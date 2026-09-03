import { Node } from '../schema';
import { assertTextRange, getNodeAtPath, getTextRangeSegments, replaceNodeAtPath } from './path';
import { ReplaceTextStep } from './replace-text-step';
import { Step } from './step';

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function replaceAcrossTopLevelTextBlocks(
  doc: Node,
  startPath: readonly number[],
  from: number,
  endPath: readonly number[],
  to: number,
  text: string,
): Node | null {
  if (startPath.length !== 2 || endPath.length !== 2 || startPath[0] === endPath[0]) return null;
  const startBlockIndex = startPath[0] as number;
  const endBlockIndex = endPath[0] as number;
  if (startBlockIndex > endBlockIndex) throw new Error('Text ranges must be ordered from start to end.');
  const startBlock = doc.child(startBlockIndex);
  const endBlock = doc.child(endBlockIndex);
  const startIndex = startPath[1] as number;
  const endIndex = endPath[1] as number;
  const start = startBlock.child(startIndex);
  const end = endBlock.child(endIndex);
  assertTextRange(start, from, start.text?.length ?? 0);
  assertTextRange(end, 0, to);

  const prefix = (start.text ?? '').slice(0, from);
  const suffix = (end.text ?? '').slice(to);
  const content = [
    ...startBlock.content.slice(0, startIndex),
    start.withText(prefix + text),
    ...(suffix ? [end.withText(suffix)] : []),
    ...endBlock.content.slice(endIndex + 1),
  ];
  const merged = startBlock.copy(content);
  return doc.copy([
    ...doc.content.slice(0, startBlockIndex),
    merged,
    ...doc.content.slice(endBlockIndex + 1),
  ]);
}

function replaceAcrossNestedStructures(
  doc: Node,
  startPath: readonly number[],
  from: number,
  endPath: readonly number[],
  to: number,
  text: string,
): Node {
  const segments = getTextRangeSegments(doc, startPath, from, endPath, to);
  const byPath = new Map(segments.map((segment) => [segment.path.join('.'), segment]));

  const rewrite = (node: Node, path: readonly number[]): Node => {
    if (node.isText) {
      const segment = byPath.get(path.join('.'));
      if (!segment) return node;
      const value = node.text ?? '';
      const isStart = samePath(path, startPath);
      const isEnd = samePath(path, endPath);
      return node.withText(
        `${isStart ? value.slice(0, segment.from) + text : ''}${isEnd ? value.slice(segment.to) : ''}`,
      );
    }
    return node.copy(node.content.map((child, index) => rewrite(child, [...path, index])));
  };

  return rewrite(doc, []);
}

/** Replaces an ordered range across inline fragments, text blocks, or nested text leaves. */
export class ReplaceTextRangeStep extends Step {
  constructor(
    public readonly startPath: readonly number[],
    public readonly from: number,
    public readonly endPath: readonly number[],
    public readonly to: number,
    public readonly text: string,
  ) { super(); }

  apply(doc: Node): Node {
    if (samePath(this.startPath, this.endPath)) {
      return new ReplaceTextStep(this.startPath, this.from, this.to, this.text).apply(doc);
    }
    if (!this.startPath.length || !this.endPath.length) throw new Error('Text ranges must resolve to text nodes.');
    const startParentPath = this.startPath.slice(0, -1);
    const endParentPath = this.endPath.slice(0, -1);
    if (!samePath(startParentPath, endParentPath)) {
      return replaceAcrossTopLevelTextBlocks(doc, this.startPath, this.from, this.endPath, this.to, this.text)
        ?? replaceAcrossNestedStructures(doc, this.startPath, this.from, this.endPath, this.to, this.text);
    }

    const startIndex = this.startPath.at(-1) as number;
    const endIndex = this.endPath.at(-1) as number;
    if (startIndex >= endIndex) throw new Error('Cross-fragment ranges must be ordered from start to end.');

    const start = getNodeAtPath(doc, this.startPath);
    const end = getNodeAtPath(doc, this.endPath);
    assertTextRange(start, this.from, start.text?.length ?? 0);
    assertTextRange(end, 0, this.to);
    const parent = getNodeAtPath(doc, startParentPath);
    const prefixAndReplacement = start.withText((start.text ?? '').slice(0, this.from) + this.text);
    const suffix = (end.text ?? '').slice(this.to);
    const content = [
      ...parent.content.slice(0, startIndex),
      prefixAndReplacement,
      ...(suffix ? [end.withText(suffix)] : []),
      ...parent.content.slice(endIndex + 1),
    ];
    return replaceNodeAtPath(doc, startParentPath, parent.copy(content));
  }
}
