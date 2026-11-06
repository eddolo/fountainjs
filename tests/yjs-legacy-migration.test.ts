// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, MathExtension, RangeSelection, GapSelection, Selection, composeExtensions, createEditor, defineExtension, insertText, undoCollaboration, type AnySelection } from '../src';
import { setStructuredAttribute, defineStructuredAttribute } from '../src/structured-attributes';
import { createYjsCollaborationExtension, type YjsAwareness } from '../src/yjs';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { captureLegacyCheckpoint, restoreLegacyCheckpoint, type LegacyProjectionOptions } from '../src/yjs/legacy-checkpoint';
import { buildLegacyMigrationCandidate, legacySelectionRootMigrator } from '../src/yjs/legacy-migration';
import { retainedStructuredRootMigrator, type RetainedMigrationOptions, type RetainedRootMigrator } from '../src/yjs/retained-migration';
import { restoreRetainedCheckpoint } from '../src/yjs/retained-checkpoint';
import { RetainedDocumentStore } from '../src/yjs/retained-document';
import { restoreSelection } from '../src/yjs/retained-selection';
import { applyRetainedRoomUpdate } from '../src/yjs/retained-room-store';

const cleanups: Array<() => void> = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });
const panel = defineExtension({ name: 'legacy-panel', nodes: { structured_panel: { group: 'block', atom: true } } });
const definition = defineStructuredAttribute({ nodeType: 'structured_panel', attribute: 'config', root: 'object' });
const cell = (text: string) => ({ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const content = { type: 'doc', attrs: { title: 'Existing paper', metadata: { edition: 2 } }, content: [
  { type: 'paragraph', attrs: { nodeId: 'intro' }, content: [{ type: 'text', text: 'Alpha <>& α\u0301 😀\u200B', marks: [{ type: 'strong' }] }] },
  { type: 'blockquote', attrs: { nodeId: 'quote' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested quotation' }] }] },
  { type: 'table', attrs: { nodeId: 'table' }, content: [{ type: 'table_row', content: [cell('A'), cell('B')] }] },
  { type: 'image_super', attrs: { nodeId: 'figure', src: '/figure.png', alt: 'Original figure' } },
  { type: 'math_block', attrs: { nodeId: 'equation', latex: '\\int_0^1 x \\, dx', label: 'eq:one' } },
  { type: 'code_block', attrs: { nodeId: 'proof', language: 'lean' }, content: [{ type: 'text', text: 'example : 1 + 1 = 2 := by decide' }] },
  { type: 'structured_panel', attrs: { nodeId: 'panel-1', config: { columns: 2, names: ['Ada', 'Grace'] } } },
] };
const policies = (migrators: readonly RetainedRootMigrator[] = []): RetainedMigrationOptions => ({ history: 'reset-with-source-checkpoint', offline: 'reconcile-before-activation', externalState: 'host-coordinated', migrators });
function fixture(structured = false, document = new Y.Doc(), room = 'fountain') {
  let local: Record<string, any> = {};
  const awareness: YjsAwareness = { clientID: document.clientID, getLocalState: () => local, getStates: () => new Map([[document.clientID, local]]), setLocalStateField: (key, value) => { local = { ...local, [key]: value }; }, on() {}, off() {} };
  const projection: LegacyProjectionOptions = structured ? { structuredAttributes: { definitions: [definition] } } : {};
  const kit = composeExtensions([CoreExtension, MathExtension, panel, createYjsCollaborationExtension({ document, fragmentName: room, captureTimeout: 0, presenceThrottleMs: 0, awareness,
    ...projection, user: { id: 'Ada', name: 'Ada', color: '#7048e8' } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  cleanups.push(() => { editor.destroy(); document.destroy(); });
  return { document, editor, schema: editor.state.schema, projection, room, capture: () => captureLegacyCheckpoint(document, editor.state.schema, 'schema-1', projection, room), selection: () => local.fountain.selection };
}
function shared(pair: ReturnType<typeof fixture>, path: readonly number[]): Y.XmlElement {
  let value = pair.document.getXmlFragment(pair.room).get(0) as Y.XmlElement; for (const index of path) value = value.get(index) as Y.XmlElement; return value;
}
async function reopen(pair: ReturnType<typeof fixture>, candidate: Awaited<ReturnType<typeof buildLegacyMigrationCandidate>>) {
  const value = await restoreRetainedCheckpoint(candidate.destination, pair.schema, 'schema-1'), reader = new RetainedDocumentStore(value.document, pair.room, pair.schema, () => { throw new Error('No allocation'); }); reader.read();
  cleanups.push(() => { reader.destroy(); value.document.destroy(); }); return { ...value, reader };
}
const owner = (name: string, migrate: RetainedRootMigrator['migrate'], verify: RetainedRootMigrator['verify'] = () => {}): RetainedRootMigrator => ({ name, roots: [name], migrate, verify });

it('archives and converts an actual public-adapter room without connecting, repairing or changing its source', async () => {
  const pair = fixture(), expected = pair.editor.getJSON(), before = Y.encodeStateAsUpdate(pair.document), checkpoint = await pair.capture();
  const candidate = await buildLegacyMigrationCandidate(checkpoint, pair.schema, 'schema-1', policies()), target = await reopen(pair, candidate);
  expect(typeof globalThis.document).toBe('undefined'); expect(candidate.source.update).toEqual(before); expect(Y.encodeStateAsUpdate(pair.document)).toEqual(before);
  expect(target.baseDocument.toJSON()).toEqual(expected); expect(candidate.destination.manifest.guid).not.toBe(pair.document.guid);
  expect(candidate.report).toMatchObject({ sourceFormat: 'legacy-xml', activation: 'not-implemented', sourceGuid: pair.document.guid });
  expect(Object.isFrozen(candidate.report)).toBe(true); expect(candidate.source.manifest.format).toBe('fountain-legacy-checkpoint/1');
  const restored = await restoreLegacyCheckpoint(candidate.source, pair.schema, 'schema-1');
  try { expect(restored.baseDocument.toJSON()).toEqual(expected); expect(Y.encodeStateAsUpdate(restored.document)).toEqual(before); } finally { restored.document.destroy(); }
});

it('preserves an empty auxiliary root and binary host data through an explicit root owner', async () => {
  const pair = fixture(); pair.document.getMap('empty'); pair.document.getMap('host-data').set('bytes', new Uint8Array([0, 128, 255]));
  const roots = [owner('empty', context => { context.target.getMap('empty'); }), owner('host-data', context => { context.target.getMap('host-data').set('bytes', Uint8Array.from(context.source.getMap('host-data').get('bytes') as Uint8Array)); }, context => { expect(context.target.getMap('host-data').toJSON()).toEqual(context.source.getMap('host-data').toJSON()); })];
  const candidate = await buildLegacyMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies(roots)), target = await reopen(pair, candidate);
  expect(target.document.share.has('empty')).toBe(true); expect(target.document.getMap('host-data').get('bytes')).toEqual(new Uint8Array([0, 128, 255]));
  const old = await restoreLegacyCheckpoint(candidate.source, pair.schema, 'schema-1'); try { expect(old.document.share.has('empty')).toBe(true); } finally { old.document.destroy(); }
});

it('restores a source checkpoint into a still-editable legacy room and preserves subsequent old-room batches', async () => {
  const pair = fixture(), checkpoint = await pair.capture(), restored = await restoreLegacyCheckpoint(checkpoint, pair.schema, 'schema-1');
  const oldPeer = fixture(false, restored.document);
  oldPeer.editor.dispatch(oldPeer.editor.createTransaction().setSelection(Selection.cursor([0, 0], 2))); expect(insertText(oldPeer.editor, 'OLD')).toBe(true);
  Y.applyUpdate(pair.document, Y.encodeStateAsUpdate(oldPeer.document)); expect(pair.editor.getJSON()).toEqual(oldPeer.editor.getJSON());
});

it('translates actual native text references and registered shared-node identities', async () => {
  const pair = fixture(), refs = pair.document.getMap('refs'), text = shared(pair, [1, 0, 0]).get(0) as Y.XmlText, node = shared(pair, [3]);
  const reference = Y.createRelativePositionFromTypeIndex(node, 0).type!, id = `yjs-${reference.client}-${reference.clock}`, anchor = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, 4, -1));
  refs.set('text', anchor); refs.set('node', id);
  const root = owner('refs', context => { const source = context.source.getMap('refs'), target = context.target.getMap('refs'); target.set('text', context.textAnchor(source.get('text'))); target.set('node', context.nodeIdentity(source.get('node') as string)); });
  const candidate = await buildLegacyMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies([root])), target = await reopen(pair, candidate), map = target.document.getMap('refs');
  expect(target.reader.resolveTextAnchor(map.get('text'))).toEqual({ path: [1, 0, 0], offset: 4 }); expect(Y.createRelativePositionFromJSON(map.get('text') as any).assoc).toBe(-1);
  expect(target.reader.path(map.get('node') as string)).toEqual([3]); expect(map.get('node')).not.toBe(id); expect(target.reader.resolveTextAnchor(anchor)).toBeUndefined();
  expect(candidate.report.translated).toEqual({ textAnchors: 1, nodeIdentities: 1, selections: 0 });
});

it.each(['text', 'forward', 'backward', 'gap-before', 'gap-after'] as const)('translates the public adapter’s actual %s selection encoding', async kind => {
  const pair = fixture(); let selection: AnySelection = Selection.range([0, 0], 2, [1, 0, 0], 5);
  if (kind === 'forward' || kind === 'backward') selection = new RangeSelection(pair.editor.state.doc, kind === 'backward' ? 15 : 2, kind === 'backward' ? 2 : 15);
  if (kind.startsWith('gap')) selection = new GapSelection(pair.editor.state.doc, 0, kind === 'gap-before' ? -1 : 1);
  pair.editor.dispatch(pair.editor.createTransaction().setSelection(selection)); pair.document.getMap('saved-selections').set('review', pair.selection());
  const candidate = await buildLegacyMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies([legacySelectionRootMigrator('saved-selections')])), target = await reopen(pair, candidate);
  expect(restoreSelection(target.reader, target.baseDocument, target.document.getMap('saved-selections').get('review'))?.eq(selection)).toBe(true);
  expect(candidate.report.translated.selections).toBe(1);
});

it('migrates granular attributes with explicit definitions and preserves a stale canonical source plus its authoritative map', async () => {
  const pair = fixture(true); expect(setStructuredAttribute(pair.editor, [6], definition, ['columns'], 7)).toBe(true);
  // Deliberate raw canonical staleness: projection must use the structured map,
  // while the full rollback wire retains the original discrepancy unchanged.
  shared(pair, [6]).setAttribute('fountain:attr:config', JSON.stringify({ columns: 1, names: ['Ada', 'Grace'] }));
  const checkpoint = await pair.capture(), before = Y.encodeStateAsUpdate(pair.document), root = retainedStructuredRootMigrator(pair.projection.structuredAttributes!);
  const candidate = await buildLegacyMigrationCandidate(checkpoint, pair.schema, 'schema-1', policies([root]), pair.projection), target = await reopen(pair, candidate);
  expect((target.baseDocument.child(6).attrs.config as any).columns).toBe(7); expect(candidate.source.update).toEqual(before); expect(Y.encodeStateAsUpdate(pair.document)).toEqual(before);
  expect(target.document.getMap('fountain:structured-attributes').toJSON()).toEqual(pair.document.getMap('fountain:structured-attributes').toJSON());
  await expect(restoreLegacyCheckpoint(checkpoint, pair.schema, 'schema-1')).rejects.toThrow('definitions');
});

it('starts a retained editor from the candidate and supports new author-local undo without sharing old-room writes', async () => {
  const pair = fixture(), candidate = await buildLegacyMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies()), target = await reopen(pair, candidate);
  const kit = composeExtensions([CoreExtension, MathExtension, panel, createRetainedYjsCollaborationExtension({ document: target.document, captureTimeout: 0, user: { id: 'Grace', name: 'Grace', color: '#7048e8' } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content }); cleanups.push(() => editor.destroy());
  expect(undoCollaboration(editor)).toBe(false); editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2))); expect(insertText(editor, 'NEW')).toBe(true); expect(undoCollaboration(editor)).toBe(true); expect(editor.getJSON()).toEqual(pair.editor.getJSON());
  await expect(applyRetainedRoomUpdate(candidate.destination, pair.schema, 'schema-1', Y.encodeStateAsUpdate(pair.document))).rejects.toMatchObject({ code: 'invalid-update' });
});

it.each(['history', 'offline', 'externalState'] as const)('requires the explicit %s migration policy', async key => {
  const pair = fixture(); await expect(buildLegacyMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', { ...policies(), [key]: undefined } as any)).rejects.toThrow('explicit');
});

it.each(['unknown', 'empty'] as const)('refuses an unclaimed %s auxiliary root without touching the source', async kind => {
  const pair = fixture(); if (kind === 'unknown') pair.document.getMap('unknown').set('data', 5); else pair.document.getMap('empty');
  const checkpoint = await pair.capture(), before = Y.encodeStateAsUpdate(pair.document);
  await expect(buildLegacyMigrationCandidate(checkpoint, pair.schema, 'schema-1', policies())).rejects.toThrow('Unclaimed'); expect(Y.encodeStateAsUpdate(pair.document)).toEqual(before);
});

it.each(['duplicate', 'reserved', 'missing'] as const)('refuses a %s root owner', async kind => {
  const pair = fixture(); pair.document.getMap('refs'); const root = owner(kind === 'reserved' ? 'fountain' : kind === 'missing' ? 'missing' : 'refs', () => {});
  await expect(buildLegacyMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies(kind === 'duplicate' ? [root, root] : [root]))).rejects.toThrow('root');
});

it.each(['extra-root', 'source-write', 'content-write', 'verifier-write', 'async-migrate', 'async-verify'] as const)('refuses %s without producing an accepted destination', async kind => {
  const pair = fixture(); pair.document.getMap('host'); const checkpoint = await pair.capture(), before = Y.encodeStateAsUpdate(pair.document);
  const root = owner('host', context => {
    context.target.getMap('host'); if (kind === 'extra-root') context.target.getMap('unowned');
    if (kind === 'source-write') context.source.getMap('host').set('changed', true);
    if (kind === 'content-write') { const texts = context.target.getMap('fountain-text:texts'); for (const value of texts.values()) if (value instanceof Y.Text) { value.insert(0, 'BAD'); break; } }
    if (kind === 'async-migrate') return Promise.resolve() as any;
  }, context => { if (kind === 'verifier-write') context.target.getMap('host').set('changed', true); if (kind === 'async-verify') return Promise.resolve() as any; });
  await expect(buildLegacyMigrationCandidate(checkpoint, pair.schema, 'schema-1', policies([root]))).rejects.toThrow(); expect(Y.encodeStateAsUpdate(pair.document)).toEqual(before);
});

it.each(['unknown-node-data', 'text-attrs', 'xml-format', 'xml-embed', 'duplicate-document', 'subdocument', 'unpaired'] as const)('refuses %s rather than normalizing or silently dropping source data', async kind => {
  const pair = fixture(), text = shared(pair, [0, 0]).get(0) as Y.XmlText;
  if (kind === 'unknown-node-data') shared(pair, [1]).setAttribute('unknown', 'Keep this');
  if (kind === 'text-attrs') shared(pair, [0, 0]).setAttribute('fountain:attr:extra', JSON.stringify('Keep this'));
  if (kind === 'xml-format') text.format(0, 2, { bold: true });
  if (kind === 'xml-embed') text.insertEmbed(0, { image: 'source' });
  if (kind === 'duplicate-document') { pair.editor.destroy(); pair.document.getXmlFragment('fountain').insert(1, [shared(pair, []).clone()]); }
  if (kind === 'subdocument') { const sub = new Y.Doc(); pair.document.getMap('nested').set('child', sub); cleanups.push(() => sub.destroy()); }
  if (kind === 'unpaired') text.insert(0, '\uD800');
  const before = Y.encodeStateAsUpdate(pair.document); await expect(pair.capture()).rejects.toThrow(); expect(Y.encodeStateAsUpdate(pair.document)).toEqual(before);
});

it.each(['format', 'schemaVersion', 'checksum', 'wire', 'inventory', 'projection'] as const)('rejects tampered %s on isolated legacy restore', async kind => {
  const pair = fixture(), checkpoint = await pair.capture(), manifest = { ...checkpoint.manifest };
  if (kind === 'format') (manifest as any).format = 'other'; if (kind === 'schemaVersion') manifest.schemaVersion = 'other'; if (kind === 'checksum') manifest.checkpointSha256 = '0'.repeat(64);
  if (kind === 'inventory') manifest.roots = []; if (kind === 'projection') manifest.projectionSha256 = '0'.repeat(64);
  const update = checkpoint.update; if (kind === 'wire') update[update.length - 1] ^= 1;
  await expect(restoreLegacyCheckpoint({ manifest, update }, pair.schema, 'schema-1')).rejects.toThrow();
});

it('owns checkpoint bytes and restore input before awaiting hashes', async () => {
  const pair = fixture(), checkpoint = await pair.capture(), copy = checkpoint.update; copy.fill(0); expect(checkpoint.update).not.toEqual(copy);
  const bytes = checkpoint.update, manifest = { ...checkpoint.manifest }, pending = restoreLegacyCheckpoint({ manifest, update: bytes }, pair.schema, 'schema-1'); bytes.fill(0); manifest.guid = 'changed';
  const restored = await pending; try { expect(restored.baseDocument.toJSON()).toEqual(pair.editor.getJSON()); expect(restored.document.guid).toBe(pair.document.guid); } finally { restored.document.destroy(); }
});

it.each(['insert', 'delete', 'root', 'options'] as const)('refuses source %s races during asynchronous legacy capture', async kind => {
  const pair = fixture(), pending = pair.capture();
  if (kind === 'insert' || kind === 'delete') { const text = shared(pair, [0, 0]).get(0) as Y.XmlText; if (kind === 'insert') text.insert(0, 'X'); else text.delete(0, 1); }
  if (kind === 'root') pair.document.getMap('new-root'); if (kind === 'options') pair.document.gc = !pair.document.gc;
  await expect(pending).rejects.toThrow('changed');
});

it('refuses a source with missing update dependencies', async () => {
  const pair = fixture(), checkpoint = await pair.capture(), updates: Uint8Array[] = []; pair.document.on('update', update => updates.push(update)); const text = shared(pair, [0, 0]).get(0) as Y.XmlText; text.insert(2, 'X'); text.insert(3, 'Y');
  const restored = await restoreLegacyCheckpoint(checkpoint, pair.schema, 'schema-1');
  try { Y.applyUpdate(restored.document, updates[1]!); await expect(captureLegacyCheckpoint(restored.document, pair.schema, 'schema-1')).rejects.toThrow('dependencies'); } finally { restored.document.destroy(); }
});

it.each(['text', 'node'] as const)('refuses a detached legacy %s reference without guessing a replacement', async kind => {
  const pair = fixture(); pair.document.getMap('refs').set('value', kind === 'text' ? { type: { client: 123, clock: 999 }, assoc: 1 } : 'yjs-123-999');
  const root = owner('refs', context => { const value = context.source.getMap('refs').get('value'); context.target.getMap('refs').set('value', kind === 'text' ? context.textAnchor(value) : context.nodeIdentity(value as string)); });
  await expect(buildLegacyMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies([root]))).rejects.toThrow('Detached');
});

it('verifies the actual stored selection rather than accepting a translated value that was discarded', async () => {
  const pair = fixture(); pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.range([0, 0], 1, [0, 0], 4))); pair.document.getMap('saved').set('review', pair.selection());
  const root = legacySelectionRootMigrator('saved'), migrate = root.migrate;
  const bad = { ...root, migrate(context: Parameters<RetainedRootMigrator['migrate']>[0]) { migrate(context); context.target.getMap('saved').set('review', { version: 1, kind: 'all' }); } };
  await expect(buildLegacyMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies([bad]))).rejects.toThrow('logical range');
});

it('expires translation helpers and owns root declarations before asynchronous restore', async () => {
  const pair = fixture(); pair.document.getMap('host'); let expired: (() => unknown) | undefined;
  const root = owner('host', context => { context.target.getMap('host'); expired = () => context.nodeIdentity('yjs-1-1'); }), mutable = { ...root, roots: ['host'] }, settings = { ...policies([mutable]), migrators: [mutable] };
  const pending = buildLegacyMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', settings); mutable.roots[0] = 'changed'; settings.migrators.length = 0;
  await pending; expect(expired).toBeTypeOf('function'); expect(expired).toThrow('expired');
});
