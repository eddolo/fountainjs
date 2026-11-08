import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { brotliCompressSync, brotliDecompressSync, constants, gzipSync, gunzipSync } from 'node:zlib';
import type { RetainedRoomRecord } from '../../src/yjs/retained-room-coordinator';
import type { RetainedRoomArchive, RetainedHandoffRepository } from '../../src/yjs/retained-handoff';
import type { RetainedCheckpoint } from '../../src/yjs/retained-checkpoint';
import { RetainedRoomError } from '../../src/yjs/retained-room-store';
import { assertRetainedRoomReader, type DocumentRoomAdmission, type DocumentRoomRecord, type DocumentRoomHeader, type DocumentCheckpoint } from '../../src/yjs/document-room';
import type { CrossFormatArchive, CrossFormatBatch, CrossFormatRepository } from '../../src/yjs/cross-format-handoff';
import { encodeRetainedPresence, presenceCapacity, presenceLeaseMs, presenceRenewalMs, presenceVisibilityMs, type PresencePeer, type PresenceState } from './retained-http-presence';

const maxCheckpointBytes = 64 * 1024 * 1024;
const brotliWirePrefix = Buffer.from([0x46, 0x4a, 0x53, 0x42, 1]); // FJSB, storage version 1

function encodeStoredWire(wire: Uint8Array): Uint8Array {
  if (wire.length < 1_024) return wire;
  const compressed = gzipSync(wire, { level: 1 });
  return compressed.length < wire.length ? compressed : wire;
}

function decodeStoredWire(wire: Uint8Array, expectedBytes: number): Uint8Array {
  // Old rows hold raw bytes. Compression always produces a shorter BLOB, so
  // even a raw update starting with the gzip header is read without decoding.
  if (wire.length >= expectedBytes || wire[0] !== 0x1f || wire[1] !== 0x8b) return Uint8Array.from(wire);
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes > maxCheckpointBytes) throw new Error('Invalid SQLite checkpoint wire length.');
  const decoded = gunzipSync(wire, { maxOutputLength: expectedBytes });
  if (decoded.length !== expectedBytes) throw new Error('Invalid SQLite checkpoint wire length.');
  return Uint8Array.from(decoded);
}

function decodeLiveWire(wire: Uint8Array, expectedBytes: number): Uint8Array {
  if (wire.length >= expectedBytes || !brotliWirePrefix.every((byte, index) => wire[index] === byte)) {
    return decodeStoredWire(wire, expectedBytes);
  }
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes > maxCheckpointBytes) throw new Error('Invalid SQLite checkpoint wire length.');
  const decoded = brotliDecompressSync(wire.subarray(brotliWirePrefix.length), { maxOutputLength: expectedBytes });
  if (decoded.length !== expectedBytes) throw new Error('Invalid SQLite checkpoint wire length.');
  return Uint8Array.from(decoded);
}

function readArchivedCheckpoint<M extends DocumentCheckpoint['manifest']>(manifest: M, wire: Uint8Array) {
  return { manifest, update: decodeStoredWire(wire, manifest.bytes) };
}

function roomMetadata(result: Record<string, unknown>, key: string) {
  if (typeof result.metadata !== 'string' || typeof result.generation !== 'string') throw new Error('Invalid SQLite retained room row.');
  const data = JSON.parse(result.metadata) as Omit<DocumentRoomRecord, 'checkpoint'> & { manifest: DocumentCheckpoint['manifest'] };
  if (data.key !== key || data.generation !== result.generation) throw new Error('SQLite retained metadata identity mismatch.');
  if (!['fountain-retained-checkpoint/1', 'fountain-legacy-checkpoint/1'].includes(data.manifest?.format)) throw new Error('Invalid SQLite document checkpoint format.');
  return data;
}

/** Internal Node 24+ reference. Local SQLite file, not network/shared-filesystem
 * storage or a public Fountain package entry. The host owns paths and access. */
