import { Mark, Node } from '../schema';
import { assertTextRange, getNodeAtPath, replaceNodeWithNodes } from './path';
import { Step } from './step';

export class AddMarkStep extends Step {
  constructor(
    public readonly path: readonly number[],
    public readonly from: number,
    public readonly to: number,
    public readonly mark: Mark,
  ) { super(); }

  apply(doc: Node): Node {
    const node = getNodeAtPath(doc, this.path);
    assertTextRange(node, this.from, this.to);
    if (this.from === this.to) return doc;
    const text = node.text ?? '';
    const marked = node.withText(text.slice(this.from, this.to)).withMarks([
      ...node.marks.filter((existing) => existing.type !== this.mark.type),
      this.mark,
    ]);
    const nodes = [
      ...(this.from ? [node.withText(text.slice(0, this.from))] : []),
      marked,
      ...(this.to < text.length ? [node.withText(text.slice(this.to))] : []),
    ];
    return replaceNodeWithNodes(doc, this.path, nodes);
  }
}
