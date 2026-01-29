import { Step } from './step';
import { Node, Mark } from '../schema';
export class AddMarkStep extends Step {
  constructor(public readonly path: number[], public readonly mark: Mark) { super(); }
  apply(doc: Node): Node {
    let node = doc; let parents: Node[] = [];
    for (const index of this.path) { parents.push(node); node = node.content[index]; }
    if (!node || !node.isText) return doc;
    const newMarks = [this.mark, ...node.marks.filter(existing => existing.type !== this.mark.type)];
    const newTextNode = new Node(node.type, node.attrs, [], node.text, newMarks);
    let newDoc: Node = newTextNode;
    for (let i = parents.length - 1; i >= 0; i--) {
      const parent = parents[i]; const newContent = [...parent.content];
      newContent[this.path[i]] = newDoc;
      newDoc = new Node(parent.type, parent.attrs, newContent, parent.text, parent.marks);
    }
    return newDoc;
  }
}