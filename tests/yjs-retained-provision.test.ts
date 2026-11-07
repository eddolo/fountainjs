// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, Selection, composeExtensions, createEditor, insertText, setMark, splitBlock, toggleList, toggleQuote } from '../src';
import { createYjsCollaborationExtension } from '../src/yjs';
import { applyDocumentRoomUpdate, CoordinatedDocumentRoom, type DocumentRoomRepository } from '../src/yjs/document-room';
import { captureLegacyCheckpoint } from '../src/yjs/legacy-checkpoint';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { captureRetainedCheckpoint, restoreRetainedCheckpoint } from '../src/yjs/retained-checkpoint';
import { validateRetainedRoomCheckpoint } from '../src/yjs/retained-room-store';
import { SQLiteRetainedRoomRepository } from '../examples/backends/retained-sqlite';
import { openBoundYjsRoom } from '../examples/backends/bound-yjs-room';

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

it('opens a newly provisioned retained room at the newer bound revision', async () => {
  const pair = await fixture();
  const bound = await openBoundYjsRoom({
    expected: { key }, schema: pair.schema, schemaVersion: version, protocols: ['legacy', 'retained'],
    open: async protocols => (await pair.room.openForEditing({ protocols, loadCheckpoint: () => pair.checkpoint })).admission,
    admit: async offer => {
      pair.editor.dispatch(pair.editor.createTransaction().insertText([0, 0], 0, 'New: '));
      await pair.peer.write({ epoch: offer.epoch, protocol: 'retained', update: Y.encodeStateAsUpdate(pair.document) });
      return pair.room.admit(offer);
    },
  });
  cleanups.push(() => bound.document.destroy());
  expect(bound.lease).toMatchObject({ key, protocol: 'retained', revision: 1, identity: pair.checkpoint.manifest.roomId });
  expect(Object.isFrozen(bound.lease)).toBe(true);
  expect(bound.baseDocument.textContent).toBe('New: Canonical starter');
  expect(bound.fragment).toBeUndefined();
});

it.each(['quote', 'bullet', 'ordered', 'task', 'mark', 'split'] as const)(
  'retains concurrent offline typing after a fresh room chooses retained storage (%s)', async change => {
    const pair = await fixture();
    const starter = seed('Alpha');
    const initial = await captureRetainedCheckpoint(starter.document, starter.schema, version);
    const open = async () => {
      const bound = await openBoundYjsRoom({
        expected: { key }, schema: pair.schema, schemaVersion: version, protocols: ['legacy', 'retained'],
        open: async protocols => (await pair.room.openForEditing({ protocols, loadCheckpoint: () => initial })).admission,
        admit: offer => pair.peer.admit(offer),
      });
      cleanups.push(() => bound.document.destroy());
      expect(bound.lease.protocol).toBe('retained');
      return bound;
    };
    const author = async () => {
      const bound = await open();
      const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({ document: bound.document, user })]);
      const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: bound.baseDocument.toJSON() });
      cleanups.push(() => editor.destroy());
      return { ...bound, editor };
    };
    const offline = await author(), online = await author();
    expect(offline.lease).toEqual(online.lease);
    offline.editor.dispatch(offline.editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(insertText(offline.editor, 'X')).toBe(true);
    const selection = change === 'mark' ? Selection.range([0, 0], 1, [0, 0], 4) : Selection.cursor([0, 0], change === 'split' ? 3 : 0);
    online.editor.dispatch(online.editor.createTransaction().setSelection(selection));
    if (change === 'mark') expect(setMark(online.editor, 'strong')).toBe(true);
    else if (change === 'split') expect(splitBlock(online.editor)).toBe(true);
    else if (change === 'quote') expect(toggleQuote(online.editor)).toBe(true);
    else expect(toggleList(online.editor, change)).toBe(true);

    const vector = Y.encodeStateVectorFromUpdate(initial.update);
    for (const writer of [online, offline]) {
      await pair.peer.write({ epoch: writer.lease.epoch, protocol: writer.lease.protocol, update: Y.encodeStateAsUpdate(writer.document, vector) });
    }
    const reopened = await open();
    expect(reopened.lease).toMatchObject({ epoch: offline.lease.epoch, identity: offline.lease.identity, revision: 2 });
    expect(reopened.baseDocument.textContent).toBe('AlXpha');
    const first = reopened.baseDocument.child(0);
    if (change === 'mark') expect(first.content.filter(node => node.marks.some(mark => mark.type.name === 'strong')).map(node => node.text).join('')).toBe('lXph');
    else if (change === 'split') expect(reopened.baseDocument.content.map(block => block.textContent)).toEqual(['AlXp', 'ha']);
    else expect(first.type.name).toBe(change === 'quote' ? 'blockquote' : `${change}_list`);
  },
);

