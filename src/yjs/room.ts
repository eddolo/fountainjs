import type * as Y from 'yjs';
import type { Node, Schema } from '../core/schema';
import type { FountainExtension } from '../extensions/extension';
import type { DocumentProtocol, DocumentRoomAdmission, DocumentRoomSnapshot } from './document-room';
import type { YjsCollaborationExtensionOptions } from './index';
import { legacyNodeIdentity } from './legacy-node-identity';
import { restoreLegacyCheckpoint, snapshotLegacyProjection, type LegacyCheckpoint, type LegacyProjectionOptions } from './legacy-checkpoint';
import { createRetainedYjsCollaborationExtension } from './retained-adapter';
import { checkpointWire, restoreRetainedCheckpoint, type RetainedCheckpoint } from './retained-checkpoint';
import { admittedRoomRoots } from './admitted-room-root';
import { projectRetainedRoomAttributes } from './structured-attributes';

export { captureLegacyCheckpoint, type LegacyCheckpoint, type LegacyProjectionOptions } from './legacy-checkpoint';
export { captureRetainedCheckpoint, type RetainedCheckpoint } from './retained-checkpoint';
export { createRetainedYjsCollaborationExtension } from './retained-adapter';
export type { DocumentProtocol, DocumentRoomAdmission, DocumentRoomSnapshot } from './document-room';

export interface YjsRoomOptions {
  readonly schema: Schema;
  readonly schemaVersion: string;
  /** Host-owned structured attribute definitions shared with the checkpoint authority. */
  readonly structuredAttributes?: LegacyProjectionOptions['structuredAttributes'];
  readonly expected: Pick<DocumentRoomAdmission, 'key'> & Partial<Pick<DocumentRoomAdmission, 'epoch' | 'protocol' | 'revision'>>;
  /** Defaults to retained-only. Include legacy explicitly to open XML rooms. */
  readonly protocols?: readonly DocumentProtocol[];
  readonly open: (protocols: readonly DocumentProtocol[], signal?: AbortSignal) => Promise<DocumentRoomAdmission>;
  readonly admit: (offer: DocumentRoomAdmission, signal?: AbortSignal) => Promise<DocumentRoomSnapshot>;
  readonly signal?: AbortSignal;
}

export type BoundYjsExtensionOptions = Pick<YjsCollaborationExtensionOptions,
  'user' | 'provider' | 'awareness' | 'awarenessField' | 'captureTimeout' | 'presenceThrottleMs' | 'autoConnect'>;

export interface BoundYjsRoom {
  readonly lease: DocumentRoomAdmission;
  readonly document: Y.Doc;
  readonly baseDocument: Node;
  readonly fragment?: Y.XmlFragment;
  /** Build an extension for the verified protocol and document. Destroy the
   * editor before destroying the caller-owned Y.Doc. */
  createExtension(options: BoundYjsExtensionOptions): FountainExtension;
}

/** Prepare an isolated document before constructing an editor or provider.
 * The host still authorizes the requests and fences each later transport write. */
export async function openYjsRoom(options: YjsRoomOptions): Promise<BoundYjsRoom> {
  const { schema, schemaVersion, signal, open, admit } = options;
  const { key, epoch, protocol, revision } = options.expected;
  const legacyProjection = snapshotLegacyProjection({ structuredAttributes: options.structuredAttributes });
  signal?.throwIfAborted();
  const requested = options.protocols === undefined ? ['retained'] as const : options.protocols;
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > 2) {
    throw new TypeError('Invalid supported document-room protocols.');
  }
  const protocols = Object.freeze([...requested]);
  if (protocols.some(value => value !== 'legacy' && value !== 'retained')
    || new Set(protocols).size !== protocols.length || (protocol !== undefined && !protocols.includes(protocol))) {
    throw new TypeError('Invalid supported document-room protocols.');
  }
  const offer = Object.freeze(checkpointWire.fields(await open(protocols, signal), 'epoch,identity,key,protocol,revision,room'));
  signal?.throwIfAborted();
  if (offer.key !== key || typeof offer.epoch !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(offer.epoch)
    || !Number.isSafeInteger(offer.revision) || offer.revision < 0 || offer.revision < (revision ?? 0)
    || !protocols.includes(offer.protocol)
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

  const bind = (document: Y.Doc, baseDocument: Node,
    createAdapterExtension: (options: YjsCollaborationExtensionOptions) => FountainExtension,
    fragment?: Y.XmlFragment): BoundYjsRoom => Object.freeze({
    lease, document, baseDocument, ...(fragment ? { fragment } : {}),
    createExtension({ user, provider, awareness, awarenessField, captureTimeout, presenceThrottleMs, autoConnect }: BoundYjsExtensionOptions) {
      return createAdapterExtension({ user, provider, awareness, awarenessField, captureTimeout, presenceThrottleMs, autoConnect,
        document, fragmentName: lease.room, structuredAttributes: legacyProjection.structuredAttributes,
        ...(fragment ? { fragment, preserveConcurrentRoots: true } : {}) });
    },
  });

  if (offer.protocol === 'legacy') {
    if (manifest.format !== 'fountain-legacy-checkpoint/1') throw new Error('Room admission returned a different checkpoint protocol.');
    const restored = await restoreLegacyCheckpoint(checkpoint as LegacyCheckpoint, schema, schemaVersion, legacyProjection);
    try {
      signal?.throwIfAborted();
      if (legacyNodeIdentity(restored.reader.root) !== offer.identity) throw new Error('Room admission native identity changed.');
      const { createYjsCollaborationExtension } = await import('./index');
      signal?.throwIfAborted();
      admittedRoomRoots.set(restored.reader.fragment, restored.reader.root);
      return bind(restored.document, restored.baseDocument, createYjsCollaborationExtension, restored.reader.fragment);
    } catch (error) { restored.document.destroy(); throw error; }
  }

  if (manifest.format !== 'fountain-retained-checkpoint/1') throw new Error('Room admission returned a different checkpoint protocol.');
  if (manifest.roomId !== offer.identity) throw new Error('Room admission native identity changed.');
  const restored = await restoreRetainedCheckpoint(checkpoint as RetainedCheckpoint, schema, schemaVersion);
  try {
    signal?.throwIfAborted();
    if (restored.document.store.pendingStructs || restored.document.store.pendingDs) throw new Error('Room admission returned unresolved update dependencies.');
    const baseDocument = projectRetainedRoomAttributes(restored.document, restored.baseDocument, lease.room, legacyProjection.structuredAttributes);
    const fragment = restored.document.getXmlFragment(lease.room);
    admittedRoomRoots.set(fragment, fragment.get(0) as Y.XmlElement);
    return bind(restored.document, baseDocument, createRetainedYjsCollaborationExtension);
  } catch (error) { restored.document.destroy(); throw error; }
}
