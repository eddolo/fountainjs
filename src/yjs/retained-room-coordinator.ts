import type { Schema } from '../core/schema';
import type { RetainedCheckpoint } from './retained-checkpoint';
import { applyRetainedRoomUpdate, validateRetainedRoomCheckpoint, RetainedRoomError, type RetainedRoomVersion } from './retained-room-store';

export interface RetainedRoomRecord extends RetainedRoomVersion {
  readonly key: string;
  readonly generation: string;
  readonly phase: 'active' | 'frozen';
  readonly freezeId: string | null;
  readonly preparationId: string | null;
  readonly lastResume: RetainedResumeReceipt | null;
  readonly checkpoint: RetainedCheckpoint;
}
export interface RetainedResumeReceipt {
  readonly freezeId: string;
  readonly preparationId: string;
  readonly sourceEpoch: string;
  readonly sourceRevision: number;
  readonly checkpointSha256: string;
  readonly targetEpoch: string;
  readonly targetRevision: number;
}
/** Trusted host storage: reads must return owned snapshots; create and CAS must
 * atomically persist the complete record. A false result must change nothing. */
export interface RetainedRoomRepository {
  read(key: string): Promise<RetainedRoomRecord | undefined>;
  create(record: RetainedRoomRecord): Promise<boolean>;
  compareAndSwap(key: string, expectedGeneration: string, next: RetainedRoomRecord): Promise<boolean>;
}
export interface CoordinatedRoomSnapshot extends RetainedRoomVersion {
  readonly key: string;
  readonly phase: 'active' | 'frozen';
  readonly checkpoint: RetainedCheckpoint;
}
export interface CoordinatedFreeze extends RetainedRoomVersion {
  readonly key: string;
  readonly id: string;
  readonly checkpointSha256: string;
}
export interface CoordinatedResume { readonly id: string; readonly freezeId: string; readonly key: string }
const uuid = (): string => globalThis.crypto.randomUUID();
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const fail = (code: ConstructorParameters<typeof RetainedRoomError>[0], message: string): never => { throw new RetainedRoomError(code, message); };
const view = (row: RetainedRoomRecord): CoordinatedRoomSnapshot => Object.freeze({ key: row.key, epoch: row.epoch, revision: row.revision, phase: row.phase, checkpoint: row.checkpoint });

/** Private provider reference. All instances coordinate through persistent CAS;
 * epochs are consistency versions, not credentials. Administrative methods need
 * host authorization. No new-room reseeding or offline-update disposal. */
