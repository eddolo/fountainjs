import type { Schema } from '../core/schema';
import { checkpointWire } from './retained-checkpoint';
import type { CoordinatedFreeze } from './retained-room-coordinator';
import { validateCoordinatedRoomRecord } from './retained-room-coordinator';
import type { RetainedRoomVersion } from './retained-room-store';
import { snapshotLegacyProjection, type LegacyCheckpoint, type LegacyProjectionOptions } from './legacy-checkpoint';
import { buildLegacyMigrationCandidate, snapshotLegacyMigrationOptions, type LegacyMigrationCandidate, type LegacyMigrationOptions } from './legacy-migration';
import { snapshotRetainedHandoffPolicy, type RetainedHandoffPolicy } from './retained-handoff';
import { documentProtocol, documentRoomId as validId, documentRoomFailure as fail, documentSnapshot, validateDocumentCheckpoint, applyDocumentRoomUpdate, copyDocumentFreeze, assertDocumentFreeze,
  type DocumentRoomRepository, type DocumentRoomRecord, type DocumentRoomSnapshot, type DocumentCheckpoint } from './document-room';

export interface CrossFormatArchive {
  readonly key: string; readonly id: string; readonly generation: string;
  readonly kind: 'legacy-migration' | 'format-rollback';
  readonly rollbackOf: string | null; readonly restore: 'frozen-source' | 'source-branch' | null;
  readonly policy: RetainedHandoffPolicy;
  readonly source: DocumentRoomRecord; readonly destination: DocumentRoomRecord;
  readonly sourceIdentity: string; readonly destinationIdentity: string;
  readonly branch: DocumentCheckpoint; readonly branchRevision: number;
  /** Older same-namespace archives predate the optional mapping fields. */
  readonly candidateReport: (Omit<LegacyMigrationCandidate['report'], 'sourceRoom' | 'destinationRoom'> & Partial<Pick<LegacyMigrationCandidate['report'], 'sourceRoom' | 'destinationRoom'>>) | null;
}
/** Trusted storage: reads return owned snapshots. The live switch/archive and
 * branch replacement/raw-batch insertion each require one atomic transaction.
 * A false CAS result must change neither side. */
export interface CrossFormatRepository extends DocumentRoomRepository {
  readCrossArchive(key: string, id: string): Promise<CrossFormatArchive | undefined>;
  readRetiredEpoch(key: string, epoch: string): Promise<CrossFormatArchive | undefined>;
  installCrossArchive(key: string, expectedGeneration: string, next: DocumentRoomRecord, archive: CrossFormatArchive, prerequisite?: { readonly id: string; readonly generation: string }): Promise<boolean>;
  compareCrossBranch(key: string, id: string, expectedGeneration: string, checkpoint: DocumentCheckpoint, batch: { readonly update: Uint8Array; readonly sha256: string }): Promise<boolean>;
  readCrossBatch(key: string, archiveId: string, revision: number): Promise<CrossFormatBatch | undefined>;
  findCrossBatch(key: string, archiveId: string, sha256: string): Promise<CrossFormatBatch | undefined>;
}
export interface CrossFormatBatch {
  readonly key: string; readonly archiveId: string; readonly sourceEpoch: string;
  readonly revision: number; readonly sha256: string; readonly update: Uint8Array;
}
export interface CrossFormatHandoffResult {
  readonly archive: CrossFormatArchive; readonly snapshot: DocumentRoomSnapshot;
  readonly replayed: boolean; readonly current: boolean;
}
export interface LegacyMigrationPreflight extends RetainedRoomVersion {
  readonly key: string;
  readonly sourceCheckpointSha256: string;
  readonly documentSha256: string;
  readonly report: Omit<LegacyMigrationCandidate['report'], 'destinationRoomId' | 'activation'>;
}

/** Private administrative boundary. Host authorization and external coordination
 * are required; neither protocol labels nor host receipts provide permission. */
