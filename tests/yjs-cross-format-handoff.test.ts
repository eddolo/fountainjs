// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import * as Y from 'yjs';
import { CoreExtension, MathExtension, Selection, composeExtensions, createEditor, defineExtension, insertText, toggleQuote } from '../src';
import { defineStructuredAttribute, setStructuredAttribute } from '../src/structured-attributes';
import { createYjsCollaborationExtension } from '../src/yjs';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { captureLegacyCheckpoint, restoreLegacyCheckpoint, type LegacyCheckpoint } from '../src/yjs/legacy-checkpoint';
import { restoreRetainedCheckpoint, type RetainedCheckpoint } from '../src/yjs/retained-checkpoint';
import { CoordinatedDocumentRoom, type DocumentCheckpoint, type DocumentProtocol } from '../src/yjs/document-room';
import { CrossFormatRoomHandoff, type CrossFormatRepository } from '../src/yjs/cross-format-handoff';
import { CoordinatedRetainedRoom } from '../src/yjs/retained-room-coordinator';
import { RetainedRoomHandoff, type RetainedHandoffPolicy } from '../src/yjs/retained-handoff';
import type { RetainedMigrationOptions } from '../src/yjs/retained-migration';
import { retainedStructuredRootMigrator } from '../src/yjs/retained-migration';
import { SQLiteRetainedRoomRepository } from '../examples/backends/retained-sqlite';

const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
const key = 'project:cross-format', version = 'schema-1', uuid = () => crypto.randomUUID();
const options = (): RetainedMigrationOptions => ({ history: 'reset-with-source-checkpoint', offline: 'reconcile-before-activation', externalState: 'host-coordinated', migrators: [] });
const policy = (): RetainedHandoffPolicy => ({ history: 'reset-with-source-archive', offline: 'retain-retired-room-branches', externalReceipt: 'host-coordination-1' });
const content = { type: 'doc', attrs: { metadata: { title: 'Existing paper', edition: 2 } }, content: [
  { type: 'paragraph', attrs: { nodeId: 'intro' }, content: [{ type: 'text', text: 'Alpha α 😀' }] },
  { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep both histories recoverable.' }] }] },
  { type: 'image_super', attrs: { nodeId: 'figure', src: '/figure.png', alt: 'Original figure' } },
  { type: 'math_block', attrs: { latex: 'x^2+y^2', label: 'eq:one' } },
  { type: 'code_block', attrs: { language: 'lean' }, content: [{ type: 'text', text: 'example : 1 + 1 = 2 := by decide' }] },
] };
function client(document = new Y.Doc(), protocol: DocumentProtocol = 'legacy', name = 'Ada') {
  const extension = (protocol === 'legacy' ? createYjsCollaborationExtension : createRetainedYjsCollaborationExtension)({ document, captureTimeout: 0, user: { id: name, name, color: '#7048e8' } });
  const kit = composeExtensions([CoreExtension, MathExtension, extension]), editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  cleanup.push(() => { editor.destroy(); document.destroy(); }); return { document, editor, schema: editor.state.schema };
}
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'fountain-cross-format-'));
  cleanup.push(() => { if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('fountain-cross-format-')) throw new Error('Unsafe cleanup target.'); rmSync(directory, { recursive: true, force: true }); });
  const path = join(directory, 'rooms.sqlite'), a = new SQLiteRetainedRoomRepository(path), b = new SQLiteRetainedRoomRepository(path); cleanup.push(() => b.close()); cleanup.push(() => a.close());
  const source = client(), checkpoint = await captureLegacyCheckpoint(source.document, source.schema, version), room = new CoordinatedDocumentRoom(a, key, source.schema, version), other = new CoordinatedDocumentRoom(b, key, source.schema, version), handoff = new CrossFormatRoomHandoff(a, key, source.schema, version), second = new CrossFormatRoomHandoff(b, key, source.schema, version), initial = await room.initialize(checkpoint);
  return { ...source, path, a, b, checkpoint, room, other, handoff, second, initial };
}
async function restore(checkpoint: DocumentCheckpoint, pair: Awaited<ReturnType<typeof fixture>>) {
  return checkpoint.manifest.format === 'fountain-legacy-checkpoint/1' ? restoreLegacyCheckpoint(checkpoint as LegacyCheckpoint, pair.schema, version) : restoreRetainedCheckpoint(checkpoint as RetainedCheckpoint, pair.schema, version);
}
async function model(checkpoint: DocumentCheckpoint, pair: Awaited<ReturnType<typeof fixture>>) { const value = await restore(checkpoint, pair); try { return value.baseDocument.toJSON(); } finally { value.document.destroy(); } }
async function open(checkpoint: DocumentCheckpoint, pair: Awaited<ReturnType<typeof fixture>>, name = 'Grace') { const value = await restore(checkpoint, pair); return client(value.document, checkpoint.manifest.format === 'fountain-legacy-checkpoint/1' ? 'legacy' : 'retained', name); }
function type(pair: ReturnType<typeof client>, text: string) { pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.cursor([0, 0], 2))); expect(insertText(pair.editor, text)).toBe(true); return Y.encodeStateAsUpdate(pair.document); }
async function migrate(pair: Awaited<ReturnType<typeof fixture>>) { const ticket = await pair.room.freeze(await pair.room.snapshot()), operation = uuid(), result = await pair.handoff.migrateLegacy(ticket, operation, options(), policy()); return { ticket, operation, result }; }
function gate(base: CrossFormatRepository, method: 'installCrossArchive' | 'compareCrossBranch' | 'compareDocument' | 'readCrossArchive' = 'installCrossArchive') {
  let release!: () => void, reached!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { reached = resolve; });
  const repository: CrossFormatRepository = { readDocument: base.readDocument.bind(base), createDocument: base.createDocument.bind(base), compareDocument: base.compareDocument.bind(base), readCrossArchive: base.readCrossArchive.bind(base), readRetiredEpoch: base.readRetiredEpoch.bind(base), installCrossArchive: base.installCrossArchive.bind(base), compareCrossBranch: base.compareCrossBranch.bind(base), readCrossBatch: base.readCrossBatch.bind(base) };
  const original = repository[method] as (...args: any[]) => Promise<any>; (repository as any)[method] = async (...args: any[]) => { reached(); await waiting; return original(...args); }; return { repository, ready, release };
}