export class CoordinatedRetainedRoom {
  constructor(private readonly repository: RetainedRoomRepository, readonly key: string, private readonly schema: Schema, private readonly schemaVersion: string) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,193}$/.test(key)) throw new Error('Invalid coordinated room key.');
  }

  async initialize(checkpoint: RetainedCheckpoint): Promise<CoordinatedRoomSnapshot> {
    const owned = await validateRetainedRoomCheckpoint(checkpoint, this.schema, this.schemaVersion);
    const row: RetainedRoomRecord = { key: this.key, epoch: uuid(), revision: 0, generation: uuid(), phase: 'active', freezeId: null, preparationId: null, lastResume: null, checkpoint: owned };
    if (!await this.repository.create(row)) fail('revision-conflict', 'Coordinated room already exists; original state retained.');
    return view(row);
  }

  private async current(): Promise<RetainedRoomRecord> {
    const row = await this.repository.read(this.key);
    if (!row) throw new Error('Coordinated room does not exist.');
    if (row.key !== this.key || !validId(row.epoch) || !validId(row.generation) || !Number.isSafeInteger(row.revision) || row.revision < 0
      || !['active', 'frozen'].includes(row.phase) || row.phase === 'active' && (row.freezeId !== null || row.preparationId !== null)
      || row.phase === 'frozen' && (!validId(row.freezeId) || row.preparationId !== null && !validId(row.preparationId))
      || row.checkpoint.manifest.schemaVersion !== this.schemaVersion) throw new Error('Invalid or incompatible coordinated room record.');
    const receipt = row.lastResume;
    if (receipt !== null && (!receipt || !validId(receipt.freezeId) || !validId(receipt.preparationId) || !validId(receipt.sourceEpoch) || !validId(receipt.targetEpoch)
      || receipt.sourceEpoch === receipt.targetEpoch || receipt.targetEpoch !== row.epoch || !Number.isSafeInteger(receipt.sourceRevision) || receipt.sourceRevision < 0
      || receipt.targetRevision !== receipt.sourceRevision + 1 || receipt.targetRevision > row.revision || !/^[a-f0-9]{64}$/.test(receipt.checkpointSha256))) throw new Error('Invalid coordinated resume receipt.');
    return row;
  }
  private writable(row: RetainedRoomRecord, epoch: string): void {
    if (row.epoch !== epoch) fail('stale-epoch', 'Writer epoch is stale; reconnect and reconcile pending edits.');
    if (row.phase !== 'active') fail('frozen', 'Coordinated room is frozen; retain pending edits for retry.');
  }
  private frozen(row: RetainedRoomRecord, ticket: CoordinatedFreeze): void {
    if (!ticket || ticket.key !== this.key || row.phase !== 'frozen' || row.freezeId !== ticket.id || row.epoch !== ticket.epoch
      || row.revision !== ticket.revision || row.checkpoint.manifest.checkpointSha256 !== ticket.checkpointSha256) fail('invalid-ticket', 'Freeze ticket is no longer current.');
  }
  private increment(row: RetainedRoomRecord): number {
    if (row.revision >= Number.MAX_SAFE_INTEGER) fail('revision-conflict', 'Coordinated revision capacity exceeded.');
    return row.revision + 1;
  }
  private async commit(before: RetainedRoomRecord, patch: Partial<RetainedRoomRecord>): Promise<RetainedRoomRecord> {
    const next = { ...before, ...patch, key: this.key, generation: uuid() };
    if (!await this.repository.compareAndSwap(this.key, before.generation, next)) fail('revision-conflict', 'Persistent room changed; retain edits and retry against current state.');
    return next;
  }
  private ticket(row: RetainedRoomRecord): CoordinatedFreeze {
    return Object.freeze({ key: this.key, epoch: row.epoch, revision: row.revision, id: row.freezeId!, checkpointSha256: row.checkpoint.manifest.checkpointSha256 });
  }
  private prepared(row: RetainedRoomRecord): CoordinatedResume {
    return Object.freeze({ key: this.key, id: row.preparationId!, freezeId: row.freezeId! });
  }

  async snapshot(): Promise<CoordinatedRoomSnapshot> {
    const row = await this.current();
    return view({ ...row, checkpoint: await validateRetainedRoomCheckpoint(row.checkpoint, this.schema, this.schemaVersion) });
  }

  async write(request: { readonly epoch: string; readonly update: Uint8Array }): Promise<CoordinatedRoomSnapshot> {
    const epoch = request.epoch, row = await this.current();
    this.writable(row, epoch);
    const supplied = request.update;
    if (!(supplied instanceof Uint8Array) || !supplied.length || supplied.length > 64 * 1024 * 1024) fail('invalid-update', 'Invalid retained update size.');
    const bytes = Uint8Array.from(supplied), checkpoint = await applyRetainedRoomUpdate(row.checkpoint, this.schema, this.schemaVersion, bytes);
    return view(await this.commit(row, { checkpoint, revision: this.increment(row) }));
  }

  async freeze(expected: RetainedRoomVersion): Promise<CoordinatedFreeze> {
    const epoch = expected.epoch, revision = expected.revision, row = await this.current();
    this.writable(row, epoch);
    if (row.revision !== revision) fail('revision-conflict', 'Cannot freeze a stale persistent revision.');
    return this.ticket(await this.commit(row, { phase: 'frozen', freezeId: uuid(), preparationId: null }));
  }

  /** Administrative crash recovery: retrieve the persisted barrier, never
   * silently turn a frozen room active on process startup. */
  async recoverFrozen(expected: RetainedRoomVersion): Promise<{ ticket: CoordinatedFreeze; prepared?: CoordinatedResume }> {
    const epoch = expected.epoch, revision = expected.revision, row = await this.current();
    if (row.epoch !== epoch || row.revision !== revision || row.phase !== 'frozen') fail('invalid-ticket', 'No matching frozen persistent revision.');
    return { ticket: this.ticket(row), ...(row.preparationId ? { prepared: this.prepared(row) } : {}) };
  }

  async prepareResume(ticket: CoordinatedFreeze): Promise<CoordinatedResume> {
    const row = await this.current(); this.frozen(row, ticket);
    const checkpoint = await validateRetainedRoomCheckpoint(row.checkpoint, this.schema, this.schemaVersion);
    if (checkpoint.manifest.checkpointSha256 !== ticket.checkpointSha256) fail('invalid-ticket', 'Frozen checkpoint changed during recovery.');
    if (row.preparationId) return this.prepared(row);
    return this.prepared(await this.commit(row, { preparationId: uuid() }));
  }

  async commitResume(ticket: CoordinatedFreeze, prepared: CoordinatedResume): Promise<CoordinatedRoomSnapshot> {
    const row = await this.current(), receipt = row.lastResume;
    // Acknowledgement may be lost after SQL commits. Recognize only the latest
    // exact handoff; do not rotate again or overwrite later accepted edits.
    if (row.phase === 'active' && receipt && ticket && prepared && ticket.key === this.key && prepared.key === this.key
      && receipt.freezeId === ticket.id && receipt.freezeId === prepared.freezeId && receipt.preparationId === prepared.id
      && receipt.sourceEpoch === ticket.epoch && receipt.sourceRevision === ticket.revision && receipt.checkpointSha256 === ticket.checkpointSha256) {
      return view({ ...row, checkpoint: await validateRetainedRoomCheckpoint(row.checkpoint, this.schema, this.schemaVersion) });
    }
    this.frozen(row, ticket);
    if (!prepared || prepared.key !== this.key || prepared.freezeId !== row.freezeId || !row.preparationId || prepared.id !== row.preparationId) fail('invalid-ticket', 'Persistent recovery preparation is not current.');
    const checkpoint = await validateRetainedRoomCheckpoint(row.checkpoint, this.schema, this.schemaVersion);
    if (checkpoint.manifest.checkpointSha256 !== ticket.checkpointSha256) fail('invalid-ticket', 'Frozen checkpoint changed during recovery.');
    const epoch = uuid(), revision = this.increment(row);
    const lastResume: RetainedResumeReceipt = Object.freeze({ freezeId: ticket.id, preparationId: prepared.id, sourceEpoch: row.epoch,
      sourceRevision: row.revision, checkpointSha256: ticket.checkpointSha256, targetEpoch: epoch, targetRevision: revision });
    return view(await this.commit(row, { epoch, revision, phase: 'active', freezeId: null, preparationId: null, lastResume }));
  }

  async abort(ticket: CoordinatedFreeze): Promise<CoordinatedRoomSnapshot> {
    const row = await this.current(); this.frozen(row, ticket);
    return view(await this.commit(row, { phase: 'active', freezeId: null, preparationId: null }));
  }
}
