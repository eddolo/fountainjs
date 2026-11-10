import * as Y from 'yjs';

/** A portable ownership token for a retained native node. Pool IDs may contain
 * ':' or exceed the direction attribute's bound; native Yjs identities do not.
 * No normalization or truncation can merge otherwise distinct owners. */
export function retainedDirectionIdentity(
  document: Y.Doc, room: string, roomId: string | undefined, id: string | undefined,
): string | null {
  if (id === 'root') return roomId ? `yjs-${roomId}` : null;
  const nodes = document.share.get(`${room}-nodes:nodes`);
  const record = id && nodes instanceof Y.Map ? nodes.get(id) : undefined;
  if (!(record instanceof Y.Map)) return null;
  const identity = Y.createRelativePositionFromTypeIndex(record, 0).type;
  return identity ? `yjs-${identity.client}-${identity.clock}` : null;
}
