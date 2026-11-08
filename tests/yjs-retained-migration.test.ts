// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import * as Y from 'yjs';
import { AllSelection, CellSelection, CoreExtension, GapSelection, MathExtension, NodeSelection, RangeSelection, Selection, composeExtensions, createEditor, defineExtension,
  insertText, nodeRangeAtPath, undoCollaboration, type FountainExtension } from '../src';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { captureRetainedCheckpoint, restoreRetainedCheckpoint } from '../src/yjs/retained-checkpoint';
import { RetainedDocumentStore } from '../src/yjs/retained-document';
import { retainSelection, restoreSelection } from '../src/yjs/retained-selection';
import { buildRetainedMigrationCandidate, retainedSelectionRootMigrator, retainedStructuredRootMigrator, type RetainedMigrationContext, type RetainedMigrationOptions, type RetainedRootMigrator } from '../src/yjs/retained-migration';
import { defineStructuredAttribute, setStructuredAttribute } from '../src/structured-attributes';
import { InMemoryCommentsStore, createCommentThread, createCommentsExtension, getCommentsState } from '../src/comments';
import { InMemoryVersionProvider, VersionController } from '../src/versions';

const cleanups: Array<() => void> = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });
const panel = defineExtension({ name: 'migration-panel', nodes: { structured_panel: { group: 'block', atom: true } } });
const definition = defineStructuredAttribute({ nodeType: 'structured_panel', attribute: 'config', root: 'object' });
const cell = (text: string) => ({ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const content = { type: 'doc', attrs: { title: 'Migration paper', metadata: { edition: 3 } }, content: [
  { type: 'paragraph', attrs: { nodeId: 'intro' }, content: [{ type: 'text', text: 'Alpha α\u0301 😀\u200B' }] },
  { type: 'blockquote', attrs: { nodeId: 'quote' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested text', marks: [{ type: 'strong' }] }] }] },
  { type: 'table', attrs: { nodeId: 'table' }, content: [{ type: 'table_row', content: [cell('A'), cell('B')] }] },
  { type: 'image_super', attrs: { nodeId: 'figure', src: '/figure.png', alt: 'Retained figure' } },
  { type: 'code_block', attrs: { nodeId: 'proof', language: 'lean' }, content: [{ type: 'text', text: 'example : 1 + 1 = 2 := by decide' }] },
  { type: 'math_block', attrs: { nodeId: 'equation', latex: '\\int_0^1 x \\, dx', label: 'eq:one' } },
  { type: 'structured_panel', attrs: { nodeId: 'panel-1', config: { layout: { columns: 2, compact: false }, names: ['Ada', 'Grace'] } } },
] };
const policies = (migrators: readonly RetainedRootMigrator[] = []): RetainedMigrationOptions => ({ history: 'reset-with-source-checkpoint', offline: 'reconcile-before-activation', externalState: 'host-coordinated', migrators });
function fixture(structured = false, extensions: readonly FountainExtension[] = [], mapName?: string) {
  const document = new Y.Doc(), kit = composeExtensions([CoreExtension, MathExtension, panel, ...extensions, createRetainedYjsCollaborationExtension({ document, captureTimeout: 0,
    ...(structured ? { structuredAttributes: { definitions: [definition], mapName } } : {}), user: { id: 'Ada', name: 'Ada', color: '#7048e8' } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  const reader = new RetainedDocumentStore(document, 'fountain', editor.state.schema, () => { throw new Error('No source allocation'); }); reader.read();
  cleanups.push(() => { reader.destroy(); editor.destroy(); document.destroy(); });
  return { document, editor, reader, schema: editor.state.schema, capture: () => captureRetainedCheckpoint(document, editor.state.schema, 'schema-1') };
}
async function reopen(pair: ReturnType<typeof fixture>, candidate: Awaited<ReturnType<typeof buildRetainedMigrationCandidate>>) {
  const value = await restoreRetainedCheckpoint(candidate.destination, pair.schema, 'schema-1'), reader = new RetainedDocumentStore(value.document, 'fountain', pair.schema, () => { throw new Error('No target allocation'); }); reader.read();
  cleanups.push(() => { reader.destroy(); value.document.destroy(); }); return { ...value, reader };
}
const owner = (name: string, migrate: RetainedRootMigrator['migrate'], verify: RetainedRootMigrator['verify'] = () => {}): RetainedRootMigrator => ({ name, roots: [name], migrate, verify });

it('builds a fresh isolated room retaining technical content, application IDs, metadata and the full recovery source', async () => {
  const pair = fixture(), checkpoint = await pair.capture(), before = Y.encodeStateAsUpdate(pair.document);
  const candidate = await buildRetainedMigrationCandidate(checkpoint, pair.schema, 'schema-1', policies()), target = await reopen(pair, candidate);
  expect(typeof globalThis.document).toBe('undefined'); expect(target.baseDocument.toJSON()).toEqual(pair.editor.getJSON());
  expect(candidate.destination.manifest.roomId).not.toBe(checkpoint.manifest.roomId); expect(candidate.destination.manifest.guid).not.toBe(checkpoint.manifest.guid);
  expect(candidate.source.update).toEqual(before); expect(Y.encodeStateAsUpdate(pair.document)).toEqual(before);
  expect(target.reader.identity([0])).not.toBe(pair.reader.identity([0])); expect(target.baseDocument.child(0).attrs.nodeId).toBe('intro');
  expect(candidate.report.activation).toBe('not-implemented'); expect(Object.isFrozen(candidate.report)).toBe(true); expect(Object.isFrozen(candidate.report.translated)).toBe(true);
});

it.each(['history', 'offline', 'externalState'] as const)('requires an explicit %s policy', async missing => {
  const pair = fixture(), options = { ...policies(), [missing]: undefined };
  await expect(buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', options as any)).rejects.toThrow('explicit');
});

it('refuses unclaimed auxiliary roots, even empty ones, without changing live source state', async () => {
  const pair = fixture(); pair.document.getMap('unclaimed host notes'); const before = Y.encodeStateAsUpdate(pair.document);
  await expect(buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies())).rejects.toThrow('Unclaimed migration roots');
  expect(Y.encodeStateAsUpdate(pair.document)).toEqual(before); expect(pair.document.share.has('unclaimed host notes')).toBe(true);
});

it.each(['duplicate', 'missing', 'reserved'] as const)('rejects %s root ownership declarations', async mode => {
  const pair = fixture(); pair.document.getMap('notes');
  const roots = mode === 'duplicate' ? [owner('notes', () => {}), owner('notes', () => {})] : [owner(mode === 'reserved' ? 'fountain:document' : 'missing', () => {})];
  await expect(buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies(roots))).rejects.toThrow('root');
});

it.each(['fountain:document', 'fountain-nodes:metadata', 'fountain-text:metadata'] as const)('refuses unknown reserved metadata in %s instead of silently dropping it', async root => {
  const pair = fixture(); pair.document.getMap(root).set('host-added-data', 'must not disappear');
  await expect(buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies())).rejects.toThrow('Unrecognized engine metadata');
  expect(pair.document.getMap(root).get('host-added-data')).toBe('must not disappear');
});

it('translates text anchors and internal node identities through nested blocks without reusing CRDT IDs', async () => {
  const pair = fixture(), input = pair.document.getMap('references'), oldAnchor = pair.reader.textAnchor([1, 0, 0], 4, -1), oldId = pair.reader.identity([3])!;
  input.set('anchor', oldAnchor); input.set('node', oldId);
  const candidate = await buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies([owner('references', context => {
    const source = context.source.getMap('references'), target = context.target.getMap('references'); target.set('anchor', context.textAnchor(source.get('anchor'))); target.set('node', context.nodeIdentity(source.get('node') as string));
  })]));
  const target = await reopen(pair, candidate), migrated = target.document.getMap('references');
  expect(target.reader.resolveTextAnchor(migrated.get('anchor'))).toEqual({ path: [1, 0, 0], offset: 4 });
  expect(target.reader.path(migrated.get('node') as string)).toEqual([3]); expect(migrated.get('node')).not.toBe(oldId);
  expect(Y.createRelativePositionFromJSON(migrated.get('anchor') as any).assoc).toBe(-1);
  expect(target.reader.resolveTextAnchor(oldAnchor)).toBeUndefined(); expect(candidate.report.translated).toEqual({ textAnchors: 1, nodeIdentities: 1, selections: 0 });
});

it('translates forward/backward, nested, node, gap, cell and all-document stored selections', async () => {
  const pair = fixture(), doc = pair.editor.state.doc, selections = [Selection.cursor([0, 0], 2), new RangeSelection(doc, 8, 2), new RangeSelection(doc, 2, 8),
    Selection.range([0, 0], 2, [1, 0, 0], 4), new NodeSelection(doc, [3]), new GapSelection(doc, nodeRangeAtPath(doc, [3]).from, -1), new CellSelection(doc, [2, 0, 0], [2, 0, 1]), new AllSelection(doc)];
  const root = pair.document.getMap('saved-selections'); selections.forEach((value, index) => root.set(String(index), retainSelection(pair.reader, doc, value)));
  const candidate = await buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies([retainedSelectionRootMigrator('saved-selections')])), target = await reopen(pair, candidate);
  selections.forEach((selection, index) => expect(restoreSelection(target.reader, target.baseDocument, target.document.getMap('saved-selections').get(String(index)))?.eq(selection)).toBe(true));
  expect(candidate.report.translated.selections).toBe(selections.length);
});

it('preserves granular structured attributes and later independent field updates after reopening', async () => {
  const pair = fixture(true); expect(setStructuredAttribute(pair.editor, [6], definition, [], { layout: { columns: 5, compact: true }, names: ['Ada', 'Mina'] })).toBe(true);
  const candidate = await buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies([retainedStructuredRootMigrator({ definitions: [definition] })])), target = await reopen(pair, candidate);
  const kit = composeExtensions([CoreExtension, MathExtension, panel, createRetainedYjsCollaborationExtension({ document: target.document, structuredAttributes: { definitions: [definition] }, user: { id: 'Grace', name: 'Grace', color: '#7048e8' } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content }); cleanups.push(() => editor.destroy());
  expect(editor.getJSON()).toEqual(pair.editor.getJSON()); expect(undoCollaboration(editor)).toBe(false);
  const peerDoc = new Y.Doc(); Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(target.document));
  const peerKit = composeExtensions([CoreExtension, MathExtension, panel, createRetainedYjsCollaborationExtension({ document: peerDoc, captureTimeout: 0, structuredAttributes: { definitions: [definition] }, user: { id: 'Mina', name: 'Mina', color: '#7048e8' } })]);
  const peer = createEditor({ schema: peerKit.schema, plugins: peerKit.plugins, content }); cleanups.push(() => { peer.destroy(); peerDoc.destroy(); });
  expect(setStructuredAttribute(editor, [6], definition, ['layout', 'columns'], 7)).toBe(true); expect(setStructuredAttribute(peer, [6], definition, ['layout', 'compact'], false)).toBe(true);
  const a = Y.encodeStateAsUpdate(target.document), b = Y.encodeStateAsUpdate(peerDoc); Y.applyUpdate(target.document, b); Y.applyUpdate(peerDoc, a);
  expect(editor.getJSON()).toEqual(peer.getJSON()); expect(editor.state.doc.child(6).attrs.config).toEqual({ layout: { columns: 7, compact: false }, names: ['Ada', 'Mina'] });
  expect(undoCollaboration(editor)).toBe(true); Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(target.document)); expect(editor.getJSON()).toEqual(peer.getJSON());
  expect(editor.state.doc.child(6).attrs.config).toEqual({ layout: { columns: 5, compact: false }, names: ['Ada', 'Mina'] }); expect(pair.editor.state.doc.child(6).attrs.config).toEqual({ layout: { columns: 5, compact: true }, names: ['Ada', 'Mina'] });
});

it('preserves the custom map declaration when replacing a retained checkpoint', async () => {
  const mapName = 'migration-settings';
  const pair = fixture(true, [], mapName);
  const candidate = await buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1',
    policies([retainedStructuredRootMigrator({ definitions: [definition], mapName })]));
  const target = await reopen(pair, candidate);
  expect(target.document.getMap('fountain:document').get('structuredMap')).toBe(mapName);
  expect(target.document.getMap(mapName).toJSON()).toEqual(pair.document.getMap(mapName).toJSON());
});

it('lets a host explicitly preserve binary/review state and empty root declarations with semantic verification', async () => {
  const pair = fixture(); pair.document.getMap('host-review').set('bytes', new Uint8Array([0, 128, 255])); pair.document.getArray('empty-host-list');
  const migrator: RetainedRootMigrator = { name: 'host-review-v1', roots: ['host-review', 'empty-host-list'], migrate(context) {
    context.target.getMap('host-review').set('bytes', Uint8Array.from(context.source.getMap('host-review').get('bytes') as Uint8Array)); context.target.getArray('empty-host-list');
  }, verify(context) { expect(context.target.getMap('host-review').get('bytes')).toEqual(context.source.getMap('host-review').get('bytes')); expect(context.target.getArray('empty-host-list').length).toBe(0); } };
  const candidate = await buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies([migrator])), target = await reopen(pair, candidate);
  expect(target.document.getMap('host-review').get('bytes')).toEqual(new Uint8Array([0, 128, 255])); expect(target.document.share.get('empty-host-list')).toBeInstanceOf(Y.Array);
});

it.each(['anchor', 'selection', 'node'] as const)('refuses detached %s references instead of choosing another target', async kind => {
  const pair = fixture(); pair.document.getMap('references');
  const migrator = owner('references', context => { context.target.getMap('references'); if (kind === 'anchor') context.textAnchor({ type: { client: 999999, clock: 0 }, assoc: 1 }); else if (kind === 'selection') context.selection({ version: 1, kind: 'node', id: 'not-present' }); else context.nodeIdentity('not-present'); });
  await expect(buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies([migrator]))).rejects.toThrow(/Detached/);
});