export class SQLiteRetainedRoomRepository implements RetainedHandoffRepository, CrossFormatRepository {
  private readonly db: DatabaseSync;
  private readonly selectRoomMetadata: StatementSync;
  private readonly compressLiveCheckpoints: boolean | 'brotli';
  private readonly compressRecoveryBatches: boolean;
  private readonly maxLiveCheckpointBytesPerRoom: number;
  private readonly maxRecoveryBytesPerRoom?: number;
  constructor(path: string, private readonly presenceNow = Date.now, options: {
    readonly compressLiveCheckpoints?: boolean | 'brotli';
    readonly compressRecoveryBatches?: boolean;
    readonly maxRecoveryBytesPerRoom?: number;
    readonly maxLiveCheckpointBytesPerRoom?: number;
  } = {}) {
    this.compressLiveCheckpoints = options.compressLiveCheckpoints === 'brotli' ? 'brotli' : options.compressLiveCheckpoints === true;
    this.compressRecoveryBatches = options.compressRecoveryBatches === true;
    const maximum = options.maxRecoveryBytesPerRoom;
    if (maximum !== undefined && (!Number.isSafeInteger(maximum) || maximum < 0)) throw new TypeError('Invalid per-room recovery capacity.');
    this.maxRecoveryBytesPerRoom = maximum;
    const liveMaximum = options.maxLiveCheckpointBytesPerRoom ?? maxCheckpointBytes;
    if (!Number.isSafeInteger(liveMaximum) || liveMaximum < 1 || liveMaximum > maxCheckpointBytes) throw new TypeError('Invalid live checkpoint capacity.');
    this.maxLiveCheckpointBytesPerRoom = liveMaximum;
    this.db = new DatabaseSync(path, { timeout: 1_000, allowExtension: false, enableDoubleQuotedStringLiterals: false });
    try {
      this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS fountain_retained_rooms_v1 (
          room_key TEXT PRIMARY KEY NOT NULL CHECK(length(room_key) BETWEEN 1 AND 194),
          generation TEXT NOT NULL CHECK(length(generation) = 36),
          metadata TEXT NOT NULL CHECK(length(metadata) <= 2097152),
          wire BLOB NOT NULL CHECK(length(wire) BETWEEN 1 AND 67108864)
        ) STRICT;
        CREATE TABLE IF NOT EXISTS fountain_retained_presence_v1 (
          peer_id INTEGER PRIMARY KEY AUTOINCREMENT CHECK(peer_id <= 9007199254740991),
          room_key TEXT NOT NULL, epoch TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
          seen INTEGER NOT NULL, state TEXT CHECK(state IS NULL OR length(state) <= 16384)
        ) STRICT;
        CREATE INDEX IF NOT EXISTS fountain_presence_room_v1 ON fountain_retained_presence_v1 (room_key, epoch, seen);
        CREATE INDEX IF NOT EXISTS fountain_presence_expiry_v1 ON fountain_retained_presence_v1 (seen);
        CREATE TABLE IF NOT EXISTS fountain_retained_archives_v1 (
          room_key TEXT NOT NULL,
          archive_id TEXT NOT NULL CHECK(length(archive_id) = 36),
          generation TEXT NOT NULL CHECK(length(generation) = 36),
          source_room_id TEXT NOT NULL,
          source_revision INTEGER NOT NULL,
          metadata TEXT NOT NULL CHECK(length(metadata) <= 8388608),
          source_wire BLOB NOT NULL CHECK(length(source_wire) BETWEEN 1 AND 67108864),
          destination_wire BLOB NOT NULL CHECK(length(destination_wire) BETWEEN 1 AND 67108864),
          branch_metadata TEXT CHECK(branch_metadata IS NULL OR length(branch_metadata) <= 2097152),
          branch_wire BLOB CHECK(branch_wire IS NULL OR length(branch_wire) BETWEEN 1 AND 67108864),
          branch_revision INTEGER NOT NULL DEFAULT 0 CHECK(branch_revision BETWEEN 0 AND 9007199254740991),
          CHECK((branch_metadata IS NULL) = (branch_wire IS NULL)),
          PRIMARY KEY (room_key, archive_id)
        ) STRICT;
        CREATE INDEX IF NOT EXISTS fountain_retained_archive_room_v1 ON fountain_retained_archives_v1 (room_key, source_room_id, source_revision DESC);
        CREATE TABLE IF NOT EXISTS fountain_retained_drafts_v1 (
          room_key TEXT NOT NULL,
          archive_id TEXT NOT NULL CHECK(length(archive_id) = 36),
          draft_id TEXT NOT NULL CHECK(length(draft_id) = 36),
          manifest TEXT NOT NULL CHECK(length(manifest) <= 2097152),
          wire BLOB NOT NULL CHECK(length(wire) BETWEEN 1 AND 67108864),
          PRIMARY KEY(room_key, archive_id, draft_id)
        ) STRICT;
        CREATE TABLE IF NOT EXISTS fountain_cross_format_archives_v1 (
          room_key TEXT NOT NULL, archive_id TEXT NOT NULL CHECK(length(archive_id) = 36), generation TEXT NOT NULL CHECK(length(generation) = 36),
          source_epoch TEXT NOT NULL CHECK(length(source_epoch) = 36), source_identity TEXT NOT NULL,
          source_protocol TEXT NOT NULL CHECK(source_protocol IN ('legacy', 'retained')),
          source_revision INTEGER NOT NULL CHECK(source_revision BETWEEN 0 AND 9007199254740991),
          metadata TEXT NOT NULL CHECK(length(metadata) <= 8388608),
          source_wire BLOB NOT NULL CHECK(length(source_wire) BETWEEN 1 AND 67108864),
          destination_wire BLOB NOT NULL CHECK(length(destination_wire) BETWEEN 1 AND 67108864),
          branch_metadata TEXT CHECK(branch_metadata IS NULL OR length(branch_metadata) <= 2097152),
          branch_wire BLOB CHECK(branch_wire IS NULL OR length(branch_wire) BETWEEN 1 AND 67108864),
          branch_revision INTEGER NOT NULL DEFAULT 0 CHECK(branch_revision BETWEEN 0 AND 9007199254740991),
          CHECK((branch_metadata IS NULL) = (branch_wire IS NULL)),
          PRIMARY KEY(room_key, archive_id), UNIQUE(room_key, source_epoch)
        ) STRICT;
        CREATE TABLE IF NOT EXISTS fountain_cross_format_batches_v1 (
          room_key TEXT NOT NULL, archive_id TEXT NOT NULL CHECK(length(archive_id) = 36),
          revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
          source_epoch TEXT NOT NULL CHECK(length(source_epoch) = 36), sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
          wire BLOB NOT NULL CHECK(length(wire) BETWEEN 1 AND 67108864),
          raw_bytes INTEGER,
          PRIMARY KEY(room_key, archive_id, revision)
        ) STRICT;
        CREATE INDEX IF NOT EXISTS fountain_cross_format_batch_digest_v1
          ON fountain_cross_format_batches_v1 (room_key, archive_id, sha256, revision);`);
      this.addRecoveryBatchLength();
      this.selectRoomMetadata = this.db.prepare('SELECT generation, metadata FROM fountain_retained_rooms_v1 WHERE room_key = ?');
    } catch (error) { this.db.close(); throw error; }
  }

  private addRecoveryBatchLength(): void {
    const hasLength = () => this.db.prepare('PRAGMA table_info(fountain_cross_format_batches_v1)').all().some(column => column.name === 'raw_bytes');
    if (hasLength()) return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // An older database can be opened by two updated processes at once.
      if (!hasLength()) this.db.exec('ALTER TABLE fountain_cross_format_batches_v1 ADD COLUMN raw_bytes INTEGER');
      this.db.exec('COMMIT');
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }

  async read(key: string): Promise<RetainedRoomRecord | undefined> {
    const row = await this.readDocument(key);
    if (row && row.checkpoint.manifest.format !== 'fountain-retained-checkpoint/1') throw new RetainedRoomError('stale-epoch', 'Room uses the legacy protocol; reconnect through the document authority.');
    return row as RetainedRoomRecord | undefined;
  }

  async readDocument(key: string): Promise<DocumentRoomRecord | undefined> {
    const result = this.db.prepare('SELECT generation, metadata, wire FROM fountain_retained_rooms_v1 WHERE room_key = ?').get(key);
    if (!result) return undefined;
    if (!(result.wire instanceof Uint8Array)) throw new Error('Invalid SQLite retained room row.');
    const { manifest, ...row } = roomMetadata(result, key), update = decodeLiveWire(result.wire, manifest.bytes);
    const checkpoint: DocumentCheckpoint = manifest.format === 'fountain-retained-checkpoint/1' ? { manifest, update } : { manifest, update };
    return { ...row, checkpoint };
  }

  async readDocumentHeader(key: string): Promise<DocumentRoomHeader | undefined> {
    const result = this.selectRoomMetadata.get(key);
    if (!result) return undefined;
    const { manifest, ...row } = roomMetadata(result, key);
    return { ...row, checkpoint: { manifest } };
  }

  /** Canonical checkpoint headroom, without reading the live BLOB. */
  readLiveCheckpointCapacity(key: string) {
    const result = this.selectRoomMetadata.get(key);
    if (!result) return undefined;
    const { epoch, revision, phase, manifest } = roomMetadata(result, key);
    const limitBytes = this.maxLiveCheckpointBytesPerRoom;
    return { epoch, revision, phase, bytes: manifest.bytes, limitBytes, headroomBytes: limitBytes - manifest.bytes };
  }

  /** A read-only room snapshot of stored BLOB sizes. The host authorizes access. */
  readStorageUsage(key: string) {
    const usage = this.db.prepare(`
      WITH archive_payloads(bytes) AS (
        SELECT length(source_wire) + length(destination_wire) + coalesce(length(branch_wire), 0)
          FROM fountain_retained_archives_v1 WHERE room_key = $key
        UNION ALL
        SELECT length(source_wire) + length(destination_wire) + coalesce(length(branch_wire), 0)
          FROM fountain_cross_format_archives_v1 WHERE room_key = $key
      ),
      archives AS (SELECT count(*) AS archiveCount, coalesce(sum(bytes), 0) AS archiveBytes FROM archive_payloads),
      drafts AS (
        SELECT count(*) AS draftCount, coalesce(sum(length(wire)), 0) AS draftBytes
          FROM fountain_retained_drafts_v1 WHERE room_key = $key
      ),
      batches AS (
        SELECT count(*) AS batchCount, coalesce(sum(length(wire)), 0) AS batchBytes
          FROM fountain_cross_format_batches_v1 WHERE room_key = $key
      )
      SELECT json_extract(live.metadata, '$.revision') AS revision, length(live.wire) AS liveBytes,
        json_extract(live.metadata, '$.manifest.bytes') AS liveCheckpointBytes,
        archives.*, drafts.*, batches.*
      FROM fountain_retained_rooms_v1 AS live CROSS JOIN archives CROSS JOIN drafts CROSS JOIN batches
      WHERE live.room_key = $key`).get({ $key: key }) as {
      revision: number; liveBytes: number; liveCheckpointBytes: number;
      archiveCount: number; archiveBytes: number;
      draftCount: number; draftBytes: number;
      batchCount: number; batchBytes: number;
    } | undefined;
    if (!usage) return undefined;
    const recoveryBytes = usage.archiveBytes + usage.draftBytes + usage.batchBytes;
    return { ...usage, recoveryBytes, totalBytes: usage.liveBytes + recoveryBytes };
  }

  // Run inside the same SQLite write transaction as the recovery change.
  private checkRecoveryCapacity(key: string): void {
    const maximum = this.maxRecoveryBytesPerRoom;
    if (maximum === undefined) return;
    const usage = this.readStorageUsage(key);
    if (!usage || usage.recoveryBytes > maximum) {
      throw Object.assign(new Error('Room recovery storage limit reached. Keep pending edits and retry after capacity is available.'), { code: 'recovery-capacity' });
    }
  }

  private writeRecovery(key: string, write: () => boolean): boolean {
    if (this.maxRecoveryBytesPerRoom === undefined) return write();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const changed = write();
      if (changed) this.checkRecoveryCapacity(key);
      this.db.exec('COMMIT');
      return changed;
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }

  private withPresenceFence<T>(lease: DocumentRoomAdmission, mode: 'read' | 'write', action: (now: number) => T): T {
    this.db.exec(mode === 'read' ? 'BEGIN' : 'BEGIN IMMEDIATE');
    try {
      const result = this.selectRoomMetadata.get(lease.key);
      if (!result) throw new RetainedRoomError('stale-epoch', 'Presence room no longer exists.');
      const { manifest, ...row } = roomMetadata(result, lease.key);
      assertRetainedRoomReader({ ...row, checkpoint: { manifest } }, lease);
      const value = action(this.presenceNow());
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* Preserve the original failure. */ }
      throw error;
    }
  }

  /** Host authenticates the actor first. Presence never reads the checkpoint BLOB. */
  bindPresence(lease: DocumentRoomAdmission): string {
    return this.withPresenceFence(lease, 'write', now => {
      this.db.prepare('DELETE FROM fountain_retained_presence_v1 WHERE room_key = ? AND (epoch <> ? OR seen <= ?)')
        .run(lease.key, lease.epoch, now - presenceLeaseMs);
      this.db.prepare(`DELETE FROM fountain_retained_presence_v1 WHERE peer_id IN (
        SELECT peer_id FROM fountain_retained_presence_v1 WHERE seen <= ? ORDER BY seen LIMIT 256)`)
        .run(now - presenceLeaseMs);
      const count = this.db.prepare('SELECT COUNT(*) AS total FROM fountain_retained_presence_v1 WHERE room_key = ? AND epoch = ?')
        .get(lease.key, lease.epoch)?.total as number;
      if (count >= presenceCapacity) throw new Error('Presence capacity exceeded.');
      const token = crypto.randomUUID();
      this.db.prepare('INSERT INTO fountain_retained_presence_v1 (room_key, epoch, token, seen) VALUES (?, ?, ?, ?)')
        .run(lease.key, lease.epoch, token, now);
      return token;
    });
  }

  private visiblePresence(lease: DocumentRoomAdmission, token: string, now: number): PresencePeer[] {
    const rows = this.db.prepare(`SELECT peer_id, state FROM fountain_retained_presence_v1
      WHERE room_key = ? AND epoch = ? AND token <> ? AND seen > ? AND state IS NOT NULL ORDER BY peer_id`)
      .all(lease.key, lease.epoch, token, now - presenceVisibilityMs);
    return rows.map(row => [-(row.peer_id as number), JSON.parse(row.state as string)]);
  }

  exchangePresence(lease: DocumentRoomAdmission, token: string, state: PresenceState | null): PresencePeer[] {
    const encoded = encodeRetainedPresence(state);
    const visible = this.withPresenceFence(lease, 'read', now => {
      const peer = this.db.prepare(`SELECT seen, state FROM fountain_retained_presence_v1
        WHERE room_key = ? AND epoch = ? AND token = ? AND seen > ?`)
        .get(lease.key, lease.epoch, token, now - presenceLeaseMs);
      if (!peer) throw new Error('Presence session is no longer active.');
      return peer.state === encoded && now - (peer.seen as number) < presenceRenewalMs
        ? this.visiblePresence(lease, token, now) : null;
    });
    if (visible) return visible;
    // Start a separate write transaction and fence again. Another worker may
    // have retired the room or removed this token since the read snapshot.
    return this.withPresenceFence(lease, 'write', now => {
      const updated = this.db.prepare(`UPDATE fountain_retained_presence_v1 SET seen = MAX(seen, ?), state = ?
        WHERE room_key = ? AND epoch = ? AND token = ? AND seen > ?`)
        .run(now, encoded, lease.key, lease.epoch, token, now - presenceLeaseMs);
      if (updated.changes !== 1) throw new Error('Presence session is no longer active.');
      return this.visiblePresence(lease, token, now);
    });
  }

  leavePresence(key: string, epoch: string, token: string): void {
    this.db.prepare('DELETE FROM fountain_retained_presence_v1 WHERE room_key = ? AND epoch = ? AND token = ?').run(key, epoch, token);
  }

  clearRoomPresence(key: string): void {
    this.db.prepare('DELETE FROM fountain_retained_presence_v1 WHERE room_key = ?').run(key);
  }

  private packet(record: DocumentRoomRecord): { metadata: string; wire: Uint8Array } {
    const { checkpoint, ...metadata } = record;
    return { metadata: JSON.stringify({ ...metadata, manifest: checkpoint.manifest }), wire: checkpoint.update };
  }

  private liveWire(wire: Uint8Array): Uint8Array {
    if (!this.compressLiveCheckpoints || wire.length < 4_096) return wire;
    if (this.compressLiveCheckpoints === true) return encodeStoredWire(wire);
    const compressed = brotliCompressSync(wire, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } });
    return compressed.length + brotliWirePrefix.length < wire.length ? Buffer.concat([brotliWirePrefix, compressed]) : wire;
  }

  private checkLiveCheckpointCapacity(bytes: number, previousBytes: number): void {
    if (bytes > this.maxLiveCheckpointBytesPerRoom && bytes > previousBytes) {
      throw Object.assign(new Error('Room live checkpoint limit reached. Keep pending edits until the room has capacity.'), { code: 'live-checkpoint-capacity' });
    }
  }

  private checkReplacementCapacity(key: string, generation: string, bytes: number): void {
    if (bytes <= this.maxLiveCheckpointBytesPerRoom) return;
    const current = this.selectRoomMetadata.get(key);
    if (current?.generation === generation) this.checkLiveCheckpointCapacity(bytes, roomMetadata(current, key).manifest.bytes);
  }

  async create(record: RetainedRoomRecord): Promise<boolean> {
    return this.createDocument(record);
  }

  async createDocument(record: DocumentRoomRecord): Promise<boolean> {
    const packet = this.packet(record);
    if (packet.wire.length > this.maxLiveCheckpointBytesPerRoom) {
      if (this.selectRoomMetadata.get(record.key)) return false;
      this.checkLiveCheckpointCapacity(packet.wire.length, 0);
    }
    const result = this.db.prepare('INSERT INTO fountain_retained_rooms_v1 (room_key, generation, metadata, wire) VALUES (?, ?, ?, ?) ON CONFLICT(room_key) DO NOTHING')
      .run(record.key, record.generation, packet.metadata, this.liveWire(packet.wire));
    return result.changes === 1;
  }

  async compareAndSwap(key: string, expectedGeneration: string, next: RetainedRoomRecord): Promise<boolean> {
    return this.compareDocument(key, expectedGeneration, next);
  }

  async compareDocument(key: string, expectedGeneration: string, next: DocumentRoomRecord): Promise<boolean> {
    if (next.key !== key || next.generation === expectedGeneration) throw new Error('Invalid SQLite retained CAS replacement.');
    // Only coordination metadata is needed for this guard. Do not copy the
    // full checkpoint wire again just to enforce the same-format CAS contract.
    const before = this.selectRoomMetadata.get(key);
    if (!before || before.generation !== expectedGeneration) return false;
    const { manifest } = roomMetadata(before, key);
    if (manifest.format !== next.checkpoint.manifest.format) throw new Error('Format changes require an atomic recovery archive.');
    const packet = this.packet(next);
    this.checkLiveCheckpointCapacity(packet.wire.length, manifest.bytes);
    const result = this.db.prepare('UPDATE fountain_retained_rooms_v1 SET generation = ?, metadata = ?, wire = ? WHERE room_key = ? AND generation = ?')
      .run(next.generation, packet.metadata, this.liveWire(packet.wire), key, expectedGeneration);
    return result.changes === 1;
  }

  private archiveRow(row: Record<string, unknown> | undefined, key: string): RetainedRoomArchive | undefined {
    if (!row) return undefined;
    if (typeof row.metadata !== 'string' || typeof row.generation !== 'string' || !(row.source_wire instanceof Uint8Array) || !(row.destination_wire instanceof Uint8Array)
      || !Number.isSafeInteger(row.branch_revision)) throw new Error('Invalid SQLite archive row.');
    const header = JSON.parse(row.metadata);
    if (header.key !== key || header.id !== row.archive_id || header.source.key !== key || header.destination.key !== key
      || header.source.manifest.roomId !== row.source_room_id || header.source.revision !== row.source_revision) throw new Error('SQLite archive metadata identity mismatch.');
    const record = (data: any, wire: Uint8Array): RetainedRoomRecord => { const { manifest, ...metadata } = data; return { ...metadata, checkpoint: readArchivedCheckpoint(manifest, wire) }; };
    const source = record(header.source, row.source_wire), destination = record(header.destination, row.destination_wire);
    const branch = row.branch_wire === null ? source.checkpoint : typeof row.branch_metadata === 'string' && row.branch_wire instanceof Uint8Array
      ? readArchivedCheckpoint(JSON.parse(row.branch_metadata), row.branch_wire) : undefined;
    if (!branch) throw new Error('Incomplete SQLite archive branch.');
    return { ...header, generation: row.generation, source, destination, branch, branchRevision: row.branch_revision as number };
  }

  async readArchive(key: string, id: string): Promise<RetainedRoomArchive | undefined> {
    const row = this.db.prepare('SELECT * FROM fountain_retained_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, id);
    if (!row && this.db.prepare('SELECT 1 FROM fountain_cross_format_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, id)) throw new RetainedRoomError('invalid-ticket', 'Operation UUID belongs to a cross-format handoff.');
    return this.archiveRow(row, key);
  }

  async readRetiredRoom(key: string, roomId: string): Promise<RetainedRoomArchive | undefined> {
    return this.archiveRow(this.db.prepare('SELECT * FROM fountain_retained_archives_v1 WHERE room_key = ? AND source_room_id = ? ORDER BY source_revision DESC LIMIT 1').get(key, roomId), key);
  }

  async installWithArchive(key: string, expectedGeneration: string, next: RetainedRoomRecord, archive: RetainedRoomArchive, prerequisite?: { id: string; generation: string }): Promise<boolean> {
    if (next.key !== key || archive.key !== key || archive.source.key !== key || archive.destination.key !== key || archive.source.generation !== expectedGeneration
      || next.generation === expectedGeneration || archive.destination.generation !== next.generation || archive.branchRevision !== 0
      || archive.branch.manifest.checkpointSha256 !== archive.source.checkpoint.manifest.checkpointSha256) throw new Error('Invalid archived handoff replacement.');
    const live = this.packet(next), source = this.packet(archive.source), destination = this.packet(archive.destination);
    if (live.metadata !== destination.metadata) throw new Error('Archive destination does not match the live replacement.');
    const sourceWire = encodeStoredWire(source.wire), destinationWire = encodeStoredWire(destination.wire), liveWire = this.liveWire(live.wire);
    const { source: _source, destination: _destination, branch: _branch, branchRevision: _revision, generation: _generation, ...header } = archive;
    const metadata = JSON.stringify({ ...header, source: JSON.parse(source.metadata), destination: JSON.parse(destination.metadata) });
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.db.prepare('SELECT 1 FROM fountain_cross_format_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, archive.id)) throw new RetainedRoomError('invalid-ticket', 'Operation UUID already belongs to a cross-format handoff.');
      if (prerequisite && this.db.prepare('SELECT generation FROM fountain_retained_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, prerequisite.id)?.generation !== prerequisite.generation) {
        this.db.exec('ROLLBACK'); return false;
      }
      this.checkReplacementCapacity(key, expectedGeneration, live.wire.length);
      const changed = this.db.prepare('UPDATE fountain_retained_rooms_v1 SET generation = ?, metadata = ?, wire = ? WHERE room_key = ? AND generation = ?')
        .run(next.generation, live.metadata, liveWire, key, expectedGeneration);
      if (changed.changes !== 1) { this.db.exec('ROLLBACK'); return false; }
      this.db.prepare('INSERT INTO fountain_retained_archives_v1 (room_key, archive_id, generation, source_room_id, source_revision, metadata, source_wire, destination_wire) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(key, archive.id, archive.generation, archive.source.checkpoint.manifest.roomId, archive.source.revision, metadata, sourceWire, destinationWire);
      this.checkRecoveryCapacity(key);
      this.db.exec('COMMIT'); return true;
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }

  async compareArchiveBranch(key: string, id: string, expectedGeneration: string, checkpoint: RetainedRoomRecord['checkpoint']): Promise<boolean> {
    const metadata = JSON.stringify(checkpoint.manifest), wire = encodeStoredWire(checkpoint.update);
    const statement = this.db.prepare('UPDATE fountain_retained_archives_v1 SET generation = ?, branch_metadata = ?, branch_wire = ?, branch_revision = branch_revision + 1 WHERE room_key = ? AND archive_id = ? AND generation = ? AND source_room_id = ? AND branch_revision < 9007199254740991');
    return this.writeRecovery(key, () => statement.run(globalThis.crypto.randomUUID(), metadata, wire, key, id, expectedGeneration, checkpoint.manifest.roomId).changes === 1);
  }

  async readRetiredDraft(key: string, archiveId: string, draftId: string): Promise<RetainedCheckpoint | undefined> {
    const row = this.db.prepare('SELECT manifest, wire FROM fountain_retained_drafts_v1 WHERE room_key = ? AND archive_id = ? AND draft_id = ?')
      .get(key, archiveId, draftId);
    if (!row) return undefined;
    if (typeof row.manifest !== 'string' || !(row.wire instanceof Uint8Array)) throw new Error('Invalid SQLite retired draft.');
    return readArchivedCheckpoint(JSON.parse(row.manifest), row.wire);
  }

  async createRetiredDraft(key: string, archiveId: string, draftId: string, checkpoint: RetainedCheckpoint): Promise<boolean> {
    const manifest = JSON.stringify(checkpoint.manifest), wire = encodeStoredWire(checkpoint.update);
    const statement = this.db.prepare(`INSERT INTO fountain_retained_drafts_v1 (room_key, archive_id, draft_id, manifest, wire)
      SELECT room_key, archive_id, ?, ?, ? FROM fountain_retained_archives_v1
      WHERE room_key = ? AND archive_id = ? AND source_room_id = ?
      ON CONFLICT(room_key, archive_id, draft_id) DO NOTHING`);
    return this.writeRecovery(key, () => statement.run(draftId, manifest, wire, key, archiveId, checkpoint.manifest.roomId).changes === 1);
  }

  private crossRow(row: Record<string, unknown> | undefined, key: string): CrossFormatArchive | undefined {
    if (!row) return undefined;
    if (typeof row.metadata !== 'string' || typeof row.generation !== 'string' || !(row.source_wire instanceof Uint8Array) || !(row.destination_wire instanceof Uint8Array) || !Number.isSafeInteger(row.branch_revision)) throw new Error('Invalid SQLite cross-format archive row.');
    const header = JSON.parse(row.metadata), protocol = header.source.manifest.format === 'fountain-legacy-checkpoint/1' ? 'legacy' : header.source.manifest.format === 'fountain-retained-checkpoint/1' ? 'retained' : null;
    if (header.key !== key || header.id !== row.archive_id || header.source.key !== key || header.destination.key !== key || header.sourceIdentity !== row.source_identity
      || header.source.epoch !== row.source_epoch || header.source.revision !== row.source_revision || !protocol || protocol !== row.source_protocol) throw new Error('SQLite cross-format metadata identity mismatch.');
    const record = (data: any, wire: Uint8Array): DocumentRoomRecord => { const { manifest, ...metadata } = data; return { ...metadata, checkpoint: readArchivedCheckpoint(manifest, wire) }; };
    const source = record(header.source, row.source_wire), destination = record(header.destination, row.destination_wire), branch = row.branch_wire === null ? source.checkpoint : typeof row.branch_metadata === 'string' && row.branch_wire instanceof Uint8Array ? readArchivedCheckpoint(JSON.parse(row.branch_metadata), row.branch_wire) : undefined;
    if (!branch) throw new Error('Incomplete cross-format source branch.');
    return { ...header, generation: row.generation, source, destination, branch, branchRevision: row.branch_revision as number };
  }
  async readCrossArchive(key: string, id: string): Promise<CrossFormatArchive | undefined> {
    const row = this.db.prepare('SELECT * FROM fountain_cross_format_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, id);
    if (!row && this.db.prepare('SELECT 1 FROM fountain_retained_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, id)) throw new RetainedRoomError('invalid-ticket', 'Operation UUID belongs to a retained handoff.');
    return this.crossRow(row, key);
  }
  async readRetiredEpoch(key: string, epoch: string): Promise<CrossFormatArchive | undefined> {
    return this.crossRow(this.db.prepare('SELECT * FROM fountain_cross_format_archives_v1 WHERE room_key = ? AND source_epoch = ?').get(key, epoch), key);
  }
  async installCrossArchive(key: string, expectedGeneration: string, next: DocumentRoomRecord, archive: CrossFormatArchive, prerequisite?: { id: string; generation: string }): Promise<boolean> {
    if (next.key !== key || archive.key !== key || archive.source.key !== key || archive.destination.key !== key || archive.source.generation !== expectedGeneration
      || next.generation === expectedGeneration || archive.destination.generation !== next.generation || archive.branchRevision !== 0 || archive.branch.manifest.checkpointSha256 !== archive.source.checkpoint.manifest.checkpointSha256
      || archive.source.checkpoint.manifest.format === archive.destination.checkpoint.manifest.format) throw new Error('Invalid cross-format installation replacement.');
    const live = this.packet(next), source = this.packet(archive.source), destination = this.packet(archive.destination);
    if (live.metadata !== destination.metadata) throw new Error('Cross-format destination differs from live replacement.');
    const sourceWire = encodeStoredWire(source.wire), destinationWire = encodeStoredWire(destination.wire), liveWire = this.liveWire(live.wire);
    const { source: _source, destination: _destination, branch: _branch, branchRevision: _revision, generation: _generation, ...header } = archive;
    const metadata = JSON.stringify({ ...header, source: JSON.parse(source.metadata), destination: JSON.parse(destination.metadata) }), protocol = archive.source.checkpoint.manifest.format === 'fountain-legacy-checkpoint/1' ? 'legacy' : 'retained';
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.db.prepare('SELECT 1 FROM fountain_retained_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, archive.id)) throw new RetainedRoomError('invalid-ticket', 'Operation UUID already belongs to a retained handoff.');
      if (prerequisite && this.db.prepare('SELECT generation FROM fountain_cross_format_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, prerequisite.id)?.generation !== prerequisite.generation) { this.db.exec('ROLLBACK'); return false; }
      this.checkReplacementCapacity(key, expectedGeneration, live.wire.length);
      const result = this.db.prepare('UPDATE fountain_retained_rooms_v1 SET generation = ?, metadata = ?, wire = ? WHERE room_key = ? AND generation = ?').run(next.generation, live.metadata, liveWire, key, expectedGeneration);
      if (result.changes !== 1) { this.db.exec('ROLLBACK'); return false; }
      this.db.prepare('INSERT INTO fountain_cross_format_archives_v1 (room_key, archive_id, generation, source_epoch, source_identity, source_protocol, source_revision, metadata, source_wire, destination_wire) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(key, archive.id, archive.generation, archive.source.epoch, archive.sourceIdentity, protocol, archive.source.revision, metadata, sourceWire, destinationWire);
      this.checkRecoveryCapacity(key);
      this.db.exec('COMMIT'); return true;
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }
  async compareCrossBranch(key: string, id: string, expectedGeneration: string, checkpoint: DocumentCheckpoint, batch: { readonly update: Uint8Array; readonly sha256: string }): Promise<boolean> {
    const protocol = checkpoint.manifest.format === 'fountain-legacy-checkpoint/1' ? 'legacy' : checkpoint.manifest.format === 'fountain-retained-checkpoint/1' ? 'retained' : null;
    if (!protocol) throw new Error('Invalid cross-format branch protocol.');
    if (!(batch.update instanceof Uint8Array) || !batch.update.length || batch.update.length > 67108864 || !/^[a-f0-9]{64}$/.test(batch.sha256)) throw new Error('Invalid raw retired batch packet.');
    const update = Uint8Array.from(batch.update), metadata = JSON.stringify(checkpoint.manifest), wire = encodeStoredWire(checkpoint.update);
    const storedUpdate = this.compressRecoveryBatches ? encodeStoredWire(update) : update;
    const rawBytes = storedUpdate.length < update.length ? update.length : null;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.db.prepare(`UPDATE fountain_cross_format_archives_v1
        SET generation = ?, branch_metadata = ?, branch_wire = ?, branch_revision = branch_revision + 1
        WHERE room_key = ? AND archive_id = ? AND generation = ? AND source_protocol = ? AND branch_revision < 9007199254740991
          AND NOT EXISTS (SELECT 1 FROM fountain_cross_format_batches_v1 WHERE room_key = ? AND archive_id = ? AND sha256 = ?)`)
        .run(crypto.randomUUID(), metadata, wire, key, id, expectedGeneration, protocol, key, id, batch.sha256);
      if (result.changes !== 1) { this.db.exec('ROLLBACK'); return false; }
      const archive = this.db.prepare('SELECT branch_revision, source_epoch FROM fountain_cross_format_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, id)!;
      this.db.prepare('INSERT INTO fountain_cross_format_batches_v1 (room_key, archive_id, revision, source_epoch, sha256, wire, raw_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(key, id, archive.branch_revision!, archive.source_epoch!, batch.sha256, storedUpdate, rawBytes);
      this.checkRecoveryCapacity(key);
      this.db.exec('COMMIT'); return true;
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }
  async readCrossBatch(key: string, archiveId: string, revision: number): Promise<CrossFormatBatch | undefined> {
    const row = this.db.prepare('SELECT revision, source_epoch, sha256, wire, raw_bytes FROM fountain_cross_format_batches_v1 WHERE room_key = ? AND archive_id = ? AND revision = ?').get(key, archiveId, revision);
    return this.crossBatchRow(row, key, archiveId);
  }
  async findCrossBatch(key: string, archiveId: string, sha256: string): Promise<CrossFormatBatch | undefined> {
    const row = this.db.prepare('SELECT revision, source_epoch, sha256, wire, raw_bytes FROM fountain_cross_format_batches_v1 WHERE room_key = ? AND archive_id = ? AND sha256 = ? ORDER BY revision LIMIT 1').get(key, archiveId, sha256);
    return this.crossBatchRow(row, key, archiveId);
  }
  private crossBatchRow(row: Record<string, unknown> | undefined, key: string, archiveId: string): CrossFormatBatch | undefined {
    if (!row) return undefined;
    if (typeof row.revision !== 'number' || typeof row.source_epoch !== 'string' || typeof row.sha256 !== 'string' || !(row.wire instanceof Uint8Array)) throw new Error('Invalid stored retired batch.');
    const length = row.raw_bytes;
    if (length !== null && (typeof length !== 'number' || !Number.isSafeInteger(length) || length <= row.wire.length
      || length > maxCheckpointBytes || row.wire[0] !== 0x1f || row.wire[1] !== 0x8b)) {
      throw new Error('Invalid compressed retired batch length or header.');
    }
    const update = decodeStoredWire(row.wire, length ?? row.wire.length);
    return { key, archiveId, revision: row.revision, sourceEpoch: row.source_epoch, sha256: row.sha256, update };
  }

  close(): void { this.db.close(); }
}
