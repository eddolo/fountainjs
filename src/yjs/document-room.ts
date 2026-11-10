import * as Y from 'yjs';
import type { Schema } from '../core/schema';
import type { RetainedCheckpoint, RetainedProjectionCheck } from './retained-checkpoint';
import { captureLegacyCheckpoint, restoreLegacyCheckpoint, assertLegacyCheckpointState, snapshotLegacyProjection, type LegacyCheckpoint, type LegacyProjectionOptions } from './legacy-checkpoint';
import { legacyNodeIdentity } from './legacy-node-identity';
import { applyRetainedRoomUpdate, validateRetainedRoomCheckpoint, RetainedRoomError, type RetainedRoomVersion } from './retained-room-store';
import { validateCoordinatedRoomRecord, type CoordinatedRecord, type CoordinatedFreeze } from './retained-room-coordinator';
import { projectRetainedRoomAttributes, roomStructuredMapName } from './structured-attributes';

export type DocumentCheckpoint = RetainedCheckpoint | LegacyCheckpoint;
export type DocumentProtocol = 'legacy' | 'retained';
export type DocumentRoomRecord = CoordinatedRecord<DocumentCheckpoint>;
export type DocumentRoomHeader = CoordinatedRecord<Pick<DocumentCheckpoint, 'manifest'>>;
export interface DocumentReviewOperation {
  readonly id: string;
  readonly digest: string;
}
interface DocumentWriteRequest {
  readonly epoch: string;
  readonly protocol: DocumentProtocol;
  readonly expectedRevision?: number;
  readonly update: Uint8Array;
}
export interface DocumentRoomRepository {
  readDocument(key: string): Promise<DocumentRoomRecord | undefined>;
  /** Read an owned header from the same atomic row used by readDocument. */
  readDocumentHeader?(key: string): Promise<DocumentRoomHeader | undefined>;
  createDocument(record: DocumentRoomRecord): Promise<boolean>;
  compareDocument(key: string, expectedGeneration: string, next: DocumentRoomRecord): Promise<boolean>;
  /** Atomically compare the generation, record a review receipt and apply the
   * optional changed checkpoint. A false result must change nothing. */
  commitDocumentReview?(row: DocumentRoomRecord, next: DocumentRoomRecord | undefined, operation: DocumentReviewOperation): Promise<boolean>;
}
export interface DocumentRoomSnapshot extends RetainedRoomVersion {
  readonly key: string; readonly phase: 'active' | 'frozen'; readonly protocol: DocumentProtocol; readonly checkpoint: DocumentCheckpoint;
}
export interface DocumentRoomAdmission {
  readonly key: string; readonly epoch: string; readonly revision: number;
  readonly protocol: DocumentProtocol; readonly room: string; readonly identity: string;
  /** Map required by a retained room with authority-configured structured fields. */
  readonly structuredMap?: string;
}
export interface RetainedRoomProvisionOptions {
  readonly room?: string;
  readonly signal?: AbortSignal;
  /** Load a server-owned initial checkpoint only when the room is absent. */
  readonly loadCheckpoint: (signal: AbortSignal | undefined) => RetainedCheckpoint | Promise<RetainedCheckpoint>;
}
export interface DocumentRoomOpenOptions extends RetainedRoomProvisionOptions {
  readonly protocols: readonly DocumentProtocol[];
}
export interface DocumentRoomOpenResult {
  readonly snapshot: DocumentRoomSnapshot;
  readonly admission: DocumentRoomAdmission;
}
export const documentProtocol = (checkpoint: Pick<DocumentCheckpoint, 'manifest'>): DocumentProtocol => {
  if (checkpoint.manifest.format === 'fountain-legacy-checkpoint/1') return 'legacy';
  if (checkpoint.manifest.format === 'fountain-retained-checkpoint/1') return 'retained';
  throw new Error('Unknown document-room protocol.');
};
export const documentRoomId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export const documentRoomFailure = (code: ConstructorParameters<typeof RetainedRoomError>[0], message: string): never => { throw new RetainedRoomError(code, message); };
/** Header-only fence shared by document polling and transactional presence. */
export function assertRetainedRoomReader(row: DocumentRoomHeader, expected: DocumentRoomAdmission): void {
  if (row.epoch !== expected.epoch || expected.protocol !== 'retained' || documentProtocol(row.checkpoint) !== 'retained') {
    documentRoomFailure('stale-epoch', 'Reader epoch/protocol is stale; reconnect and retain pending edits.');
  }
  if (row.phase !== 'active') documentRoomFailure('frozen', 'Document room is frozen; retain pending edits.');
  const manifest = row.checkpoint.manifest as RetainedCheckpoint['manifest'];
  if (expected.key !== row.key || manifest.room !== expected.room || manifest.roomId !== expected.identity
    || !Number.isSafeInteger(expected.revision) || expected.revision < 0 || expected.revision > row.revision) {
    documentRoomFailure('invalid-ticket', 'Retained reader does not match the active room.');
  }
}
export function copyDocumentFreeze(ticket: CoordinatedFreeze, key: string): CoordinatedFreeze {
  const owned = ticket && { key: ticket.key, epoch: ticket.epoch, revision: ticket.revision, id: ticket.id, checkpointSha256: ticket.checkpointSha256 };
  if (!owned || owned.key !== key || !documentRoomId(owned.epoch) || !documentRoomId(owned.id) || !Number.isSafeInteger(owned.revision) || owned.revision < 0 || !/^[a-f0-9]{64}$/.test(owned.checkpointSha256)) documentRoomFailure('invalid-ticket', 'Invalid document-room freeze ticket.');
  return Object.freeze(owned);
}
export function assertDocumentFreeze(row: DocumentRoomRecord, ticket: CoordinatedFreeze): void {
  if (row.key !== ticket.key || row.phase !== 'frozen' || row.preparationId !== null || row.freezeId !== ticket.id || row.epoch !== ticket.epoch || row.revision !== ticket.revision || row.checkpoint.manifest.checkpointSha256 !== ticket.checkpointSha256) documentRoomFailure('invalid-ticket', 'Document-room freeze ticket is no longer current.');
}
export const documentSnapshot = (row: DocumentRoomRecord): DocumentRoomSnapshot => Object.freeze({ key: row.key, epoch: row.epoch, revision: row.revision, phase: row.phase, protocol: documentProtocol(row.checkpoint), checkpoint: row.checkpoint });
function initialDocumentRoom(key: string, checkpoint: DocumentCheckpoint): DocumentRoomRecord {
  return {
    key, checkpoint, epoch: crypto.randomUUID(), generation: crypto.randomUUID(), revision: 0,
    phase: 'active', freezeId: null, preparationId: null, lastResume: null,
  };
}
export interface ValidatedDocumentCheckpoint { readonly checkpoint: DocumentCheckpoint; readonly protocol: DocumentProtocol; readonly identity: string }
const retainedProjection = (projection: LegacyProjectionOptions): RetainedProjectionCheck =>
  (document, base, room) => projectRetainedRoomAttributes(document, base, room, projection.structuredAttributes);

