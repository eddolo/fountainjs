import * as Y from 'yjs';
import type { Schema } from '../core/schema';
import { captureRetainedCheckpoint, restoreRetainedCheckpoint, verifyRetainedCheckpoint, type RetainedCheckpoint } from './retained-checkpoint';

export type RetainedRoomErrorCode = 'closed' | 'stale-epoch' | 'frozen' | 'revision-conflict' | 'invalid-ticket' | 'invalid-update' | 'insufficient-savings';
export class RetainedRoomError extends Error {
  constructor(readonly code: RetainedRoomErrorCode, message: string, options?: ErrorOptions) { super(message, options); }
}
export interface RetainedRoomVersion { readonly epoch: string; readonly revision: number }
export interface RetainedRoomSnapshot extends RetainedRoomVersion {
  readonly phase: 'active' | 'frozen';
  readonly checkpoint: RetainedCheckpoint;
}
export interface RetainedRoomFreeze extends RetainedRoomVersion {
  readonly id: string;
  readonly checkpointSha256: string;
}
export interface RetainedRoomResume { readonly id: string; readonly freezeId: string; readonly checkpointSha256: string }
const failure = (code: RetainedRoomErrorCode, message: string): never => { throw new RetainedRoomError(code, message); };
function complete(document: Y.Doc): void {
  if (document.store.pendingStructs || document.store.pendingDs) failure('invalid-update', 'Update has unresolved dependencies; retain it and resend complete shared state.');
}

/** Shared private codec boundary for in-memory and persistent authorities. */
export async function validateRetainedRoomCheckpoint(checkpoint: RetainedCheckpoint, schema: Schema, schemaVersion: string): Promise<RetainedCheckpoint> {
  const restored = await verifyRetainedCheckpoint(checkpoint, schema, schemaVersion);
  try {
    complete(restored.document);
    return restored.checkpoint;
  } finally { restored.document.destroy(); }
}

export async function applyRetainedRoomUpdate(source: RetainedCheckpoint, schema: Schema, schemaVersion: string, bytes: Uint8Array): Promise<RetainedCheckpoint> {
  const restored = await restoreRetainedCheckpoint(source, schema, schemaVersion);
  try {
    complete(restored.document);
    Y.applyUpdate(restored.document, bytes);
    complete(restored.document);
    const next = await captureRetainedCheckpoint(restored.document, schema, schemaVersion, restored.manifest.room);
    if (next.manifest.roomId !== restored.manifest.roomId) throw new Error('Shared room identity changed.');
    return next;
  } catch (cause) { throw new RetainedRoomError('invalid-update', 'Retained update rejected; authoritative state was not changed.', { cause }); }
  finally { restored.document.destroy(); }
}

/** Experimental single-authority, in-memory provider reference, not a durable
 * server or a client-side access-control check. No live Y.Doc escapes this store.
 * New-room compaction/translation is deliberately not implemented here. */
export class FencedRetainedRoom {
  #checkpoint: RetainedCheckpoint;
  #epoch = globalThis.crypto.randomUUID();
  #revision = 0;
  #generation = 0;
  #closed = false;
  #freeze?: RetainedRoomFreeze;
  #resume?: RetainedRoomResume;

  private constructor(checkpoint: RetainedCheckpoint, private readonly schema: Schema, private readonly schemaVersion: string) {
    this.#checkpoint = checkpoint;
  }

  /** Reopening creates a new writer epoch. The caller must route all writers
   * through this authority; persistence, authentication and distributed CAS are host responsibilities. */
  static async open(checkpoint: RetainedCheckpoint, schema: Schema, schemaVersion: string): Promise<FencedRetainedRoom> {
    const owned = await validateRetainedRoomCheckpoint(checkpoint, schema, schemaVersion);
    return new FencedRetainedRoom(owned, schema, schemaVersion);
  }