it('uses one persisted live row for old and new protocols and archives the exact original atomically', async () => {
  const pair = await fixture(), expected = pair.editor.getJSON(), moved = await migrate(pair), current = await pair.other.snapshot();
  expect(typeof globalThis.document).toBe('undefined'); expect(pair.initial.protocol).toBe('legacy'); expect(current.protocol).toBe('retained'); expect(current).toEqual(moved.result.snapshot); expect(current.epoch).not.toBe(pair.initial.epoch); expect(current.revision).toBe(1);
  expect(await model(current.checkpoint, pair)).toEqual(expected); const archive = await pair.b.readCrossArchive(key, moved.operation); expect(archive!.source.checkpoint).toEqual(pair.checkpoint); expect(archive!.destination.checkpoint).toEqual(current.checkpoint); expect(archive!.branchRevision).toBe(0);
  const retained = new CoordinatedRetainedRoom(pair.b, key, pair.schema, version); expect((await retained.snapshot()).checkpoint).toEqual(current.checkpoint);
  const db = new DatabaseSync(pair.path); cleanup.push(() => db.close()); expect(db.prepare('SELECT count(*) AS total FROM fountain_retained_rooms_v1').get()!.total).toBe(1);
  moved.result.archive.source.checkpoint.update.fill(0); expect((await pair.b.readCrossArchive(key, moved.operation))!.source.checkpoint).toEqual(pair.checkpoint);
});

it('accepts real legacy edits before migration and never allows a plain CAS to change protocols', async () => {
  const pair = await fixture(), accepted = await pair.other.write({ epoch: pair.initial.epoch, protocol: 'legacy', update: type(pair, 'OLD') }); expect(accepted.revision).toBe(1); expect(await model(accepted.checkpoint, pair)).toEqual(pair.editor.getJSON());
  const moved = await migrate(pair), row = (await pair.a.readDocument(key))!;
  await expect(pair.b.compareDocument(key, row.generation, { ...row, generation: uuid(), checkpoint: pair.checkpoint })).rejects.toThrow('atomic recovery archive');
  expect(await pair.room.snapshot()).toEqual(moved.result.snapshot);
});

it('rehearses the exact saved legacy revision without freezing, archiving or exposing a candidate identity', async () => {
  const pair = await fixture();
  const before = await pair.a.readDocument(key);
  const checked = await pair.handoff.preflightLegacy(pair.initial, { ...options(), destinationRoom: 'review-copy' });
  expect(checked).toMatchObject({
    key, epoch: pair.initial.epoch, revision: pair.initial.revision,
    sourceCheckpointSha256: pair.checkpoint.manifest.checkpointSha256,
    documentSha256: pair.checkpoint.manifest.documentSha256,
    report: { sourceRoom: 'fountain', destinationRoom: 'review-copy', sourceBytes: pair.checkpoint.manifest.bytes },
  });
  expect(checked.report).not.toHaveProperty('destinationRoomId');
  expect(checked).not.toHaveProperty('checkpoint');
  expect(await pair.b.readDocument(key)).toEqual(before);
  expect(await pair.b.readRetiredEpoch(key, pair.initial.epoch)).toBeUndefined();
  const edited = await pair.other.write({ epoch: pair.initial.epoch, protocol: 'legacy', update: type(pair, 'AFTER') });
  await expect(pair.handoff.preflightLegacy(checked, options())).rejects.toMatchObject({ code: 'revision-conflict' });
  await expect(pair.room.freeze(checked)).rejects.toMatchObject({ code: 'revision-conflict' });
  expect((await pair.room.snapshot()).phase).toBe('active');
  const fresh = await pair.handoff.preflightLegacy(edited, options());
  expect(fresh.documentSha256).not.toBe(checked.documentSha256);
  expect((await pair.room.freeze(fresh)).checkpointSha256).toBe(fresh.sourceCheckpointSha256);
});

