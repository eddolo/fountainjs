import type * as Y from 'yjs';

/** Yjs 13.6.x keeps one physical map-index entry per key, including deleted
 * keys. Its native Map.size is a constant-time upper bound, not a live count.
 * Consult Y.Map.size when that bound cannot prove capacity; this preserves
 * tombstone, remote-update, undo and pending-transaction semantics without
 * an observer-maintained cache. Retained pools are integrated named maps. */
export function retainedMapExceeds(map: Y.Map<unknown>, maximum: number): boolean {
  return map._map.size > maximum && map.size > maximum;
}