it('returns the exact verified bytes without retaining the supplied checkpoint object', async () => {
  const pair = await fixture();
  const manifest = { ...pair.checkpoint.manifest, roots: pair.checkpoint.manifest.roots.map(root => ({ ...root })) };
  const update = pair.checkpoint.update;
  const validation = validateRetainedRoomCheckpoint({ manifest, update }, pair.schema, version);
  manifest.guid = 'changed-after-read';
  manifest.roots[0]!.name = 'changed-after-read';
  update.fill(0);
  const checked = await validation;
  expect(checked).toEqual(pair.checkpoint);
  expect(Object.isFrozen(checked.manifest.roots[0])).toBe(true);
  checked.update.fill(0);
  expect(checked.update).toEqual(pair.checkpoint.update);
});

it('checks the changed poll payload even when the room header matches', async () => {
  const pair = await fixture();
  const opened = await pair.room.openForEditing({ protocols: ['retained'], loadCheckpoint: () => pair.checkpoint });
  pair.editor.dispatch(pair.editor.createTransaction().insertText([0, 0], 0, 'Changed: '));
  const saved = await pair.peer.write({ epoch: opened.admission.epoch, protocol: 'retained', update: Y.encodeStateAsUpdate(pair.document) });
  const row = (await pair.first.readDocument(key))!;
  const update = row.checkpoint.update;
  update[0] ^= 1;
  vi.spyOn(pair.first, 'readDocument').mockResolvedValueOnce({ ...row, checkpoint: { ...row.checkpoint, update } });
  await expect(pair.room.pollRetained(opened.admission)).rejects.toThrow('Checkpoint update checksum mismatch');
  expect(await pair.room.pollRetained(opened.admission)).toEqual(saved);
});

it.each(['insertion', 'deletion'] as const)('acknowledges a replayed %s without advancing or rewriting the room', async edit => {
  const pair = await fixture();
  const initial = await pair.room.initialize(pair.checkpoint);
  const tx = pair.editor.createTransaction();
  if (edit === 'insertion') tx.insertText([0, 0], 0, 'New: ');
  else tx.replaceText([0, 0], 0, 1, '');
  pair.editor.dispatch(tx);
  const update = Y.encodeStateAsUpdate(pair.document, Y.encodeStateVectorFromUpdate(pair.checkpoint.update));
  const request = { epoch: initial.epoch, protocol: 'retained' as const, update };
  const saved = await pair.room.write(request);
  expect(saved.revision).toBe(initial.revision + 1);
  expect(saved.checkpoint.manifest.updateSha256).not.toBe(initial.checkpoint.manifest.updateSha256);
  const persisted = await pair.first.readDocument(key);
  const replay = await pair.peer.write(request);
  expect(replay).toEqual(saved);
  expect(await pair.second.readDocument(key)).toEqual(persisted);
});

it('advances the revision for a shared-state change with an identical document projection', async () => {
  const pair = await fixture();
  const initial = await pair.room.initialize(pair.checkpoint);
  pair.document.getMap('host-review').set('state', 'approved');
  const saved = await pair.room.write({ epoch: initial.epoch, protocol: 'retained', update: Y.encodeStateAsUpdate(pair.document) });
  expect(saved.checkpoint.manifest.documentSha256).toBe(initial.checkpoint.manifest.documentSha256);
  expect(saved.checkpoint.manifest.checkpointSha256).not.toBe(initial.checkpoint.manifest.checkpointSha256);
  expect(saved.revision).toBe(initial.revision + 1);
});

