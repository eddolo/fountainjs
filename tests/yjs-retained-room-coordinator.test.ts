// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import * as Y from 'yjs';
import { CoreExtension, Selection, composeExtensions, createEditor, insertText } from '../src';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { captureRetainedCheckpoint, restoreRetainedCheckpoint } from '../src/yjs/retained-checkpoint';
import { CoordinatedRetainedRoom, type RetainedRoomRecord, type RetainedRoomRepository } from '../src/yjs/retained-room-coordinator';
import { SQLiteRetainedRoomRepository } from '../examples/backends/retained-sqlite';

const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
const content = { type: 'doc', content: [{ type: 'paragraph', attrs: { nodeId: 'intro' }, content: [{ type: 'text', text: 'Alpha' }] }] };
function client(document = new Y.Doc(), name = 'Ada') {
  const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({ document, captureTimeout: 0, user: { id: name, name, color: '#7048e8' } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  cleanup.push(() => { editor.destroy(); document.destroy(); });
  return { document, editor, schema: editor.state.schema };
}
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'fountain-retained-cas-'));
  cleanup.push(() => {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('fountain-retained-cas-')) throw new Error('Unsafe test cleanup target.');
    rmSync(directory, { recursive: true, force: true });
  });
  const path = join(directory, 'rooms.sqlite'), a = new SQLiteRetainedRoomRepository(path), b = new SQLiteRetainedRoomRepository(path);
  cleanup.push(() => b.close()); cleanup.push(() => a.close());
  const source = client(); source.document.getMap('host-notes').set('owner', 'Grace'); source.document.getMap('host-notes').set('bytes', new Uint8Array([0, 128, 255]));
  const checkpoint = await captureRetainedCheckpoint(source.document, source.schema, 'schema-1');
  const first = new CoordinatedRetainedRoom(a, 'project:launch', source.schema, 'schema-1'), second = new CoordinatedRetainedRoom(b, 'project:launch', source.schema, 'schema-1');
  const initial = await first.initialize(checkpoint);
  return { ...source, path, a, b, first, second, checkpoint, initial };
}
function type(source: ReturnType<typeof client>, text: string) {
  source.editor.dispatch(source.editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
  expect(insertText(source.editor, text)).toBe(true);
}
const wire = (document: Y.Doc) => Y.encodeStateAsUpdate(document);
async function json(pair: Awaited<ReturnType<typeof fixture>>) {
  const snapshot = await pair.first.snapshot(), restored = await restoreRetainedCheckpoint(snapshot.checkpoint, pair.schema, 'schema-1');
  try { return restored.baseDocument.toJSON(); } finally { restored.document.destroy(); }
}
function gateRepository(base: RetainedRoomRepository) {
  let release!: () => void, reached!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { reached = resolve; });
  const repository: RetainedRoomRepository = { read: key => base.read(key), create: row => base.create(row), compareAndSwap: async (key, expected, row) => { reached(); await waiting; return base.compareAndSwap(key, expected, row); } };
  return { repository, ready, release };
}

it('persists an initialized checkpoint and shares its epoch across independent SQLite connections', async () => {
  const pair = await fixture(), current = await pair.second.snapshot();
  expect(typeof globalThis.document).toBe('undefined'); expect(current.epoch).toBe(pair.initial.epoch); expect(current.revision).toBe(0);
  expect(current.checkpoint.manifest.checkpointSha256).toBe(pair.checkpoint.manifest.checkpointSha256);
  current.checkpoint.update.fill(0); expect(await json(pair)).toEqual(pair.editor.getJSON());
});

