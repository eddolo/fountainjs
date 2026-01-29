import { Step } from './step';
import { Node } from '../schema';
export class InsertTextStep extends Step {
  constructor( public readonly path: number[], public readonly offset: number, public readonly text: string, ) { super(); }
  apply(doc: Node): Node {
    let node = doc; let parents: Node[] = [];
    for (const index of this.path) { parents.push(node); node = node.content[index]; }
    if (!node || !node.isText) throw new Error('Target for InsertTextStep is not a text node.');
    const newTextNode = node.withText((node.text || '').slice(0, this.offset) + this.text + (node.text || '').slice(this.offset));
    let newDoc: Node = newTextNode;
    for (let i = parents.length - 1; i >= 0; i--) {
      const parent = parents[i]; const newContent = [...parent.content];
      newContent[this.path[i]] = newDoc;
      newDoc = new Node(parent.type, parent.attrs, newContent, parent.text, parent.marks);
    }
    return newDoc;
  }
}