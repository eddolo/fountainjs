import type { Node } from './node';

interface PrefixCheckpoint {
  /** Every owner has identical child references before this boundary. */
  readonly limit: number;
  index: number;
  position: number;
}

// One scalar checkpoint, not a full index, per queried wide container. Sharing
// a cell across immutable copies also handles the order apply -> getMap: the
// first old-document query can populate the new document's common prefix.
// Cells contain no Node references, so they cannot retain previous snapshots.
const checkpoints = new WeakMap<Node, PrefixCheckpoint>();
const minimumPrefix = 64;

export function inheritChildOffset(before: Node, after: Node): number | undefined {
  if (Math.min(before.childCount, after.childCount) < minimumPrefix) return;
  let common = 0;
  const length = Math.min(before.childCount, after.childCount);
  while (common < length && before.content[common] === after.content[common]) common++;
  if (common < minimumPrefix) return common;
  const previous = checkpoints.get(before);
  const cell = previous?.limit === common ? previous : {
    limit: common,
    index: previous && previous.index <= common ? previous.index : 0,
    position: previous && previous.index <= common ? previous.position : 0,
  };
  checkpoints.set(before, cell);
  checkpoints.set(after, cell);
  return common;
}

/** Structural position before a child, or after all children at childCount. */
export function childOffset(node: Node, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index > node.childCount) {
    throw new RangeError(`Invalid child index: ${index}.`);
  }
  if (index === 0) return 0;
  let cell = checkpoints.get(node);
  if (!cell && index < minimumPrefix) {
    let position = 0;
    for (let child = 0; child < index; child++) position += node.child(child).nodeSize;
    return position;
  }
  if (!cell) {
    cell = { limit: node.childCount, index: 0, position: 0 };
    checkpoints.set(node, cell);
  }
  const sharedIndex = Math.min(index, cell.limit);
  let position = cell.position;
  if (sharedIndex < cell.index) {
    for (let child = sharedIndex; child < cell.index; child++) position -= node.child(child).nodeSize;
  } else {
    for (let child = cell.index; child < sharedIndex; child++) position += node.child(child).nodeSize;
  }
  cell.index = sharedIndex;
  cell.position = position;
  // Beyond the common prefix, values belong only to this particular snapshot.
  // Never put them into the shared cell.
  for (let child = sharedIndex; child < index; child++) position += node.child(child).nodeSize;
  return position;
}
