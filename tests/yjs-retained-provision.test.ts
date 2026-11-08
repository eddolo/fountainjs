// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, Plugin, Selection, canUndoCollaboration, composeExtensions, createEditor, defineExtension, getCollaborationState, insertText, reconnectCollaboration, replaceCollaborationAdapter, setMark, splitBlock, toggleList, toggleQuote, undoCollaboration } from '../src';
import { defineStructuredAttribute, setStructuredAttribute } from '../src/structured-attributes';
import { createYjsCollaborationExtension } from '../src/yjs';
import { applyDocumentRoomUpdate, CoordinatedDocumentRoom, type DocumentRoomAdmission, type DocumentRoomRepository } from '../src/yjs/document-room';
import { captureLegacyCheckpoint } from '../src/yjs/legacy-checkpoint';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { prepareRetainedAdmission } from '../src/yjs/retained-admission';
import { captureRetainedCheckpoint, restoreRetainedCheckpoint } from '../src/yjs/retained-checkpoint';
import { validateRetainedRoomCheckpoint } from '../src/yjs/retained-room-store';
import { SQLiteRetainedRoomRepository } from '../examples/backends/retained-sqlite';
import { openYjsRoom } from '../src/yjs/room';

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
  const bound = await openYjsRoom({
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

it.each(['retained', 'legacy'] as const)('switches a mounted editor to a verified %s room and isolates author history', async protocol => {
  const pair = await fixture();
  await pair.room.initialize(pair.checkpoint);
  const other = seed('Other room', 'fountain', protocol === 'legacy');
  const checkpoint = protocol === 'legacy'
    ? await captureLegacyCheckpoint(other.document, pair.schema, version)
    : await captureRetainedCheckpoint(other.document, pair.schema, version);
  const target = new CoordinatedDocumentRoom(pair.second, 'other-room', pair.schema, version);
  await target.initialize(checkpoint);
  const open = async (authority: CoordinatedDocumentRoom, kind: 'retained' | 'legacy') => {
    const bound = await openYjsRoom({ expected: { key: authority.key }, schema: pair.schema, schemaVersion: version, protocols: [kind],
      open: async protocols => (await authority.openForEditing({ protocols, loadCheckpoint: () => pair.checkpoint })).admission,
      admit: offer => authority.admit(offer) });
    cleanups.push(() => bound.document.destroy());
    return bound;
  };
  const first = await open(pair.room, 'retained');
  const oldProvider = { connect: vi.fn(), disconnect: vi.fn() };
  const next = await open(target, protocol);
  const tampered = await open(target, protocol);
  const filtered = await open(target, protocol);
  let refuseRemote = false;
  const filter = defineExtension({ name: 'test-filter', plugins: [new Plugin({
    filterTransaction: transaction => !refuseRemote || transaction.getMeta('fountain$collaborationRemote') !== true,
  })] });
  const kit = composeExtensions([CoreExtension, filter, first.createExtension({ user, provider: oldProvider })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: first.baseDocument.toJSON() });
  cleanups.push(() => editor.destroy());
  editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'First-room draft: '));
  const previous = Y.encodeStateAsUpdate(first.document);
  const provider = { connect: vi.fn() };
  tampered.document.getXmlFragment(tampered.lease.room).delete(0, 1);
  expect(replaceCollaborationAdapter(editor, () => tampered.createAdapter({ user, provider }))).toBe(false);
  expect(editor.getText()).toBe('First-room draft: Canonical starter');
  expect(oldProvider.disconnect).not.toHaveBeenCalled();
  expect(provider.connect).not.toHaveBeenCalled();

  expect(replaceCollaborationAdapter(editor, () => next.createAdapter({ user, provider }))).toBe(true);
  expect(editor.getText()).toBe('Other room');
  expect(oldProvider.disconnect).toHaveBeenCalledTimes(1);
  expect(provider.connect).toHaveBeenCalledTimes(1);
  expect(canUndoCollaboration(editor)).toBe(false);
  editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Second-room edit: '));
  expect(editor.getText()).toBe('Second-room edit: Other room');
  expect(undoCollaboration(editor)).toBe(true);
  expect(editor.getText()).toBe('Other room');
  expect(Y.encodeStateAsUpdate(first.document)).toEqual(previous);
  expect(await target.snapshot()).toMatchObject({ revision: 0, checkpoint });

  editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Keep this draft: '));
  refuseRemote = true;
  expect(replaceCollaborationAdapter(editor, () => filtered.createAdapter({ user, provider }))).toBe(false);
  expect(editor.getText()).toBe('Keep this draft: Other room');
  expect(getCollaborationState(editor)).toMatchObject({ status: 'error' });
  expect(provider.connect).toHaveBeenCalledTimes(1);
});

