import type { Node } from './node';

// Operation provenance, not portable node IDs. Values contain no model/root
// references, so retaining a new version cannot retain discarded snapshots.
const lineages = new WeakMap<Node, symbol>();

export function inheritBlockLineage(before: Node, after: Node): Node {
  if (before.type.isBlock && after.type.isBlock) {
    const lineage = lineages.get(before) ?? Symbol();
    lineages.set(before, lineage);
    lineages.set(after, lineage);
  }
  return after;
}

export function hasSharedBlockLineage(before: Node, after: Node): boolean {
  const lineage = lineages.get(before);
  return lineage !== undefined && lineage === lineages.get(after);
}
