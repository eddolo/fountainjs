import { Step } from './step';
import { Node, MarkType } from '../schema';
export class RemoveMarkStep extends Step {
  constructor(public readonly from: number, public readonly to: number, public readonly markType: MarkType) { super(); }
  apply(doc: Node): Node {
    const newContent = doc.content.map((node, i) => {
      if (i >= this.from && i < this.to) {
        if (node.type.name === 'paragraph') {
          const newParaContent = node.content.map(child => { if (child.isText) { const newMarks = child.marks.filter(m => m.type !== this.markType); return new Node(child.type, child.attrs, [], child.text, newMarks); } return child; });
          return new Node(node.type, node.attrs, newParaContent);
        }
      }
      return node;
    });
    return new Node(doc.type, doc.attrs, newContent);
  }
}