import * as Y from 'yjs';
import type { Schema } from '../core/schema';
import type { RetainedCheckpoint } from './retained-checkpoint';
import { captureLegacyCheckpoint, restoreLegacyCheckpoint, assertLegacyCheckpointState, snapshotLegacyProjection, type LegacyCheckpoint, type LegacyProjectionOptions } from './legacy-checkpoint';
import { applyRetainedRoomUpdate, validateRetainedRoomCheckpoint, RetainedRoomError, type RetainedRoomVersion } from './retained-room-store';
import { validateCoordinatedRoomRecord, type CoordinatedRecord, type CoordinatedFreeze } from './retained-room-coordinator';

export type DocumentCheckpoint = RetainedCheckpoint | LegacyCheckpoint;
export type DocumentProtocol = 'legacy' | 'retained';
export type DocumentRoomRecord = CoordinatedRecord<DocumentCheckpoint>;
export interface DocumentRoomRepository {
  readDocument(key: string): Promise<DocumentRoomRecord | undefined>;
  createDocument(record: DocumentRoomRecord): Promise<boolean>;
  compareDocument(key: string, expectedGeneration: string, next: DocumentRoomRecord): Promise<boolean>;
}
export interface DocumentRoomSnapshot extends RetainedRoomVersion {
  readonly key: string; readonly phase: 'active' | 'frozen'; readonly protocol: DocumentProtocol; readonly checkpoint: DocumentCheckpoint;
}
export const documentProtocol = (checkpoint: DocumentCheckpoint): DocumentProtocol => {
  if (checkpoint.manifest.format === 'fountain-legacy-checkpoint/1') return 'legacy';
  if (checkpoint.manifest.format === 'fountain-retained-checkpoint/1') return 'retained';
  throw new Error('Unknown document-room protocol.');
};
export const documentRoomId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export const documentRoomFailure = (code: ConstructorParameters<typeof RetainedRoomError>[0], message: string): never => { throw new RetainedRoomError(code, message); };
export function copyDocumentFreeze(ticket: CoordinatedFreeze, key: string): CoordinatedFreeze {
  const owned = ticket && { key: ticket.key, epoch: ticket.epoch, revision: ticket.revision, id: ticket.id, checkpointSha256: ticket.checkpointSha256 };
  if (!owned || owned.key !== key || !documentRoomId(owned.epoch) || !documentRoomId(owned.id) || !Number.isSafeInteger(owned.revision) || owned.revision < 0 || !/^[a-f0-9]{64}$/.test(owned.checkpointSha256)) documentRoomFailure('invalid-ticket', 'Invalid document-room freeze ticket.');
  return Object.freeze(owned);
}
export function assertDocumentFreeze(row: DocumentRoomRecord, ticket: CoordinatedFreeze): void {
  if (row.key !== ticket.key || row.phase !== 'frozen' || row.preparationId !== null || row.freezeId !== ticket.id || row.epoch !== ticket.epoch || row.revision !== ticket.revision || row.checkpoint.manifest.checkpointSha256 !== ticket.checkpointSha256) documentRoomFailure('invalid-ticket', 'Document-room freeze ticket is no longer current.');
}
export const documentSnapshot = (row: DocumentRoomRecord): DocumentRoomSnapshot => Object.freeze({ key: row.key, epoch: row.epoch, revision: row.revision, phase: row.phase, protocol: documentProtocol(row.checkpoint), checkpoint: row.checkpoint });
export interface ValidatedDocumentCheckpoint { readonly checkpoint: DocumentCheckpoint; readonly protocol: DocumentProtocol; readonly identity: string }
export async function validateDocumentCheckpoint(checkpoint: DocumentCheckpoint, schema: Schema, schemaVersion: string, projection: LegacyProjectionOptions): Promise<ValidatedDocumentCheckpoint> {
  if (documentProtocol(checkpoint) === 'retained') {
    const owned = await validateRetainedRoomCheckpoint(checkpoint as RetainedCheckpoint, schema, schemaVersion);
    return { checkpoint: owned, protocol: 'retained', identity: owned.manifest.roomId };
  }
  const restored = await restoreLegacyCheckpoint(checkpoint as LegacyCheckpoint, schema, schemaVersion, projection);
  try {
    const root = restored.document.getXmlFragment(restored.manifest.room).get(0), reference = Y.createRelativePositionFromTypeIndex(root as Y.XmlElement, 0).type;
    if (!reference) throw new Error('Legacy source has no native root identity.');
    assertLegacyCheckpointState(restored.document, restored.checkpoint);
    return { checkpoint: restored.checkpoint, protocol: 'legacy', identity: `yjs-${reference.client}-${reference.clock}` };
  } finally { restored.document.destroy(); }
}
export async function applyDocumentRoomUpdate(source: DocumentCheckpoint, schema: Schema, schemaVersion: string, projection: LegacyProjectionOptions, supplied: Uint8Array): Promise<DocumentCheckpoint> {
  if (!(supplied instanceof Uint8Array) || !supplied.length || supplied.length > 64 * 1024 * 1024) documentRoomFailure('invalid-update', 'Invalid document update size.');
  const bytes = Uint8Array.from(supplied);
  try {
    const before = await validateDocumentCheckpoint(source, schema, schemaVersion, projection);
    if (before.protocol === 'retained') return await applyRetainedRoomUpdate(before.checkpoint as RetainedCheckpoint, schema, schemaVersion, bytes);
    const restored = await restoreLegacyCheckpoint(before.checkpoint as LegacyCheckpoint, schema, schemaVersion, projection);
    try {
      Y.applyUpdate(restored.document, bytes);
      const next = await captureLegacyCheckpoint(restored.document, schema, schemaVersion, projection, restored.manifest.room), checked = await validateDocumentCheckpoint(next, schema, schemaVersion, projection);
      if (checked.identity !== before.identity) throw new Error('Legacy update replaced the authoritative XML root identity.');
      return checked.checkpoint;
    } finally { restored.document.destroy(); }
  } catch (cause) { throw new RetainedRoomError('invalid-update', 'Document update rejected without changing authoritative state.', { cause }); }
}