it('reports unclaimed data before the room stops accepting edits', async () => {
  const pair = await fixture();
  pair.document.getMap('unclaimed').set('comment', 'Preserve me');
  const accepted = await pair.room.write({ epoch: pair.initial.epoch, protocol: 'legacy', update: Y.encodeStateAsUpdate(pair.document) });
  await expect(pair.handoff.preflightLegacy(accepted, options())).rejects.toThrow('Unclaimed legacy migration roots: unclaimed');
  expect(await pair.other.snapshot()).toEqual(accepted);
  const later = await pair.other.write({ epoch: pair.initial.epoch, protocol: 'legacy', update: type(pair, 'STILL LIVE') });
  expect(later.phase).toBe('active');
  expect(later.revision).toBe(accepted.revision + 1);
});

it.each(['write', 'freeze and abort'] as const)('refuses preflight when another authority performs a %s during conversion', async action => {
  const pair = await fixture();
  let entered!: () => void, release!: () => void;
  const atFence = new Promise<void>(resolve => { entered = resolve; });
  const proceed = new Promise<void>(resolve => { release = resolve; });
  const read = pair.a.readDocumentHeader.bind(pair.a);
  vi.spyOn(pair.a, 'readDocumentHeader').mockImplementation(async roomKey => {
    entered();
    await proceed;
    return read(roomKey);
  });
  const check = pair.handoff.preflightLegacy(pair.initial, options());
  try {
    await atFence;
    if (action === 'write') await pair.other.write({ epoch: pair.initial.epoch, protocol: 'legacy', update: type(pair, 'RACE') });
    else await pair.other.abort(await pair.other.freeze(pair.initial));
  } finally { release(); }
  await expect(check).rejects.toMatchObject({ code: 'revision-conflict' });
  expect((await pair.other.snapshot()).phase).toBe('active');
});

it.each(['epoch', 'protocol', 'frozen'] as const)('rejects an incorrect %s before reading update bytes', async kind => {
  const pair = await fixture(); if (kind === 'frozen') await pair.room.freeze(pair.initial); const getter = vi.fn(() => { throw new Error('Unread'); });
  await expect(pair.other.write({ epoch: kind === 'epoch' ? uuid() : pair.initial.epoch, protocol: kind === 'protocol' ? 'retained' : 'legacy', get update() { return getter(); } })).rejects.toMatchObject({ code: kind === 'frozen' ? 'frozen' : 'stale-epoch' }); expect(getter).not.toHaveBeenCalled();
});

it.each(['invalid-wire', 'foreign-wire', 'missing-dependency', 'root-replacement'] as const)('keeps the original legacy row intact after %s rejection', async kind => {
  const pair = await fixture(); let update: Uint8Array;
  if (kind === 'invalid-wire') update = new Uint8Array([255]);
  else if (kind === 'foreign-wire') { const foreign = client(); foreign.document.guid = pair.document.guid; update = Y.encodeStateAsUpdate(foreign.document); }
  else if (kind === 'missing-dependency') { const updates: Uint8Array[] = []; pair.document.on('update', update => updates.push(update)); type(pair, 'X'); type(pair, 'Y'); update = updates[1]!; }
  else { pair.editor.destroy(); const fragment = pair.document.getXmlFragment('fountain'), copy = (fragment.get(0) as Y.XmlElement).clone(); fragment.delete(0, 1); fragment.insert(0, [copy]); update = Y.encodeStateAsUpdate(pair.document); }
  const before = await pair.a.readDocument(key); await expect(pair.room.write({ epoch: pair.initial.epoch, protocol: 'legacy', update })).rejects.toMatchObject({ code: 'invalid-update' }); expect(await pair.b.readDocument(key)).toEqual(before);
});

it.each(['active', 'prepared', 'stale-ticket'] as const)('does not install from an %s source', async kind => {
  const pair = await fixture(), ticket = await pair.room.freeze(pair.initial), operation = uuid();
  if (kind === 'active') await pair.room.abort(ticket);
  if (kind === 'prepared') { const row = (await pair.a.readDocument(key))!; await pair.a.compareDocument(key, row.generation, { ...row, generation: uuid(), preparationId: uuid() }); }
  const before = await pair.a.readDocument(key); await expect(pair.handoff.migrateLegacy(kind === 'stale-ticket' ? { ...ticket, revision: 5 } : ticket, operation, options(), policy())).rejects.toMatchObject({ code: 'invalid-ticket' }); expect(await pair.b.readDocument(key)).toEqual(before); expect(await pair.b.readCrossArchive(key, operation)).toBeUndefined();
});