it.each([undefined, 'research-settings'] as const)('requires the full saved structured map (%s) and reopens the merged field values', async mapName => {
  const pair = await fixture();
  const panel = defineExtension({ name: 'room-settings', nodes: { settings: { group: 'block', atom: true } } });
  const config = defineStructuredAttribute({ nodeType: 'settings', attribute: 'config', root: 'object' });
  const display = defineStructuredAttribute({ nodeType: 'settings', attribute: 'display', root: 'object' });
  const structured = { definitions: [config, display], mapName };
  const document = new Y.Doc();
  const kit = composeExtensions([CoreExtension, panel, createRetainedYjsCollaborationExtension({
    document, user, structuredAttributes: structured,
  })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: {
    type: 'doc', content: [
      { type: 'settings', attrs: { nodeId: 'panel-1', config: { columns: 2, compact: false }, display: { theme: 'light' } } },
      { type: 'paragraph', content: [{ type: 'text', text: 'Room notes' }] },
    ],
  } });
  cleanups.push(() => { editor.destroy(); document.destroy(); });
  const schema = editor.state.schema;
  const authority = new CoordinatedDocumentRoom(pair.first, key, schema, version, { structuredAttributes: structured });
  const checkpoint = await captureRetainedCheckpoint(document, schema, version);
  const initial = await authority.initialize(checkpoint);
  const opened = await authority.openForEditing({ protocols: ['retained'], loadCheckpoint: () => checkpoint });
  const restarted = new CoordinatedDocumentRoom(pair.second, key, schema, version);
  await expect(restarted.openForEditing({ protocols: ['retained'], loadCheckpoint: () => checkpoint }))
    .rejects.toThrow('requires definitions for the saved structured attribute map');
  if (mapName) {
    const changed = await restoreRetainedCheckpoint(checkpoint, schema, version);
    cleanups.push(() => changed.document.destroy());
    const metadata = changed.document.getMap('fountain:document');
    expect(metadata.get('structuredMap')).toBe(mapName);
    metadata.delete('structuredMap');
    await expect(authority.write({ epoch: initial.epoch, protocol: 'retained', update: Y.encodeStateAsUpdate(changed.document) }))
      .rejects.toMatchObject({ code: 'invalid-update' });
    expect(await authority.snapshot()).toEqual(initial);
  }
  const admit = vi.fn((offer: DocumentRoomAdmission) => authority.admit(offer));
  const open = async (structuredAttributes?: { definitions: typeof structured.definitions; mapName?: string }) => {
    const bound = await openYjsRoom({ expected: { key }, schema, schemaVersion: version, structuredAttributes,
      open: async protocols => (await authority.openForEditing({ protocols, loadCheckpoint: () => checkpoint })).admission,
      admit,
    });
    cleanups.push(() => bound.document.destroy());
    return bound;
  };
  await expect(open()).rejects.toThrow('requires definitions for the saved structured attribute map');
  await expect(open({ definitions: [config], mapName: 'wrong-map' })).rejects.toThrow(/requires .*structured attribute map/);
  expect(admit).not.toHaveBeenCalled();
  const selectedMap = mapName ?? 'fountain:structured-attributes';
  expect(opened.admission).toHaveProperty('structuredMap', selectedMap);
  const { structuredMap, ...incompleteOffer } = opened.admission;
  expect(structuredMap).toBe(selectedMap);
  await expect(authority.admit(incompleteOffer)).rejects.toMatchObject({ code: 'invalid-ticket' });
  await expect(authority.admit({ ...opened.admission, structuredMap: 'wrong-map' })).rejects.toMatchObject({ code: 'invalid-ticket' });
  await expect(openYjsRoom({ expected: { key }, schema, schemaVersion: version,
    open: async () => incompleteOffer, admit: async () => opened.snapshot,
  })).rejects.toThrow('requires definitions for the saved structured attribute map');
  await expect(open({ definitions: [config], mapName })).rejects.toThrow('do not cover the saved room map');
  const wrongAttribute = defineStructuredAttribute({ nodeType: 'settings', attribute: 'other', root: 'object' });
  await expect(open({ definitions: [config, wrongAttribute], mapName })).rejects.toThrow(/Invalid structured attribute settings\.other/);
  expect(await authority.snapshot()).toEqual(initial);

  const mount = async () => {
    const bound = await open(structured);
    expect(bound.lease.structuredMap).toBe(selectedMap);
    const localKit = composeExtensions([CoreExtension, panel, bound.createExtension({ user })]);
    const localEditor = createEditor({ schema: localKit.schema, plugins: localKit.plugins, content: bound.baseDocument.toJSON() });
    cleanups.push(() => localEditor.destroy());
    return { ...bound, editor: localEditor };
  };
  const left = await mount(), right = await mount();
  expect(setStructuredAttribute(left.editor, [0], config, ['columns'], 4)).toBe(true);
  expect(setStructuredAttribute(right.editor, [0], config, ['compact'], true)).toBe(true);
  const vector = Y.encodeStateVectorFromUpdate(checkpoint.update);
  for (const author of [left, right]) {
    await authority.write({ epoch: author.lease.epoch, protocol: 'retained', update: Y.encodeStateAsUpdate(author.document, vector) });
  }
  const saved = await authority.snapshot();
  const malformed = await restoreRetainedCheckpoint(saved.checkpoint as typeof checkpoint, schema, version);
  cleanups.push(() => malformed.document.destroy());
  malformed.document.gc = false;
  const malformedMap = malformed.document.getMap(mapName ?? 'fountain:structured-attributes');
  const configKey = 'v1:["settings","panel-1","config"]';
  malformedMap.set(configKey, 'not an object');
  const malformedUpdate = Y.encodeStateAsUpdate(malformed.document, Y.encodeStateVectorFromUpdate(saved.checkpoint.update));
  await expect(authority.write({ epoch: saved.epoch, protocol: 'retained', update: malformedUpdate }))
    .rejects.toMatchObject({ code: 'invalid-update' });
  expect(await authority.snapshot()).toEqual(saved);
  malformedMap.delete(configKey);
  const missingUpdate = Y.encodeStateAsUpdate(malformed.document, Y.encodeStateVectorFromUpdate(saved.checkpoint.update));
  await expect(authority.write({ epoch: saved.epoch, protocol: 'retained', update: missingUpdate }))
    .rejects.toMatchObject({ code: 'invalid-update' });
  expect(await authority.snapshot()).toEqual(saved);
  const badCheckpoint = await captureRetainedCheckpoint(malformed.document, schema, version);
  const freshKey = 'malformed-settings';
  const fresh = new CoordinatedDocumentRoom(pair.first, freshKey, schema, version, { structuredAttributes: structured });
  await expect(fresh.provisionRetained({ loadCheckpoint: () => badCheckpoint })).rejects.toThrow('do not cover the saved room map');
  expect(await pair.first.readDocument(freshKey)).toBeUndefined();
  const reopened = await mount();
  expect(reopened.lease.revision).toBe(2);
  const attrs = { nodeId: 'panel-1', config: { columns: 4, compact: true }, display: { theme: 'light' } };
  expect(reopened.baseDocument.child(0).attrs).toEqual(attrs);
  expect(reopened.editor.state.doc.child(0).attrs).toEqual(attrs);
  expect(await authority.snapshot()).toEqual(saved);

  const partial = await restoreRetainedCheckpoint(saved.checkpoint as typeof checkpoint, schema, version);
  const partialKit = composeExtensions([CoreExtension, panel, createRetainedYjsCollaborationExtension({
    document: partial.document, user, structuredAttributes: { definitions: [config], mapName },
  })]);
  const partialEditor = createEditor({ schema: partialKit.schema, plugins: partialKit.plugins, content: partial.baseDocument.toJSON() });
  cleanups.push(() => { partialEditor.destroy(); partial.document.destroy(); });
  partialEditor.dispatch(partialEditor.createTransaction().replaceNode([0], []));
  await authority.write({ epoch: saved.epoch, protocol: 'retained', update: Y.encodeStateAsUpdate(partial.document,
    Y.encodeStateVectorFromUpdate(saved.checkpoint.update)) });
  const afterDeletion = await open(structured);
  expect(afterDeletion.document.gc).toBe(true);
  expect(afterDeletion.baseDocument.textContent).toBe('Room notes');
  const retired = afterDeletion.document.getMap(mapName ?? 'fountain:structured-attributes');
  expect(retired.toJSON()).toEqual({ 'v1:["settings","panel-1","display"]': { theme: 'light' } });

  const reconnect = await restoreRetainedCheckpoint(saved.checkpoint as typeof checkpoint, schema, version);
  cleanups.push(() => reconnect.document.destroy());
  const latest = await authority.snapshot();
  const candidate = await prepareRetainedAdmission(reconnect.document, latest.checkpoint as typeof checkpoint, schema, version, 'fountain');
  expect(candidate.document.textContent).toBe('Room notes');
  candidate.install('reconnect');
  expect(reconnect.document.gc).toBe(true);
});

