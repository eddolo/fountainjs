import { DatabaseSync } from 'node:sqlite';
import type { RetainedRoomRecord } from '../../src/yjs/retained-room-coordinator';
import type { RetainedRoomArchive, RetainedHandoffRepository } from '../../src/yjs/retained-handoff';
import { RetainedRoomError } from '../../src/yjs/retained-room-store';
import type { DocumentRoomRecord, DocumentCheckpoint } from '../../src/yjs/document-room';
import type { CrossFormatArchive, CrossFormatBatch, CrossFormatRepository } from '../../src/yjs/cross-format-handoff';

/** Internal Node 24+ reference. Local SQLite file, not network/shared-filesystem
 * storage or a public Fountain package entry. The host owns paths and access. */
export class SQLiteRetainedRoomRepository implements RetainedHandoffRepository, CrossFormatRepository {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path, { timeout: 1_000, allowExtension: false, enableDoubleQuotedStringLiterals: false });
    try {
      this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS fountain_retained_rooms_v1 (
          room_key TEXT PRIMARY KEY NOT NULL CHECK(length(room_key) BETWEEN 1 AND 194),
          generation TEXT NOT NULL CHECK(length(generation) = 36),
          metadata TEXT NOT NULL CHECK(length(metadata) <= 2097152),
          wire BLOB NOT NULL CHECK(length(wire) BETWEEN 1 AND 67108864)
        ) STRICT;
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
          PRIMARY KEY(room_key, archive_id, revision)
        ) STRICT;`);
    } catch (error) { this.db.close(); throw error; }
  }

  async read(key: string): Promise<RetainedRoomRecord | undefined> {
    const row = await this.readDocument(key);
    if (row && row.checkpoint.manifest.format !== 'fountain-retained-checkpoint/1') throw new RetainedRoomError('stale-epoch', 'Room uses the legacy protocol; reconnect through the document authority.');
    return row as RetainedRoomRecord | undefined;
  }

  async readDocument(key: string): Promise<DocumentRoomRecord | undefined> {
    const result = this.db.prepare('SELECT generation, metadata, wire FROM fountain_retained_rooms_v1 WHERE room_key = ?').get(key);
    if (!result) return undefined;
    if (typeof result.metadata !== 'string' || typeof result.generation !== 'string' || !(result.wire instanceof Uint8Array)) throw new Error('Invalid SQLite retained room row.');
    const data = JSON.parse(result.metadata) as Omit<DocumentRoomRecord, 'checkpoint'> & { manifest: DocumentCheckpoint['manifest'] };
    if (data.key !== key || data.generation !== result.generation) throw new Error('SQLite retained metadata identity mismatch.');
    if (!['fountain-retained-checkpoint/1', 'fountain-legacy-checkpoint/1'].includes(data.manifest?.format)) throw new Error('Invalid SQLite document checkpoint format.');
    const { manifest, ...row } = data, update = Uint8Array.from(result.wire);
    const checkpoint: DocumentCheckpoint = manifest.format === 'fountain-retained-checkpoint/1' ? { manifest, update } : { manifest, update };
    return { ...row, checkpoint };
  }

  private packet(record: DocumentRoomRecord): { metadata: string; wire: Uint8Array } {
    const { checkpoint, ...metadata } = record;
    return { metadata: JSON.stringify({ ...metadata, manifest: checkpoint.manifest }), wire: checkpoint.update };
  }

  async create(record: RetainedRoomRecord): Promise<boolean> {
    return this.createDocument(record);
  }

  async createDocument(record: DocumentRoomRecord): Promise<boolean> {
    const packet = this.packet(record);
    const result = this.db.prepare('INSERT INTO fountain_retained_rooms_v1 (room_key, generation, metadata, wire) VALUES (?, ?, ?, ?) ON CONFLICT(room_key) DO NOTHING')
      .run(record.key, record.generation, packet.metadata, packet.wire);
    return result.changes === 1;
  }

  async compareAndSwap(key: string, expectedGeneration: string, next: RetainedRoomRecord): Promise<boolean> {
    return this.compareDocument(key, expectedGeneration, next);
  }

  async compareDocument(key: string, expectedGeneration: string, next: DocumentRoomRecord): Promise<boolean> {
    if (next.key !== key || next.generation === expectedGeneration) throw new Error('Invalid SQLite retained CAS replacement.');
    // Only coordination metadata is needed for this guard. Do not copy the
    // full checkpoint wire again just to enforce the same-format CAS contract.
    const before = this.db.prepare('SELECT generation, metadata FROM fountain_retained_rooms_v1 WHERE room_key = ?').get(key);
    if (!before || before.generation !== expectedGeneration) return false;
    if (typeof before.metadata !== 'string' || JSON.parse(before.metadata).manifest?.format !== next.checkpoint.manifest.format) throw new Error('Format changes require an atomic recovery archive.');
    const packet = this.packet(next);
    const result = this.db.prepare('UPDATE fountain_retained_rooms_v1 SET generation = ?, metadata = ?, wire = ? WHERE room_key = ? AND generation = ?')
      .run(next.generation, packet.metadata, packet.wire, key, expectedGeneration);
    return result.changes === 1;
  }

  private archiveRow(row: Record<string, unknown> | undefined, key: string): RetainedRoomArchive | undefined {
    if (!row) return undefined;
    if (typeof row.metadata !== 'string' || typeof row.generation !== 'string' || !(row.source_wire instanceof Uint8Array) || !(row.destination_wire instanceof Uint8Array)
      || !Number.isSafeInteger(row.branch_revision)) throw new Error('Invalid SQLite archive row.');
    const header = JSON.parse(row.metadata);
    if (header.key !== key || header.id !== row.archive_id || header.source.key !== key || header.destination.key !== key
      || header.source.manifest.roomId !== row.source_room_id || header.source.revision !== row.source_revision) throw new Error('SQLite archive metadata identity mismatch.');
    const record = (data: any, wire: Uint8Array): RetainedRoomRecord => { const { manifest, ...metadata } = data; return { ...metadata, checkpoint: { manifest, update: Uint8Array.from(wire) } }; };
    const source = record(header.source, row.source_wire), destination = record(header.destination, row.destination_wire);
    const branch = row.branch_wire === null ? source.checkpoint : typeof row.branch_metadata === 'string' && row.branch_wire instanceof Uint8Array
      ? { manifest: JSON.parse(row.branch_metadata), update: Uint8Array.from(row.branch_wire) } : undefined;
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
    const { source: _source, destination: _destination, branch: _branch, branchRevision: _revision, generation: _generation, ...header } = archive;
    const metadata = JSON.stringify({ ...header, source: JSON.parse(source.metadata), destination: JSON.parse(destination.metadata) });
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.db.prepare('SELECT 1 FROM fountain_cross_format_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, archive.id)) throw new RetainedRoomError('invalid-ticket', 'Operation UUID already belongs to a cross-format handoff.');
      if (prerequisite && this.db.prepare('SELECT generation FROM fountain_retained_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, prerequisite.id)?.generation !== prerequisite.generation) {
        this.db.exec('ROLLBACK'); return false;
      }
      const changed = this.db.prepare('UPDATE fountain_retained_rooms_v1 SET generation = ?, metadata = ?, wire = ? WHERE room_key = ? AND generation = ?')
        .run(next.generation, live.metadata, live.wire, key, expectedGeneration);
      if (changed.changes !== 1) { this.db.exec('ROLLBACK'); return false; }
      this.db.prepare('INSERT INTO fountain_retained_archives_v1 (room_key, archive_id, generation, source_room_id, source_revision, metadata, source_wire, destination_wire) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(key, archive.id, archive.generation, archive.source.checkpoint.manifest.roomId, archive.source.revision, metadata, source.wire, destination.wire);
      this.db.exec('COMMIT'); return true;
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }

  async compareArchiveBranch(key: string, id: string, expectedGeneration: string, checkpoint: RetainedRoomRecord['checkpoint']): Promise<boolean> {
    const result = this.db.prepare('UPDATE fountain_retained_archives_v1 SET generation = ?, branch_metadata = ?, branch_wire = ?, branch_revision = branch_revision + 1 WHERE room_key = ? AND archive_id = ? AND generation = ? AND source_room_id = ? AND branch_revision < 9007199254740991')
      .run(globalThis.crypto.randomUUID(), JSON.stringify(checkpoint.manifest), checkpoint.update, key, id, expectedGeneration, checkpoint.manifest.roomId);
    return result.changes === 1;
  }

  private crossRow(row: Record<string, unknown> | undefined, key: string): CrossFormatArchive | undefined {
    if (!row) return undefined;
    if (typeof row.metadata !== 'string' || typeof row.generation !== 'string' || !(row.source_wire instanceof Uint8Array) || !(row.destination_wire instanceof Uint8Array) || !Number.isSafeInteger(row.branch_revision)) throw new Error('Invalid SQLite cross-format archive row.');
    const header = JSON.parse(row.metadata), protocol = header.source.manifest.format === 'fountain-legacy-checkpoint/1' ? 'legacy' : header.source.manifest.format === 'fountain-retained-checkpoint/1' ? 'retained' : null;
    if (header.key !== key || header.id !== row.archive_id || header.source.key !== key || header.destination.key !== key || header.sourceIdentity !== row.source_identity
      || header.source.epoch !== row.source_epoch || header.source.revision !== row.source_revision || !protocol || protocol !== row.source_protocol) throw new Error('SQLite cross-format metadata identity mismatch.');
    const record = (data: any, wire: Uint8Array): DocumentRoomRecord => { const { manifest, ...metadata } = data; return { ...metadata, checkpoint: { manifest, update: Uint8Array.from(wire) } }; };
    const source = record(header.source, row.source_wire), destination = record(header.destination, row.destination_wire), branch = row.branch_wire === null ? source.checkpoint : typeof row.branch_metadata === 'string' && row.branch_wire instanceof Uint8Array ? { manifest: JSON.parse(row.branch_metadata), update: Uint8Array.from(row.branch_wire) } : undefined;
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
    const { source: _source, destination: _destination, branch: _branch, branchRevision: _revision, generation: _generation, ...header } = archive;
    const metadata = JSON.stringify({ ...header, source: JSON.parse(source.metadata), destination: JSON.parse(destination.metadata) }), protocol = archive.source.checkpoint.manifest.format === 'fountain-legacy-checkpoint/1' ? 'legacy' : 'retained';
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.db.prepare('SELECT 1 FROM fountain_retained_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, archive.id)) throw new RetainedRoomError('invalid-ticket', 'Operation UUID already belongs to a retained handoff.');
      if (prerequisite && this.db.prepare('SELECT generation FROM fountain_cross_format_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, prerequisite.id)?.generation !== prerequisite.generation) { this.db.exec('ROLLBACK'); return false; }
      const result = this.db.prepare('UPDATE fountain_retained_rooms_v1 SET generation = ?, metadata = ?, wire = ? WHERE room_key = ? AND generation = ?').run(next.generation, live.metadata, live.wire, key, expectedGeneration);
      if (result.changes !== 1) { this.db.exec('ROLLBACK'); return false; }
      this.db.prepare('INSERT INTO fountain_cross_format_archives_v1 (room_key, archive_id, generation, source_epoch, source_identity, source_protocol, source_revision, metadata, source_wire, destination_wire) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(key, archive.id, archive.generation, archive.source.epoch, archive.sourceIdentity, protocol, archive.source.revision, metadata, source.wire, destination.wire);
      this.db.exec('COMMIT'); return true;
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }
  async compareCrossBranch(key: string, id: string, expectedGeneration: string, checkpoint: DocumentCheckpoint, batch: { readonly update: Uint8Array; readonly sha256: string }): Promise<boolean> {
    const protocol = checkpoint.manifest.format === 'fountain-legacy-checkpoint/1' ? 'legacy' : checkpoint.manifest.format === 'fountain-retained-checkpoint/1' ? 'retained' : null;
    if (!protocol) throw new Error('Invalid cross-format branch protocol.');
    if (!(batch.update instanceof Uint8Array) || !batch.update.length || batch.update.length > 67108864 || !/^[a-f0-9]{64}$/.test(batch.sha256)) throw new Error('Invalid raw retired batch packet.');
    const update = Uint8Array.from(batch.update), metadata = JSON.stringify(checkpoint.manifest), wire = checkpoint.update;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.db.prepare('UPDATE fountain_cross_format_archives_v1 SET generation = ?, branch_metadata = ?, branch_wire = ?, branch_revision = branch_revision + 1 WHERE room_key = ? AND archive_id = ? AND generation = ? AND source_protocol = ? AND branch_revision < 9007199254740991')
        .run(crypto.randomUUID(), metadata, wire, key, id, expectedGeneration, protocol);
      if (result.changes !== 1) { this.db.exec('ROLLBACK'); return false; }
      const archive = this.db.prepare('SELECT branch_revision, source_epoch FROM fountain_cross_format_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, id)!;
      this.db.prepare('INSERT INTO fountain_cross_format_batches_v1 (room_key, archive_id, revision, source_epoch, sha256, wire) VALUES (?, ?, ?, ?, ?, ?)').run(key, id, archive.branch_revision!, archive.source_epoch!, batch.sha256, update);
      this.db.exec('COMMIT'); return true;
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }
  async readCrossBatch(key: string, archiveId: string, revision: number): Promise<CrossFormatBatch | undefined> {
    const row = this.db.prepare('SELECT source_epoch, sha256, wire FROM fountain_cross_format_batches_v1 WHERE room_key = ? AND archive_id = ? AND revision = ?').get(key, archiveId, revision);
    if (!row) return undefined;
    if (typeof row.source_epoch !== 'string' || typeof row.sha256 !== 'string' || !(row.wire instanceof Uint8Array)) throw new Error('Invalid stored retired batch.');
    return { key, archiveId, revision, sourceEpoch: row.source_epoch, sha256: row.sha256, update: Uint8Array.from(row.wire) };
  }

  close(): void { this.db.close(); }
}