it('leaves an unclaimed auxiliary root and frozen original untouched after conversion refusal', async () => {
  const pair = await fixture(); pair.document.getMap('unclaimed').set('record', 'Must survive'); await pair.room.write({ epoch: pair.initial.epoch, protocol: 'legacy', update: Y.encodeStateAsUpdate(pair.document) });
  const ticket = await pair.room.freeze(await pair.room.snapshot()), before = await pair.a.readDocument(key), operation = uuid(); await expect(pair.handoff.migrateLegacy(ticket, operation, options(), policy())).rejects.toThrow('Unclaimed'); expect(await pair.a.readDocument(key)).toEqual(before); expect(await pair.b.readCrossArchive(key, operation)).toBeUndefined();
});

it('rolls back the live format flip when archive insertion fails after the live SQL update', async () => {
  const pair = await fixture(), ticket = await pair.room.freeze(pair.initial), operation = uuid(), before = await pair.a.readDocument(key), db = new DatabaseSync(pair.path); cleanup.push(() => db.close());
  db.exec("CREATE TRIGGER fail_cross BEFORE INSERT ON fountain_cross_format_archives_v1 BEGIN SELECT RAISE(ABORT, 'injected cross archive failure'); END");
  await expect(pair.handoff.migrateLegacy(ticket, operation, options(), policy())).rejects.toThrow('injected cross archive failure'); expect(await pair.b.readDocument(key)).toEqual(before); expect(await pair.b.readCrossArchive(key, operation)).toBeUndefined();
  db.exec('DROP TRIGGER fail_cross'); expect((await pair.handoff.migrateLegacy(ticket, operation, options(), policy())).snapshot.protocol).toBe('retained');
});

it('rejects a prevalidated legacy writer after another authority commits the format switch', async () => {
  const pair = await fixture(), held = gate(pair.a, 'compareDocument'), delayed = new CoordinatedDocumentRoom(held.repository, key, pair.schema, version), update = type(pair, 'PENDING');
  const pending = delayed.write({ epoch: pair.initial.epoch, protocol: 'legacy', update }); await held.ready; const moved = await migrate(pair); held.release(); await expect(pending).rejects.toMatchObject({ code: 'revision-conflict' }); expect(await pair.other.snapshot()).toEqual(moved.result.snapshot);
  const saved = await pair.second.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, update }); expect(await model(saved.branch, pair)).toEqual(pair.editor.getJSON());
});

it('rejects a candidate whose frozen source was aborted and frozen again during conversion', async () => {
  const pair = await fixture(), ticket = await pair.room.freeze(pair.initial), operation = uuid(), held = gate(pair.a), service = new CrossFormatRoomHandoff(held.repository, key, pair.schema, version), pending = service.migrateLegacy(ticket, operation, options(), policy());
  await held.ready; await pair.other.abort(ticket); await pair.other.freeze(pair.initial); const before = await pair.b.readDocument(key); held.release(); await expect(pending).rejects.toMatchObject({ code: 'revision-conflict' }); expect(await pair.a.readDocument(key)).toEqual(before); expect(await pair.a.readCrossArchive(key, operation)).toBeUndefined();
});

it('admits exactly one competing migration and permits an explicit idempotent replay', async () => {
  const pair = await fixture(), ticket = await pair.room.freeze(pair.initial), operation = uuid(), results = await Promise.allSettled([pair.handoff.migrateLegacy(ticket, operation, options(), policy()), pair.second.migrateLegacy(ticket, operation, options(), policy())]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(results.filter(result => result.status === 'rejected')).toHaveLength(1); const replay = await pair.second.migrateLegacy(ticket, operation, options(), policy()); expect(replay).toMatchObject({ replayed: true, current: true }); expect(replay.snapshot.revision).toBe(1);
});

it('retains late old-format data in its original codec, never in the live retained room', async () => {
  const pair = await fixture(), moved = await migrate(pair), before = await pair.room.snapshot(), update = type(pair, 'LATE'); const saved = await pair.handoff.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, update });
  expect(saved.branch.manifest.format).toBe('fountain-legacy-checkpoint/1'); expect(saved.source.checkpoint).toEqual(pair.checkpoint); expect(saved.destination.checkpoint).toEqual(before.checkpoint); expect(await model(saved.branch, pair)).toEqual(pair.editor.getJSON()); expect(await pair.room.snapshot()).toEqual(before); expect(await pair.second.retiredEpoch(pair.initial.epoch)).toEqual(saved); expect(await pair.second.retiredEpoch(uuid())).toBeUndefined();
  const getter = vi.fn(() => update); await expect(pair.handoff.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: uuid(), get update() { return getter(); } })).rejects.toMatchObject({ code: 'stale-epoch' }); expect(getter).not.toHaveBeenCalled();
});

