// @vitest-environment node
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, Selection, composeExtensions, createEditor, insertText } from '../src';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { RetainedDocumentStore } from '../src/yjs/retained-document';
import { captureRetainedCheckpoint, restoreRetainedCheckpoint, type RetainedCheckpoint } from '../src/yjs/retained-checkpoint';

const content = { type: 'doc', attrs: { title: 'Checkpoint', nested: { source: true } }, content: [
  { type: 'paragraph', attrs: { nodeId: 'intro' }, content: [{ type: 'text', text: 'Alpha' }] },
  { type: 'image_super', attrs: { nodeId: 'figure', src: '/figure.png', alt: 'Retained figure' } },
] };
function fixture(gc = true) {
  const document = new Y.Doc({ gc }), kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({ document, captureTimeout: 0, user: { id: 'Ada', name: 'Ada', color: '#7048e8' } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  return { document, editor, schema: editor.state.schema, destroy() { editor.destroy(); document.destroy(); } };
}
const wire = (document: Y.Doc) => Y.encodeStateAsUpdate(document);
const changed = (checkpoint: RetainedCheckpoint, patch: object): RetainedCheckpoint => ({ update: checkpoint.update, manifest: { ...checkpoint.manifest, ...patch } });

it('captures and restores a pure-Node retained room without mutating the source', async () => {
  const pair = fixture();
  try {
    const before = wire(pair.document), checkpoint = await captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1');
    const result = await restoreRetainedCheckpoint(checkpoint, pair.schema, 'schema-1');
    try {
      expect(typeof globalThis.document).toBe('undefined');
      expect(result.baseDocument.toJSON()).toEqual(pair.editor.getJSON());
      expect(result.document.guid).toBe(pair.document.guid); expect(result.document.gc).toBe(pair.document.gc);
      expect(wire(result.document)).toEqual(before); expect(wire(pair.document)).toEqual(before);
      expect(result.document).not.toBe(pair.document);
    } finally { result.document.destroy(); }
  } finally { pair.destroy(); }
});

it('preserves nested auxiliary state, binary values and empty shared-root declarations', async () => {
  const pair = fixture();
  try {
    const extra = pair.document.getMap('opaque extension/state'), nested = new Y.Map(); extra.set('comments', nested);
    nested.set('author', 'Grace'); nested.set('bytes', new Uint8Array([0, 128, 255]));
    pair.document.getArray('empty list'); pair.document.getText('empty text'); pair.document.get('unresolved root'); pair.document.getMap().set('default', 'Default unnamed root');
    const checkpoint = await captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1');
    const result = await restoreRetainedCheckpoint(checkpoint, pair.schema, 'schema-1');
    try {
      const value = result.document.getMap('opaque extension/state').get('comments') as Y.Map<unknown>;
      expect(value.get('author')).toBe('Grace'); expect(value.get('bytes')).toEqual(new Uint8Array([0, 128, 255]));
      expect(result.document.share.get('empty list')).toBeInstanceOf(Y.Array);
      expect(result.document.share.get('empty text')).toBeInstanceOf(Y.Text);
      expect(result.document.share.has('unresolved root')).toBe(true);
      expect(result.document.getMap().get('default')).toBe('Default unnamed root');
    } finally { result.document.destroy(); }
  } finally { pair.destroy(); }
});

it('preserves shared identities and relative anchors and can receive subsequent same-room peer updates', async () => {
  const pair = fixture(), reader = new RetainedDocumentStore(pair.document, 'fountain', pair.schema, () => { throw new Error('No allocation'); });
  try {
    reader.read(); const anchor = reader.textAnchor([0, 0], 2, 1), identity = reader.identity([0]);
    const checkpoint = await captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1');
    const restored = await restoreRetainedCheckpoint(checkpoint, pair.schema, 'schema-1');
    const control = new RetainedDocumentStore(restored.document, 'fountain', pair.schema, () => { throw new Error('No allocation'); });
    try {
      control.read(); expect(control.identity([0])).toBe(identity); expect(control.resolveTextAnchor(anchor)).toEqual({ path: [0, 0], offset: 2 });
      pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.cursor([0, 0], 2))); expect(insertText(pair.editor, 'X')).toBe(true);
      Y.applyUpdate(restored.document, wire(pair.document));
      expect(control.read().toJSON()).toEqual(pair.editor.getJSON()); expect(control.resolveTextAnchor(anchor)).toEqual({ path: [0, 0], offset: 3 });
    } finally { control.destroy(); restored.document.destroy(); }
  } finally { reader.destroy(); pair.destroy(); }
});