it('saves a smaller live checkpoint and lets an updated raw writer reopen it exactly', async () => {
  const pair = await fixture();
  const key = 'project:launch';
  const repository = new SQLiteRetainedRoomRepository(pair.path, Date.now, { compressLiveCheckpoints: true });
  cleanup.push(() => repository.close());
  const compressedRoom = new CoordinatedRetainedRoom(repository, key, pair.schema, 'schema-1');
  expect((await compressedRoom.snapshot()).checkpoint).toEqual(pair.checkpoint);
  type(pair, ' Retained paragraph. '.repeat(500));
  const saved = await compressedRoom.write({ epoch: pair.initial.epoch, update: wire(pair.document) });
  const usage = repository.readStorageUsage(key)!;
  expect(usage.liveCheckpointBytes).toBe(saved.checkpoint.manifest.bytes);
  expect(usage.liveBytes).toBeLessThan(usage.liveCheckpointBytes / 2);
  expect(await pair.second.snapshot()).toEqual(saved);
  expect(await json(pair)).toEqual(pair.editor.getJSON());
  type(pair, 'New edit');
  const raw = await pair.second.write({ epoch: saved.epoch, update: wire(pair.document) });
  expect(repository.readStorageUsage(key)?.liveBytes).toBe(raw.checkpoint.manifest.bytes);
  expect(await compressedRoom.snapshot()).toEqual(raw);
});

it('refuses duplicate initialization without replacing saved content or epoch', async () => {
  const pair = await fixture();
  await expect(pair.second.initialize(pair.checkpoint)).rejects.toMatchObject({ code: 'revision-conflict' });
  expect(await pair.second.snapshot()).toEqual(pair.initial);
});

it('acknowledges a durable write retry without rewriting SQLite or invalidating a checked revision', async () => {
  const pair = await fixture();
  const { epoch } = pair.initial;
  pair.document.getMap('host-notes').set('owner', 'Mina');
  const request = { epoch, update: wire(pair.document) };
  const saved = await pair.first.write(request);
  expect(saved.revision).toBe(1);
  expect(saved.checkpoint.manifest.documentSha256).toBe(pair.checkpoint.manifest.documentSha256);
  expect(saved.checkpoint.manifest.checkpointSha256).not.toBe(pair.checkpoint.manifest.checkpointSha256);
  const row = await pair.a.read('project:launch');
  expect(await pair.second.write(request)).toEqual(saved);
  expect(await pair.b.read('project:launch')).toEqual(row);
  expect((await pair.second.freeze(saved)).revision).toBe(1);
});

it('does not create a missing room implicitly or accept invalid keys and schema versions', async () => {
  const pair = await fixture();
  expect(() => new CoordinatedRetainedRoom(pair.a, '../bad', pair.schema, 'schema-1')).toThrow('key');
  await expect(new CoordinatedRetainedRoom(pair.a, 'missing', pair.schema, 'schema-1').snapshot()).rejects.toThrow('does not exist');
  await expect(new CoordinatedRetainedRoom(pair.a, 'project:launch', pair.schema, 'schema-2').snapshot()).rejects.toThrow('incompatible');
});

it('commits actual editor changes with opaque auxiliary state visible on a different connection', async () => {
  const pair = await fixture(); type(pair, 'X'); pair.document.getMap('host-notes').set('owner', 'Mina');
  const current = await pair.first.write({ epoch: pair.initial.epoch, update: wire(pair.document) });
  expect(current.revision).toBe(1); expect((await pair.second.snapshot()).checkpoint.manifest.checkpointSha256).toBe(current.checkpoint.manifest.checkpointSha256);
  expect(await json(pair)).toEqual(pair.editor.getJSON());
  const restored = await restoreRetainedCheckpoint(current.checkpoint, pair.schema, 'schema-1');
  try { expect(restored.document.getMap('host-notes').get('owner')).toBe('Mina'); expect(restored.document.getMap('host-notes').get('bytes')).toEqual(new Uint8Array([0, 128, 255])); }
  finally { restored.document.destroy(); }
});

it.each(['stale', 'frozen'] as const)('rejects a %s write on another authority before reading its update field', async kind => {
  const pair = await fixture(); if (kind === 'frozen') await pair.first.freeze(pair.initial);
  const read = vi.fn((): Uint8Array => { throw new Error('Must not read update'); });
  await expect(pair.second.write({ epoch: kind === 'stale' ? 'old' : pair.initial.epoch, get update() { return read(); } })).rejects.toMatchObject({ code: kind === 'stale' ? 'stale-epoch' : 'frozen' });
  expect(read).not.toHaveBeenCalled(); expect((await pair.first.snapshot()).checkpoint.manifest.checkpointSha256).toBe(pair.checkpoint.manifest.checkpointSha256);
});

