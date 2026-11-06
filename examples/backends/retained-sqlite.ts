import { DatabaseSync } from 'node:sqlite';
import type { RetainedRoomRecord } from '../../src/yjs/retained-room-coordinator';
import type { RetainedRoomArchive, RetainedHandoffRepository } from '../../src/yjs/retained-handoff';
import type { RetainedCheckpointManifest } from '../../src/yjs/retained-checkpoint';

/** Internal Node 24+ reference. Local SQLite file, not network/shared-filesystem
 * storage or a public Fountain package entry. The host owns paths and access. */
export class SQLiteRetainedRoomRepository implements RetainedHandoffRepository {
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
        CREATE INDEX IF NOT EXISTS fountain_retained_archive_room_v1 ON fountain_retained_archives_v1 (room_key, source_room_id, source_revision DESC);`);
    } catch (error) { this.db.close(); throw error; }
  }

  async read(key: string): Promise<RetainedRoomRecord | undefined> {
    const result = this.db.prepare('SELECT generation, metadata, wire FROM fountain_retained_rooms_v1 WHERE room_key = ?').get(key);
    if (!result) return undefined;
    if (typeof result.metadata !== 'string' || typeof result.generation !== 'string' || !(result.wire instanceof Uint8Array)) throw new Error('Invalid SQLite retained room row.');
    const data = JSON.parse(result.metadata) as Omit<RetainedRoomRecord, 'checkpoint'> & { manifest: RetainedCheckpointManifest };
    if (data.key !== key || data.generation !== result.generation) throw new Error('SQLite retained metadata identity mismatch.');
    const { manifest, ...row } = data, update = Uint8Array.from(result.wire);
    return { ...row, checkpoint: { manifest, update } };
  }

  private packet(record: RetainedRoomRecord): { metadata: string; wire: Uint8Array } {
    const { checkpoint, ...metadata } = record;
    return { metadata: JSON.stringify({ ...metadata, manifest: checkpoint.manifest }), wire: checkpoint.update };
  }

  async create(record: RetainedRoomRecord): Promise<boolean> {
    const packet = this.packet(record);
    const result = this.db.prepare('INSERT INTO fountain_retained_rooms_v1 (room_key, generation, metadata, wire) VALUES (?, ?, ?, ?) ON CONFLICT(room_key) DO NOTHING')
      .run(record.key, record.generation, packet.metadata, packet.wire);
    return result.changes === 1;
  }

  async compareAndSwap(key: string, expectedGeneration: string, next: RetainedRoomRecord): Promise<boolean> {
    if (next.key !== key || next.generation === expectedGeneration) throw new Error('Invalid SQLite retained CAS replacement.');
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
    return this.archiveRow(this.db.prepare('SELECT * FROM fountain_retained_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, id), key);
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

  close(): void { this.db.close(); }
}