it('owns checkpoint bytes and snapshots restore input before asynchronous validation', async () => {
  const pair = fixture();
  try {
    const checkpoint = await captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1'), original = checkpoint.update;
    checkpoint.update.fill(0); expect(checkpoint.update).toEqual(original);
    expect(Object.isFrozen(checkpoint)).toBe(true); expect(Object.isFrozen(checkpoint.manifest)).toBe(true);
    expect(Object.isFrozen(checkpoint.manifest.roots)).toBe(true);
    const input = { manifest: checkpoint.manifest, update: checkpoint.update }, pending = restoreRetainedCheckpoint(input, pair.schema, 'schema-1'); input.update.fill(0);
    const result = await pending; try { expect(result.baseDocument.toJSON()).toEqual(pair.editor.getJSON()); } finally { result.document.destroy(); }
  } finally { pair.destroy(); }
});

it.each(['insert', 'delete', 'empty-root'] as const)('refuses a source %s during asynchronous capture, including deletion-only changes', async kind => {
  const pair = fixture();
  try {
    const state = Y.encodeStateVector(pair.document), before = wire(pair.document), pending = captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1');
    if (kind === 'empty-root') { pair.document.getMap('new empty root'); expect(wire(pair.document)).toEqual(before); }
    else {
      const text = [...pair.document.getMap('fountain-text:texts').values()][0] as Y.Text;
      if (kind === 'delete') { text.delete(1, 1); expect(Y.encodeStateVector(pair.document)).toEqual(state); }
      else text.insert(1, 'X', text.toDelta()[1].attributes);
    }
    await expect(pending).rejects.toThrow('changed shared state');
  } finally { pair.destroy(); }
});

