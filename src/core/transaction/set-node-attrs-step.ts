import { Node, type Attributes } from '../schema';
import { getNodeAtPath, replaceNodeAtPath } from './path';
import { Step } from './step';

export class SetNodeAttrsStep extends Step {
  constructor(public readonly path: readonly number[], public readonly attrs: Attributes) { super(); }

  apply(doc: Node): Node {
    const node = getNodeAtPath(doc, this.path);
    // Use schema normalization so optional undefined attributes become absence,
    // matching node construction and portable JSON/Yjs representation.
    const attrs = node.type.create({ ...node.attrs, ...this.attrs }, node.content, node.text, node.marks).attrs;
    return replaceNodeAtPath(doc, this.path, node.withAttrs(attrs));
  }
}