it.each(['invalid-wire', 'different-room', 'missing-dependency'] as const)('keeps the saved row exact after %s rejection', async kind => {
  const pair = await fixture(); let update: Uint8Array = new Uint8Array([255]);
  if (kind === 'different-room') update = wire(client(undefined, 'Foreign').document);
  if (kind === 'missing-dependency') { const updates: Uint8Array[] = []; pair.document.on('update', bytes => updates.push(bytes)); const text = [...pair.document.getMap('fountain-text:texts').values()][0] as Y.Text; text.insert(2, 'X'); text.insert(3, 'Y'); update = updates[1]!; }
  const before = await pair.a.read('project:launch');
  await expect(pair.first.write({ epoch: pair.initial.epoch, update })).rejects.toMatchObject({ code: 'invalid-update' });
  expect(await pair.b.read('project:launch')).toEqual(before);
});

it('rejects stale freeze revisions and does not allow two authorities to freeze the same revision', async () => {
  const pair = await fixture(); type(pair, 'X'); await pair.first.write({ epoch: pair.initial.epoch, update: wire(pair.document) });
  await expect(pair.second.freeze(pair.initial)).rejects.toMatchObject({ code: 'revision-conflict' });
  const current = await pair.first.snapshot(); const results = await Promise.allSettled([pair.first.freeze(current), pair.second.freeze(current)]);
  expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1); expect(results.filter(row => row.status === 'rejected')).toHaveLength(1);
  expect((await pair.second.snapshot()).phase).toBe('frozen');
});

it('fences an already validated write through persistent CAS when another authority freezes and aborts', async () => {
  const pair = await fixture(), gate = gateRepository(pair.a), delayed = new CoordinatedRetainedRoom(gate.repository, 'project:launch', pair.schema, 'schema-1');
  const before = await json(pair);
  type(pair, 'X'); const pending = delayed.write({ epoch: pair.initial.epoch, update: wire(pair.document) }); await gate.ready;
  const ticket = await pair.second.freeze(pair.initial); await pair.second.abort(ticket); gate.release();
  await expect(pending).rejects.toMatchObject({ code: 'revision-conflict' }); expect(await json(pair)).toEqual(before);
  await pair.first.write({ epoch: pair.initial.epoch, update: wire(pair.document) }); expect(await json(pair)).toEqual(pair.editor.getJSON());
});

it('fences an already validated write after another authority commits a new writer epoch', async () => {
  const pair = await fixture(), gate = gateRepository(pair.a), delayed = new CoordinatedRetainedRoom(gate.repository, 'project:launch', pair.schema, 'schema-1');
  const before = await json(pair);
  type(pair, 'X'); const pending = delayed.write({ epoch: pair.initial.epoch, update: wire(pair.document) }); await gate.ready;
  const ticket = await pair.second.freeze(pair.initial), prepared = await pair.second.prepareResume(ticket), resumed = await pair.second.commitResume(ticket, prepared); gate.release();
  await expect(pending).rejects.toMatchObject({ code: 'revision-conflict' }); expect((await pair.first.snapshot()).epoch).toBe(resumed.epoch); expect(await json(pair)).toEqual(before);
});

it('persists frozen state and preparation across connection restart without automatically resuming writes', async () => {
  const pair = await fixture(), ticket = await pair.first.freeze(pair.initial), prepared = await pair.first.prepareResume(ticket);
  const repository = new SQLiteRetainedRoomRepository(pair.path); cleanup.push(() => repository.close());
  const restarted = new CoordinatedRetainedRoom(repository, 'project:launch', pair.schema, 'schema-1');
  const recovered = await restarted.recoverFrozen(pair.initial);
  expect(recovered.ticket).toEqual(ticket); expect(recovered.prepared).toEqual(prepared); expect((await restarted.snapshot()).phase).toBe('frozen');
  await expect(restarted.write({ epoch: pair.initial.epoch, update: wire(pair.document) })).rejects.toMatchObject({ code: 'frozen' });
  const resumed = await restarted.commitResume(recovered.ticket, recovered.prepared!);
  expect(resumed.epoch).not.toBe(pair.initial.epoch); expect(resumed.revision).toBe(1); expect(resumed.checkpoint.manifest.checkpointSha256).toBe(pair.initial.checkpoint.manifest.checkpointSha256);
  expect(await pair.first.commitResume(ticket, prepared)).toEqual(resumed);
});

