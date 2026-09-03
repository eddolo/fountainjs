import { MarkType, Node } from '../schema';
import { assertTextRange, getNodeAtPath, replaceNodeWithNodes } from './path';
import { Step } from './step';

export class RemoveMarkStep extends Step {
  constructor(
    public readonly path: readonly number[],
    public readonly from: number,
    public readonly to: number,
    public readonly markType: MarkType,
  ) { super(); }

  apply(doc: Node): Node {
    const node = getNodeAtPath(doc, this.path);
    assertTextRange(node, this.from, this.to);
    if (this.from === this.to) return doc;
    const text = node.text ?? '';
    const unmarked = node.withText(text.slice(this.from, this.to)).withMarks(node.marks.filter((mark) => mark.type !== this.markType));
    const nodes = [
      ...(this.from ? [node.withText(text.slice(0, this.from))] : []),
      unmarked,
      ...(this.to < text.length ? [node.withText(text.slice(this.to))] : []),
    ];
    return replaceNodeWithNodes(doc, this.path, nodes);
  }
}