it.each([
  ['retained', 'replaced'], ['retained', 'removed'], ['retained', 'removed by the provider listener'],
  ['legacy', 'replaced'], ['legacy', 'removed'], ['legacy', 'removed by the provider listener'],
] as const)('refuses a %s root %s before starting the first provider', async (protocol, change) => {
  const pair = await fixture();
  if (protocol === 'legacy') {
    const legacy = seed('Existing XML document', 'fountain', true);
    await pair.room.initialize(await captureLegacyCheckpoint(legacy.document, pair.schema, version));
  }
  const bound = await openYjsRoom({
    expected: { key }, schema: pair.schema, schemaVersion: version, protocols: [protocol],
    open: async protocols => (await pair.room.openForEditing({ protocols, loadCheckpoint: () => pair.checkpoint })).admission,
    admit: offer => pair.peer.admit(offer),
  });
  cleanups.push(() => bound.document.destroy());
  const connect = vi.fn();
  const fragment = bound.fragment ?? bound.document.getXmlFragment(bound.lease.room);
  let received: Uint8Array | undefined;
  const changeRoot = () => {
    bound.document.transact(() => {
      const clone = change === 'replaced' ? (fragment.get(0) as Y.XmlElement).clone() : undefined;
      fragment.delete(0, 1);
      if (clone) fragment.insert(0, [clone]);
    }, 'late-provider');
    received = Y.encodeStateAsUpdate(bound.document);
  };
  const changeOnListen = change === 'removed by the provider listener';
  const provider = changeOnListen ? { connect, on: changeRoot } : { connect };
  const kit = composeExtensions([CoreExtension, bound.createExtension({ user, provider })]);
  if (!changeOnListen) changeRoot();
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: bound.baseDocument.toJSON() });
  cleanups.push(() => editor.destroy());
  expect(getCollaborationState(editor)).toMatchObject({ status: 'error', error: { recoverable: true, message: expect.stringContaining('admitted room root') } });
  expect(connect).not.toHaveBeenCalled();
  expect(received).toBeDefined();
  expect(Y.encodeStateAsUpdate(bound.document)).toEqual(received);
});