export async function validateDocumentCheckpoint(checkpoint: DocumentCheckpoint, schema: Schema, schemaVersion: string, projection: LegacyProjectionOptions): Promise<ValidatedDocumentCheckpoint> {
  if (documentProtocol(checkpoint) === 'retained') {
    const owned = await validateRetainedRoomCheckpoint(checkpoint as RetainedCheckpoint, schema, schemaVersion, retainedProjection(projection));
    return { checkpoint: owned, protocol: 'retained', identity: owned.manifest.roomId };
  }
  const restored = await restoreLegacyCheckpoint(checkpoint as LegacyCheckpoint, schema, schemaVersion, projection);
  try {
    assertLegacyCheckpointState(restored.document, restored.checkpoint);
    return { checkpoint: restored.checkpoint, protocol: 'legacy', identity: legacyNodeIdentity(restored.reader.root) };
  } finally { restored.document.destroy(); }
}
export async function applyDocumentRoomUpdate(source: DocumentCheckpoint, schema: Schema, schemaVersion: string, projection: LegacyProjectionOptions, supplied: Uint8Array): Promise<DocumentCheckpoint> {
  if (!(supplied instanceof Uint8Array) || !supplied.length || supplied.length > 64 * 1024 * 1024) documentRoomFailure('invalid-update', 'Invalid document update size.');
  const bytes = Uint8Array.from(supplied);
  try {
    // The retained writer validates the original checkpoint as it restores
    // the isolated document it will edit. Reuse that one restore.
    if (documentProtocol(source) === 'retained') return await applyRetainedRoomUpdate(source as RetainedCheckpoint, schema, schemaVersion, bytes, retainedProjection(projection));
    const before = await validateDocumentCheckpoint(source, schema, schemaVersion, projection);
    const restored = await restoreLegacyCheckpoint(before.checkpoint as LegacyCheckpoint, schema, schemaVersion, projection);
    try {
      Y.applyUpdate(restored.document, bytes);
      const next = await captureLegacyCheckpoint(restored.document, schema, schemaVersion, projection, restored.manifest.room, restored.reader.fragment), checked = await validateDocumentCheckpoint(next, schema, schemaVersion, projection);
      if (checked.identity !== before.identity) throw new Error('Legacy update replaced the authoritative XML root identity.');
      return checked.checkpoint;
    } finally { restored.document.destroy(); }
  } catch (cause) { throw new RetainedRoomError('invalid-update', 'Document update rejected without changing authoritative state.', { cause }); }
}

