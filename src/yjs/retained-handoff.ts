import type { Schema } from '../core/schema';
import type { RetainedCheckpoint } from './retained-checkpoint';
import { buildRetainedMigrationCandidate, snapshotRetainedMigrationOptions, type RetainedMigrationOptions, type RetainedMigrationCandidate } from './retained-migration';
import { validateRetainedRoomRecord, type RetainedRoomRepository, type RetainedRoomRecord, type CoordinatedFreeze, type CoordinatedRoomSnapshot } from './retained-room-coordinator';
import { applyRetainedRoomUpdate, validateRetainedRoomCheckpoint, RetainedRoomError } from './retained-room-store';

export interface RetainedHandoffPolicy {
  readonly history: 'reset-with-source-archive';
  readonly offline: 'retain-retired-room-branches';
  /** Host's durable coordination receipt, not authentication or proof of consent. */
  readonly externalReceipt: string;
}
export interface RetainedRoomArchive {
  readonly key: string;
  readonly id: string;
  readonly generation: string;
  readonly kind: 'migration' | 'rollback';
  readonly rollbackOf: string | null;
  readonly restore: 'frozen-source' | 'retained-branch' | null;
  readonly policy: RetainedHandoffPolicy;
  readonly candidateReport: RetainedMigrationCandidate['report'] | null;
  /** Positive live checkpoint savings required for a guarded migration. */
  readonly minimumBytesSaved?: number;
  readonly source: RetainedRoomRecord;
  readonly destination: RetainedRoomRecord;
  /** Separately mutable late-update branch; source/destination stay immutable. */
  readonly branch: RetainedCheckpoint;
  readonly branchRevision: number;
}
export interface RetainedHandoffRepository extends RetainedRoomRepository {
  readArchive(key: string, id: string): Promise<RetainedRoomArchive | undefined>;
  readRetiredRoom(key: string, roomId: string): Promise<RetainedRoomArchive | undefined>;
  /** Live-row CAS and archive insertion must commit or roll back together. */
  installWithArchive(key: string, expectedGeneration: string, next: RetainedRoomRecord, archive: RetainedRoomArchive,
    prerequisite?: { readonly id: string; readonly generation: string }): Promise<boolean>;
  compareArchiveBranch(key: string, id: string, expectedGeneration: string, checkpoint: RetainedCheckpoint): Promise<boolean>;
}
export interface RetainedHandoffResult {
  readonly archive: RetainedRoomArchive;
  readonly snapshot: CoordinatedRoomSnapshot;
  readonly replayed: boolean;
  readonly current: boolean;
}
const uuid = (): string => globalThis.crypto.randomUUID();
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const fail = (code: ConstructorParameters<typeof RetainedRoomError>[0], message: string): never => { throw new RetainedRoomError(code, message); };
const validSavings = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

export interface RetainedHandoffMigrationOptions extends RetainedMigrationOptions {
  readonly minimumBytesSaved?: number;
}
export function snapshotRetainedHandoffPolicy(value: RetainedHandoffPolicy): RetainedHandoffPolicy {
  const history = value?.history, offline = value?.offline, externalReceipt = value?.externalReceipt;
  if (history !== 'reset-with-source-archive' || offline !== 'retain-retired-room-branches' || typeof externalReceipt !== 'string'
    || !externalReceipt.trim() || externalReceipt.length > 1_000 || /[\u0000-\u001f\u007f]/.test(externalReceipt)) throw new Error('Handoff requires explicit history/offline policy and a host coordination receipt.');
  return Object.freeze({ history, offline, externalReceipt });
}

/** Private administrative backend reference. Authorization, user approval and
 * external-system coordination remain host responsibilities. Never auto-merges
 * old-room operations into a new CRDT room. */