it.each(['retained', 'legacy', 'nested legacy'] as const)('preserves the editor draft when an admitted %s root disappears', async mode => {
  const pair = await fixture();
  const protocol = mode === 'retained' ? 'retained' : 'legacy';
  if (mode === 'legacy') {
    const legacy = seed('Existing XML document', 'fountain', true);
    await pair.room.initialize(await captureLegacyCheckpoint(legacy.document, pair.schema, version));
  } else if (mode === 'nested legacy') {
    const document = new Y.Doc(), fragment = new Y.XmlFragment();
    document.getMap('folder').set('page', fragment);
    const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, fragment, user })]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: pair.editor.getJSON() });
    cleanups.push(() => { editor.destroy(); document.destroy(); });
    await pair.room.initialize(await captureLegacyCheckpoint(document, pair.schema, version, {}, 'fountain', fragment));
  }
  const bound = await openYjsRoom({
    expected: { key }, schema: pair.schema, schemaVersion: version, protocols: [protocol],
    open: async protocols => (await pair.room.openForEditing({ protocols, loadCheckpoint: () => pair.checkpoint })).admission,
    admit: offer => pair.peer.admit(offer),
  });
  cleanups.push(() => bound.document.destroy());
  const connect = vi.fn();
  const kit = composeExtensions([CoreExtension, bound.createExtension({ user, provider: { connect } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: bound.baseDocument.toJSON() });
  cleanups.push(() => editor.destroy());
  expect(getCollaborationState(editor)?.status).toBe('connected');
  editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Draft: '));
  expect(canUndoCollaboration(editor)).toBe(true);
  bound.document.transact(() => {
    if (mode === 'nested legacy') bound.document.getMap('folder').delete('page');
    else (bound.fragment ?? bound.document.getXmlFragment(bound.lease.room)).delete(0, 1);
  }, 'late-provider');
  const received = Y.encodeStateAsUpdate(bound.document);
  expect(getCollaborationState(editor)).toMatchObject({ status: 'error', error: { recoverable: true, message: expect.stringContaining('admitted room root') } });
  expect(canUndoCollaboration(editor)).toBe(false);
  editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Local '));
  expect(editor.state.doc.textContent).toBe('Local Draft: ' + bound.baseDocument.textContent);
  expect(Y.encodeStateAsUpdate(bound.document)).toEqual(received);
  expect(reconnectCollaboration(editor)).toBe(false);
  expect(getCollaborationState(editor)?.status).toBe('error');
  expect(connect).toHaveBeenCalledTimes(1);
  expect(Y.encodeStateAsUpdate(bound.document)).toEqual(received);
});