it('preserves concurrent old-source batches through branch CAS and explicit retry', async () => {
  const pair = await fixture(), peer = await open(pair.checkpoint, pair), moved = await migrate(pair), held = gate(pair.a, 'compareCrossBranch'), service = new CrossFormatRoomHandoff(held.repository, key, pair.schema, version), a = type(pair, 'A'), b = type(peer, 'B');
  const pending = service.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, update: a }); await held.ready; await pair.second.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, update: b }); held.release(); await expect(pending).rejects.toMatchObject({ code: 'revision-conflict' });
  const saved = await pair.handoff.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, update: a }); Y.applyUpdate(pair.document, b); expect(await model(saved.branch, pair)).toEqual(pair.editor.getJSON()); expect(saved.branchRevision).toBe(2);
});

it.each(['frozen-source', 'source-branch'] as const)('rolls back to the legacy %s and archives all accepted retained edits', async restore => {
  const pair = await fixture(), moved = await migrate(pair); await pair.handoff.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, update: type(pair, ' OLD ') });
  const fresh = await open(moved.result.snapshot.checkpoint, pair), accepted = await pair.room.write({ epoch: moved.result.snapshot.epoch, protocol: 'retained', update: type(fresh, ' NEW ') }), ticket = await pair.room.freeze(accepted), operation = uuid(), result = await pair.second.rollback(ticket, operation, moved.operation, restore, policy());
  expect(result.snapshot.protocol).toBe('legacy'); expect(result.snapshot.revision).toBe(3); expect(result.archive.source.checkpoint).toEqual(accepted.checkpoint); expect(await model(result.archive.source.checkpoint, pair)).toEqual(fresh.editor.getJSON()); expect(await model(result.snapshot.checkpoint, pair)).toEqual(restore === 'source-branch' ? pair.editor.getJSON() : await model(pair.checkpoint, pair));
  for (const [epoch, protocol] of [[pair.initial.epoch, 'legacy'], [accepted.epoch, 'retained']] as const) await expect(pair.room.write({ epoch, protocol, update: pair.checkpoint.update })).rejects.toMatchObject({ code: 'stale-epoch' });
  const retained = new CoordinatedRetainedRoom(pair.b, key, pair.schema, version), getter = vi.fn(() => accepted.checkpoint.update); await expect(retained.write({ epoch: accepted.epoch, get update() { return getter(); } })).rejects.toMatchObject({ code: 'stale-epoch' }); expect(getter).not.toHaveBeenCalled();
  expect(await pair.handoff.rollback(ticket, operation, moved.operation, restore, policy())).toMatchObject({ replayed: true, current: true });
});

it('can undo a cross-format rollback without discarding newer legacy edits', async () => {
  const pair = await fixture(), moved = await migrate(pair), fresh = await open(moved.result.snapshot.checkpoint, pair), accepted = await pair.room.write({ epoch: moved.result.snapshot.epoch, protocol: 'retained', update: type(fresh, 'NEW') }), ticket = await pair.room.freeze(accepted);
  const rolled = await pair.handoff.rollback(ticket, uuid(), moved.operation, 'frozen-source', policy()), old = await open(rolled.snapshot.checkpoint, pair, 'Old-peer'), oldAccepted = await pair.room.write({ epoch: rolled.snapshot.epoch, protocol: 'legacy', update: type(old, 'LATER') }), nextTicket = await pair.room.freeze(oldAccepted);
  const undone = await pair.handoff.rollback(nextTicket, uuid(), rolled.archive.id, 'frozen-source', policy()); expect(undone.snapshot.protocol).toBe('retained'); expect(await model(undone.snapshot.checkpoint, pair)).toEqual(fresh.editor.getJSON()); expect(await model(undone.archive.source.checkpoint, pair)).toEqual(old.editor.getJSON());
});

it('fences branch changes after rollback validation and preserves the frozen current room on refusal', async () => {
  const pair = await fixture(), moved = await migrate(pair), ticket = await pair.room.freeze(moved.result.snapshot), held = gate(pair.a), operation = uuid(), service = new CrossFormatRoomHandoff(held.repository, key, pair.schema, version), pending = service.rollback(ticket, operation, moved.operation, 'source-branch', policy());
  await held.ready; await pair.second.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, update: type(pair, 'LATE') }); const before = await pair.b.readDocument(key); held.release(); await expect(pending).rejects.toMatchObject({ code: 'revision-conflict' }); expect(await pair.a.readDocument(key)).toEqual(before); expect(await pair.a.readCrossArchive(key, operation)).toBeUndefined();
});