it('refuses capture from a caller-owned open transaction', async () => {
  const pair = fixture(); let pending: Promise<unknown>;
  try {
    pair.document.transact(() => { pending = captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1'); });
    await expect(pending!).rejects.toThrow('outside a shared transaction');
  } finally { pair.destroy(); }
});

it.each([false, true])('refuses nested subdocuments, including deleted uncollected items (%s)', async deleted => {
  const pair = fixture(!deleted), child = new Y.Doc();
  try {
    child.getText('data').insert(0, 'Not part of parent wire state');
    const host = pair.document.getMap('host');
    host.set('child', child);
    if (deleted) {
      host.delete('child');
      expect(pair.document.getSubdocs().size).toBe(0);
    }
    await expect(captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1')).rejects.toThrow('subdocument');
  } finally { pair.destroy(); child.destroy(); }
});

it.each(['version', 'checksum', 'room', 'projection', 'extra'] as const)('rejects incompatible or tampered %s without touching the source', async kind => {
  const pair = fixture();
  try {
    const checkpoint = await captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1'), before = wire(pair.document);
    const invalid = changed(checkpoint, kind === 'version' ? { schemaVersion: 'other' } : kind === 'checksum' ? { updateSha256: '0'.repeat(64) }
      : kind === 'room' ? { roomId: 'r-00000000-0000-4000-8000-000000000000' } : kind === 'projection' ? { documentSha256: '0'.repeat(64) } : { ignored: true });
    await expect(restoreRetainedCheckpoint(invalid, pair.schema, 'schema-1')).rejects.toThrow(); expect(wire(pair.document)).toEqual(before);
  } finally { pair.destroy(); }
});

it('refuses an altered byte payload before interpreting it as Yjs data', async () => {
  const pair = fixture();
  try {
    const checkpoint = await captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1'), update = checkpoint.update; update.fill(0);
    await expect(restoreRetainedCheckpoint({ manifest: checkpoint.manifest, update }, pair.schema, 'schema-1')).rejects.toThrow('checksum mismatch');
  } finally { pair.destroy(); }
});

it.each(['manifest', 'root'] as const)('rejects %s accessors without invoking them', async kind => {
  const pair = fixture(); let called = false;
  try {
    const checkpoint = await captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1');
    const manifest = { ...checkpoint.manifest, roots: [...checkpoint.manifest.roots] };
    if (kind === 'manifest') Object.defineProperty(manifest, 'room', { enumerable: true, get() { called = true; return 'fountain'; } });
    else Object.defineProperty(manifest.roots, '0', { enumerable: true, get() { called = true; return checkpoint.manifest.roots[0]; } });
    await expect(restoreRetainedCheckpoint({ manifest, update: checkpoint.update }, pair.schema, 'schema-1')).rejects.toThrow(); expect(called).toBe(false);
  } finally { pair.destroy(); }
});

it('rejects a sparse shared-root inventory', async () => {
  const pair = fixture();
  try {
    const checkpoint = await captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1'), inventory = [...checkpoint.manifest.roots]; delete inventory[0];
    await expect(restoreRetainedCheckpoint(changed(checkpoint, { roots: inventory }), pair.schema, 'schema-1')).rejects.toThrow('manifest');
  } finally { pair.destroy(); }
});

it('reruns schema factory rules when restoring a valid wire snapshot', async () => {
  const pair = fixture(), spec = pair.schema.nodes.paragraph.spec, validate = spec.validate;
  try {
    const checkpoint = await captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1'), before = wire(pair.document);
    spec.validate = () => false;
    await expect(restoreRetainedCheckpoint(checkpoint, pair.schema, 'schema-1')).rejects.toThrow('Invalid node invariant'); expect(wire(pair.document)).toEqual(before);
  } finally { spec.validate = validate; pair.destroy(); }
});

it('rejects capture when source GC options change during hashing', async () => {
  const pair = fixture();
  try {
    const pending = captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1'); pair.document.gc = !pair.document.gc;
    await expect(pending).rejects.toThrow('source options changed');
  } finally { pair.destroy(); }
});

it('captures a wire-loaded room before an editor has materialized its root types', async () => {
  const pair = fixture(), raw = new Y.Doc();
  try {
    Y.applyUpdate(raw, wire(pair.document)); const before = wire(raw);
    const checkpoint = await captureRetainedCheckpoint(raw, pair.schema, 'schema-1');
    expect(wire(raw)).toEqual(before);
    const restored = await restoreRetainedCheckpoint(checkpoint, pair.schema, 'schema-1');
    try { expect(restored.baseDocument.toJSON()).toEqual(pair.editor.getJSON()); } finally { restored.document.destroy(); }
  } finally { raw.destroy(); pair.destroy(); }
});

it('checks otherwise wire-invisible manifest metadata', async () => {
  const pair = fixture();
  try {
    const checkpoint = await captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1');
    await expect(restoreRetainedCheckpoint(changed(checkpoint, { guid: 'altered-guid' }), pair.schema, 'schema-1')).rejects.toThrow('manifest checksum');
  } finally { pair.destroy(); }
});

it('rejects capture when the source is destroyed during hashing', async () => {
  const pair = fixture();
  try {
    const pending = captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1'); pair.destroy();
    await expect(pending).rejects.toThrow('live document');
  } finally { pair.destroy(); }
});

it('declines custom top-level shared types instead of silently losing their behavior', async () => {
  const pair = fixture(); class CustomMap extends Y.Map<unknown> {}
  try {
    pair.document.get('custom', CustomMap).set('value', 'kept'); const before = wire(pair.document);
    await expect(captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1')).rejects.toThrow('custom top-level'); expect(wire(pair.document)).toEqual(before);
  } finally { pair.destroy(); }
});

it('detects source writes made by a host schema callback during clone validation', async () => {
  const pair = fixture(), spec = pair.schema.nodes.paragraph.spec, validate = spec.validate;
  try {
    spec.validate = () => { pair.document.getMap('host-callback').set('touched', true); return true; };
    await expect(captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1')).rejects.toThrow('changed shared state');
    expect(pair.document.getMap('host-callback').get('touched')).toBe(true);
  } finally { spec.validate = validate; pair.destroy(); }
});

it.each(['\uD800', '\uDC00'] as const)('refuses raw shared text containing unpaired %j instead of replacing it on reopen', async value => {
  const pair = fixture();
  try {
    const text = [...pair.document.getMap('fountain-text:texts').values()][0] as Y.Text;
    text.insert(2, value, text.toDelta()[1].attributes); const original = text.toString();
    await expect(captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1')).rejects.toThrow('unpaired UTF-16'); expect(text.toString()).toBe(original);
  } finally { pair.destroy(); }
});

it.each(['value', 'key'] as const)('rejects an unrepresentable opaque Any %s without rewriting it', async kind => {
  const pair = fixture();
  try {
    const value = kind === 'value' ? { raw: '\uD800' } : { ['raw\uDC00']: 'kept' };
    pair.document.getMap('opaque').set('data', value);
    await expect(captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1')).rejects.toThrow('unpaired UTF-16'); expect(pair.document.getMap('opaque').get('data')).toBe(value);
  } finally { pair.destroy(); }
});

it('retains representable escaped UTF-16 metadata without a blanket Unicode cleanup', async () => {
  const pair = fixture();
  try {
    const transaction = pair.editor.createTransaction().replaceDocument(pair.editor.state.doc.withAttrs({ ['raw\uD800']: 'value\uDC00' })); pair.editor.dispatch(transaction);
    const checkpoint = await captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1'), restored = await restoreRetainedCheckpoint(checkpoint, pair.schema, 'schema-1');
    try { expect(restored.baseDocument.attrs['raw\uD800']).toBe('value\uDC00'); } finally { restored.document.destroy(); }
  } finally { pair.destroy(); }
});

it.each(['\uD800', '\uDC00'] as const)('rejects native insertion of unpaired %j before changing shared storage', value => {
  const pair = fixture(), reader = new RetainedDocumentStore(pair.document, 'fountain', pair.schema, () => { throw new Error('No allocation'); });
  try {
    reader.read(); const before = wire(pair.document), transaction = pair.editor.createTransaction().insertText([0, 0], 2, value);
    expect(() => reader.apply(transaction)).toThrow('unpaired UTF-16'); expect(wire(pair.document)).toEqual(before);
  } finally { reader.destroy(); pair.destroy(); }
});

it('rejects opaque Any bigints that Yjs cannot represent without truncation', async () => {
  const pair = fixture();
  try {
    const value = 1n << 80n; pair.document.getMap('opaque').set('large', value);
    await expect(captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1')).rejects.toThrow('signed 64-bit'); expect(pair.document.getMap('opaque').get('large')).toBe(value);
  } finally { pair.destroy(); }
});

it('retains supported opaque scalar and binary data without JSON-normalizing it', async () => {
  const pair = fixture();
  try {
    const value = { optional: undefined, nan: NaN, infinity: Infinity, negativeZero: -0, min: -(1n << 63n), max: (1n << 63n) - 1n, bytes: new Uint8Array([0, 255]), list: [null, true, 'literal', undefined] };
    pair.document.getMap('opaque').set('data', value);
    const captured = await captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1'), restored = await restoreRetainedCheckpoint(captured, pair.schema, 'schema-1');
    try { expect(restored.document.getMap('opaque').get('data')).toEqual(value); } finally { restored.document.destroy(); }
  } finally { pair.destroy(); }
});

it('preserves stored relative-position JSON containing standard Y.ID records', async () => {
  const pair = fixture(), reader = new RetainedDocumentStore(pair.document, 'fountain', pair.schema, () => { throw new Error('No allocation'); });
  try {
    reader.read(); pair.document.getMap('anchors').set('cursor', reader.textAnchor([0, 0], 2, 1));
    const checkpoint = await captureRetainedCheckpoint(pair.document, pair.schema, 'schema-1'), restored = await restoreRetainedCheckpoint(checkpoint, pair.schema, 'schema-1');
    const control = new RetainedDocumentStore(restored.document, 'fountain', pair.schema, () => { throw new Error('No allocation'); });
    try { control.read(); expect(control.resolveTextAnchor(restored.document.getMap('anchors').get('cursor'))).toEqual({ path: [0, 0], offset: 2 }); }
    finally { control.destroy(); restored.document.destroy(); }
  } finally { reader.destroy(); pair.destroy(); }
});