it.each(['source', 'content', 'inventory', 'verify-inventory'] as const)('refuses a migrator changing %s outside its root contract', async kind => {
  const pair = fixture(); pair.document.getMap('notes'); const original = await pair.capture();
  const change = (context: RetainedMigrationContext) => { if (kind === 'source') context.source.getMap('notes').set('mutated', true); else if (kind === 'inventory' || kind === 'verify-inventory') context.target.getMap('unclaimed'); else { const text = [...context.target.getMap('fountain-text:texts').values()][0] as Y.Text; text.insert(1, 'WRONG', text.toDelta().find((entry: any) => typeof entry.insert === 'string')?.attributes); } };
  const migrator = owner('notes', context => { context.target.getMap('notes'); if (kind !== 'verify-inventory') change(context); }, context => { if (kind === 'verify-inventory') change(context); });
  await expect(buildRetainedMigrationCandidate(original, pair.schema, 'schema-1', policies([migrator]))).rejects.toThrow(/changed|ownership/);
  expect((await pair.capture()).manifest.checkpointSha256).toBe(original.manifest.checkpointSha256);
});

it('requires a semantic verifier and refuses a migrator that fails to produce its root', async () => {
  const pair = fixture(); pair.document.getMap('notes'); const checkpoint = await pair.capture();
  await expect(buildRetainedMigrationCandidate(checkpoint, pair.schema, 'schema-1', policies([{ name: 'missing-check', roots: ['notes'], migrate() {} } as any]))).rejects.toThrow('owner');
  await expect(buildRetainedMigrationCandidate(checkpoint, pair.schema, 'schema-1', policies([owner('notes', () => {})]))).rejects.toThrow('did not produce');
});