it('replays a lost acknowledgement after restart without rotating twice or overwriting later retained edits', async () => {
  const pair = await fixture(), moved = await migrate(pair), fresh = await open(moved.result.snapshot.checkpoint, pair), accepted = await pair.room.write({ epoch: moved.result.snapshot.epoch, protocol: 'retained', update: type(fresh, 'AFTER') }), repository = new SQLiteRetainedRoomRepository(pair.path); cleanup.push(() => repository.close());
  const restarted = new CrossFormatRoomHandoff(repository, key, pair.schema, version), replay = await restarted.migrateLegacy(moved.ticket, moved.operation, options(), policy()); expect(replay).toMatchObject({ replayed: true, current: true }); expect(replay.snapshot).toEqual(accepted);
  const ticket = await pair.room.freeze(accepted), rolled = await pair.handoff.rollback(ticket, uuid(), moved.operation, 'frozen-source', policy()), historical = await restarted.migrateLegacy(moved.ticket, moved.operation, options(), policy()); expect(historical).toMatchObject({ replayed: true, current: false }); expect(historical.snapshot).toEqual(rolled.snapshot);
});

it.each(['ticket', 'receipt', 'kind'] as const)('rejects operation UUID reuse with a different %s', async kind => {
  const pair = await fixture(), moved = await migrate(pair), before = await pair.room.snapshot(); const pending = kind === 'kind' ? pair.handoff.rollback(moved.ticket, moved.operation, uuid(), 'frozen-source', policy()) : pair.handoff.migrateLegacy(kind === 'ticket' ? { ...moved.ticket, id: uuid() } : moved.ticket, moved.operation, options(), kind === 'receipt' ? { ...policy(), externalReceipt: 'other' } : policy());
  await expect(pending).rejects.toMatchObject({ code: 'invalid-ticket' }); expect(await pair.room.snapshot()).toEqual(before);
});

it('does not allow operation UUID reuse between retained and cross-format archive APIs', async () => {
  const pair = await fixture(), moved = await migrate(pair), retainedRoom = new CoordinatedRetainedRoom(pair.a, key, pair.schema, version), retainedHandoff = new RetainedRoomHandoff(pair.a, key, pair.schema, version), ticket = await retainedRoom.freeze(await retainedRoom.snapshot());
  await expect(retainedHandoff.migrate(ticket, moved.operation, options(), policy())).rejects.toMatchObject({ code: 'invalid-ticket' });
  const retainedMove = await retainedHandoff.migrate(ticket, uuid(), options(), policy()), nextTicket = await pair.room.freeze(await pair.room.snapshot()), before = await pair.a.readDocument(key);
  await expect(pair.handoff.migrateLegacy(nextTicket, retainedMove.archive.id, options(), policy())).rejects.toMatchObject({ code: 'invalid-ticket' }); expect(await pair.a.readDocument(key)).toEqual(before);
  await expect(pair.handoff.rollback(nextTicket, uuid(), moved.operation, 'frozen-source', policy())).rejects.toMatchObject({ code: 'invalid-ticket' });
});

it.each(['source_wire', 'destination_wire', 'branch_wire'] as const)('refuses corrupt archived %s before changing any authoritative or branch bytes', async field => {
  const pair = await fixture(), moved = await migrate(pair); if (field === 'branch_wire') await pair.handoff.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, update: type(pair, 'X') });
  const db = new DatabaseSync(pair.path); cleanup.push(() => db.close()); db.prepare(`UPDATE fountain_cross_format_archives_v1 SET ${field} = ? WHERE room_key = ? AND archive_id = ?`).run(new Uint8Array([255]), key, moved.operation);
  const before = await pair.a.readCrossArchive(key, moved.operation), current = await pair.room.snapshot(), getter = vi.fn(() => type(pair, 'Y'));
  await expect(pair.handoff.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, get update() { return getter(); } })).rejects.toThrow(); expect(getter).not.toHaveBeenCalled(); expect(await pair.b.readCrossArchive(key, moved.operation)).toEqual(before); expect(await pair.room.snapshot()).toEqual(current);
});

it('owns ticket, options and policy before the first storage await', async () => {
  const pair = await fixture(), ticket = { ...await pair.room.freeze(pair.initial) }, held = gate(pair.a, 'readCrossArchive'), service = new CrossFormatRoomHandoff(held.repository, key, pair.schema, version), settings = { ...options(), migrators: [] as any[] }, host = { ...policy() }, pending = service.migrateLegacy(ticket, uuid(), settings, host);
  await held.ready; ticket.revision = 99; settings.migrators.push({ name: 'bad' }); host.externalReceipt = 'changed'; held.release(); const result = await pending; expect(result.archive.source.revision).toBe(0); expect(result.archive.policy.externalReceipt).toBe(policy().externalReceipt);
});

