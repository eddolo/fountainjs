// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, Selection, composeExtensions, createEditor, insertText, type Schema } from '../src';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { captureRetainedCheckpoint, restoreRetainedCheckpoint, type RetainedCheckpoint } from '../src/yjs/retained-checkpoint';
import { FencedRetainedRoom, RetainedRoomError } from '../src/yjs/retained-room-store';

const content = { type: 'doc', attrs: { title: 'Fenced recovery' }, content: [
  { type: 'paragraph', attrs: { nodeId: 'intro' }, content: [{ type: 'text', text: 'Alpha' }] },
  { type: 'image_super', attrs: { nodeId: 'figure', src: '/figure.png', alt: 'A retained image' } },
] };
const wire = (document: Y.Doc) => Y.encodeStateAsUpdate(document);
function client(document = new Y.Doc(), room = 'fountain', name = 'Ada') {
  const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({ document, fragmentName: room, captureTimeout: 0, user: { id: name, name, color: '#7048e8' } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  return { document, editor, schema: editor.state.schema, destroy() { editor.destroy(); document.destroy(); } };
}
async function fixture(roomName = 'fountain') {
  const source = client(undefined, roomName);
  source.document.getMap('host-review').set('owner', 'Grace');
  source.document.getMap('host-review').set('bytes', new Uint8Array([0, 128, 255]));
  const checkpoint = await captureRetainedCheckpoint(source.document, source.schema, 'schema-1', roomName);
  const authority = await FencedRetainedRoom.open(checkpoint, source.schema, 'schema-1');
  return { ...source, checkpoint, authority, destroy() { authority.close(); source.destroy(); } };
}
async function value(checkpoint: RetainedCheckpoint, schema: Schema) {
  const result = await restoreRetainedCheckpoint(checkpoint, schema, 'schema-1');
  try { return result.baseDocument.toJSON(); } finally { result.document.destroy(); }
}
function type(source: ReturnType<typeof client>, text: string, offset = 2) {
  source.editor.dispatch(source.editor.createTransaction().setSelection(Selection.cursor([0, 0], offset)));
  expect(insertText(source.editor, text)).toBe(true);
}
function unreadable(epoch: string) {
  const read = vi.fn((): Uint8Array => { throw new Error('Bytes must not be read'); });
  return { request: { epoch, get update() { return read(); } }, read };
}

it('owns a validated pure-Node authoritative checkpoint and exposes no live shared document', async () => {
  const pair = await fixture();
  try {
    const state = pair.authority.snapshot(), bytes = state.checkpoint.update;
    expect(typeof globalThis.document).toBe('undefined');
    expect(Object.isFrozen(state)).toBe(true); expect(state.phase).toBe('active'); expect(state.revision).toBe(0);
    expect(await value(state.checkpoint, pair.schema)).toEqual(pair.editor.getJSON());
    state.checkpoint.update.fill(0); pair.checkpoint.update.fill(0);
    expect(pair.authority.snapshot().checkpoint.update).toEqual(bytes);
    type(pair, 'X'); expect(pair.authority.snapshot()).toEqual(state);
  } finally { pair.destroy(); }
});

it('validates and commits an editor update with auxiliary state and monotonically increasing revision', async () => {
  const pair = await fixture();
  try {
    const before = pair.authority.snapshot(); type(pair, 'X'); pair.document.getMap('host-review').set('owner', 'Mina');
    const next = await pair.authority.write({ epoch: before.epoch, update: wire(pair.document) });
    expect(next.epoch).toBe(before.epoch); expect(next.revision).toBe(1);
    expect(await value(next.checkpoint, pair.schema)).toEqual(pair.editor.getJSON());
    const restored = await restoreRetainedCheckpoint(next.checkpoint, pair.schema, 'schema-1');
    try {
      expect(restored.document.getMap('host-review').get('owner')).toBe('Mina');
      expect(restored.document.getMap('host-review').get('bytes')).toEqual(new Uint8Array([0, 128, 255]));
    } finally { restored.document.destroy(); }
  } finally { pair.destroy(); }
});

it.each(['stale', 'frozen'] as const)('rejects %s writes before reading update bytes', async kind => {
  const pair = await fixture();
  try {
    const state = pair.authority.snapshot();
    if (kind === 'frozen') pair.authority.freeze(state);
    const probe = unreadable(kind === 'stale' ? 'old-epoch' : state.epoch);
    await expect(pair.authority.write(probe.request)).rejects.toMatchObject({ code: kind === 'stale' ? 'stale-epoch' : 'frozen' });
    expect(probe.read).not.toHaveBeenCalled();
    expect(pair.authority.snapshot().checkpoint.manifest.checkpointSha256).toBe(state.checkpoint.manifest.checkpointSha256);
  } finally { pair.destroy(); }
});

it.each([new Uint8Array(), new Uint8Array([255]), new Uint8Array([1, 255, 255])])('leaves authoritative state intact after malformed wire input %j', async bytes => {
  const pair = await fixture();
  try {
    const before = pair.authority.snapshot();
    await expect(pair.authority.write({ epoch: before.epoch, update: bytes })).rejects.toBeInstanceOf(RetainedRoomError);
    expect(pair.authority.snapshot()).toEqual(before);
    type(pair, 'X'); await pair.authority.write({ epoch: before.epoch, update: wire(pair.document) });
    expect(await value(pair.authority.snapshot().checkpoint, pair.schema)).toEqual(pair.editor.getJSON());
  } finally { pair.destroy(); }
});

it('rejects a different shared room identity without polluting the authoritative Yjs state', async () => {
  const pair = await fixture(), foreign = client();
  try {
    const before = pair.authority.snapshot();
    await expect(pair.authority.write({ epoch: before.epoch, update: wire(foreign.document) })).rejects.toMatchObject({ code: 'invalid-update' });
    expect(pair.authority.snapshot()).toEqual(before);
  } finally { foreign.destroy(); pair.destroy(); }
});

it.each(['insert', 'delete'] as const)('rejects an out-of-order %s update until its dependencies are supplied', async operation => {
  const pair = await fixture();
  try {
    const before = pair.authority.snapshot(), updates: Uint8Array[] = [];
    pair.document.on('update', update => updates.push(update));
    const text = [...pair.document.getMap('fountain-text:texts').values()][0] as Y.Text;
    text.insert(2, 'X');
    if (operation === 'delete') text.delete(2, 1); else text.insert(3, 'Y');
    expect(updates).toHaveLength(2);
    await expect(pair.authority.write({ epoch: before.epoch, update: updates[1]! })).rejects.toMatchObject({ code: 'invalid-update' });
    expect(pair.authority.snapshot()).toEqual(before);
    const accepted = await pair.authority.write({ epoch: before.epoch, update: wire(pair.document) });
    expect(await value(accepted.checkpoint, pair.schema)).toEqual(pair.editor.getJSON());
  } finally { pair.destroy(); }
});

it('refuses an initial checkpoint with unresolved dependencies', async () => {
  const pair = await fixture(), restored = await restoreRetainedCheckpoint(pair.checkpoint, pair.schema, 'schema-1');
  try {
    const updates: Uint8Array[] = []; pair.document.on('update', update => updates.push(update));
    const text = [...pair.document.getMap('fountain-text:texts').values()][0] as Y.Text;
    text.insert(2, 'X'); text.insert(3, 'Y'); Y.applyUpdate(restored.document, updates[1]!);
    const incomplete = await captureRetainedCheckpoint(restored.document, pair.schema, 'schema-1');
    await expect(FencedRetainedRoom.open(incomplete, pair.schema, 'schema-1')).rejects.toMatchObject({ code: 'invalid-update' });
  } finally { restored.document.destroy(); pair.destroy(); }
});

it('copies incoming update bytes and epoch before asynchronous validation', async () => {
  const pair = await fixture();
  try {
    type(pair, 'X'); const input = { epoch: pair.authority.snapshot().epoch, update: wire(pair.document) };
    const pending = pair.authority.write(input); input.update.fill(0); input.epoch = 'changed-by-caller';
    await pending;
    expect(await value(pair.authority.snapshot().checkpoint, pair.schema)).toEqual(pair.editor.getJSON());
  } finally { pair.destroy(); }
});

it('refuses stale freeze revisions and a second freeze without changing state', async () => {
  const pair = await fixture();
  try {
    const before = pair.authority.snapshot(); type(pair, 'X');
    const current = await pair.authority.write({ epoch: before.epoch, update: wire(pair.document) });
    expect(() => pair.authority.freeze(before)).toThrow(expect.objectContaining({ code: 'revision-conflict' }));
    expect(() => pair.authority.freeze({ ...current, epoch: 'old' })).toThrow(expect.objectContaining({ code: 'stale-epoch' }));
    const ticket = pair.authority.freeze(current);
    expect(ticket.checkpointSha256).toBe(current.checkpoint.manifest.checkpointSha256);
    expect(() => pair.authority.freeze(current)).toThrow(expect.objectContaining({ code: 'frozen' }));
  } finally { pair.destroy(); }
});

it.each(['remain-frozen', 'abort'] as const)('invalidates a write started before freeze even if the freeze is %s', async mode => {
  const pair = await fixture();
  try {
    const before = pair.authority.snapshot(); type(pair, 'X');
    const pending = pair.authority.write({ epoch: before.epoch, update: wire(pair.document) });
    const ticket = pair.authority.freeze(before);
    if (mode === 'abort') pair.authority.abort(ticket);
    await expect(pending).rejects.toMatchObject({ code: mode === 'abort' ? 'revision-conflict' : 'frozen' });
    expect(pair.authority.snapshot().revision).toBe(before.revision);
    expect(pair.authority.snapshot().checkpoint).toBe(before.checkpoint);
  } finally { pair.destroy(); }
});

it('prepares and atomically resumes the exact frozen checkpoint under a new epoch', async () => {
  const pair = await fixture();
  try {
    const before = pair.authority.snapshot(), ticket = pair.authority.freeze(before);
    const prepared = await pair.authority.prepareResume(ticket);
    expect(pair.authority.snapshot().phase).toBe('frozen');
    expect(Object.isFrozen(ticket)).toBe(true); expect(Object.isFrozen(prepared)).toBe(true);
    const current = pair.authority.commitResume(ticket, prepared);
    expect(current.epoch).not.toBe(before.epoch); expect(current.revision).toBe(1); expect(current.phase).toBe('active');
    expect(current.checkpoint).toBe(before.checkpoint);
    expect(() => pair.authority.commitResume(ticket, prepared)).toThrow(expect.objectContaining({ code: 'invalid-ticket' }));
    const probe = unreadable(before.epoch);
    await expect(pair.authority.write(probe.request)).rejects.toMatchObject({ code: 'stale-epoch' }); expect(probe.read).not.toHaveBeenCalled();
  } finally { pair.destroy(); }
});

it('aborts without changing data, epoch or revision and invalidates prepared and copied tickets', async () => {
  const pair = await fixture();
  try {
    const before = pair.authority.snapshot(), ticket = pair.authority.freeze(before), prepared = await pair.authority.prepareResume(ticket);
    expect(() => pair.authority.abort({ ...ticket })).toThrow(expect.objectContaining({ code: 'invalid-ticket' }));
    expect(() => pair.authority.commitResume(ticket, { ...prepared })).toThrow(expect.objectContaining({ code: 'invalid-ticket' }));
    expect(pair.authority.abort(ticket)).toEqual(before);
    await expect(pair.authority.prepareResume(ticket)).rejects.toMatchObject({ code: 'invalid-ticket' });
    const next = pair.authority.freeze(before);
    expect(() => pair.authority.commitResume(next, prepared)).toThrow(expect.objectContaining({ code: 'invalid-ticket' }));
    pair.authority.abort(next); type(pair, 'X');
    await pair.authority.write({ epoch: before.epoch, update: wire(pair.document) });
  } finally { pair.destroy(); }
});

it('rejects preparation that finishes after abort and refreeze', async () => {
  const pair = await fixture();
  try {
    const before = pair.authority.snapshot(), ticket = pair.authority.freeze(before), pending = pair.authority.prepareResume(ticket);
    pair.authority.abort(ticket); pair.authority.freeze(before);
    await expect(pending).rejects.toMatchObject({ code: 'invalid-ticket' });
    expect(pair.authority.snapshot().checkpoint).toBe(before.checkpoint);
  } finally { pair.destroy(); }
});

it('does not allow freeze/preparation capabilities from another authority', async () => {
  const pair = await fixture(), other = await FencedRetainedRoom.open(pair.checkpoint, pair.schema, 'schema-1');
  try {
    const ticket = pair.authority.freeze(pair.authority.snapshot()), prepared = await pair.authority.prepareResume(ticket);
    const foreign = other.freeze(other.snapshot());
    await expect(other.prepareResume(ticket)).rejects.toMatchObject({ code: 'invalid-ticket' });
    expect(() => other.commitResume(foreign, prepared)).toThrow(expect.objectContaining({ code: 'invalid-ticket' }));
  } finally { other.close(); pair.destroy(); }
});

it('permits concurrent preparations of the same frozen revision to share one capability', async () => {
  const pair = await fixture();
  try {
    const ticket = pair.authority.freeze(pair.authority.snapshot());
    const [a, b] = await Promise.all([pair.authority.prepareResume(ticket), pair.authority.prepareResume(ticket)]);
    expect(a).toBe(b); pair.authority.commitResume(ticket, a);
  } finally { pair.destroy(); }
});

it('rejects concurrent-write CAS conflict explicitly, then preserves both edits on retry', async () => {
  const pair = await fixture(), restored = await restoreRetainedCheckpoint(pair.checkpoint, pair.schema, 'schema-1'), peer = client(restored.document, 'fountain', 'Grace');
  try {
    type(pair, 'X'); type(peer, 'Y'); const epoch = pair.authority.snapshot().epoch;
    const requests = [wire(pair.document), wire(peer.document)];
    const outcomes = await Promise.allSettled(requests.map(update => pair.authority.write({ epoch, update })));
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.findIndex(item => item.status === 'rejected');
    expect((outcomes[rejected] as PromiseRejectedResult).reason).toMatchObject({ code: 'revision-conflict' });
    const current = await pair.authority.write({ epoch, update: requests[rejected]! });
    Y.applyUpdate(pair.document, current.checkpoint.update); Y.applyUpdate(peer.document, current.checkpoint.update);
    expect(pair.editor.getJSON()).toEqual(peer.editor.getJSON());
    expect(pair.editor.state.doc.textContent).toContain('X'); expect(pair.editor.state.doc.textContent).toContain('Y');
    expect(await value(current.checkpoint, pair.schema)).toEqual(pair.editor.getJSON()); expect(current.revision).toBe(2);
  } finally { peer.destroy(); pair.destroy(); }
});

it('retains an offline editor update across same-room epoch handoff and requires explicit reconnection', async () => {
  const pair = await fixture(), restored = await restoreRetainedCheckpoint(pair.checkpoint, pair.schema, 'schema-1'), peer = client(restored.document, 'fountain', 'Grace');
  try {
    const before = pair.authority.snapshot(); type(peer, 'OFFLINE'); const pending = wire(peer.document);
    const ticket = pair.authority.freeze(before), prepared = await pair.authority.prepareResume(ticket), current = pair.authority.commitResume(ticket, prepared);
    await expect(pair.authority.write({ epoch: before.epoch, update: pending })).rejects.toMatchObject({ code: 'stale-epoch' });
    expect(await value(current.checkpoint, pair.schema)).toEqual(pair.editor.getJSON());
    const reconciled = await pair.authority.write({ epoch: current.epoch, update: pending });
    expect(await value(reconciled.checkpoint, pair.schema)).toEqual(peer.editor.getJSON());
    Y.applyUpdate(pair.document, reconciled.checkpoint.update); expect(pair.editor.getJSON()).toEqual(peer.editor.getJSON());
  } finally { peer.destroy(); pair.destroy(); }
});

it('reopens a saved checkpoint with a fresh epoch and rejects writers from the closed authority', async () => {
  const pair = await fixture();
  try {
    type(pair, 'X'); const saved = await pair.authority.write({ epoch: pair.authority.snapshot().epoch, update: wire(pair.document) });
    pair.authority.close(); const reopened = await FencedRetainedRoom.open(saved.checkpoint, pair.schema, 'schema-1');
    try {
      const probe = unreadable(saved.epoch);
      await expect(reopened.write(probe.request)).rejects.toMatchObject({ code: 'stale-epoch' }); expect(probe.read).not.toHaveBeenCalled();
      expect(reopened.snapshot().checkpoint.manifest.checkpointSha256).toBe(saved.checkpoint.manifest.checkpointSha256);
      expect(await value(reopened.snapshot().checkpoint, pair.schema)).toEqual(pair.editor.getJSON());
    } finally { reopened.close(); }
  } finally { pair.destroy(); }
});

it.each(['write', 'prepare'] as const)('rejects pending %s after authority closure', async operation => {
  const pair = await fixture();
  try {
    const state = pair.authority.snapshot();
    const pending = operation === 'write' ? pair.authority.write({ epoch: state.epoch, update: wire(pair.document) }) : pair.authority.prepareResume(pair.authority.freeze(state));
    pair.authority.close(); await expect(pending).rejects.toMatchObject({ code: 'closed' });
    expect(() => pair.authority.snapshot()).toThrow(expect.objectContaining({ code: 'closed' }));
    const probe = unreadable(state.epoch);
    await expect(pair.authority.write(probe.request)).rejects.toMatchObject({ code: 'closed' }); expect(probe.read).not.toHaveBeenCalled();
  } finally { pair.destroy(); }
});

it('uses the validated manifest snapshot when caller metadata changes during open', async () => {
  const pair = await fixture('custom-room');
  try {
    const input = { manifest: { ...pair.checkpoint.manifest }, update: pair.checkpoint.update };
    const pending = FencedRetainedRoom.open(input, pair.schema, 'schema-1');
    input.manifest.room = 'changed'; input.update.fill(0);
    const other = await pending;
    try { expect(other.snapshot().checkpoint.manifest.room).toBe('custom-room'); } finally { other.close(); }
  } finally { pair.destroy(); }
});
