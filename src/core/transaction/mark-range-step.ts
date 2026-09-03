import { Mark, MarkType, Node } from '../schema';
import { AddMarkStep } from './add-mark-step';
import { assertTextRange, getNodeAtPath, replaceNodeAtPath } from './path';
import { RemoveMarkStep } from './remove-mark-step';
import { Step } from './step';

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function transformRange(
  doc: Node,
  startPath: readonly number[],
  from: number,
  endPath: readonly number[],
  to: number,
  transform: (node: Node) => Node,
): Node {
  const parentPath = startPath.slice(0, -1);
  if (!startPath.length || !samePath(parentPath, endPath.slice(0, -1))) {
    throw new Error('Cross-fragment mark ranges must share one parent.');
  }
  const startIndex = startPath.at(-1) as number;
  const endIndex = endPath.at(-1) as number;
  if (startIndex >= endIndex) throw new Error('Cross-fragment mark ranges must be ordered from start to end.');
  const parent = getNodeAtPath(doc, parentPath);
  const replacement: Node[] = [];

  parent.content.slice(startIndex, endIndex + 1).forEach((node, relativeIndex, selected) => {
    const nodeFrom = relativeIndex === 0 ? from : 0;
    const nodeTo = relativeIndex === selected.length - 1 ? to : node.text?.length ?? 0;
    assertTextRange(node, nodeFrom, nodeTo);
    const value = node.text ?? '';
    if (nodeFrom) replacement.push(node.withText(value.slice(0, nodeFrom)));
    if (nodeTo > nodeFrom) replacement.push(transform(node.withText(value.slice(nodeFrom, nodeTo))));
    if (nodeTo < value.length) replacement.push(node.withText(value.slice(nodeTo)));
  });

  return replaceNodeAtPath(doc, parentPath, parent.copy([
    ...parent.content.slice(0, startIndex),
    ...replacement,
    ...parent.content.slice(endIndex + 1),
  ]));
}

export class AddMarkRangeStep extends Step {
  constructor(
    public readonly startPath: readonly number[],
    public readonly from: number,
    public readonly endPath: readonly number[],
    public readonly to: number,
    public readonly mark: Mark,
  ) { super(); }

  apply(doc: Node): Node {
    if (samePath(this.startPath, this.endPath)) {
      return new AddMarkStep(this.startPath, this.from, this.to, this.mark).apply(doc);
    }
    return transformRange(doc, this.startPath, this.from, this.endPath, this.to, (node) => node.withMarks([
      ...node.marks.filter((existing) => existing.type !== this.mark.type),
      this.mark,
    ]));
  }
}

export class RemoveMarkRangeStep extends Step {
  constructor(
    public readonly startPath: readonly number[],
    public readonly from: number,
    public readonly endPath: readonly number[],
    public readonly to: number,
    public readonly markType: MarkType,
  ) { super(); }

  apply(doc: Node): Node {
    if (samePath(this.startPath, this.endPath)) {
      return new RemoveMarkStep(this.startPath, this.from, this.to, this.markType).apply(doc);
    }
    return transformRange(doc, this.startPath, this.from, this.endPath, this.to, (node) => node.withMarks(
      node.marks.filter((existing) => existing.type !== this.markType),
    ));
  }
}