it('recovers a persistent legacy freeze without unfreezing, rejects duplicate initialization, and can abort explicitly', async () => {
  const pair = await fixture(), ticket = await pair.room.freeze(pair.initial), repository = new SQLiteRetainedRoomRepository(pair.path); cleanup.push(() => repository.close());
  const restarted = new CoordinatedDocumentRoom(repository, key, pair.schema, version); expect(await restarted.recoverFrozen(pair.initial)).toEqual(ticket); expect((await restarted.snapshot()).phase).toBe('frozen');
  await expect(restarted.initialize(pair.checkpoint)).rejects.toMatchObject({ code: 'revision-conflict' }); expect(await restarted.abort(ticket)).toEqual(pair.initial); await expect(pair.room.abort(ticket)).rejects.toMatchObject({ code: 'invalid-ticket' });
});

it('retains late retained-format edits after rollback and restores that branch while archiving newer legacy edits', async () => {
  const pair = await fixture(), moved = await migrate(pair), fresh = await open(moved.result.snapshot.checkpoint, pair), accepted = await pair.room.write({ epoch: moved.result.snapshot.epoch, protocol: 'retained', update: type(fresh, 'NEW') }), ticket = await pair.room.freeze(accepted);
  const rolled = await pair.handoff.rollback(ticket, uuid(), moved.operation, 'frozen-source', policy()), branch = await pair.handoff.retainLateUpdate({ archiveId: rolled.archive.id, sourceEpoch: accepted.epoch, update: type(fresh, 'LATE-NEW') }); expect(branch.branch.manifest.format).toBe('fountain-retained-checkpoint/1');
  const old = await open(rolled.snapshot.checkpoint, pair, 'Old-peer'), oldAccepted = await pair.room.write({ epoch: rolled.snapshot.epoch, protocol: 'legacy', update: type(old, 'AFTER-ROLLBACK') }), nextTicket = await pair.room.freeze(oldAccepted), restored = await pair.second.rollback(nextTicket, uuid(), rolled.archive.id, 'source-branch', policy());
  expect(restored.snapshot.protocol).toBe('retained'); expect(await model(restored.snapshot.checkpoint, pair)).toEqual(fresh.editor.getJSON()); expect(await model(restored.archive.source.checkpoint, pair)).toEqual(old.editor.getJSON()); expect((await pair.b.readCrossArchive(key, rolled.archive.id))!.source.checkpoint).toEqual(accepted.checkpoint);
});

it('requires explicit host coordination policy before any format change', async () => {
  const pair = await fixture(), ticket = await pair.room.freeze(pair.initial), before = await pair.a.readDocument(key), operation = uuid();
  await expect(pair.handoff.migrateLegacy(ticket, operation, options(), { ...policy(), externalReceipt: '' })).rejects.toThrow('explicit'); expect(await pair.b.readDocument(key)).toEqual(before); expect(await pair.a.readCrossArchive(key, operation)).toBeUndefined();
});

it('carries actual granular widget state through migration, retained edits and cross-format rollback', async () => {
  const pair = await fixture(), widget = defineExtension({ name: 'cross-widget', nodes: { panel: { group: 'block', atom: true } } }), definition = defineStructuredAttribute({ nodeType: 'panel', attribute: 'config', root: 'object' }), structured = { definitions: [definition] }, projection = { structuredAttributes: structured }, document = new Y.Doc();
  const kit = composeExtensions([CoreExtension, MathExtension, widget, createYjsCollaborationExtension({ document, structuredAttributes: structured, user: { id: 'Widget-author', name: 'Widget author', color: '#7048e8' } })]), editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { ...content, content: [...content.content, { type: 'panel', attrs: { nodeId: 'panel-1', config: { columns: 2, compact: false } } }] } }); cleanup.push(() => { editor.destroy(); document.destroy(); });
  expect(setStructuredAttribute(editor, [5], definition, ['columns'], 7)).toBe(true);
  const room = new CoordinatedDocumentRoom(pair.a, 'widget-room', editor.state.schema, version, projection), handoff = new CrossFormatRoomHandoff(pair.b, 'widget-room', editor.state.schema, version, projection), initial = await room.initialize(await captureLegacyCheckpoint(document, editor.state.schema, version, projection)), ticket = await room.freeze(initial), moved = await handoff.migrateLegacy(ticket, uuid(), optionsWithWidget(), policy());
  function optionsWithWidget(): RetainedMigrationOptions { return { ...options(), migrators: [retainedStructuredRootMigrator(structured)] }; }
  const restored = await restoreRetainedCheckpoint(moved.snapshot.checkpoint as RetainedCheckpoint, editor.state.schema, version), nextKit = composeExtensions([CoreExtension, MathExtension, widget, createRetainedYjsCollaborationExtension({ document: restored.document, structuredAttributes: structured, user: { id: 'Retained-author', name: 'Retained author', color: '#7048e8' } })]), next = createEditor({ schema: nextKit.schema, plugins: nextKit.plugins, content: editor.getJSON() }); cleanup.push(() => { next.destroy(); restored.document.destroy(); });
  expect((next.state.doc.child(5).attrs.config as any).columns).toBe(7); expect(setStructuredAttribute(next, [5], definition, ['columns'], 9)).toBe(true); const accepted = await room.write({ epoch: moved.snapshot.epoch, protocol: 'retained', update: Y.encodeStateAsUpdate(restored.document) }), back = await handoff.rollback(await room.freeze(accepted), uuid(), moved.archive.id, 'frozen-source', policy());
  const old = await restoreLegacyCheckpoint(back.snapshot.checkpoint as LegacyCheckpoint, editor.state.schema, version, projection), archived = await restoreRetainedCheckpoint(back.archive.source.checkpoint as RetainedCheckpoint, editor.state.schema, version);
  try { expect((old.baseDocument.child(5).attrs.config as any).columns).toBe(7); expect((archived.baseDocument.child(5).attrs.config as any).columns).toBe(9); } finally { old.document.destroy(); archived.document.destroy(); }
});

