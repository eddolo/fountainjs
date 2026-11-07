// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, composeExtensions, createEditor } from '../src';
import { createYjsCollaborationExtension } from '../src/yjs';
import { CoordinatedDocumentRoom, type DocumentRoomRepository } from '../src/yjs/document-room';
import { captureLegacyCheckpoint } from '../src/yjs/legacy-checkpoint';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { captureRetainedCheckpoint } from '../src/yjs/retained-checkpoint';
import { SQLiteRetainedRoomRepository } from '../examples/backends/retained-sqlite';

const key = 'project:first-document';
const version = 'schema-1';
const user = { id: 'server', name: 'Server seed', color: '#7048e8' };
const cleanups: Array<() => void> = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(ready => { resolve = ready; });
  return { promise, resolve };
}

function seed(text = 'Canonical starter', fragmentName = 'fountain', legacy = false) {
  const document = new Y.Doc();
  const factory = legacy ? createYjsCollaborationExtension : createRetainedYjsCollaborationExtension;
  const kit = composeExtensions([CoreExtension, factory({ document, fragmentName, user })]);
  const editor = createEditor({
    schema: kit.schema, plugins: kit.plugins,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  });
  cleanups.push(() => { editor.destroy(); document.destroy(); });
  return { document, editor, schema: editor.state.schema };
}

async function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'fountain-provision-'));
  cleanups.push(() => {
    if (dirname(resolve(folder)) !== resolve(tmpdir()) || !basename(folder).startsWith('fountain-provision-')) throw new Error('Unsafe cleanup path.');
    rmSync(folder, { recursive: true, force: true });
  });
  const path = join(folder, 'rooms.sqlite');
  const first = new SQLiteRetainedRoomRepository(path);
  cleanups.push(() => first.close());
  const second = new SQLiteRetainedRoomRepository(path);
  cleanups.push(() => second.close());
  const starter = seed();
  const checkpoint = await captureRetainedCheckpoint(starter.document, starter.schema, version);
  const room = new CoordinatedDocumentRoom(first, key, starter.schema, version);
  const peer = new CoordinatedDocumentRoom(second, key, starter.schema, version);
  return { ...starter, checkpoint, first, second, room, peer };
}

it('returns one durable identity to simultaneous first joins through separate database connections', async () => {
  const pair = await fixture();
  const contender = seed('Another valid candidate');
  const alternate = await captureRetainedCheckpoint(contender.document, contender.schema, version);
  const barrier = deferred<void>();
  let loads = 0;
  const load = async (value: typeof alternate) => {
    if (++loads === 2) barrier.resolve();
    await barrier.promise;
    return value;
  };
  const [left, right] = await Promise.all([
    pair.room.provisionRetained({ loadCheckpoint: () => load(pair.checkpoint) }),
    pair.peer.provisionRetained({ loadCheckpoint: () => load(alternate) }),
  ]);
  expect(loads).toBe(2);
  expect(left).toEqual(right);
  expect(left).toMatchObject({ key, revision: 0, phase: 'active', protocol: 'retained' });
  expect([pair.checkpoint.manifest.checkpointSha256, alternate.manifest.checkpointSha256]).toContain(left.checkpoint.manifest.checkpointSha256);
  expect(await pair.peer.snapshot()).toEqual(left);
  const identity = (await pair.first.read(key))!.checkpoint.manifest.roomId;
  expect(await pair.peer.admit({ key, epoch: left.epoch, revision: 0, protocol: 'retained', room: 'fountain', identity })).toEqual(left);
  expect(contender.editor.state.doc.textContent).toBe('Another valid candidate');
});

it('returns the latest durable revision without evaluating the initializer again', async () => {
  const pair = await fixture();
  const loadCheckpoint = vi.fn(() => pair.checkpoint);
  const created = await pair.room.provisionRetained({ loadCheckpoint });
  pair.editor.dispatch(pair.editor.createTransaction().insertText([0, 0], 17, ' edited'));
  const saved = await pair.room.write({ epoch: created.epoch, protocol: 'retained', update: Y.encodeStateAsUpdate(pair.document) });
  expect(await pair.peer.provisionRetained({ loadCheckpoint })).toEqual(saved);
  expect(saved.revision).toBe(1);
  expect(loadCheckpoint).toHaveBeenCalledTimes(1);
});