it.each(['quote', 'bullet', 'ordered', 'task', 'mark', 'split'] as const)(
  'retains concurrent offline typing after a fresh room chooses retained storage (%s)', async change => {
    const pair = await fixture();
    const starter = seed('Alpha');
    const initial = await captureRetainedCheckpoint(starter.document, starter.schema, version);
    const open = async () => {
      const bound = await openYjsRoom({
        expected: { key }, schema: pair.schema, schemaVersion: version,
        open: async protocols => {
          expect(protocols).toEqual(['retained']);
          return (await pair.room.openForEditing({ protocols, loadCheckpoint: () => initial })).admission;
        },
        admit: offer => pair.peer.admit(offer),
      });
      cleanups.push(() => bound.document.destroy());
      expect(bound.lease.protocol).toBe('retained');
      return bound;
    };
    const author = async () => {
      const bound = await open();
      const kit = composeExtensions([CoreExtension, bound.createExtension({ user })]);
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
  const bound = await openYjsRoom({
    expected: saved, schema: pair.schema, schemaVersion: version, protocols: ['legacy', 'retained'],
    open: async protocols => (await pair.room.openForEditing({ protocols, loadCheckpoint })).admission,
    admit: offer => pair.peer.admit(offer),
  });
  cleanups.push(() => bound.document.destroy());
  expect(loadCheckpoint).not.toHaveBeenCalled();
  expect(bound.lease).toMatchObject({ key, epoch: saved.epoch, protocol: 'legacy', room: 'Original / α' });
  expect(bound.fragment).toBe(bound.document.getMap('folder').get('page'));
  expect(bound.baseDocument.toJSON()).toEqual(editor.getJSON());
  const boundKit = composeExtensions([CoreExtension, bound.createExtension({ user })]);
  const boundEditor = createEditor({ schema: boundKit.schema, plugins: boundKit.plugins, content: bound.baseDocument.toJSON() });
  cleanups.push(() => boundEditor.destroy());
  boundEditor.dispatch(boundEditor.createTransaction().insertText([0, 0], 0, 'Nested: '));
  const updated = await pair.room.write({ epoch: bound.lease.epoch, protocol: bound.lease.protocol, update: Y.encodeStateAsUpdate(bound.document) });
  expect(updated.revision).toBe(1);
});

it('rejects a legacy offer to a retained-only client before admitting the room', async () => {
  const pair = await fixture();
  const legacy = seed('Existing XML document', 'fountain', true);
  const saved = await pair.room.initialize(await captureLegacyCheckpoint(legacy.document, pair.schema, version));
  const opened = await pair.room.openForEditing({ protocols: ['legacy', 'retained'], loadCheckpoint: () => pair.checkpoint });
  const requested: Array<'retained' | 'legacy'> = ['retained'];
  const admit = vi.fn(offer => pair.peer.admit(offer));
  await expect(openYjsRoom({
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
  await expect(openYjsRoom({
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
  await expect(openYjsRoom({
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
  const result = openYjsRoom({
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
