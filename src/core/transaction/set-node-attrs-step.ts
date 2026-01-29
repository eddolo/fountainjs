import { Step } from './step';
import { Node } from '../schema';

export class SetNodeAttrsStep extends Step {
  constructor(
    public readonly path: number[],
    public readonly attrs: { [key: string]: any },
  ) {
    super();
  }

  apply(doc: Node): Node {
    let node = doc; let parents: Node[] = [];
    for (const index of this.path) { parents.push(node); node = node.content[index]; }

    if (!node) throw new Error('No node found at path');

    const newAttrs = { ...node.attrs, ...this.attrs };
    const updatedNode = new Node(node.type, newAttrs, node.content, node.text, node.marks);

    let newDoc: Node = updatedNode;
    for (let i = parents.length - 1; i >= 0; i--) {
      const parent = parents[i];
      const newContent = [...parent.content];
      newContent[this.path[i]] = newDoc;
      newDoc = new Node(parent.type, parent.attrs, newContent, parent.text, parent.marks);
    }
    return newDoc;
  }
}