it('recovers a freeze that had not yet prepared and can abort it from a new authority', async () => {
  const pair = await fixture(), ticket = await pair.first.freeze(pair.initial), recovered = await pair.second.recoverFrozen(pair.initial);
  expect(recovered.ticket).toEqual(ticket); expect(recovered.prepared).toBeUndefined();
  expect(await pair.second.abort(recovered.ticket)).toEqual(pair.initial);
  await expect(pair.first.prepareResume(ticket)).rejects.toMatchObject({ code: 'invalid-ticket' });
});

it('rejects foreign, stale, or mismatched administrative recovery capabilities', async () => {
  const pair = await fixture(), ticket = await pair.first.freeze(pair.initial), prepared = await pair.first.prepareResume(ticket);
  await expect(pair.second.prepareResume({ ...ticket, key: 'other' })).rejects.toMatchObject({ code: 'invalid-ticket' });
  await expect(pair.second.commitResume(ticket, { ...prepared, id: globalThis.crypto.randomUUID() })).rejects.toMatchObject({ code: 'invalid-ticket' });
  await expect(pair.second.recoverFrozen({ ...pair.initial, revision: 42 })).rejects.toMatchObject({ code: 'invalid-ticket' });
  await pair.second.abort(ticket); const replacement = await pair.second.freeze(pair.initial);
  await expect(pair.first.abort(ticket)).rejects.toMatchObject({ code: 'invalid-ticket' });
  await expect(pair.first.commitResume(replacement, prepared)).rejects.toMatchObject({ code: 'invalid-ticket' });
});

it.each(['abort', 'resume'] as const)('rejects a recovery preparation CAS that races with %s', async operation => {
  const pair = await fixture(), ticket = await pair.first.freeze(pair.initial), gate = gateRepository(pair.a), delayed = new CoordinatedRetainedRoom(gate.repository, 'project:launch', pair.schema, 'schema-1');
  const pending = delayed.prepareResume(ticket); await gate.ready;
  if (operation === 'abort') await pair.second.abort(ticket);
  else { const ready = await pair.second.prepareResume(ticket); await pair.second.commitResume(ticket, ready); }
  gate.release(); await expect(pending).rejects.toMatchObject({ code: 'revision-conflict' });
});

it('reuses a persisted preparation id without changing the checkpoint', async () => {
  const pair = await fixture(), ticket = await pair.first.freeze(pair.initial), first = await pair.first.prepareResume(ticket), before = await pair.a.read('project:launch');
  expect(await pair.second.prepareResume(ticket)).toEqual(first); expect(await pair.b.read('project:launch')).toEqual(before);
});

it('replays a committed handoff after lost acknowledgement without rotating twice or losing subsequent edits', async () => {
  const pair = await fixture(), ticket = await pair.first.freeze(pair.initial), prepared = await pair.first.prepareResume(ticket), resumed = await pair.first.commitResume(ticket, prepared);
  const before = await pair.a.read('project:launch'); expect(await pair.second.commitResume(ticket, prepared)).toEqual(resumed); expect(await pair.b.read('project:launch')).toEqual(before);
  type(pair, 'AFTER'); const edited = await pair.second.write({ epoch: resumed.epoch, update: wire(pair.document) });
  expect(await pair.first.commitResume(ticket, prepared)).toEqual(edited); expect(await json(pair)).toEqual(pair.editor.getJSON());
});