export class CrossFormatRoomHandoff {
  private readonly projection: LegacyProjectionOptions;
  constructor(private readonly repository: CrossFormatRepository, readonly key: string, private readonly schema: Schema, private readonly schemaVersion: string, projection: LegacyProjectionOptions = {}) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,193}$/.test(key)) throw new Error('Invalid cross-format room key.');
    this.projection = snapshotLegacyProjection(projection);
  }
  private async current(): Promise<DocumentRoomRecord> { const row = await this.repository.readDocument(this.key); validateCoordinatedRoomRecord(row, this.key, this.schemaVersion); documentProtocol(row.checkpoint); return row; }
  private check(archive: CrossFormatArchive | undefined): asserts archive is CrossFormatArchive {
    if (!archive || archive.key !== this.key || !validId(archive.id) || !validId(archive.generation) || !['legacy-migration', 'format-rollback'].includes(archive.kind)
      || !Number.isSafeInteger(archive.branchRevision) || archive.branchRevision < 0) throw new Error('Invalid or missing cross-format archive.');
    validateCoordinatedRoomRecord(archive.source, this.key, this.schemaVersion); validateCoordinatedRoomRecord(archive.destination, this.key, this.schemaVersion); snapshotRetainedHandoffPolicy(archive.policy);
    const source = archive.source, destination = archive.destination;
    if (source.phase !== 'frozen' || source.preparationId !== null || destination.phase !== 'active' || source.epoch === destination.epoch || source.generation === destination.generation
      || destination.revision !== source.revision + 1
      || documentProtocol(source.checkpoint) === documentProtocol(destination.checkpoint) || documentProtocol(archive.branch) !== documentProtocol(source.checkpoint)
      || archive.branch.manifest.guid !== source.checkpoint.manifest.guid || typeof archive.sourceIdentity !== 'string' || typeof archive.destinationIdentity !== 'string') throw new Error('Incompatible cross-format archive.');
    if (archive.kind === 'legacy-migration') {
      if (documentProtocol(source.checkpoint) !== 'legacy' || archive.rollbackOf !== null || archive.restore !== null || !archive.candidateReport
        || archive.candidateReport.sourceFormat !== 'legacy-xml' || archive.candidateReport.sourceGuid !== source.checkpoint.manifest.guid
        || archive.candidateReport.destinationRoomId !== archive.destinationIdentity || source.checkpoint.manifest.documentSha256 !== destination.checkpoint.manifest.documentSha256
        || (archive.candidateReport.sourceRoom === undefined) !== (archive.candidateReport.destinationRoom === undefined)
        || (archive.candidateReport.sourceRoom ?? source.checkpoint.manifest.room) !== source.checkpoint.manifest.room
        || (archive.candidateReport.destinationRoom ?? source.checkpoint.manifest.room) !== destination.checkpoint.manifest.room) throw new Error('Invalid legacy migration archive.');
    } else if (!validId(archive.rollbackOf) || !['frozen-source', 'source-branch'].includes(archive.restore!) || archive.candidateReport !== null) throw new Error('Invalid cross-format rollback archive.');
  }
  private async owned(archive: CrossFormatArchive): Promise<CrossFormatArchive> {
    this.check(archive);
    const source = await validateDocumentCheckpoint(archive.source.checkpoint, this.schema, this.schemaVersion, this.projection), destination = await validateDocumentCheckpoint(archive.destination.checkpoint, this.schema, this.schemaVersion, this.projection), branch = await validateDocumentCheckpoint(archive.branch, this.schema, this.schemaVersion, this.projection);
    if (source.identity !== archive.sourceIdentity || destination.identity !== archive.destinationIdentity || branch.identity !== source.identity) throw new Error('Cross-format archive identity mismatch.');
    return Object.freeze({ ...archive, policy: snapshotRetainedHandoffPolicy(archive.policy), source: Object.freeze({ ...archive.source, checkpoint: source.checkpoint }), destination: Object.freeze({ ...archive.destination, checkpoint: destination.checkpoint }), branch: branch.checkpoint });
  }
  private async result(archive: CrossFormatArchive, row: DocumentRoomRecord, replayed: boolean): Promise<CrossFormatHandoffResult> {
    const checked = await validateDocumentCheckpoint(row.checkpoint, this.schema, this.schemaVersion, this.projection);
    return Object.freeze({ archive: await this.owned(archive), snapshot: documentSnapshot({ ...row, checkpoint: checked.checkpoint }), replayed, current: row.epoch === archive.destination.epoch });
  }
  private async replay(ticket: CoordinatedFreeze, operation: string, kind: CrossFormatArchive['kind'], policy: RetainedHandoffPolicy, rollbackOf: string | null, restore: CrossFormatArchive['restore']): Promise<CrossFormatHandoffResult | undefined> {
    if (!validId(operation)) throw new Error('Cross-format handoff requires a stable operation UUID.');
    const archive = await this.repository.readCrossArchive(this.key, operation); if (!archive) return undefined; this.check(archive);
    if (archive.kind !== kind || archive.rollbackOf !== rollbackOf || archive.restore !== restore || archive.policy.externalReceipt !== policy.externalReceipt
      || archive.source.freezeId !== ticket.id || archive.source.epoch !== ticket.epoch || archive.source.revision !== ticket.revision || archive.source.checkpoint.manifest.checkpointSha256 !== ticket.checkpointSha256) fail('invalid-ticket', 'Operation UUID belongs to another cross-format handoff.');
    return this.result(archive, await this.current(), true);
  }
  private async install(row: DocumentRoomRecord, checkpoint: DocumentCheckpoint, operation: string, policy: RetainedHandoffPolicy, kind: CrossFormatArchive['kind'], rollbackOf: string | null, restore: CrossFormatArchive['restore'], candidateReport: CrossFormatArchive['candidateReport'], prerequisite?: { id: string; generation: string }): Promise<CrossFormatHandoffResult> {
    if (row.revision >= Number.MAX_SAFE_INTEGER) fail('revision-conflict', 'Document revision capacity exceeded.');
    const source = await validateDocumentCheckpoint(row.checkpoint, this.schema, this.schemaVersion, this.projection), destination = await validateDocumentCheckpoint(checkpoint, this.schema, this.schemaVersion, this.projection);
    const next: DocumentRoomRecord = { ...row, checkpoint: destination.checkpoint, epoch: crypto.randomUUID(), generation: crypto.randomUUID(), revision: row.revision + 1, phase: 'active', freezeId: null, preparationId: null, lastResume: null };
    const archive: CrossFormatArchive = { key: this.key, id: operation, generation: crypto.randomUUID(), kind, rollbackOf, restore, policy, candidateReport,
      source: { ...row, checkpoint: source.checkpoint }, destination: next, sourceIdentity: source.identity, destinationIdentity: destination.identity, branch: source.checkpoint, branchRevision: 0 };
    this.check(archive);
    if (!await this.repository.installCrossArchive(this.key, row.generation, next, archive, prerequisite)) fail('revision-conflict', 'Source or archived branch changed; no cross-format installation committed.');
    return this.result(archive, next, false);
  }
  /** Rehearse conversion against a live revision. The result is evidence for
   * the operator and does not authorize, freeze or prepare the actual switch. */
  async preflightLegacy(expected: RetainedRoomVersion, options: LegacyMigrationOptions): Promise<LegacyMigrationPreflight> {
    const { epoch, revision } = expected;
    if (!validId(epoch) || !Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid legacy migration revision.');
    options = snapshotLegacyMigrationOptions(options);
    const row = await this.current();
    if (row.epoch !== epoch || documentProtocol(row.checkpoint) !== 'legacy') fail('stale-epoch', 'The requested legacy room is no longer active.');
    if (row.phase !== 'active') fail('frozen', 'The legacy room is already frozen.');
    if (row.revision !== revision) fail('revision-conflict', 'The legacy room changed. Refresh before checking migration.');
    if (revision === Number.MAX_SAFE_INTEGER) fail('revision-conflict', 'Document revision capacity exceeded.');

    const candidate = await buildLegacyMigrationCandidate(row.checkpoint as LegacyCheckpoint, this.schema, this.schemaVersion, options, this.projection);
    const current = this.repository.readDocumentHeader ? await this.repository.readDocumentHeader(this.key) : await this.current();
    validateCoordinatedRoomRecord(current, this.key, this.schemaVersion);
    if (current.generation !== row.generation) fail('revision-conflict', 'The legacy room changed during the migration check. Refresh and retry.');
    const { destinationRoomId: _identity, activation: _activation, ...report } = candidate.report;
    return Object.freeze({
      key: row.key, epoch, revision,
      sourceCheckpointSha256: candidate.source.manifest.checkpointSha256,
      documentSha256: candidate.source.manifest.documentSha256,
      report: Object.freeze(report),
    });
  }
  async migrateLegacy(ticket: CoordinatedFreeze, operation: string, options: LegacyMigrationOptions, policy: RetainedHandoffPolicy): Promise<CrossFormatHandoffResult> {
    ticket = copyDocumentFreeze(ticket, this.key); options = snapshotLegacyMigrationOptions(options); policy = snapshotRetainedHandoffPolicy(policy);
    const replay = await this.replay(ticket, operation, 'legacy-migration', policy, null, null);
    if (replay) {
      if (replay.archive.destination.checkpoint.manifest.room !== (options.destinationRoom ?? replay.archive.source.checkpoint.manifest.room)) fail('invalid-ticket', 'Operation UUID belongs to another destination namespace.');
      return replay;
    }
    const row = await this.current(); assertDocumentFreeze(row, ticket); if (documentProtocol(row.checkpoint) !== 'legacy') fail('stale-epoch', 'Migration source is no longer a legacy room.');
    const candidate = await buildLegacyMigrationCandidate(row.checkpoint as LegacyCheckpoint, this.schema, this.schemaVersion, options, this.projection);
    return this.install(row, candidate.destination, operation, policy, 'legacy-migration', null, null, candidate.report);
  }
  async rollback(ticket: CoordinatedFreeze, operation: string, archiveId: string, restore: 'frozen-source' | 'source-branch', policy: RetainedHandoffPolicy): Promise<CrossFormatHandoffResult> {
    ticket = copyDocumentFreeze(ticket, this.key); policy = snapshotRetainedHandoffPolicy(policy);
    if (!validId(archiveId) || !['frozen-source', 'source-branch'].includes(restore)) throw new Error('Invalid cross-format rollback selection.');
    const replay = await this.replay(ticket, operation, 'format-rollback', policy, archiveId, restore); if (replay) return replay;
    const row = await this.current(); assertDocumentFreeze(row, ticket); const saved = await this.repository.readCrossArchive(this.key, archiveId); this.check(saved); const archive = await this.owned(saved), current = await validateDocumentCheckpoint(row.checkpoint, this.schema, this.schemaVersion, this.projection);
    if (current.protocol !== documentProtocol(archive.destination.checkpoint) || current.identity !== archive.destinationIdentity || row.checkpoint.manifest.room !== archive.destination.checkpoint.manifest.room) fail('invalid-ticket', 'Rollback archive is outside the current room lineage.');
    return this.install(row, restore === 'frozen-source' ? archive.source.checkpoint : archive.branch, operation, policy, 'format-rollback', archiveId, restore, null, { id: archiveId, generation: archive.generation });
  }
  async retiredEpoch(epoch: string): Promise<CrossFormatArchive | undefined> { if (!validId(epoch)) throw new Error('Invalid retired writer epoch.'); const archive = await this.repository.readRetiredEpoch(this.key, epoch); return archive && this.owned(archive); }
  async retainLateUpdate(request: { readonly archiveId: string; readonly sourceEpoch: string; readonly update: Uint8Array }): Promise<CrossFormatArchive> {
    const id = request.archiveId, epoch = request.sourceEpoch, saved = await this.repository.readCrossArchive(this.key, id); this.check(saved);
    if (saved.source.epoch !== epoch) fail('stale-epoch', 'Late batch belongs to another retired writer epoch.');
    const archive = await this.owned(saved), supplied = request.update;
    if (!(supplied instanceof Uint8Array) || !supplied.length || supplied.length > 64 * 1024 * 1024) fail('invalid-update', 'Invalid retired batch size.');
    const update = Uint8Array.from(supplied), sha256 = await checkpointWire.digest(update);
    const replay = await this.replayBatch(archive, sha256, update);
    if (replay) return replay;
    const checkpoint = await applyDocumentRoomUpdate(archive.branch, this.schema, this.schemaVersion, this.projection, update);
    // Preserve the original received operations too. A legacy CRDT merge can
    // hide old-client intent even when its projected document remains valid.
    if (!await this.repository.compareCrossBranch(this.key, id, archive.generation, checkpoint, { update, sha256 })) {
      const committed = await this.replayBatch(archive, sha256, update);
      if (committed) return committed;
      fail('revision-conflict', 'Retired source branch changed; retain the batch and retry.');
    }
    const next = await this.repository.readCrossArchive(this.key, id); this.check(next); return this.owned(next);
  }

  private async replayBatch(previous: CrossFormatArchive, sha256: string, update: Uint8Array): Promise<CrossFormatArchive | undefined> {
    const batch = await this.repository.findCrossBatch(this.key, previous.id, sha256);
    if (!batch) return undefined;
    const archive = await this.repository.readCrossArchive(this.key, previous.id);
    this.check(archive);
    const accepted = await this.verifyBatch(archive, batch, batch.revision);
    const bytes = accepted.update;
    if (accepted.sourceEpoch !== previous.source.epoch || accepted.sha256 !== sha256
      || bytes.length !== update.length || !bytes.every((byte, index) => byte === update[index])) {
      throw new Error('Retired batch replay does not match the accepted operations.');
    }
    return archive.generation === previous.generation ? previous : this.owned(archive);
  }

  /** Privileged recovery of exact accepted operations, independent of the
   * merged branch's projection. Not an automatic cross-format conflict merge. */
  async retiredBatch(archiveId: string, revision: number): Promise<CrossFormatBatch> {
    if (!validId(archiveId) || !Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid retired batch selection.');
    const archive = await this.repository.readCrossArchive(this.key, archiveId); this.check(archive);
    const batch = await this.repository.readCrossBatch(this.key, archiveId, revision);
    return this.verifyBatch(archive, batch, revision);
  }

  private async verifyBatch(archive: CrossFormatArchive, batch: CrossFormatBatch | undefined, revision: number): Promise<CrossFormatBatch> {
    if (!batch || batch.key !== this.key || batch.archiveId !== archive.id || batch.revision !== revision
      || !Number.isSafeInteger(revision) || revision < 1 || revision > archive.branchRevision || batch.sourceEpoch !== archive.source.epoch
      || typeof batch.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(batch.sha256)) throw new Error('Missing or incompatible retired batch.');
    const supplied = batch.update;
    if (!(supplied instanceof Uint8Array) || !supplied.length || supplied.length > 64 * 1024 * 1024) throw new Error('Invalid retained raw batch.');
    const update = Uint8Array.from(supplied);
    if (await checkpointWire.digest(update) !== batch.sha256) throw new Error('Retired batch checksum mismatch.');
    return Object.freeze({ key: this.key, archiveId: archive.id, sourceEpoch: batch.sourceEpoch, revision, sha256: batch.sha256, get update() { return update.slice(); } });
  }
}
