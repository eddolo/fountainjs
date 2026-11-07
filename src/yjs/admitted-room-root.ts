import type * as Y from 'yjs';

// Admission binds one native root in one restored document. An equal clone
// does not carry the original Yjs identity or its history.
export const admittedRoomRoots = new WeakMap<Y.XmlFragment, Y.XmlElement>();

export function admittedRoomRootChanged(fragment: Y.XmlFragment): boolean {
  const root = admittedRoomRoots.get(fragment);
  return root !== undefined && (fragment.doc?.isDestroyed === true || fragment.get(0) !== root || root._item?.deleted === true);
}