it.each(['insertion', 'deletion'] as const)('refuses an incomplete source even when a write supplies the missing dependency for a pending %s', async kind => {
  const pair = await fixture();
  const restored = await restoreRetainedCheckpoint(pair.checkpoint, pair.schema, version);
  cleanups.push(() => restored.document.destroy());
  const updates: Uint8Array[] = [];
  pair.document.on('update', update => updates.push(update));
  const text = [...pair.document.getMap('fountain-text:texts').values()][0] as Y.Text;
  text.insert(2, 'X');
  if (kind === 'insertion') text.insert(3, 'Y');
  else text.delete(2, 1);
  Y.applyUpdate(restored.document, updates[1]!);
  expect(kind === 'insertion' ? restored.document.store.pendingStructs : restored.document.store.pendingDs).toBeTruthy();
  const incomplete = await captureRetainedCheckpoint(restored.document, pair.schema, version);
  await expect(applyDocumentRoomUpdate(incomplete, pair.schema, version, {}, updates[0]!))
    .rejects.toMatchObject({ code: 'invalid-update' });
  const complete = await applyDocumentRoomUpdate(pair.checkpoint, pair.schema, version, {}, Y.encodeStateAsUpdate(pair.document));
  expect(complete.manifest.updateSha256).not.toBe(pair.checkpoint.manifest.updateSha256);
});

it.each(['edit', 'freeze'] as const)('fences a replay if another authority commits a concurrent %s', async change => {
  const pair = await fixture();
  const initial = await pair.room.initialize(pair.checkpoint);
  pair.editor.dispatch(pair.editor.createTransaction().insertText([0, 0], 0, 'Saved: '));
  const request = { epoch: initial.epoch, protocol: 'retained' as const, update: Y.encodeStateAsUpdate(pair.document) };
  const saved = await pair.room.write(request);
  const reached = deferred<void>(), release = deferred<void>();
  const read = pair.first.readDocumentHeader.bind(pair.first);
  vi.spyOn(pair.first, 'readDocumentHeader').mockImplementation(async roomKey => {
    reached.resolve();
    await release.promise;
    return read(roomKey);
  });
  const replay = pair.room.write(request);
  try {
    await Promise.race([reached.promise, replay.then(() => { throw new Error('Replay returned without fencing the room.'); })]);
    if (change === 'freeze') await pair.peer.freeze(saved);
    else {
      pair.editor.dispatch(pair.editor.createTransaction().insertText([0, 0], 0, 'Later: '));
      await pair.peer.write({ ...request, update: Y.encodeStateAsUpdate(pair.document) });
    }
  } finally { release.resolve(); }
  await expect(replay).rejects.toMatchObject({ code: 'revision-conflict' });
  const current = await pair.peer.snapshot();
  if (change === 'freeze') {
    expect(current.phase).toBe('frozen');
    await expect(pair.peer.write(request)).rejects.toMatchObject({ code: 'frozen' });
  } else {
    expect(current.revision).toBe(saved.revision + 1);
    expect(await pair.peer.write(request)).toEqual(current);
  }
});

it('selects the stored legacy adapter and returns the original embedded fragment', async () => {
  const pair = await fixture();
  const document = new Y.Doc();
  const fragment = new Y.XmlFragment();
  document.getMap('folder').set('page', fragment);
  const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, fragment, user })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: pair.editor.getJSON() });
  cleanups.push(() => { editor.destroy(); document.destroy(); });
  const saved = await pair.room.initialize(await captureLegacyCheckpoint(document, pair.schema, version, {}, 'Original / α', fragment));
  const loadCheckpoint = vi.fn(() => pair.checkpoint);
  const bound = await openBoundYjsRoom({
    expected: saved, schema: pair.schema, schemaVersion: version, protocols: ['legacy', 'retained'],
    open: async protocols => (await pair.room.openForEditing({ protocols, loadCheckpoint })).admission,
    admit: offer => pair.peer.admit(offer),
  });
  cleanups.push(() => bound.document.destroy());
  expect(loadCheckpoint).not.toHaveBeenCalled();
  expect(bound.lease).toMatchObject({ key, epoch: saved.epoch, protocol: 'legacy', room: 'Original / α' });
  expect(bound.fragment).toBe(bound.document.getMap('folder').get('page'));
  expect(bound.baseDocument.toJSON()).toEqual(editor.getJSON());
});

