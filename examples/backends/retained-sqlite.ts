import { DatabaseSync } from 'node:sqlite';
import type { RetainedRoomRecord, RetainedRoomRepository } from '../../src/yjs/retained-room-coordinator';
import type { RetainedCheckpointManifest } from '../../src/yjs/retained-checkpoint';

/** Internal Node 24+ reference. Local SQLite file, not network/shared-filesystem
 * storage or a public Fountain package entry. The host owns paths and access. */
export class SQLiteRetainedRoomRepository implements RetainedRoomRepository {
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
        ) STRICT;`);
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

  close(): void { this.db.close(); }
}
