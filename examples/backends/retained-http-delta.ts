import * as Y from 'yjs';
import type { DocumentRoomSnapshot } from '../../src/yjs/document-room';
import type { RetainedCheckpoint } from '../../src/yjs/retained-checkpoint';

export interface RetainedDeltaBasis {
  readonly updateSha256: string;
  readonly vector: Uint8Array;
}

interface DeltaReceipt {
  readonly baseUpdateSha256: string;
  readonly snapshot: Omit<DocumentRoomSnapshot, 'checkpoint'>;
  readonly manifest: RetainedCheckpoint['manifest'];
  readonly delta: Uint8Array;
}

export type RetainedHttpReceipt = DocumentRoomSnapshot | DeltaReceipt;

/** A vector only selects bytes to omit. The server's admitted snapshot still
 * supplies all metadata and checksums. Use the full receipt when a delta does
 * not save enough to pay for the extra envelope fields. */
export function retainedHttpReceipt(snapshot: DocumentRoomSnapshot, basis?: RetainedDeltaBasis): RetainedHttpReceipt {
  if (snapshot.protocol !== 'retained' || !basis || !(basis.vector instanceof Uint8Array)
    || basis.vector.length === 0 || basis.vector.length > 16_384
    || typeof basis.updateSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(basis.updateSha256)) return snapshot;

  const { checkpoint, ...metadata } = snapshot;
  const update = checkpoint.update;
  let delta: Uint8Array;
  try { delta = Y.diffUpdate(update, basis.vector); }
  catch { return snapshot; }
  if (delta.length + 128 >= update.length) return snapshot;
  return { baseUpdateSha256: basis.updateSha256, snapshot: metadata,
    manifest: (checkpoint as RetainedCheckpoint).manifest, delta };
}

/** Rebuild only from the last accepted server bytes. A live editor can hold
 * unacknowledged updates and must never be used as the delta base. */
export async function restoreRetainedHttpReceipt(receipt: RetainedHttpReceipt, base: RetainedCheckpoint): Promise<DocumentRoomSnapshot> {
  if (!('baseUpdateSha256' in receipt)) return receipt;
  const { manifest, snapshot, delta } = receipt;
  if (receipt.baseUpdateSha256 !== base.manifest.updateSha256 || !(delta instanceof Uint8Array)
    || delta.length < 1 || delta.length >= manifest.bytes || manifest.bytes > 64 * 1024 * 1024) {
    throw new Error('The retained delta does not match the accepted checkpoint.');
  }
  const staged = new Y.Doc({ gc: false });
  try {
    // Match checkpoint construction at the authority. The manifest's GC
    // preference applies when the verified checkpoint is opened for editing.
    Y.applyUpdate(staged, base.update);
    Y.applyUpdate(staged, delta);
    const update = Y.encodeStateAsUpdate(staged);
    if (staged.store.pendingStructs || staged.store.pendingDs || update.length !== manifest.bytes) {
      throw new Error('The retained delta did not reconstruct the complete checkpoint.');
    }
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(update).buffer));
    const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== manifest.updateSha256) throw new Error('The retained delta failed its checkpoint checksum.');
    return { ...snapshot, checkpoint: { manifest, update } };
  } finally { staged.destroy(); }
}
