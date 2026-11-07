import type * as Y from 'yjs';
import type { Node, Schema } from '../../src/core/schema';
import type { DocumentRoomAdmission, DocumentRoomSnapshot } from '../../src/yjs/document-room';
import { legacyNodeIdentity } from '../../src/yjs/legacy-node-identity';
import { restoreLegacyCheckpoint, snapshotLegacyProjection, type LegacyCheckpoint, type LegacyProjectionOptions } from '../../src/yjs/legacy-checkpoint';
import { checkpointWire, restoreRetainedCheckpoint, type RetainedCheckpoint } from '../../src/yjs/retained-checkpoint';

interface BoundYjsRoomOptions {
  readonly schema: Schema;
  readonly schemaVersion: string;
  readonly legacyProjection?: LegacyProjectionOptions;
  readonly expected: Pick<DocumentRoomAdmission, 'key'> & Partial<Pick<DocumentRoomAdmission, 'epoch' | 'protocol' | 'revision'>>;
  readonly open: (signal?: AbortSignal) => Promise<DocumentRoomAdmission>;
  readonly admit: (offer: DocumentRoomAdmission, signal?: AbortSignal) => Promise<DocumentRoomSnapshot>;
  readonly signal?: AbortSignal;
}

export interface BoundYjsRoom {
  readonly lease: DocumentRoomAdmission;
  readonly document: Y.Doc;
  readonly baseDocument: Node;
  readonly fragment?: Y.XmlFragment;
}

/** Prepare an isolated document before constructing an editor or provider.
 * The host still authorizes the requests and fences each later transport write. */
export async function openBoundYjsRoom(options: BoundYjsRoomOptions): Promise<BoundYjsRoom> {
  const { schema, schemaVersion, signal, open, admit } = options;
  const { key, epoch, protocol, revision } = options.expected;
  const legacyProjection = snapshotLegacyProjection(options.legacyProjection);
  signal?.throwIfAborted();
  const offer = Object.freeze(checkpointWire.fields(await open(signal), 'epoch,identity,key,protocol,revision,room'));
  signal?.throwIfAborted();
  if (offer.key !== key || typeof offer.epoch !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(offer.epoch)
    || !Number.isSafeInteger(offer.revision) || offer.revision < 0 || offer.revision < (revision ?? 0)
    || (offer.protocol !== 'legacy' && offer.protocol !== 'retained')
    || (epoch !== undefined && offer.epoch !== epoch)
    || (protocol !== undefined && offer.protocol !== protocol)
    || typeof offer.room !== 'string' || offer.room.length > 1_000
    || typeof offer.identity !== 'string' || !offer.identity || offer.identity.length > 200) {
    throw new Error('Room opening offer does not match the requested room.');
  }

  const reply = checkpointWire.fields(await admit(offer, signal), 'checkpoint,epoch,key,phase,protocol,revision');
  signal?.throwIfAborted();
  if (reply.key !== offer.key || reply.epoch !== offer.epoch || reply.protocol !== offer.protocol || reply.phase !== 'active'
    || !Number.isSafeInteger(reply.revision) || reply.revision < offer.revision) {
    throw new Error('Room admission reply does not match the opening offer.');
  }
  const supplied = reply.checkpoint;
  const manifest = supplied?.manifest;
  if (manifest?.room !== offer.room) throw new Error('Room admission returned a different namespace.');
  const lease = Object.freeze({ ...offer, revision: reply.revision });
  const checkpoint = { manifest, get update() { return supplied.update; } };

  if (offer.protocol === 'legacy') {
    if (manifest.format !== 'fountain-legacy-checkpoint/1') throw new Error('Room admission returned a different checkpoint protocol.');
    const restored = await restoreLegacyCheckpoint(checkpoint as LegacyCheckpoint, schema, schemaVersion, legacyProjection);
    try {
      signal?.throwIfAborted();
      if (legacyNodeIdentity(restored.reader.root) !== offer.identity) throw new Error('Room admission native identity changed.');
      return Object.freeze({ lease, document: restored.document, baseDocument: restored.baseDocument, fragment: restored.reader.fragment });
    } catch (error) { restored.document.destroy(); throw error; }
  }

  if (manifest.format !== 'fountain-retained-checkpoint/1') throw new Error('Room admission returned a different checkpoint protocol.');
  if (manifest.roomId !== offer.identity) throw new Error('Room admission native identity changed.');
  const restored = await restoreRetainedCheckpoint(checkpoint as RetainedCheckpoint, schema, schemaVersion);
  try {
    signal?.throwIfAborted();
    if (restored.document.store.pendingStructs || restored.document.store.pendingDs) throw new Error('Room admission returned unresolved update dependencies.');
    return Object.freeze({ lease, document: restored.document, baseDocument: restored.baseDocument });
  } catch (error) { restored.document.destroy(); throw error; }
}