it('recovers the existing room after the insert committed but its acknowledgement was lost', async () => {
  const pair = await fixture();
  const missingAck = new Error('Simulated lost acknowledgement');
  const repository: DocumentRoomRepository = {
    readDocument: pair.first.readDocument.bind(pair.first),
    compareDocument: pair.first.compareDocument.bind(pair.first),
    async createDocument(record) {
      expect(await pair.first.createDocument(record)).toBe(true);
      throw missingAck;
    },
  };
  const authority = new CoordinatedDocumentRoom(repository, key, pair.schema, version);
  const loadCheckpoint = vi.fn(() => pair.checkpoint);
  await expect(authority.provisionRetained({ loadCheckpoint })).rejects.toBe(missingAck);
  const persisted = await pair.peer.snapshot();
  expect(await pair.peer.provisionRetained({ loadCheckpoint })).toEqual(persisted);
  expect(loadCheckpoint).toHaveBeenCalledTimes(1);
});

it('cancels a pending initializer before an insert and permits a later retry', async () => {
  const pair = await fixture();
  const controller = new AbortController();
  const waiting = deferred<typeof pair.checkpoint>();
  const started = deferred<void>();
  const pending = pair.room.provisionRetained({
    signal: controller.signal,
    loadCheckpoint(signal) {
      expect(signal).toBe(controller.signal);
      started.resolve();
      return waiting.promise;
    },
  });
  await started.promise;
  controller.abort();
  waiting.resolve(pair.checkpoint);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(await pair.first.readDocument(key)).toBeUndefined();
  expect(await pair.peer.provisionRetained({ loadCheckpoint: () => pair.checkpoint })).toMatchObject({ revision: 0 });
});

it('preserves an existing frozen room and refuses to rerun its initializer', async () => {
  const pair = await fixture();
  const initial = await pair.room.initialize(pair.checkpoint);
  await pair.room.freeze(initial);
  const before = await pair.room.snapshot();
  const loadCheckpoint = vi.fn(() => pair.checkpoint);
  await expect(pair.peer.provisionRetained({ loadCheckpoint })).rejects.toMatchObject({ code: 'frozen' });
  expect(loadCheckpoint).not.toHaveBeenCalled();
  expect(await pair.room.snapshot()).toEqual(before);
});

it('refuses an existing legacy room and preserves its original checkpoint', async () => {
  const pair = await fixture();
  const source = seed('Existing XML document', 'fountain', true);
  const legacy = await captureLegacyCheckpoint(source.document, source.schema, version);
  const initial = await pair.room.initialize(legacy);
  const loadCheckpoint = vi.fn(() => pair.checkpoint);
  await expect(pair.peer.provisionRetained({ loadCheckpoint })).rejects.toMatchObject({ code: 'stale-epoch' });
  expect(loadCheckpoint).not.toHaveBeenCalled();
  expect(await pair.room.snapshot()).toEqual(initial);
});

it('refuses initial and existing checkpoints in a different namespace', async () => {
  const pair = await fixture();
  const named = seed('Named document', 'separate-room');
  const checkpoint = await captureRetainedCheckpoint(named.document, named.schema, version, 'separate-room');
  await expect(pair.room.provisionRetained({ loadCheckpoint: () => checkpoint })).rejects.toMatchObject({ code: 'revision-conflict' });
  expect(await pair.first.readDocument(key)).toBeUndefined();
  const initial = await pair.room.provisionRetained({ room: 'separate-room', loadCheckpoint: () => checkpoint });
  const loadCheckpoint = vi.fn(() => pair.checkpoint);
  await expect(pair.peer.provisionRetained({ loadCheckpoint })).rejects.toMatchObject({ code: 'revision-conflict' });
  expect(loadCheckpoint).not.toHaveBeenCalled();
  expect(await pair.peer.provisionRetained({ room: 'separate-room', loadCheckpoint })).toEqual(initial);
});

it('validates the initial bytes before writing a row', async () => {
  const pair = await fixture();
  const damaged = { manifest: pair.checkpoint.manifest, update: new Uint8Array([1, 2, 3]) };
  await expect(pair.room.provisionRetained({ loadCheckpoint: () => damaged })).rejects.toThrow();
  expect(await pair.second.readDocument(key)).toBeUndefined();
  expect(await pair.peer.provisionRetained({ loadCheckpoint: () => pair.checkpoint })).toMatchObject({ revision: 0 });
});

