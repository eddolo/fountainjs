import { Step } from './step';
import { Node } from '../schema';

export class ReplaceTextStep extends Step {
  constructor(
    public readonly path: number[],
    public readonly from: number,
    public readonly to: number,
    public readonly text: string,
  ) {
    super();
  }

  apply(doc: Node): Node {
    let node = doc; let parents: Node[] = [];
    for (const index of this.path) { parents.push(node); node = node.content[index]; }

    if (!node || !node.isText) throw new Error('Target for ReplaceTextStep is not a text node.');
    
    const oldText = node.text || '';
    const newTextContent = oldText.slice(0, this.from) + this.text + oldText.slice(this.to);
    const newTextNode = node.withText(newTextContent);

    let newDoc: Node = newTextNode;
    for (let i = parents.length - 1; i >= 0; i--) {
      const parent = parents[i];
      const newContent = [...parent.content];
      newContent[this.path[i]] = newDoc;
      newDoc = new Node(parent.type, parent.attrs, newContent, parent.text, parent.marks);
    }
    return newDoc;
  }
}