it('does not use an old completion receipt to reactivate a later freeze or supersede a later handoff', async () => {
  const pair = await fixture(), ticket = await pair.first.freeze(pair.initial), prepared = await pair.first.prepareResume(ticket), resumed = await pair.first.commitResume(ticket, prepared);
  const secondTicket = await pair.second.freeze(resumed); await expect(pair.first.commitResume(ticket, prepared)).rejects.toMatchObject({ code: 'invalid-ticket' });
  const secondPrepared = await pair.second.prepareResume(secondTicket); await pair.second.commitResume(secondTicket, secondPrepared);
  await expect(pair.first.commitResume(ticket, prepared)).rejects.toMatchObject({ code: 'invalid-ticket' });
});

it('preserves both actual offline edits after a persistent write conflict and explicit retry', async () => {
  const pair = await fixture(), restored = await restoreRetainedCheckpoint(pair.checkpoint, pair.schema, 'schema-1'), peer = client(restored.document, 'Grace');
  type(pair, 'X'); type(peer, 'Y'); const updates = [wire(pair.document), wire(peer.document)], authorities = [pair.first, pair.second];
  const results = await Promise.allSettled(authorities.map((room, index) => room.write({ epoch: pair.initial.epoch, update: updates[index]! })));
  expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1); const rejected = results.findIndex(row => row.status === 'rejected');
  expect((results[rejected] as PromiseRejectedResult).reason).toMatchObject({ code: 'revision-conflict' });
  const accepted = await authorities[rejected]!.write({ epoch: pair.initial.epoch, update: updates[rejected]! });
  Y.applyUpdate(pair.document, accepted.checkpoint.update); Y.applyUpdate(peer.document, accepted.checkpoint.update);
  expect(pair.editor.getJSON()).toEqual(peer.editor.getJSON()); expect(await json(pair)).toEqual(pair.editor.getJSON());
  expect(pair.editor.state.doc.textContent).toContain('X'); expect(pair.editor.state.doc.textContent).toContain('Y');
});

it('rejects an old epoch after reconnect then merges its explicitly retained same-room update', async () => {
  const pair = await fixture(); type(pair, 'OFFLINE'); const update = wire(pair.document), ticket = await pair.first.freeze(pair.initial), prepared = await pair.second.prepareResume(ticket), current = await pair.first.commitResume(ticket, prepared);
  await expect(pair.second.write({ epoch: pair.initial.epoch, update })).rejects.toMatchObject({ code: 'stale-epoch' });
  await pair.second.write({ epoch: current.epoch, update }); expect(await json(pair)).toEqual(pair.editor.getJSON());
});

it.each(['read', 'prepare', 'commit'] as const)('detects persisted wire corruption during %s without repairing or advancing the row', async operation => {
  const pair = await fixture(); let ticket, prepared;
  if (operation !== 'read') ticket = await pair.first.freeze(pair.initial);
  if (operation === 'commit') prepared = await pair.first.prepareResume(ticket!);
  const db = new DatabaseSync(pair.path); db.prepare('UPDATE fountain_retained_rooms_v1 SET wire = ? WHERE room_key = ?').run(new Uint8Array([255]), 'project:launch'); db.close();
  const corrupted = await pair.a.read('project:launch');
  await expect(operation === 'read' ? pair.first.snapshot() : operation === 'prepare' ? pair.first.prepareResume(ticket!) : pair.first.commitResume(ticket!, prepared!)).rejects.toThrow();
  expect(await pair.b.read('project:launch')).toEqual(corrupted);
});

it('owns repository reads and refuses a stale SQLite CAS without changing metadata or bytes', async () => {
  const pair = await fixture(), before = (await pair.a.read('project:launch'))!;
  const mutated = await pair.b.read('project:launch'); mutated!.checkpoint.update.fill(0);
  expect((await pair.a.read('project:launch'))!.checkpoint.update).toEqual(before.checkpoint.update);
  const replacement: RetainedRoomRecord = { ...before, generation: globalThis.crypto.randomUUID(), revision: 7 };
  expect(await pair.b.compareAndSwap('project:launch', globalThis.crypto.randomUUID(), replacement)).toBe(false);
  expect(await pair.a.read('project:launch')).toEqual(before);
  await expect(pair.a.compareAndSwap('other-key', before.generation, replacement)).rejects.toThrow('replacement');
});