it('offers a retained default to new clients, including concurrent first opens', async () => {
  const pair = await fixture();
  const alternate = seed('Alternate first-open template');
  const other = await captureRetainedCheckpoint(alternate.document,alternate.schema,version);
  const onlyLegacy = vi.fn(() => pair.checkpoint);
  await expect(pair.room.openForEditing({protocols:['legacy'],loadCheckpoint:onlyLegacy})).rejects.toMatchObject({code:'stale-epoch'});
  expect(onlyLegacy).not.toHaveBeenCalled();
  const both = deferred<void>();
  let loads = 0;
  const load = async (checkpoint: typeof other) => {
    if (++loads === 2) both.resolve();
    await both.promise;
    return checkpoint;
  };
  const [first,second] = await Promise.all([
    pair.room.openForEditing({protocols:['legacy','retained'],loadCheckpoint:()=>load(pair.checkpoint)}),
    pair.peer.openForEditing({protocols:['retained'],loadCheckpoint:()=>load(other)}),
  ]);
  expect(first).toEqual(second);
  expect(first.admission).toMatchObject({protocol:'retained',room:'fountain',revision:0});
  expect(await pair.peer.admit(first.admission)).toEqual(first.snapshot);
  expect(loads).toBe(2);
});

it('offers a named legacy room without selecting a retained seed or rewriting bytes', async () => {
  const pair = await fixture(), name = 'Research / α';
  const source = seed('Existing named XML document',name,true);
  const checkpoint = await captureLegacyCheckpoint(source.document,source.schema,version,{},name);
  const created = await pair.room.initialize(checkpoint);
  const loadCheckpoint = vi.fn(() => pair.checkpoint);
  await expect(pair.peer.openForEditing({protocols:['retained'],loadCheckpoint})).rejects.toMatchObject({code:'stale-epoch'});
  const opened = await pair.peer.openForEditing({protocols:['retained','legacy'],loadCheckpoint});
  expect(opened.snapshot).toEqual(created);
  expect(opened.admission).toMatchObject({protocol:'legacy',room:name,identity:expect.stringMatching(/^yjs-/)});
  expect(await pair.room.admit(opened.admission)).toEqual(created);
  expect(loadCheckpoint).not.toHaveBeenCalled();
  expect((await pair.first.readDocument(key))?.checkpoint.update).toEqual(checkpoint.update);
  await pair.room.freeze(created);
  await expect(pair.peer.admit(opened.admission)).rejects.toMatchObject({code:'frozen'});
});

it('uses a concurrently installed legacy room when it wins the first-open insert', async () => {
  const pair = await fixture(), source = seed('Legacy writer won the first insert','old-notes',true);
  const legacy = await captureLegacyCheckpoint(source.document,source.schema,version,{},'old-notes');
  const started = deferred<void>(), candidate = deferred<typeof pair.checkpoint>();
  const pending = pair.room.openForEditing({protocols:['retained','legacy'],loadCheckpoint(){
    started.resolve();
    return candidate.promise;
  }});
  await started.promise;
  const winner = await pair.peer.initialize(legacy);
  candidate.resolve(pair.checkpoint);
  const result = await pending;
  expect(result.snapshot).toEqual(winner);
  expect(result.admission).toMatchObject({protocol:'legacy',room:'old-notes'});
  expect((await pair.first.readDocument(key))?.checkpoint.update).toEqual(legacy.update);
});

it('refuses an opening receipt when another authority changes the room during verification', async () => {
  const pair = await fixture(), initial = await pair.room.initialize(pair.checkpoint);
  const repository: DocumentRoomRepository = {
    readDocument: pair.first.readDocument.bind(pair.first), createDocument: pair.first.createDocument.bind(pair.first),
    compareDocument: pair.first.compareDocument.bind(pair.first),
    async readDocumentHeader(roomKey) {
      await pair.peer.freeze(initial);
      return pair.first.readDocumentHeader(roomKey);
    },
  };
  const authority = new CoordinatedDocumentRoom(repository,key,pair.schema,version);
  const loadCheckpoint = vi.fn(() => pair.checkpoint);
  await expect(authority.openForEditing({protocols:['retained'],loadCheckpoint})).rejects.toMatchObject({code:'revision-conflict'});
  expect(loadCheckpoint).not.toHaveBeenCalled();
});
