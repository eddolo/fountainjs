import { Node } from '../schema';
import { getNodeAtPath, replaceNodeAtPath } from './path';
import { nodeRangeAtPath, StepMap } from './mapping';
import { Step } from './step';
import { hasSharedBlockLineage } from '../schema/block-lineage';

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
    const before = getNodeAtPath(doc, this.path), after = this.content.length === 1 ? this.content[0] : undefined;
    // Node.copy/withAttrs explicitly retain the block owner. Keep its opening
    // and closing units and actual shared children; never infer this from text.
    if (after && hasSharedBlockLineage(before, after)) {
      let prefix = 0, suffix = 0;
      while (prefix < before.childCount && prefix < after.childCount && before.child(prefix) === after.child(prefix)) prefix++;
      while (suffix < before.childCount - prefix && suffix < after.childCount - prefix
        && before.child(before.childCount - suffix - 1) === after.child(after.childCount - suffix - 1)) suffix++;
      const start = range.from + 1 + before.content.slice(0, prefix).reduce((sum, child) => sum + child.nodeSize, 0);
      const removed = before.content.slice(prefix, before.childCount - suffix).reduce((sum, child) => sum + child.nodeSize, 0);
      const inserted = after.content.slice(prefix, after.childCount - suffix).reduce((sum, child) => sum + child.nodeSize, 0);
      return removed || inserted ? new StepMap([start, removed, inserted]) : StepMap.empty;
    }
    const insertedSize = this.content.reduce((size, node) => size + node.nodeSize, 0);
    return new StepMap([range.from, range.to - range.from, insertedSize]);
  }
}