it('retains exact raw legacy operations even when concurrent old-format wrapping can hide their intent', async () => {
  const pair = await fixture(), offline = await open(pair.checkpoint, pair), update = type(offline, 'OFFLINE');
  pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.cursor([0, 0], 2))); expect(toggleQuote(pair.editor)).toBe(true); await pair.room.write({ epoch: pair.initial.epoch, protocol: 'legacy', update: Y.encodeStateAsUpdate(pair.document) });
  const moved = await migrate(pair), saved = await pair.handoff.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, update }), batch = await pair.second.retiredBatch(moved.operation, saved.branchRevision);
  expect(batch.update).toEqual(update); batch.update.fill(0); expect((await pair.second.retiredBatch(moved.operation, saved.branchRevision)).update).toEqual(update);
  const isolated = new Y.Doc(); isolated.getXmlFragment('fountain'); Y.applyUpdate(isolated, batch.update);
  try { const checkpoint = await captureLegacyCheckpoint(isolated, pair.schema, version); expect(await model(checkpoint, pair)).toEqual(offline.editor.getJSON()); } finally { isolated.destroy(); }
  expect((await pair.room.snapshot()).checkpoint).toEqual(moved.result.snapshot.checkpoint);
});

it('commits neither a branch replacement nor a receipt if raw batch insertion fails', async () => {
  const pair = await fixture(), moved = await migrate(pair), before = await pair.a.readCrossArchive(key, moved.operation), db = new DatabaseSync(pair.path); cleanup.push(() => db.close());
  db.exec("CREATE TRIGGER fail_batch BEFORE INSERT ON fountain_cross_format_batches_v1 BEGIN SELECT RAISE(ABORT, 'injected raw batch failure'); END");
  const update = type(pair, 'LATE'); await expect(pair.handoff.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, update })).rejects.toThrow('injected raw batch failure'); expect(await pair.b.readCrossArchive(key, moved.operation)).toEqual(before); expect(await pair.b.readCrossBatch(key, moved.operation, 1)).toBeUndefined();
  db.exec('DROP TRIGGER fail_batch'); await pair.handoff.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, update }); expect((await pair.second.retiredBatch(moved.operation, 1)).update).toEqual(update);
});

it('detects raw batch corruption independently of the merged recovery checkpoint', async () => {
  const pair = await fixture(), moved = await migrate(pair); await pair.handoff.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, update: type(pair, 'LATE') });
  const db = new DatabaseSync(pair.path); cleanup.push(() => db.close()); db.prepare('UPDATE fountain_cross_format_batches_v1 SET wire = ? WHERE room_key = ? AND archive_id = ? AND revision = 1').run(new Uint8Array([255]), key, moved.operation);
  await expect(pair.handoff.retiredBatch(moved.operation, 1)).rejects.toThrow('checksum'); await expect(pair.handoff.retiredBatch(moved.operation, 2)).rejects.toThrow('Missing'); expect((await pair.room.snapshot()).protocol).toBe('retained');
});

it('can recover exact operations even if the independently merged branch checkpoint is corrupt', async () => {
  const pair = await fixture(), moved = await migrate(pair), update = type(pair, 'RECOVER'); await pair.handoff.retainLateUpdate({ archiveId: moved.operation, sourceEpoch: pair.initial.epoch, update });
  const db = new DatabaseSync(pair.path); cleanup.push(() => db.close()); db.prepare('UPDATE fountain_cross_format_archives_v1 SET branch_wire = ? WHERE room_key = ? AND archive_id = ?').run(new Uint8Array([255]), key, moved.operation);
  await expect(pair.handoff.retiredEpoch(pair.initial.epoch)).rejects.toThrow(); expect((await pair.second.retiredBatch(moved.operation, 1)).update).toEqual(update);
});