/** Private provider reference sharing one persistent live row across formats.
 * Every write must pass this authority; epochs/protocol labels are not auth. */
export class CoordinatedDocumentRoom {
  readonly projection: LegacyProjectionOptions;
  constructor(private readonly repository: DocumentRoomRepository, readonly key: string, private readonly schema: Schema, private readonly schemaVersion: string, projection: LegacyProjectionOptions = {}) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,193}$/.test(key)) throw new Error('Invalid document-room key.');
    this.projection = snapshotLegacyProjection(projection);
  }
  private async current(): Promise<DocumentRoomRecord> { const row = await this.repository.readDocument(this.key); validateCoordinatedRoomRecord(row, this.key, this.schemaVersion); documentProtocol(row.checkpoint); return row; }
  private async commit(row: DocumentRoomRecord, patch: Partial<DocumentRoomRecord>): Promise<DocumentRoomRecord> {
    const next = { ...row, ...patch, generation: crypto.randomUUID() };
    if (!await this.repository.compareDocument(this.key, row.generation, next)) documentRoomFailure('revision-conflict', 'Document room changed; retain pending edits and retry.'); return next;
  }
  async initialize(checkpoint: DocumentCheckpoint): Promise<DocumentRoomSnapshot> {
    const checked = await validateDocumentCheckpoint(checkpoint, this.schema, this.schemaVersion, this.projection), row: DocumentRoomRecord = { key: this.key, epoch: crypto.randomUUID(), generation: crypto.randomUUID(), revision: 0, phase: 'active', freezeId: null, preparationId: null, lastResume: null, checkpoint: checked.checkpoint };
    if (!await this.repository.createDocument(row)) documentRoomFailure('revision-conflict', 'Document room already exists.'); return documentSnapshot(row);
  }
  async snapshot(): Promise<DocumentRoomSnapshot> { const row = await this.current(), checked = await validateDocumentCheckpoint(row.checkpoint, this.schema, this.schemaVersion, this.projection); return documentSnapshot({ ...row, checkpoint: checked.checkpoint }); }
  async write(request: { readonly epoch: string; readonly protocol: DocumentProtocol; readonly update: Uint8Array }): Promise<DocumentRoomSnapshot> {
    const epoch = request.epoch, protocol = request.protocol, row = await this.current();
    if (epoch !== row.epoch || protocol !== documentProtocol(row.checkpoint)) documentRoomFailure('stale-epoch', 'Writer epoch/protocol is stale; reconnect and retain pending edits.');
    if (row.phase !== 'active') documentRoomFailure('frozen', 'Document room is frozen; retain pending edits.');
    if (row.revision >= Number.MAX_SAFE_INTEGER) documentRoomFailure('revision-conflict', 'Document revision capacity exceeded.');
    const checkpoint = await applyDocumentRoomUpdate(row.checkpoint, this.schema, this.schemaVersion, this.projection, request.update);
    return documentSnapshot(await this.commit(row, { checkpoint, revision: row.revision + 1 }));
  }
  async freeze(expected: RetainedRoomVersion): Promise<CoordinatedFreeze> {
    const epoch = expected.epoch, revision = expected.revision, row = await this.current();
    if (row.epoch !== epoch) documentRoomFailure('stale-epoch', 'Cannot freeze an old epoch.');
    if (row.phase !== 'active' || row.revision !== revision) documentRoomFailure('revision-conflict', 'Cannot freeze a stale or already frozen revision.');
    const next = await this.commit(row, { phase: 'frozen', freezeId: crypto.randomUUID(), preparationId: null });
    return Object.freeze({ key: this.key, epoch, revision, id: next.freezeId!, checkpointSha256: row.checkpoint.manifest.checkpointSha256 });
  }
  async recoverFrozen(expected: RetainedRoomVersion): Promise<CoordinatedFreeze> {
    const epoch = expected.epoch, revision = expected.revision, row = await this.current();
    if (row.phase !== 'frozen' || row.epoch !== epoch || row.revision !== revision || row.preparationId !== null) documentRoomFailure('invalid-ticket', 'No matching unprepared frozen room.');
    return Object.freeze({ key: this.key, epoch, revision, id: row.freezeId!, checkpointSha256: row.checkpoint.manifest.checkpointSha256 });
  }
  async abort(ticket: CoordinatedFreeze): Promise<DocumentRoomSnapshot> { ticket = copyDocumentFreeze(ticket, this.key); const row = await this.current(); assertDocumentFreeze(row, ticket); return documentSnapshot(await this.commit(row, { phase: 'active', freezeId: null })); }
}