export class RetainedRoomHandoff {
  constructor(private readonly repository: RetainedHandoffRepository, readonly key: string, private readonly schema: Schema, private readonly schemaVersion: string) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,193}$/.test(key)) throw new Error('Invalid handoff room key.');
  }
  private ticketCopy(ticket: CoordinatedFreeze): CoordinatedFreeze {
    const owned = ticket && { key: ticket.key, epoch: ticket.epoch, revision: ticket.revision, id: ticket.id, checkpointSha256: ticket.checkpointSha256 };
    if (!owned || owned.key !== this.key || !id(owned.epoch) || !id(owned.id) || !Number.isSafeInteger(owned.revision) || owned.revision < 0
      || !/^[a-f0-9]{64}$/.test(owned.checkpointSha256)) fail('invalid-ticket', 'Invalid handoff freeze ticket.');
    return Object.freeze(owned);
  }

  private async current(): Promise<RetainedRoomRecord> {
    const row = await this.repository.read(this.key); validateRetainedRoomRecord(row, this.key, this.schemaVersion); return row;
  }
  private frozen(row: RetainedRoomRecord, ticket: CoordinatedFreeze): void {
    if (!ticket || ticket.key !== this.key || row.phase !== 'frozen' || row.freezeId !== ticket.id || row.preparationId !== null
      || row.epoch !== ticket.epoch || row.revision !== ticket.revision || row.checkpoint.manifest.checkpointSha256 !== ticket.checkpointSha256) fail('invalid-ticket', 'Handoff requires the exact unprepared frozen source revision.');
  }
  private checkArchive(archive: RetainedRoomArchive | undefined): asserts archive is RetainedRoomArchive {
    if (!archive || archive.key !== this.key || !id(archive.id) || !id(archive.generation) || !['migration', 'rollback'].includes(archive.kind)
      || !Number.isSafeInteger(archive.branchRevision) || archive.branchRevision < 0) throw new Error('Invalid or missing retained archive.');
    validateRetainedRoomRecord(archive.source, this.key, this.schemaVersion); validateRetainedRoomRecord(archive.destination, this.key, this.schemaVersion);
    snapshotRetainedHandoffPolicy(archive.policy);
    const { minimumBytesSaved } = archive;
    if (minimumBytesSaved !== undefined && (archive.kind !== 'migration' || !validSavings(minimumBytesSaved)
      || archive.source.checkpoint.manifest.bytes - archive.destination.checkpoint.manifest.bytes < minimumBytesSaved)) {
      throw new Error('Invalid retained archive compaction requirement.');
    }
    if (archive.source.phase !== 'frozen' || archive.destination.phase !== 'active' || archive.source.epoch === archive.destination.epoch
      || archive.destination.revision !== archive.source.revision + 1 || archive.source.checkpoint.manifest.room !== archive.destination.checkpoint.manifest.room
      || archive.branch.manifest.roomId !== archive.source.checkpoint.manifest.roomId || archive.branch.manifest.guid !== archive.source.checkpoint.manifest.guid
      || archive.source.checkpoint.manifest.roomId === archive.destination.checkpoint.manifest.roomId || archive.source.checkpoint.manifest.guid === archive.destination.checkpoint.manifest.guid
      || archive.kind === 'migration' && (archive.rollbackOf !== null || archive.restore !== null || !archive.candidateReport
        || archive.source.checkpoint.manifest.documentSha256 !== archive.destination.checkpoint.manifest.documentSha256)
      || archive.kind === 'rollback' && (!id(archive.rollbackOf) || !['frozen-source', 'retained-branch'].includes(archive.restore!))) throw new Error('Incompatible retained archive state.');
  }
  private async ownedArchive(archive: RetainedRoomArchive): Promise<RetainedRoomArchive> {
    this.checkArchive(archive);
    const source = { ...archive.source, checkpoint: await validateRetainedRoomCheckpoint(archive.source.checkpoint, this.schema, this.schemaVersion) };
    const destination = { ...archive.destination, checkpoint: await validateRetainedRoomCheckpoint(archive.destination.checkpoint, this.schema, this.schemaVersion) };
    const branch = await validateRetainedRoomCheckpoint(archive.branch, this.schema, this.schemaVersion);
    return Object.freeze({ ...archive, source: Object.freeze(source), destination: Object.freeze(destination), branch });
  }
  private async result(archive: RetainedRoomArchive, row: RetainedRoomRecord, replayed: boolean): Promise<RetainedHandoffResult> {
    const checkpoint = await validateRetainedRoomCheckpoint(row.checkpoint, this.schema, this.schemaVersion);
    return Object.freeze({ archive: await this.ownedArchive(archive), snapshot: Object.freeze({ key: row.key, epoch: row.epoch, revision: row.revision, phase: row.phase, checkpoint }), replayed, current: row.epoch === archive.destination.epoch });
  }
  private async replay(operationId: string, ticket: CoordinatedFreeze, kind: RetainedRoomArchive['kind'], policy: RetainedHandoffPolicy, rollbackOf: string | null, restore: RetainedRoomArchive['restore'], minimumBytesSaved?: number): Promise<RetainedHandoffResult | undefined> {
    if (!id(operationId)) throw new Error('Handoff needs a stable operation UUID.');
    const archive = await this.repository.readArchive(this.key, operationId); if (!archive) return undefined;
    this.checkArchive(archive);
    if (!ticket || ticket.key !== this.key || archive.kind !== kind || archive.rollbackOf !== rollbackOf || archive.restore !== restore || archive.minimumBytesSaved !== minimumBytesSaved
      || archive.source.freezeId !== ticket.id || archive.source.epoch !== ticket.epoch || archive.source.revision !== ticket.revision
      || archive.source.checkpoint.manifest.checkpointSha256 !== ticket.checkpointSha256 || archive.policy.externalReceipt !== policy.externalReceipt) fail('invalid-ticket', 'Operation UUID belongs to a different handoff.');
    return this.result(archive, await this.current(), true);
  }
  private async install(row: RetainedRoomRecord, destination: RetainedCheckpoint, operationId: string, kind: RetainedRoomArchive['kind'], policy: RetainedHandoffPolicy,
    rollbackOf: string | null, restore: RetainedRoomArchive['restore'], report: RetainedMigrationCandidate['report'] | null, prerequisite?: { id: string; generation: string }, minimumBytesSaved?: number): Promise<RetainedHandoffResult> {
    if (row.revision >= Number.MAX_SAFE_INTEGER) fail('revision-conflict', 'Retained revision capacity exceeded.');
    const sourceCheckpoint = await validateRetainedRoomCheckpoint(row.checkpoint, this.schema, this.schemaVersion);
    const checkpoint = await validateRetainedRoomCheckpoint(destination, this.schema, this.schemaVersion);
    if (checkpoint.manifest.room !== sourceCheckpoint.manifest.room || checkpoint.manifest.roomId === sourceCheckpoint.manifest.roomId) throw new Error('Handoff requires a distinct compatible destination room.');
    const next: RetainedRoomRecord = { ...row, epoch: uuid(), revision: row.revision + 1, generation: uuid(), phase: 'active', freezeId: null, preparationId: null, lastResume: null, checkpoint };
    const archive: RetainedRoomArchive = { key: this.key, id: operationId, generation: uuid(), kind, rollbackOf, restore, policy, candidateReport: report,
      ...(minimumBytesSaved === undefined ? {} : { minimumBytesSaved }),
      source: { ...row, checkpoint: sourceCheckpoint }, destination: next, branch: sourceCheckpoint, branchRevision: 0 };
    this.checkArchive(archive);
    if (!await this.repository.installWithArchive(this.key, row.generation, next, archive, prerequisite)) fail('revision-conflict', 'Handoff source or archive changed; nothing installed.');
    return this.result(archive, next, false);
  }

  async migrate(ticket: CoordinatedFreeze, operationId: string, options: RetainedHandoffMigrationOptions, policy: RetainedHandoffPolicy): Promise<RetainedHandoffResult> {
    const minimumBytesSaved = options?.minimumBytesSaved;
    if (minimumBytesSaved !== undefined && !validSavings(minimumBytesSaved)) throw new Error('Minimum saved bytes must be a positive safe integer.');
    ticket = this.ticketCopy(ticket);
    const migration = snapshotRetainedMigrationOptions(options), ownedPolicy = snapshotRetainedHandoffPolicy(policy);
    const replay = await this.replay(operationId, ticket, 'migration', ownedPolicy, null, null, minimumBytesSaved); if (replay) return replay;
    const row = await this.current(); this.frozen(row, ticket);
    const candidate = await buildRetainedMigrationCandidate(row.checkpoint, this.schema, this.schemaVersion, migration);
    const saved = candidate.source.manifest.bytes - candidate.destination.manifest.bytes;
    if (minimumBytesSaved !== undefined && saved < minimumBytesSaved) {
      const change = saved < 0 ? `The candidate is ${-saved} bytes larger` : `The candidate saves ${saved} bytes`;
      fail('insufficient-savings', `${change}. The minimum saving is ${minimumBytesSaved} bytes.`);
    }
    return this.install(row, candidate.destination, operationId, 'migration', ownedPolicy, null, null, candidate.report, undefined, minimumBytesSaved);
  }

  async rollback(ticket: CoordinatedFreeze, operationId: string, archiveId: string, restore: 'frozen-source' | 'retained-branch', policy: RetainedHandoffPolicy): Promise<RetainedHandoffResult> {
    ticket = this.ticketCopy(ticket);
    const ownedPolicy = snapshotRetainedHandoffPolicy(policy); if (!id(archiveId) || !['frozen-source', 'retained-branch'].includes(restore)) throw new Error('Invalid rollback selection.');
    const replay = await this.replay(operationId, ticket, 'rollback', ownedPolicy, archiveId, restore); if (replay) return replay;
    const row = await this.current(); this.frozen(row, ticket); const saved = await this.repository.readArchive(this.key, archiveId); this.checkArchive(saved);
    const archived = await this.ownedArchive(saved);
    if (row.checkpoint.manifest.roomId !== archived.destination.checkpoint.manifest.roomId) fail('invalid-ticket', 'Rollback archive does not belong to the current room lineage.');
    return this.install(row, restore === 'frozen-source' ? archived.source.checkpoint : archived.branch, operationId, 'rollback', ownedPolicy, archiveId, restore, null, { id: archiveId, generation: archived.generation });
  }

  /** Privileged host recovery lookup, not a public unauthenticated endpoint. */
  async retiredRoom(roomId: string): Promise<RetainedRoomArchive | undefined> {
    const archive = await this.repository.readRetiredRoom(this.key, roomId); return archive && this.ownedArchive(archive);
  }

  async retainLateUpdate(request: { readonly archiveId: string; readonly roomId: string; readonly update: Uint8Array }): Promise<RetainedRoomArchive> {
    const archiveId = request.archiveId, roomId = request.roomId; const saved = await this.repository.readArchive(this.key, archiveId); this.checkArchive(saved);
    if (roomId !== saved.source.checkpoint.manifest.roomId) fail('stale-epoch', 'Late update belongs to another retired room.');
    const archive = await this.ownedArchive(saved);
    const supplied = request.update; if (!(supplied instanceof Uint8Array) || !supplied.length || supplied.length > 64 * 1024 * 1024) fail('invalid-update', 'Invalid late update size.');
    const checkpoint = await applyRetainedRoomUpdate(archive.branch, this.schema, this.schemaVersion, Uint8Array.from(supplied));
    if (!await this.repository.compareArchiveBranch(this.key, archiveId, archive.generation, checkpoint)) fail('revision-conflict', 'Retired branch changed; retain the update and retry.');
    const next = await this.repository.readArchive(this.key, archiveId); this.checkArchive(next); return this.ownedArchive(next);
  }
}