  snapshot(): RetainedRoomSnapshot {
    this.live();
    return Object.freeze({ epoch: this.#epoch, revision: this.#revision, phase: this.#freeze ? 'frozen' : 'active', checkpoint: this.#checkpoint });
  }

  private live(): void { if (this.#closed) failure('closed', 'Retained room authority is closed.'); }
  private writable(epoch: string): void {
    this.live();
    if (epoch !== this.#epoch) failure('stale-epoch', 'Writer epoch is stale; reconnect and reconcile pending edits.');
    if (this.#freeze) failure('frozen', 'Retained room is frozen; retain pending edits for retry.');
  }
  private ticket(ticket: RetainedRoomFreeze): void {
    this.live();
    if (!this.#freeze || this.#freeze !== ticket) failure('invalid-ticket', 'Freeze ticket is no longer current.');
  }
  private advance(): void {
    if (this.#revision >= Number.MAX_SAFE_INTEGER) failure('revision-conflict', 'Retained room revision capacity exceeded.');
    this.#revision++;
    this.#generation++;
  }

  /** Epoch/phase checks run before reading or decoding update bytes. Validation
   * occurs in isolation; a concurrent commit/freeze/abort invalidates this CAS.
   * On rejection the provider owns retry/reconciliation, never silent disposal. */
  async write(request: { readonly epoch: string; readonly update: Uint8Array }): Promise<RetainedRoomSnapshot> {
    const epoch = request.epoch;
    this.writable(epoch);
    const generation = this.#generation, source = this.#checkpoint;
    const supplied = request.update;
    if (!(supplied instanceof Uint8Array) || !supplied.length || supplied.length > 64 * 1024 * 1024) failure('invalid-update', 'Invalid retained update size.');
    const bytes = Uint8Array.from(supplied);
    const next = await applyRetainedRoomUpdate(source, this.schema, this.schemaVersion, bytes);
    this.writable(epoch);
    if (generation !== this.#generation) failure('revision-conflict', 'Retained room changed during validation; retry against its current state.');
    this.advance();
    this.#checkpoint = next;
    return this.snapshot();
  }

  /** Compare-and-swap the exact source revision before beginning handoff. */
  freeze(expected: RetainedRoomVersion): RetainedRoomFreeze {
    const epoch = expected.epoch, revision = expected.revision;
    this.writable(epoch);
    if (revision !== this.#revision) failure('revision-conflict', 'Cannot freeze a stale retained revision.');
    this.#generation++;
    this.#freeze = Object.freeze({ epoch: this.#epoch, revision: this.#revision, id: globalThis.crypto.randomUUID(), checkpointSha256: this.#checkpoint.manifest.checkpointSha256 });
    return this.#freeze;
  }

  /** Verify same-room recovery before committing a new writer epoch. This does
   * not compact history, reseed identity or discard/reconcile offline updates. */
  async prepareResume(ticket: RetainedRoomFreeze): Promise<RetainedRoomResume> {
    this.ticket(ticket);
    const source = this.#checkpoint;
    const restored = await restoreRetainedCheckpoint(source, this.schema, this.schemaVersion);
    try {
      const verified = await captureRetainedCheckpoint(restored.document, this.schema, this.schemaVersion, source.manifest.room);
      this.ticket(ticket);
      if (verified.manifest.checkpointSha256 !== source.manifest.checkpointSha256) failure('invalid-ticket', 'Recovery changed the frozen checkpoint.');
      if (!this.#resume) this.#resume = Object.freeze({ id: globalThis.crypto.randomUUID(), freezeId: ticket.id, checkpointSha256: source.manifest.checkpointSha256 });
      return this.#resume;
    } finally { restored.document.destroy(); }
  }

  commitResume(ticket: RetainedRoomFreeze, prepared: RetainedRoomResume): RetainedRoomSnapshot {
    this.ticket(ticket);
    if (!this.#resume || prepared !== this.#resume) failure('invalid-ticket', 'Recovery preparation is not current.');
    const epoch = globalThis.crypto.randomUUID();
    this.advance();
    this.#epoch = epoch;
    this.#freeze = undefined;
    this.#resume = undefined;
    return this.snapshot();
  }

  abort(ticket: RetainedRoomFreeze): RetainedRoomSnapshot {
    this.ticket(ticket);
    this.#generation++;
    this.#freeze = undefined;
    this.#resume = undefined;
    return this.snapshot();
  }

  close(): void {
    this.#closed = true;
    this.#generation++;
    this.#freeze = undefined;
    this.#resume = undefined;
  }
}