it('rejects a verifier that rewrites a stored selection after it has been checked', async () => {
  const pair = fixture(), selections = pair.document.getMap('saved-selections'); selections.set('cursor', retainSelection(pair.reader, pair.editor.state.doc, Selection.cursor([0, 0], 2))); pair.document.getMap('notes');
  const changed = owner('notes', context => { context.target.getMap('notes'); }, context => {
    context.target.getMap('saved-selections').set('cursor', context.source.getMap('saved-selections').get('cursor'));
  });
  await expect(buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies([retainedSelectionRootMigrator('saved-selections'), changed]))).rejects.toThrow(/changed/);
});

it('invalidates translation helpers after candidate construction', async () => {
  const pair = fixture(); pair.document.getMap('notes'); let retained: RetainedMigrationContext | undefined;
  await buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies([owner('notes', context => { retained = context; context.target.getMap('notes'); })]));
  expect(() => retained!.nodeIdentity(pair.reader.identity([0])!)).toThrow('no longer active');
});

it('snapshots policy declarations before asynchronous checkpoint validation', async () => {
  const pair = fixture(), options = { ...policies() }, checkpoint = await pair.capture();
  const pending = buildRetainedMigrationCandidate(checkpoint, pair.schema, 'schema-1', options); (options as any).history = 'preserve'; (options as any).offline = 'discard';
  expect((await pending).report).toMatchObject({ history: 'reset-with-source-checkpoint', offline: 'reconcile-before-activation' });
});