/** Private provider reference sharing one persistent live row across formats.
 * Every write must pass this authority; epochs/protocol labels are not auth. */
export class CoordinatedDocumentRoom {
  readonly projection: LegacyProjectionOptions;
  private pendingRetainedRead?: { readonly generation: string; readonly result: Promise<DocumentRoomRecord> };
  constructor(private readonly repository: DocumentRoomRepository, readonly key: string, private readonly schema: Schema, private readonly schemaVersion: string, projection: LegacyProjectionOptions = {}) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,193}$/.test(key)) throw new Error('Invalid document-room key.');
    this.projection = snapshotLegacyProjection(projection);
  }
  private async current(): Promise<DocumentRoomRecord> { const row = await this.repository.readDocument(this.key); validateCoordinatedRoomRecord(row, this.key, this.schemaVersion); documentProtocol(row.checkpoint); return row; }
  private async currentHeader(): Promise<DocumentRoomHeader> {
    if (!this.repository.readDocumentHeader) return this.current();
    const row = await this.repository.readDocumentHeader(this.key);
    validateCoordinatedRoomRecord(row, this.key, this.schemaVersion);
    documentProtocol(row.checkpoint);
    return row;
  }
  private async commit(row: DocumentRoomRecord, patch: Partial<DocumentRoomRecord>): Promise<DocumentRoomRecord> {
    const next = { ...row, ...patch, generation: crypto.randomUUID() };
    if (!await this.repository.compareDocument(this.key, row.generation, next)) documentRoomFailure('revision-conflict', 'Document room changed; retain pending edits and retry.'); return next;
  }
  async initialize(checkpoint: DocumentCheckpoint): Promise<DocumentRoomSnapshot> {
    const checked = await validateDocumentCheckpoint(checkpoint, this.schema, this.schemaVersion, this.projection);
    const row = initialDocumentRoom(this.key, checked.checkpoint);
    if (!await this.repository.createDocument(row)) documentRoomFailure('revision-conflict', 'Document room already exists.'); return documentSnapshot(row);
  }
  private async loadOrCreate(options: RetainedRoomProvisionOptions, mayCreate: boolean) {
    const { room = 'fountain', loadCheckpoint, signal } = options;
    if (typeof room !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,193}$/.test(room)
      || typeof loadCheckpoint !== 'function') throw new TypeError('Invalid retained room provisioning options.');
    signal?.throwIfAborted();

    const existing = await this.repository.readDocument(this.key);
    signal?.throwIfAborted();
    if (existing) return { row: existing, created: false };
    if (!mayCreate) documentRoomFailure('stale-epoch', 'A new room requires retained collaboration support.');

    const initial = await loadCheckpoint(signal);
    signal?.throwIfAborted();
    const checkpoint = await validateRetainedRoomCheckpoint(initial, this.schema, this.schemaVersion, retainedProjection(this.projection));
    if (checkpoint.manifest.room !== room) documentRoomFailure('revision-conflict', 'Initial checkpoint uses a different namespace.');
    const row = initialDocumentRoom(this.key, checkpoint);
    signal?.throwIfAborted();
    const created = await this.repository.createDocument(row);
    signal?.throwIfAborted();
    if (created) return { row, created };

    const winner = await this.current();
    signal?.throwIfAborted();
    return { row: winner, created };
  }

  /** Authorized load-or-create. A separate admission fence is required. */
  async provisionRetained(options: RetainedRoomProvisionOptions): Promise<DocumentRoomSnapshot> {
    const { room = 'fountain', signal, loadCheckpoint } = options;
    const { row, created } = await this.loadOrCreate({ room, signal, loadCheckpoint }, true);
    if (created) return documentSnapshot(row);
    validateCoordinatedRoomRecord(row, this.key, this.schemaVersion);
    if (documentProtocol(row.checkpoint) !== 'retained') documentRoomFailure('stale-epoch', 'Existing room requires explicit migration to retained storage.');
    if (row.phase !== 'active') documentRoomFailure('frozen', 'Existing room is frozen.');
    if (row.checkpoint.manifest.room !== room) documentRoomFailure('revision-conflict', 'Existing room uses a different namespace.');
    const checkpoint = await validateRetainedRoomCheckpoint(row.checkpoint as RetainedCheckpoint, this.schema, this.schemaVersion, retainedProjection(this.projection));
    signal?.throwIfAborted();
    return documentSnapshot({ ...row, checkpoint });
  }

  /** Choose the persisted format for an existing room. Only absent rooms use
   * the retained default. The returned admission must be fenced before attach. */
  async openForEditing(options: DocumentRoomOpenOptions): Promise<DocumentRoomOpenResult> {
    const protocols = options.protocols;
    if (!Array.isArray(protocols) || !protocols.length || protocols.length > 2 || protocols.some(protocol => protocol !== 'legacy' && protocol !== 'retained')) {
      throw new TypeError('Invalid supported document-room protocols.');
    }
    const supported = new Set(protocols), { signal } = options;
    const { row, created } = await this.loadOrCreate(options, supported.has('retained'));
    validateCoordinatedRoomRecord(row, this.key, this.schemaVersion);
    const protocol = documentProtocol(row.checkpoint);
    if (!supported.has(protocol)) documentRoomFailure('stale-epoch', 'This client does not support the existing room format.');
    if (row.phase !== 'active') documentRoomFailure('frozen', 'Existing room is frozen.');
    const checked = created
      ? { checkpoint: row.checkpoint, identity: (row.checkpoint as RetainedCheckpoint).manifest.roomId }
      : await validateDocumentCheckpoint(row.checkpoint, this.schema, this.schemaVersion, this.projection);
    if ((await this.currentHeader()).generation !== row.generation) documentRoomFailure('revision-conflict', 'The room changed while opening. Retry before connecting.');
    signal?.throwIfAborted();
    const snapshot = documentSnapshot({ ...row, checkpoint: checked.checkpoint });
    const room = checked.checkpoint.manifest.room;
    const structuredMap = this.admissionStructuredMap(protocol, room);
    const admission = Object.freeze({ key: this.key, epoch: row.epoch, revision: row.revision, protocol, room,
      identity: checked.identity, ...(structuredMap !== undefined ? { structuredMap } : {}) });
    return Object.freeze({ snapshot, admission });
  }
  private admissionStructuredMap(protocol: DocumentProtocol, room: string): string | undefined {
    const structured = this.projection.structuredAttributes;
    return protocol === 'retained' && structured ? roomStructuredMapName(room, structured.mapName) : undefined;
  }
  async snapshot(): Promise<DocumentRoomSnapshot> { const row = await this.current(), checked = await validateDocumentCheckpoint(row.checkpoint, this.schema, this.schemaVersion, this.projection); return documentSnapshot({ ...row, checkpoint: checked.checkpoint }); }
  /** Revision-aware read for a bound retained transport. An idle client gets no
   * checkpoint. The durable row still fences epoch, protocol and phase. */
  async pollRetained(lease: DocumentRoomAdmission): Promise<DocumentRoomSnapshot | null> {
    const expected = { ...lease };
    const header = await this.retainedReader(expected);
    if (expected.revision === header.revision) return null;
    const checked = await this.sharedRetainedRead(header.generation);
    assertRetainedRoomReader(checked, expected);
    if ((await this.currentHeader()).generation !== checked.generation) {
      documentRoomFailure('revision-conflict', 'Authority changed during poll verification; retry explicitly.');
    }
    return documentSnapshot(checked);
  }
  private sharedRetainedRead(generation: string): Promise<DocumentRoomRecord> {
    const pending = this.pendingRetainedRead;
    if (pending?.generation === generation) return pending.result;
    const verify = async () => {
      const row = await this.current();
      if (row.generation !== generation) documentRoomFailure('revision-conflict', 'Authority changed before loading the poll checkpoint.');
      const checked = await validateDocumentCheckpoint(row.checkpoint, this.schema, this.schemaVersion, this.projection);
      return { ...row, checkpoint: checked.checkpoint };
    };
    // Share only the in-flight work for this generation. A settled result
    // never substitutes for a fresh database read.
    const result: Promise<DocumentRoomRecord> = verify().finally(() => {
      if (this.pendingRetainedRead?.result === result) this.pendingRetainedRead = undefined;
    });
    this.pendingRetainedRead = { generation, result };
    return result;
  }
  /** Presence carries no document bytes, even when the receiver is behind. */
  async fenceRetainedPresence(lease: DocumentRoomAdmission): Promise<void> {
    await this.retainedReader({ ...lease });
  }
  private async retainedReader(expected: DocumentRoomAdmission): Promise<DocumentRoomHeader> {
    const row = await this.currentHeader();
    assertRetainedRoomReader(row, expected);
    return row;
  }
  /** Read-only connection fence. Every later write must still check its epoch;
   * this receipt does not reserve an active room or grant authorization. */
  async admit(request: DocumentRoomAdmission): Promise<DocumentRoomSnapshot> {
    const expected = request && { key: request.key, epoch: request.epoch, revision: request.revision, protocol: request.protocol,
      room: request.room, identity: request.identity, structuredMap: request.structuredMap };
    if (!expected || expected.key !== this.key || !documentRoomId(expected.epoch) || !Number.isSafeInteger(expected.revision) || expected.revision < 0
      || !['legacy', 'retained'].includes(expected.protocol) || typeof expected.room !== 'string' || expected.room.length > 1_000
      || typeof expected.identity !== 'string' || !expected.identity || expected.identity.length > 200) documentRoomFailure('invalid-ticket', 'Invalid authority admission request.');
    const row = await this.current();
    if (row.epoch !== expected.epoch || documentProtocol(row.checkpoint) !== expected.protocol) documentRoomFailure('stale-epoch', 'Admission epoch/protocol is stale; preserve pending edits.');
    if (row.phase !== 'active') documentRoomFailure('frozen', 'Authority admission refused: room is frozen.');
    if (row.revision < expected.revision || row.checkpoint.manifest.room !== expected.room) documentRoomFailure('revision-conflict', 'Admission revision or namespace is incompatible.');
    if (expected.structuredMap !== this.admissionStructuredMap(expected.protocol, expected.room)) {
      documentRoomFailure('invalid-ticket', 'Admission structured attribute map differs.');
    }
    const checked = await validateDocumentCheckpoint(row.checkpoint, this.schema, this.schemaVersion, this.projection);
    if (checked.identity !== expected.identity) documentRoomFailure('invalid-ticket', 'Admission native room identity differs.');
    if ((await this.currentHeader()).generation !== row.generation) documentRoomFailure('revision-conflict', 'Authority changed during admission verification; retry explicitly.');
    return documentSnapshot({ ...row, checkpoint: checked.checkpoint });
  }
  async write(request: DocumentWriteRequest): Promise<DocumentRoomSnapshot> {
    return this.writeUpdate(request);
  }
  async writeReviewed(request: DocumentWriteRequest, operation: DocumentReviewOperation): Promise<DocumentRoomSnapshot> {
    return this.writeUpdate(request, { id: operation.id, digest: operation.digest });
  }
  private async writeUpdate(request: DocumentWriteRequest, operation?: DocumentReviewOperation): Promise<DocumentRoomSnapshot> {
    const { epoch, protocol, expectedRevision } = request;
    if (operation && (!this.repository.commitDocumentReview || protocol !== 'retained'
      || !Number.isSafeInteger(expectedRevision) || !documentRoomId(operation.id) || !/^[a-f0-9]{64}$/.test(operation.digest))) {
      documentRoomFailure('invalid-ticket', 'Invalid document review operation.');
    }
    const row = await this.current();
    if (epoch !== row.epoch || protocol !== documentProtocol(row.checkpoint)) documentRoomFailure('stale-epoch', 'Writer epoch/protocol is stale; reconnect and retain pending edits.');
    if (row.phase !== 'active') documentRoomFailure('frozen', 'Document room is frozen; retain pending edits.');
    if (expectedRevision !== undefined && expectedRevision !== row.revision) {
      documentRoomFailure('revision-conflict', 'The reviewed room revision changed. Review the latest document before applying.');
    }
    const checkpoint = await applyDocumentRoomUpdate(row.checkpoint, this.schema, this.schemaVersion, this.projection, request.update);
    const changed = checkpoint.manifest.checkpointSha256 !== row.checkpoint.manifest.checkpointSha256;
    if (changed && row.revision >= Number.MAX_SAFE_INTEGER) documentRoomFailure('revision-conflict', 'Document revision capacity exceeded.');
    if (operation) {
      const next = changed ? { ...row, checkpoint, generation: crypto.randomUUID(), revision: row.revision + 1 } : undefined;
      if (!await this.repository.commitDocumentReview!(row, next, operation)) {
        documentRoomFailure('revision-conflict', 'Document room changed before the review receipt was saved.');
      }
      return documentSnapshot(next ?? { ...row, checkpoint });
    }
    if (!changed) {
      // An already integrated update is a read acknowledgement. Check the
      // same generation fence a writing CAS would require before returning it.
      if ((await this.currentHeader()).generation !== row.generation) documentRoomFailure('revision-conflict', 'Authority changed while acknowledging the replay. Retain pending edits and retry.');
      return documentSnapshot({ ...row, checkpoint });
    }
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
