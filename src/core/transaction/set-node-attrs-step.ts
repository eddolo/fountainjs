import { Node, type Attributes } from '../schema';
import { getNodeAtPath, replaceNodeAtPath } from './path';
import { Step } from './step';

export class SetNodeAttrsStep extends Step {
  constructor(public readonly path: readonly number[], public readonly attrs: Attributes) { super(); }

  apply(doc: Node): Node {
    const node = getNodeAtPath(doc, this.path);
    return replaceNodeAtPath(doc, this.path, node.withAttrs({ ...node.attrs, ...this.attrs }));
  }
}