it.each(['migrate', 'verify'] as const)('rejects async %s callbacks and consumes their rejected promise', async phase => {
  const pair = fixture(); pair.document.getMap('notes');
  const migrator = owner('notes', context => { context.target.getMap('notes'); });
  (migrator as any)[phase] = async () => { throw new Error('Async extension failure'); };
  await expect(buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies([migrator]))).rejects.toThrow('synchronously');
});

it('retains source recovery while reducing accumulated CRDT wire state in an isolated fresh candidate', async () => {
  const pair = fixture(); for (let index = 0; index < 128; index++) { pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.cursor([0, 0], 2))); expect(insertText(pair.editor, 'x')).toBe(true); }
  const checkpoint = await pair.capture(), candidate = await buildRetainedMigrationCandidate(checkpoint, pair.schema, 'schema-1', policies()), target = await reopen(pair, candidate);
  expect(target.baseDocument.toJSON()).toEqual(pair.editor.getJSON()); expect(candidate.source.update).toEqual(checkpoint.update);
  expect(candidate.report.destinationBytes).toBeLessThan(candidate.report.sourceBytes); expect(candidate.report.history).toBe('reset-with-source-checkpoint');
});

it('keeps host comment anchors and named version records outside the CRDT room and usable on the identical destination model', async () => {
  const comments = new InMemoryCommentsStore(), commentsExtension = createCommentsExtension({ adapter: () => comments.createAdapter(), user: { id: 'Ada', name: 'Ada' } });
  const pair = fixture(false, [commentsExtension]), thread = await createCommentThread(pair.editor, { content: 'Check this phrase', selection: Selection.range([0, 0], 1, [0, 0], 4) });
  const provider = new InMemoryVersionProvider(), controller = new VersionController({ editor: pair.editor, provider, documentId: 'paper', user: { id: 'Ada', name: 'Ada' }, autoLoad: false, autoSave: false }); cleanups.push(() => controller.destroy());
  const saved = await controller.save({ name: 'Before room migration' }), originalVersion = await provider.load({ documentId: 'paper', versionId: saved.id }), originalThreads = comments.snapshot;
  const candidate = await buildRetainedMigrationCandidate(await pair.capture(), pair.schema, 'schema-1', policies()), target = await reopen(pair, candidate);
  const kit = composeExtensions([CoreExtension, MathExtension, panel, commentsExtension, createRetainedYjsCollaborationExtension({ document: target.document, user: { id: 'Grace', name: 'Grace', color: '#7048e8' } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content }); cleanups.push(() => editor.destroy());
  expect(editor.getJSON()).toEqual(pair.editor.getJSON()); expect(getCommentsState(editor)?.threads.find(value => value.id === thread.id)?.anchor).toEqual(thread.anchor);
  expect(comments.snapshot).toEqual(originalThreads); expect(await provider.load({ documentId: 'paper', versionId: saved.id })).toEqual(originalVersion);
  expect(candidate.report.externalState).toBe('host-coordinated');
});