it('rejects a legacy offer to a retained-only client before admitting the room', async () => {
  const pair = await fixture();
  const legacy = seed('Existing XML document', 'fountain', true);
  const saved = await pair.room.initialize(await captureLegacyCheckpoint(legacy.document, pair.schema, version));
  const opened = await pair.room.openForEditing({ protocols: ['legacy', 'retained'], loadCheckpoint: () => pair.checkpoint });
  const requested: Array<'retained' | 'legacy'> = ['retained'];
  const admit = vi.fn(offer => pair.peer.admit(offer));
  await expect(openBoundYjsRoom({
    expected: { key }, schema: pair.schema, schemaVersion: version, protocols: requested,
    open: async protocols => {
      expect(protocols).toEqual(['retained']);
      expect(Object.isFrozen(protocols)).toBe(true);
      requested.push('legacy');
      return opened.admission;
    },
    admit,
  })).rejects.toThrow('opening offer does not match');
  expect(admit).not.toHaveBeenCalled();
  expect(await pair.room.snapshot()).toEqual(saved);
});

it.each(['epoch', 'protocol', 'key', 'phase', 'revision'] as const)('refuses a mismatched %s in the bound reply before reading checkpoint bytes', async field => {
  const pair = await fixture();
  const opened = await pair.room.openForEditing({ protocols: ['retained'], loadCheckpoint: () => pair.checkpoint });
  const readBytes = vi.fn(() => opened.snapshot.checkpoint.update);
  const reply = { ...opened.snapshot, checkpoint: { manifest: pair.checkpoint.manifest, get update() { return readBytes(); } } };
  const wrong = { epoch: crypto.randomUUID(), protocol: 'legacy', key: 'other-room', phase: 'frozen', revision: -1 };
  await expect(openBoundYjsRoom({
    expected: opened.snapshot, schema: pair.schema, schemaVersion: version, protocols: ['retained'], open: async () => opened.admission,
    admit: async () => ({ ...reply, [field]: wrong[field] }),
  })).rejects.toThrow('reply does not match');
  expect(readBytes).not.toHaveBeenCalled();
});

it.each(['legacy', 'retained'] as const)('refuses a valid but foreign %s checkpoint for the same namespace', async protocol => {
  const pair = await fixture();
  const legacy = protocol === 'legacy';
  const original = legacy ? seed('Original', 'fountain', true) : pair;
  const foreign = seed('Unrelated', 'fountain', legacy);
  const capture = (source: ReturnType<typeof seed>) => legacy
    ? captureLegacyCheckpoint(source.document, source.schema, version)
    : captureRetainedCheckpoint(source.document, source.schema, version);
  await pair.room.initialize(await capture(original));
  const opened = await pair.room.openForEditing({ protocols: [protocol], loadCheckpoint: () => pair.checkpoint });
  const checkpoint = await capture(foreign);
  await expect(openBoundYjsRoom({
    expected: opened.snapshot, schema: pair.schema, schemaVersion: version, protocols: [protocol], open: async () => opened.admission,
    admit: async () => ({ ...opened.snapshot, checkpoint }),
  })).rejects.toThrow('native identity changed');
});

it('discards a delayed admission after cancellation before reading its wire data', async () => {
  const pair = await fixture();
  const opened = await pair.room.openForEditing({ protocols: ['retained'], loadCheckpoint: () => pair.checkpoint });
  const controller = new AbortController();
  const started = deferred<void>();
  const response = deferred<typeof opened.snapshot>();
  const readBytes = vi.fn(() => opened.snapshot.checkpoint.update);
  const result = openBoundYjsRoom({
    expected: opened.snapshot, schema: pair.schema, schemaVersion: version, protocols: ['retained'], signal: controller.signal,
    open: async () => opened.admission, admit: () => { started.resolve(); return response.promise; },
  });
  await started.promise;
  controller.abort();
  response.resolve({ ...opened.snapshot, checkpoint: { manifest: pair.checkpoint.manifest, get update() { return readBytes(); } } });
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(readBytes).not.toHaveBeenCalled();
});

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
