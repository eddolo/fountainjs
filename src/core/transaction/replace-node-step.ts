import { Node } from '../schema';
import { getNodeAtPath, replaceNodeAtPath } from './path';
import { nodeRangeAtPath, StepMap } from './mapping';
import { Step } from './step';

/** Replaces one node with zero or more siblings at any depth in the document. */
export class ReplaceNodeStep extends Step {
  constructor(
    public readonly path: readonly number[],
    public readonly content: readonly Node[],
  ) { super(); }

  apply(doc: Node): Node {
    if (!this.path.length) throw new Error('The root node cannot be replaced with sibling nodes.');
    const parentPath = this.path.slice(0, -1);
    const index = this.path.at(-1) as number;
    const parent = getNodeAtPath(doc, parentPath);
    if (index < 0 || index >= parent.childCount) throw new RangeError(`No node exists at ${this.path.join('.')}.`);
    return replaceNodeAtPath(doc, parentPath, parent.copy([
      ...parent.content.slice(0, index),
      ...this.content,
      ...parent.content.slice(index + 1),
    ]));
  }

  override getMap(doc: Node): StepMap {
    const range = nodeRangeAtPath(doc, this.path);
    const insertedSize = this.content.reduce((size, node) => size + node.nodeSize, 0);
    return new StepMap([range.from, range.to - range.from, insertedSize]);
  }
}
