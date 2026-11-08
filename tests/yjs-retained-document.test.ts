// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, EditorState, MathExtension, ReplaceDocumentStep, Schema, Selection, composeExtensions, createEditor, createHistoryPlugin, defineExtension, moveBlock, setMark, splitBlock, toggleList, toggleQuote, undo, redo,
  type NodeJSON, type Transaction } from '../src';
import { RetainedDocumentStore, validateRetainedDocument } from '../src/yjs/retained-document';
import { Mark as ModelMark } from '../src/core/schema/mark';
import { Node as ModelNode } from '../src/core/schema/node';
import { ReplaceTextStep } from '../src/core/transaction/replace-text-step';
import { StepMap, textPointToPosition } from '../src/core/transaction/mapping';
import { getNodeAtPath } from '../src/core/transaction/path';
import { retainedNameKey } from '../src/yjs/retained-nodes';

const factory = (prefix: string) => { let index = 0; return () => `${prefix}-${index++}`; };
const source: NodeJSON = { type: 'doc', attrs: { audit: { keep: true } }, content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
  { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure' } },
] };
function fixture(content: NodeJSON = source, clientID = 101, extensions: Parameters<typeof composeExtensions>[0] = [CoreExtension]) {
  const kit = composeExtensions(extensions), doc = new Y.Doc();
  doc.clientID = clientID;
  const transactions: Transaction[] = [];
  const editor = createEditor({ schema: kit.schema, content, plugins: [createHistoryPlugin({ newGroupDelay: 0 })], onUpdate: (_state, transaction) => {
    if (transaction.docChanged) transactions.push(transaction);
  } });
  const store = new RetainedDocumentStore(doc, 'candidate', editor.state.schema, factory('left'));
  store.seed(editor.state.doc);
  return { doc, editor, store, transactions, apply: () => store.apply(transactions.at(-1)!),
    destroy: () => { editor.destroy(); store.destroy(); doc.destroy(); } };
}
function peers(content = source, reverseIDs = false) {
  const left = fixture(content, reverseIDs ? 202 : 101), doc = new Y.Doc();
  doc.clientID = reverseIDs ? 101 : 202;
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(left.doc));
  const kit = composeExtensions([CoreExtension]), transactions: Transaction[] = [];
  const editor = createEditor({ schema: kit.schema, content: left.editor.getJSON(), onUpdate: (_state, transaction) => {
    if (transaction.docChanged) transactions.push(transaction);
  } });
  const store = new RetainedDocumentStore(doc, 'candidate', editor.state.schema, factory('right'));
  store.read();
  return { left, right: { doc, editor, store, apply: () => store.apply(transactions.at(-1)!) }, sync: (reverse: boolean) => {
    const a = Y.encodeStateAsUpdate(left.doc), b = Y.encodeStateAsUpdate(doc);
    if (reverse) { Y.applyUpdate(doc, a, 'peer'); Y.applyUpdate(left.doc, b, 'peer'); }
    else { Y.applyUpdate(left.doc, b, 'peer'); Y.applyUpdate(doc, a, 'peer'); }
  }, destroy: () => { left.destroy(); editor.destroy(); store.destroy(); doc.destroy(); } };
}

function boundsSchema() {
  return new Schema({ nodes: { doc: { content: 'block*' }, text: { group: 'inline' },
    paragraph: { group: 'block', content: 'inline*' }, box: { group: 'block', content: 'block*' }, leaf: { group: 'block', atom: true } },
    marks: { strong: {} } });
}

it('refuses an empty required wrapper without evidence of a displaced child', () => {
  const pair = fixture();
  try {
    pair.store.nodes.create({ type: 'blockquote' }, 'root', 0);
    expect(() => pair.store.read()).toThrow('Content of blockquote does not match "block+".');
  } finally { pair.destroy(); }
});

it('counts a reused portable subtree at its actual new depth', () => {
  const schema = boundsSchema(); let branch = schema.node('leaf');
  for (let index = 0; index < 99; index++) branch = schema.node('box', {}, [branch]);
  const original = schema.node('doc', {}, [branch]); validateRetainedDocument(original, schema);
  expect(() => validateRetainedDocument(original.copy([schema.node('box', {}, [branch])]), schema)).toThrow('Retained document is too large.');
});

it('counts every occurrence of a reused portable subtree toward the node limit', () => {
  const schema = boundsSchema(), leaf = schema.node('leaf'), branch = schema.node('box', {}, Array(9999).fill(leaf));
  validateRetainedDocument(schema.node('doc', {}, [branch]), schema);
  validateRetainedDocument(schema.node('doc', {}, Array(9).fill(branch)), schema);
  expect(() => validateRetainedDocument(schema.node('doc', {}, Array(10).fill(branch)), schema)).toThrow('Retained document is too large.');
});

it('counts cached text occurrences and new text against the unchanged character limit', () => {
  const schema = boundsSchema(), text = schema.text('x'.repeat(1_000_000)), paragraph = schema.node('paragraph', {}, Array(10).fill(text));
  validateRetainedDocument(schema.node('doc', {}, [paragraph]), schema);
  expect(() => validateRetainedDocument(schema.node('doc', {}, [paragraph, schema.node('paragraph', {}, [schema.text('x')])]), schema)).toThrow('Retained document is too large.');
});

it('invalidates portable summaries when a retained node type name changes', () => {
  const schema = boundsSchema(), document = schema.node('doc', {}, [schema.node('leaf')]), type = schema.nodes.leaf as { name: string }, name = type.name;
  validateRetainedDocument(document, schema);
  try { type.name = 'x'.repeat(201); expect(() => validateRetainedDocument(document, schema)).toThrow('Retained node metadata exceeds the candidate storage bounds.'); }
  finally { type.name = name; }
  validateRetainedDocument(document, schema);
});

it('invalidates portable text summaries when a mark name exceeds the wire key limit', () => {
  const schema = boundsSchema(), document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Alpha', [schema.mark('strong')])])]);
  const type = schema.marks.strong as { name: string }, name = type.name; validateRetainedDocument(document, schema);
  try { type.name = 'm'.repeat(600); expect(() => validateRetainedDocument(document, schema)).toThrow('Invalid retained text attribute.'); }
  finally { type.name = name; }
  validateRetainedDocument(document, schema);
});

it('keeps live host-array serialization outside the portable summary cache', () => {
  let oversized = false;
  class HostArray extends Array<number> { toJSON() { return oversized ? 'x'.repeat(1_000_001) : [1, 2]; } }
  const schema = boundsSchema(), document = schema.node('doc', {}, [schema.node('leaf', { values: new HostArray(1, 2) })]);
  validateRetainedDocument(document, schema); oversized = true;
  expect(() => validateRetainedDocument(document, schema)).toThrow('Retained node value is too large.');
});

it('keeps later cached nodes live when a host serializer changes their type name', () => {
  const schema = boundsSchema(), type = schema.nodes.leaf as { name: string }, originalName = type.name;
  let armed = false;
  class HostArray extends Array<number> { toJSON() { if (armed) type.name = 'x'.repeat(201); return [1, 2]; } }
  const leaf = schema.node('leaf'); validateRetainedDocument(schema.node('doc', {}, [leaf]), schema);
  const changed = schema.node('doc', {}, [schema.node('box', { values: new HostArray(1, 2) }), leaf]);
  try { armed = true; expect(() => validateRetainedDocument(changed, schema)).toThrow('Retained node metadata exceeds the candidate storage bounds.'); }
  finally { type.name = originalName; }
});

it('keeps custom mark serializers outside the portable summary cache', () => {
  let oversized = false;
  class HostMark extends ModelMark { override toJSON() { return oversized ? { type: this.type.name, attrs: { payload: 'x'.repeat(1_000_001) } } : super.toJSON(); } }
  const schema = boundsSchema(), document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Alpha', [new HostMark(schema.marks.strong)])])]);
  validateRetainedDocument(document, schema); oversized = true;
  expect(() => validateRetainedDocument(document, schema)).toThrow('Retained node value is too large.');
});

it('does not certify mutable untyped text payloads as immutable character bounds', () => {
  const schema = boundsSchema(), payload = { length: 4 }, text = schema.nodes.text.create({}, [], payload as unknown as string);
  const document = schema.node('doc', {}, [schema.node('paragraph', {}, [text])]);
  validateRetainedDocument(document, schema); payload.length = 10_000_001;
  expect(() => validateRetainedDocument(document, schema)).toThrow('Retained document is too large.');
});

it('rechecks live mark serialization after a prototype serializer changes', () => {
  const schema = boundsSchema(), document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Alpha', [schema.mark('strong')])])]);
  validateRetainedDocument(document, schema); const serialize = ModelMark.prototype.toJSON;
  try {
    ModelMark.prototype.toJSON = function () { return { type: this.type.name, attrs: { payload: 'x'.repeat(1_000_001) } }; };
    expect(() => validateRetainedDocument(document, schema)).toThrow('Retained node value is too large.');
  } finally { ModelMark.prototype.toJSON = serialize; }
});

it('inspects serializer eligibility without invoking a prototype getter', () => {
  const schema = boundsSchema(), document = schema.node('doc', {}, [schema.node('leaf')]); validateRetainedDocument(document, schema);
  const descriptor = Object.getOwnPropertyDescriptor(ModelMark.prototype, 'toJSON')!; let calls = 0;
  try {
    Object.defineProperty(ModelMark.prototype, 'toJSON', { configurable: true, get: () => { calls++; return descriptor.value; } });
    validateRetainedDocument(document, schema); expect(calls).toBe(0);
  } finally { Object.defineProperty(ModelMark.prototype, 'toJSON', descriptor); }
});

it('always invokes the supplied schema after portable metadata has been certified', () => {
  const schema = boundsSchema(), document = schema.node('doc', {}, [schema.node('leaf')]); validateRetainedDocument(document, schema);
  const policy = vi.spyOn(schema, 'validate').mockImplementation(() => { throw new Error('Host validation policy'); });
  try { expect(() => validateRetainedDocument(document, schema)).toThrow('Host validation policy'); }
  finally { policy.mockRestore(); }
});

it('validates newly introduced metadata even when sibling portable subtrees are certified', () => {
  const schema = boundsSchema(), sibling = schema.node('leaf'), document = schema.node('doc', {}, [sibling]); validateRetainedDocument(document, schema);
  const changed = document.copy([sibling, schema.node('leaf', { unsupported: () => true })]);
  expect(() => validateRetainedDocument(changed, schema)).toThrow('Retained metadata must be portable JSON.');
});

it('reuses unchanged immutable model branches after fresh projection and retains changed bindings', () => {
  const pair = fixture({ ...source, content: [source.content![0], { type: 'paragraph', content: [{ type: 'text', text: 'Beta', marks: [{ type: 'strong' }] }] }, source.content![1]] });
  try {
    const first = pair.store.read(); expect(pair.store.read()).toBe(first);
    const transaction = pair.editor.createTransaction().insertText([0, 0], 2, 'X'), second = pair.store.apply(transaction);
    expect(second.toJSON()).toEqual(transaction.doc.toJSON()); expect(second.child(0)).not.toBe(first.child(0));
    expect(second.child(1)).toBe(first.child(1)); expect(second.child(1).child(0)).toBe(first.child(1).child(0)); expect(second.child(2)).toBe(first.child(2));
    const anchor = pair.store.textAnchor([0, 0], 3, 1); expect(pair.store.resolveTextAnchor(anchor)).toEqual({ path: [0, 0], offset: 3 });
  } finally { pair.destroy(); }
});

const nestedBindings: { name: string; block: NodeJSON; path: number[] }[] = [
  { name: 'quote', block: { type: 'blockquote', content: [source.content![0]] }, path: [0, 0, 0] },
  { name: 'list', block: { type: 'bullet_list', content: [{ type: 'list_item', content: [source.content![0]] }] }, path: [0, 0, 0, 0] },
  { name: 'table', block: { type: 'table', content: [{ type: 'table_row', content: [{ type: 'table_cell', content: [source.content![0]] }] }] }, path: [0, 0, 0, 0, 0] },
];
for (const association of [-1, 1] as const) it.each(nestedBindings)(`retains nested $name cursor ownership through typing, movement and collaborative undo (association ${association})`, ({ block, path }) => {
  const pair = fixture({ ...source, content: [block, source.content![0], source.content![1]] });
  const manager = new Y.UndoManager([...pair.store.scope], { captureTimeout: 0 });
  try {
    const identity = pair.store.identity(path.slice(0, -1))!, oldPath = pair.store.path(identity)!;
    expect(Object.isFrozen(oldPath)).toBe(true); expect(oldPath).toEqual(path.slice(0, -1));
    const anchor = pair.store.textAnchor(path, 2, association);
    pair.editor.dispatch(pair.editor.createTransaction().insertText(path, 2, 'X')); const typed = pair.apply();
    expect(pair.store.resolveTextAnchor(anchor)).toEqual({ path, offset: association < 0 ? 2 : 3 });
    expect(moveBlock(pair.editor, 0, 2)).toBe(true); pair.apply();
    const moved = [2, ...path.slice(1)];
    expect(pair.store.resolveTextAnchor(anchor)).toEqual({ path: moved, offset: association < 0 ? 2 : 3 });
    expect(pair.store.path(identity)).toEqual(moved.slice(0, -1)); expect(oldPath).toEqual(path.slice(0, -1));
    expect(Object.isFrozen(pair.store.path(identity))).toBe(true);
    expect(manager.undo()).not.toBeNull(); expect(pair.store.read().toJSON()).toEqual(typed.toJSON());
    expect(pair.store.resolveTextAnchor(anchor)).toEqual({ path, offset: association < 0 ? 2 : 3 });
    expect(manager.redo()).not.toBeNull(); pair.store.read();
    expect(pair.store.resolveTextAnchor(anchor)).toEqual({ path: moved, offset: association < 0 ? 2 : 3 });
    expect(pair.store.read().toJSON()).toEqual(pair.editor.getJSON());
    expect(getNodeAtPath(pair.store.read(), [0, 0]).text).toBe('Alpha');
  } finally { manager.destroy(); pair.destroy(); }
});

it('keeps colon-bearing shared identities distinct when only one equal text leaf is edited', () => {
  const kit = composeExtensions([CoreExtension]), doc = new Y.Doc(), editor = createEditor({ schema: kit.schema, content: {
    ...source, content: [source.content![0], source.content![0], source.content![1]],
  } });
  let index = 0;
  const store = new RetainedDocumentStore(doc, 'colons', editor.state.schema, () => `part:${index++}:12.3`);
  try {
    store.seed(editor.state.doc); const first = store.read(), left = store.textAnchor([0, 0], 2, 1), right = store.textAnchor([1, 0], 2, 1);
    expect(first.child(0).child(0)).not.toBe(first.child(1).child(0));
    const transaction = editor.createTransaction().insertText([0, 0], 2, 'X'); editor.dispatch(transaction); store.apply(transaction);
    expect(store.resolveTextAnchor(left)).toEqual({ path: [0, 0], offset: 3 });
    expect(store.resolveTextAnchor(right)).toEqual({ path: [1, 0], offset: 2 });
    expect(store.read().content.slice(0, 2).map(node => node.textContent)).toEqual(['AlXpha', 'Alpha']);
  } finally { store.destroy(); editor.destroy(); doc.destroy(); }
});

it('reads newly supplied text attribute rules after an earlier attribute-free projection', () => {
  const kit = composeExtensions([CoreExtension]), textSpec = { ...kit.schema.nodes.text };
  const schema = new Schema({ ...kit.schema, nodes: { ...kit.schema.nodes, text: textSpec } });
  const doc = new Y.Doc(), original = schema.nodeFromJSON(source), store = new RetainedDocumentStore(doc, 'live-text-rules', schema, factory('live-text-rules'));
  let allowed = true;
  try {
    store.seed(original); expect(store.read().child(0).child(0).attrs.token).toBeUndefined();
    const saved = Y.encodeStateAsUpdate(doc);
    textSpec.attrs = { token: { default: 'fresh', validate: () => allowed } };
    expect(store.read().child(0).child(0).attrs.token).toBe('fresh');
    allowed = false; expect(() => store.read()).toThrow('Invalid value for attribute: token');
    allowed = true; expect(store.read().child(0).child(0).attrs.token).toBe('fresh');
    expect(Y.encodeStateAsUpdate(doc)).toEqual(saved);
  } finally { store.destroy(); doc.destroy(); }
});

it('accepts equivalent reordered metadata through native editing and exact save/reopen', () => {
  const pair = fixture({ ...source, attrs: { zeta: { second: 2, first: 1 }, alpha: true } });
  const reopenedDoc = new Y.Doc();
  try {
    const transaction = pair.editor.createTransaction().insertText([0, 0], 2, 'X');
    const result = pair.store.apply(transaction);
    expect(result.eq(transaction.doc)).toBe(false); // The factories retain different key orders.
    expect(result.toJSON()).toEqual(transaction.doc.toJSON());
    Y.applyUpdate(reopenedDoc, Y.encodeStateAsUpdate(pair.doc));
    const reopened = new RetainedDocumentStore(reopenedDoc, 'candidate', pair.editor.state.schema, factory('reordered'));
    try { expect(reopened.read().toJSON()).toEqual(transaction.doc.toJSON()); } finally { reopened.destroy(); }
  } finally { reopenedDoc.destroy(); pair.destroy(); }
});

it('rejects unexpected shared metadata written during a native text operation', () => {
  const pair = fixture(), insert = pair.store.text.insert.bind(pair.store.text);
  try {
    pair.store.text.insert = (...args) => { insert(...args); pair.store.nodes.setAttribute('root', 'unexpected', true); };
    const transaction = pair.editor.createTransaction().insertText([0, 0], 2, 'X');
    expect(() => pair.store.apply(transaction)).toThrow('Retained transaction changed the native document shape.');
    expect(pair.store.read().attrs.unexpected).toBe(true);
  } finally { pair.destroy(); }
});

it('invalidates checked shared frames after a committed malformed metadata edit', () => {
  const pair = fixture();
  try {
    pair.doc.getMap('candidate-nodes:root').set('attr:' + retainedNameKey('malformed'), '{');
    expect(() => pair.store.apply(pair.editor.createTransaction().insertText([0, 0], 2, 'X'))).toThrow();
    expect(pair.doc.getMap('candidate-nodes:root').get('attr:' + retainedNameKey('malformed'))).toBe('{');
  } finally { pair.destroy(); }
});

it('does not hide deletion-only changes in an unedited shared stream', () => {
  const pair = fixture({ ...source, content: [source.content![0], { type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] }] });
  try {
    const field = pair.store.nodes.project().root.content[1].content[0].id, vector = Y.encodeStateVector(pair.doc);
    pair.store.text.delete(field, 0, 1); expect(Y.encodeStateVector(pair.doc)).toEqual(vector);
    expect(() => pair.store.apply(pair.editor.createTransaction().insertText([0, 0], 2, 'X'))).toThrow('Retained transaction changed the native document shape.');
    expect(pair.store.read().child(1).textContent).toBe('eta');
  } finally { pair.destroy(); }
});

it('refreshes all shared-stream partition coordinates after an eligible local edit', () => {
  const pair = fixture(), control = new RetainedDocumentStore(pair.doc, 'candidate', pair.editor.state.schema, factory('coordinates'));
  try {
    pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(splitBlock(pair.editor)).toBe(true); pair.apply();
    const first = pair.store.apply(pair.editor.createTransaction().insertText([0, 0], 1, 'X'));
    expect(first.toJSON()).toEqual(control.read().toJSON()); expect(first.content.slice(0, 2).map(node => node.textContent)).toEqual(['AXl', 'pha']);
    const state = EditorState.create({ schema: pair.editor.state.schema, doc: first });
    const second = pair.store.apply(state.createTransaction().insertText([1, 0], 1, 'Y'));
    expect(second.toJSON()).toEqual(control.read().toJSON()); expect(second.child(1).textContent).toBe('pYha');
    expect(pair.store.resolveTextAnchor(pair.store.textAnchor([1, 0], 2, 1))).toEqual({ path: [1, 0], offset: 2 });
  } finally { control.destroy(); pair.destroy(); }
});

it.each(['insert', 'delete'] as const)('detects an extra same-stream %s during cached normalization', kind => {
  const kit = composeExtensions([CoreExtension]), document = new Y.Doc();
  let armed = false, written = false, field = '';
  let store: RetainedDocumentStore;
  const schema = new Schema({ ...kit.schema, nodes: { ...kit.schema.nodes, text: { ...kit.schema.nodes.text,
    validate: node => {
      if (armed && !written && node.text === 'AlXpha') {
        written = true; const vector = Y.encodeStateVector(document);
        if (kind === 'delete') { store.text.delete(field, 5, 6); expect(Y.encodeStateVector(document)).toEqual(vector); }
        else store.text.insert(field, 6, 'Y', store.text.project(field).runs[0].attributes);
      }
      return true;
    } } } });
  const original = schema.nodeFromJSON(source); store = new RetainedDocumentStore(document, 'versions', schema, factory('versions'));
  try {
    store.seed(original); field = store.nodes.project().root.content[0].content[0].id;
    const insert = store.text.insert.bind(store.text); store.text.insert = (...args) => { insert(...args); armed = true; };
    const transaction = EditorState.create({ schema, doc: original }).createTransaction().insertText([0, 0], 2, 'X');
    expect(() => store.apply(transaction)).toThrow('Retained transaction changed the native document shape.');
    expect(written).toBe(true); expect(store.read().child(0).textContent).toBe(kind === 'delete' ? 'AlXph' : 'AlXphaY');
  } finally { store.destroy(); document.destroy(); }
});

it('reruns off-path factory validators during checked frame normalization', () => {
  let valid = true;
  const extension = defineExtension({ name: 'frame-guarded', nodes: { guarded: { group: 'block', atom: true,
    attrs: { token: { default: 'ok', validate: () => valid } } } } });
  const pair = fixture({ ...source, content: [source.content![0], { type: 'guarded' }] }, 101, [CoreExtension, extension]);
  try {
    const insert = pair.store.text.insert.bind(pair.store.text); pair.store.text.insert = (...args) => { insert(...args); valid = false; };
    expect(() => pair.store.apply(pair.editor.createTransaction().insertText([0, 0], 2, 'X'))).toThrow('Invalid value for attribute: token');
  } finally { pair.destroy(); }
});

it('releases its shared-frame listener while the caller retains the Yjs document', () => {
  const kit = composeExtensions([CoreExtension]), document = new Y.Doc(), on = vi.spyOn(document, 'on'), off = vi.spyOn(document, 'off');
  const editor = createEditor({ schema: kit.schema, content: source }), store = new RetainedDocumentStore(document, 'release', editor.state.schema, factory('release'));
  try {
    const added = on.mock.calls.filter(([name]) => name === 'afterTransaction').map(([, listener]) => listener);
    expect(added).toHaveLength(1); store.seed(editor.state.doc); store.destroy();
    expect(off.mock.calls.some(([name, listener]) => name === 'afterTransaction' && listener === added[0])).toBe(true);
    document.getMap('host-data').set('alive', true); expect(document.getMap('host-data').get('alive')).toBe(true);
  } finally { store.destroy(); editor.destroy(); document.destroy(); }
});

it('does not introduce duplicate model identity when the input reuses the same immutable node twice', () => {
  const pair = fixture(), document = new Y.Doc(), store = new RetainedDocumentStore(document, 'duplicate', pair.editor.state.schema, factory('duplicate'));
  try {
    const paragraph = pair.editor.state.doc.child(0), original = pair.editor.state.doc.copy([paragraph, paragraph]); store.seed(original);
    const result = store.read(); expect(result.toJSON()).toEqual(original.toJSON());
    expect(result.child(0)).not.toBe(result.child(1)); expect(result.child(0).child(0)).not.toBe(result.child(1).child(0));
    for (const path of [[0, 0], [1, 0]]) expect(store.resolveTextAnchor(store.textAnchor(path, 2, 1))).toEqual({ path, offset: 2 });
  } finally { store.destroy(); document.destroy(); pair.destroy(); }
});

it('keeps equal text in independently owned blocks distinct through a pending move', () => {
  const pair = fixture({ ...source, content: [source.content![0], source.content![0], source.content![1]] });
  try {
    const before = pair.store.read(), moved = pair.store.identity([1])!;
    pair.doc.transact(() => {
      pair.store.nodes.move(moved, 'root', 0); const after = pair.store.read();
      expect(after.child(0)).toBe(before.child(1)); expect(after.child(1)).toBe(before.child(0));
      expect(after.child(0)).not.toBe(after.child(1)); expect(after.child(0).child(0)).not.toBe(after.child(1).child(0));
      expect(pair.store.resolveTextAnchor(pair.store.textAnchor([0, 0], 2, 1))).toEqual({ path: [0, 0], offset: 2 });
    });
  } finally { pair.destroy(); }
});

it('runs attribute and whole-node factory validators again before reusing an immutable value', () => {
  let attribute = true, invariant = true;
  const extension = defineExtension({ name: 'reuse-guard', nodes: { guarded: { group: 'block', atom: true,
    attrs: { token: { default: 'ok', validate: value => attribute && value === 'ok' } }, validate: () => invariant } } });
  const pair = fixture({ type: 'doc', content: [{ type: 'guarded' }] }, 101, [CoreExtension, extension]);
  try {
    const first = pair.store.read(); attribute = false; expect(() => pair.store.read()).toThrow('Invalid value for attribute: token');
    attribute = true; invariant = false; expect(() => pair.store.read()).toThrow('Invalid node invariant: guarded');
    invariant = true; expect(pair.store.read().toJSON()).toEqual(first.toJSON());
  } finally { pair.destroy(); }
});

it('does not reuse a model containing a mutable host default or hide its later invariant failure', () => {
  class HostValue { valid = true; }
  const value = new HostValue(), extension = defineExtension({ name: 'host-default', nodes: { hosted: { group: 'block', atom: true,
    attrs: { host: { default: value } }, validate: node => node.attrs.host === 0 || (node.attrs.host as HostValue).valid } } });
  const pair = fixture({ type: 'doc', content: [{ type: 'hosted', attrs: { host: 0 } }] }, 101, [CoreExtension, extension]);
  try {
    pair.store.nodes.setAttribute(pair.store.identity([0])!, 'host', undefined);
    const first = pair.store.read(), second = pair.store.read(); expect(first.child(0).attrs.host).toBe(value); expect(second.child(0)).not.toBe(first.child(0));
    value.valid = false; expect(() => pair.store.read()).toThrow('Invalid node invariant: hosted');
    value.valid = true; expect(pair.store.read().child(0).attrs.host).toBe(value);
  } finally { pair.destroy(); }
});

it('matches uncached factory normalization and JSON key order after reordered model metadata', () => {
  const extension = defineExtension({ name: 'ordered-defaults', nodes: { ordered_defaults: { group: 'block', atom: true,
    attrs: { zeta: { default: 1 }, alpha: { default: 2 } } } } });
  const pair = fixture({ type: 'doc', attrs: { zeta: 1, alpha: 2 }, content: [{ type: 'ordered_defaults' },
    { type: 'paragraph', attrs: { zeta: 1, alpha: 2 }, content: [{ type: 'text', text: 'Alpha', attrs: { zeta: 1, alpha: 2 } }] }] }, 101, [CoreExtension, extension]);
  const control = new RetainedDocumentStore(pair.doc, 'candidate', pair.editor.state.schema, factory('control'));
  try {
    const before = pair.store.read(), fresh = control.read(); expect(JSON.stringify(before.toJSON())).toBe(JSON.stringify(fresh.toJSON()));
    pair.store.nodes.setAttribute(pair.store.identity([0])!, 'zeta', undefined);
    expect(JSON.stringify(pair.store.read().toJSON())).toBe(JSON.stringify(control.read().toJSON()));
  } finally { control.destroy(); pair.destroy(); }
});

it('does not preserve an input array subclass in place of the freshly decoded portable array', () => {
  class HostArray extends Array<number> {}
  const extension = defineExtension({ name: 'portable-array', nodes: { array_item: { group: 'block', atom: true, attrs: { tags: { default: [] } } } } });
  const pair = fixture({ type: 'doc', content: [{ type: 'array_item', attrs: { tags: new HostArray(1, 2) } }] }, 101, [CoreExtension, extension]);
  try {
    expect(pair.editor.state.doc.child(0).attrs.tags).toBeInstanceOf(HostArray);
    const result = pair.store.read(); expect(result.child(0).attrs.tags).toEqual([1, 2]);
    expect(Object.getPrototypeOf(result.child(0).attrs.tags)).toBe(Array.prototype);
    expect(result.child(0)).not.toBe(pair.editor.state.doc.child(0));
  } finally { pair.destroy(); }
});

it('still validates each custom text run before merging split partitions with the same logical leaf', () => {
  const kit = composeExtensions([CoreExtension]), schema = new Schema({ ...kit.schema, nodes: { ...kit.schema.nodes,
    text: { ...kit.schema.nodes.text, validate: node => node.text === 'Alpha' } } });
  const document = new Y.Doc(), store = new RetainedDocumentStore(document, 'runs', schema, factory('runs')), original = schema.nodeFromJSON(source);
  try {
    store.seed(original); const parent = store.identity([0])!, field = store.nodes.project().root.content[0].content[0].id;
    const second = store.nodes.create({ type: 'text', textLayout: { field, empty: false } }, parent, 1); store.text.split(field, second, 2);
    const before = Y.encodeStateAsUpdate(document); expect(() => store.read(false)).toThrow('Invalid node invariant: text'); expect(Y.encodeStateAsUpdate(document)).toEqual(before);
    store.text.join(field, second); store.nodes.remove(second); expect(store.read().toJSON()).toEqual(original.toJSON());
  } finally { store.destroy(); document.destroy(); }
});

it('snapshots text defaults before a later mark validator changes a mutable default source', () => {
  const value = { version: 1 }; let calls = 0;
  const kit = composeExtensions([CoreExtension]), schema = new Schema({ ...kit.schema, nodes: { ...kit.schema.nodes,
    text: { ...kit.schema.nodes.text, attrs: { snapshot: { default: value } } } }, marks: { ...kit.schema.marks,
    source_mark: { attrs: { token: { default: 0, validate: () => { if (++calls === 2) value.version = 2; return true; } } } } } });
  const document = new Y.Doc(), store = new RetainedDocumentStore(document, 'snapshots', schema, factory('snapshots'));
  const original = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha', marks: [{ type: 'source_mark' }] }] }] });
  try {
    store.seed(original); const parent = store.identity([0])!, field = store.nodes.project().root.content[0].content[0].id;
    const second = store.nodes.create({ type: 'text', textLayout: { field, empty: false } }, parent, 1); store.text.split(field, second, 2);
    for (const [id, length] of [[field, 2], [second, 3]] as const) store.text.format(id, 0, length, { ['a_' + retainedNameKey('snapshot')]: null });
    calls = 0; value.version = 1;
    const result = store.read(false); expect(result.child(0).content.map(node => ({ text: node.text, snapshot: node.attrs.snapshot }))).toEqual([
      { text: 'Al', snapshot: { version: 1 } }, { text: 'pha', snapshot: { version: 2 } },
    ]);
  } finally { store.destroy(); document.destroy(); }
});

it('rejects newly malformed shared metadata after a successful reused read and recovers without repair writes', () => {
  const pair = fixture();
  try {
    const first = pair.store.read(), root = pair.doc.getMap('candidate-nodes:root'), key = 'attr:' + retainedNameKey('audit'), original = root.get(key);
    root.set(key, '{'); const before = Y.encodeStateAsUpdate(pair.doc); expect(() => pair.store.read()).toThrow(); expect(Y.encodeStateAsUpdate(pair.doc)).toEqual(before);
    root.set(key, original); expect(pair.store.read().toJSON()).toEqual(first.toJSON());
  } finally { pair.destroy(); }
});

it.each([
  { name: 'prefix insertion', from: 0, to: 0, text: 'X' },
  { name: 'suffix insertion', from: 5, to: 5, text: 'X' },
  { name: 'partial deletion', from: 1, to: 3, text: '' },
  { name: 'partial replacement', from: 1, to: 3, text: 'Ω' },
  { name: 'same-text replacement', from: 1, to: 3, text: 'lp' },
  { name: 'literal Unicode', from: 2, to: 2, text: '👩‍💻e\u0301\u200B' },
  { name: 'full replacement', from: 0, to: 5, text: 'Beta' },
  { name: 'first typing', initial: '', from: 0, to: 0, text: 'X' },
  { name: 'emptying a leaf', from: 0, to: 5, text: '' },
  { name: 'first mixed-mark fragment', mixed: true, from: 0, to: 0, text: 'X' },
  { name: 'second mixed-mark fragment', mixed: true, second: true, from: 1, to: 2, text: 'X' },
  { name: 'declared whole-leaf replacement map', fullMap: true, from: 1, to: 3, text: 'X' },
])('matches general shared state and author history for $name', row => {
  const content: NodeJSON = { ...source, content: [{ ...source.content![0], attrs: { owner: 'Ada' }, content: row.mixed ? [
    { type: 'text', text: 'A' }, { type: 'text', text: 'lpha', marks: [{ type: 'strong' }] },
  ] : [{ type: 'text', text: row.initial ?? 'Alpha', attrs: { literal: { keep: ['β', null] } }, marks: [{ type: 'strong' }] }] }, source.content![1]] };
  const direct = fixture(content), general = fixture(content), path = [0, row.second ? 1 : 0];
  class DeclaredTextStep extends ReplaceTextStep {
    override getMap(document: Parameters<ReplaceTextStep['apply']>[0]) {
      return row.fullMap ? new StepMap([textPointToPosition(document, this.path, 0), getNodeAtPath(document, this.path).nodeSize,
        getNodeAtPath(document, this.path).nodeSize - (this.to - this.from) + this.text.length]) : super.getMap(document);
    }
  }
  class GeneralTextStep extends DeclaredTextStep { override apply(document: Parameters<ReplaceTextStep['apply']>[0]) { return super.apply(document); } }
  const histories = [direct, general].map(pair => new Y.UndoManager([...pair.store.scope], { captureTimeout: 0 }));
  try {
    const initial = Y.encodeStateAsUpdate(direct.doc);
    const first = direct.editor.createTransaction().step(new DeclaredTextStep(path, row.from, row.to, row.text));
    const second = general.editor.createTransaction().step(new GeneralTextStep(path, row.from, row.to, row.text));
    expect(direct.store.apply(first).toJSON()).toEqual(first.doc.toJSON()); expect(general.store.apply(second).toJSON()).toEqual(second.doc.toJSON());
    expect(Y.encodeStateAsUpdate(direct.doc)).toEqual(Y.encodeStateAsUpdate(general.doc));
    if (row.name === 'same-text replacement') {
      expect(first.steps).toHaveLength(0); expect(second.steps).toHaveLength(0);
      expect(Y.encodeStateAsUpdate(direct.doc)).toEqual(initial);
      for (const history of histories) { expect(history.undoStack).toHaveLength(0); expect(history.redoStack).toHaveLength(0); expect(history.undo()).toBeNull(); }
      return;
    }
    for (const history of histories) expect(history.undo()).toBeTruthy();
    expect(direct.store.read().toJSON()).toEqual(direct.editor.getJSON()); expect(general.store.read().toJSON()).toEqual(general.editor.getJSON());
    expect(Y.encodeStateAsUpdate(direct.doc)).toEqual(Y.encodeStateAsUpdate(general.doc));
    for (const history of histories) expect(history.redo()).toBeTruthy();
    expect(direct.store.read().toJSON()).toEqual(first.doc.toJSON()); expect(general.store.read().toJSON()).toEqual(second.doc.toJSON());
    expect(Y.encodeStateAsUpdate(direct.doc)).toEqual(Y.encodeStateAsUpdate(general.doc));
  } finally { histories.forEach(history => history.destroy()); direct.destroy(); general.destroy(); }
});

it('preserves additional metadata intent from a custom text transformation', () => {
  const pair = fixture();
  class AnnotatedTextStep extends ReplaceTextStep {
    override apply(document: Parameters<ReplaceTextStep['apply']>[0]) { return super.apply(document).withAttrs({ ...document.attrs, annotated: true }); }
  }
  try {
    const transaction = pair.editor.createTransaction().step(new AnnotatedTextStep([0, 0], 2, 2, 'X'));
    expect(pair.store.apply(transaction).toJSON()).toEqual(transaction.doc.toJSON()); expect(pair.store.read().attrs.annotated).toBe(true);
  } finally { pair.destroy(); }
});

it('falls back when an inherited native text primitive changes leaf metadata', () => {
  const pair = fixture(), withText = ModelNode.prototype.withText;
  try {
    ModelNode.prototype.withText = function (text) { return withText.call(this, text).withAttrs({ ...this.attrs, annotation: true }); };
    const transaction = pair.editor.createTransaction().insertText([0, 0], 2, 'X'), result = pair.store.apply(transaction);
    expect(result.toJSON()).toEqual(transaction.doc.toJSON()); expect(result.child(0).child(0).attrs.annotation).toBe(true);
  } finally { ModelNode.prototype.withText = withText; pair.destroy(); }
});

it('falls back when native ancestor copying changes an otherwise unedited sibling', () => {
  const pair = fixture(), copy = ModelNode.prototype.copy;
  try {
    ModelNode.prototype.copy = function (this: ModelNode, content = this.content) {
      const result = copy.call(this, content);
      return this.type.name === 'doc' && result.childCount > 1
        ? copy.call(result, [result.child(0), result.child(1).withAttrs({ ...result.child(1).attrs, annotation: true })]) : result;
    };
    const transaction = pair.editor.createTransaction().insertText([0, 0], 2, 'X'), result = pair.store.apply(transaction);
    expect(result.toJSON()).toEqual(transaction.doc.toJSON()); expect(result.child(1).attrs.annotation).toBe(true);
  } finally { ModelNode.prototype.copy = copy; pair.destroy(); }
});

it('retains generic composed-map semantics and author history for an otherwise native text operation', () => {
  const direct = fixture(), composed = fixture();
  class ComposedTextStep extends ReplaceTextStep { override getMaps(document: Parameters<ReplaceTextStep['apply']>[0]) { return [super.getMap(document), StepMap.empty]; } }
  const histories = [direct, composed].map(pair => new Y.UndoManager([...pair.store.scope], { captureTimeout: 0 }));
  try {
    const target = direct.editor.createTransaction().insertText([0, 0], 2, 'X');
    expect(direct.store.apply(target).toJSON()).toEqual(target.doc.toJSON());
    const other = composed.editor.createTransaction().step(new ComposedTextStep([0, 0], 2, 2, 'X'));
    expect(composed.store.apply(other).toJSON()).toEqual(other.doc.toJSON()); expect(Y.encodeStateAsUpdate(direct.doc)).toEqual(Y.encodeStateAsUpdate(composed.doc));
    for (const history of histories) expect(history.undo()).toBeTruthy();
    expect(direct.store.read().toJSON()).toEqual(direct.editor.getJSON()); expect(composed.store.read().toJSON()).toEqual(composed.editor.getJSON());
    for (const history of histories) expect(history.redo()).toBeTruthy();
    expect(direct.store.read().toJSON()).toEqual(target.doc.toJSON()); expect(composed.store.read().toJSON()).toEqual(other.doc.toJSON());
    expect(Y.encodeStateAsUpdate(direct.doc)).toEqual(Y.encodeStateAsUpdate(composed.doc));
  } finally { histories.forEach(history => history.destroy()); direct.destroy(); composed.destroy(); }
});

it.each(['identity', 'outside'] as const)('rejects a single native text operation with an untruthful %s map before opening a shared transaction', kind => {
  const pair = fixture(), changed = vi.fn();
  class InvalidTextStep extends ReplaceTextStep { override getMaps() { return kind === 'identity' ? [] : [new StepMap([1000, 0, 1])]; } }
  try {
    const transaction = pair.editor.createTransaction().step(new InvalidTextStep([0, 0], 1, 2, 'X')), before = Y.encodeStateAsUpdate(pair.doc);
    pair.doc.on('afterTransaction', changed);
    expect(() => pair.store.apply(transaction)).toThrow(kind === 'identity' ? 'claim changed text was retained' : 'Retained mapping exceeds its source document.');
    expect(Y.encodeStateAsUpdate(pair.doc)).toEqual(before); expect(changed).not.toHaveBeenCalled();
  } finally { pair.doc.off('afterTransaction', changed); pair.destroy(); }
});

it('preflights a later native map failure before writing an earlier native text step', () => {
  const pair = fixture(), changed = vi.fn();
  class InvalidTextStep extends ReplaceTextStep { override getMaps() { return []; } }
  try {
    const transaction = pair.editor.createTransaction().insertText([0, 0], 2, 'X').step(new InvalidTextStep([0, 0], 0, 1, 'Z'));
    const before = Y.encodeStateAsUpdate(pair.doc); pair.doc.on('afterTransaction', changed);
    expect(() => pair.store.apply(transaction)).toThrow('claim changed text was retained');
    expect(Y.encodeStateAsUpdate(pair.doc)).toEqual(before); expect(changed).not.toHaveBeenCalled();
  } finally { pair.doc.off('afterTransaction', changed); pair.destroy(); }
});

it.each(['range', 'path'] as const)('pins the validated native %s when a transaction-start hook mutates the original step', kind => {
  const pair = fixture({ ...source, content: [source.content![0], source.content![0], source.content![1]] });
  const step = new ReplaceTextStep([0, 0], 2, 2, 'X'), transaction = pair.editor.createTransaction().step(step);
  let changed = false;
  const hook = () => {
    if (changed) return; changed = true;
    if (kind === 'path') (step.path as number[])[0] = 1;
    else { const mutable = step as { from: number; to: number; text: string }; mutable.from = 0; mutable.to = 1; mutable.text = 'Y'; }
  };
  try {
    pair.doc.on('beforeTransaction', hook);
    const result = pair.store.apply(transaction); expect(changed).toBe(true);
    expect(result.toJSON()).toEqual(transaction.doc.toJSON()); expect(pair.store.read().toJSON()).toEqual(transaction.doc.toJSON());
    expect(result.child(0).textContent).toBe('AlXpha'); expect(result.child(1).textContent).toBe('Alpha');
  } finally { pair.doc.off('beforeTransaction', hook); pair.destroy(); }
});

it('matches general reconciliation when shared layout was changed earlier in the outer transaction', () => {
  const direct = fixture(), general = fixture();
  class GeneralTextStep extends ReplaceTextStep { override apply(document: Parameters<ReplaceTextStep['apply']>[0]) { return super.apply(document); } }
  try {
    for (const [pair, StepType] of [[direct, ReplaceTextStep], [general, GeneralTextStep]] as const) pair.doc.transact(() => {
      const field = pair.store.nodes.project().root.content[0].content[0].id;
      pair.store.nodes.setTextLayout(field, { field, empty: true });
      const transaction = pair.editor.createTransaction().step(new StepType([0, 0], 2, 2, 'X'));
      expect(pair.store.apply(transaction).toJSON()).toEqual(transaction.doc.toJSON());
      expect(pair.store.nodes.project().root.content[0].content[0].textLayout).toEqual({ field, empty: false });
    });
    expect(Y.encodeStateAsUpdate(direct.doc)).toEqual(Y.encodeStateAsUpdate(general.doc));
  } finally { direct.destroy(); general.destroy(); }
});

it.each([{ path: [] }, { path: [0] }])('does not rewrite reordered portable metadata or create history at path $path', ({ path }) => {
  const value = { first: ['keep', null, 1], second: { x: 1, y: 2 } }, changed = { second: { y: 2, x: 1 }, first: ['keep', null, 1] };
  const content: NodeJSON = path.length ? { ...source, content: [{ ...source.content![0], attrs: { custom: value } }, source.content![1]] }
    : { ...source, attrs: { custom: value } };
  const pair = fixture(content), history = new Y.UndoManager([...pair.store.scope]);
  try {
    const before = Y.encodeStateAsUpdate(pair.doc), transaction = pair.editor.createTransaction().setNodeAttrs(path, { custom: changed });
    const actual = pair.store.apply(transaction);
    expect(actual.toJSON()).toEqual(transaction.doc.toJSON()); expect(Y.encodeStateAsUpdate(pair.doc)).toEqual(before); expect(history.undoStack).toHaveLength(0);
    // The editor still has the original key order. A later genuine edit must
    // accept that semantically equal source rather than report stale state.
    const edit = pair.editor.createTransaction().insertText([0, 0], 2, 'X');
    expect(pair.store.apply(edit).toJSON()).toEqual(edit.doc.toJSON());
  } finally { history.destroy(); pair.destroy(); }
});

it('retains changes to nested array order and distinguishes a missing field from null', () => {
  const pair = fixture({ ...source, attrs: { custom: { items: [1, 2], retained: true } } });
  try {
    const transaction = pair.editor.createTransaction().setNodeAttrs([], { custom: { items: [2, 1], retained: true, optional: null } });
    expect(pair.store.apply(transaction).attrs.custom).toEqual({ items: [2, 1], retained: true, optional: null });
    expect(pair.store.read().toJSON()).toEqual(transaction.doc.toJSON());
  } finally { pair.destroy(); }
});

it.each(['text', 'metadata'] as const)('refuses a stale %s source before shared writes', kind => {
  const pair = fixture();
  try {
    const original = pair.editor.state.doc, stale = kind === 'metadata' ? original.withAttrs({ audit: { keep: false } })
      : original.copy([original.child(0).copy([pair.editor.state.schema.text('Other')]), original.child(1)]);
    const transaction = EditorState.create({ schema: pair.editor.state.schema, doc: stale }).createTransaction().setNodeAttrs([], { incoming: true });
    const before = Y.encodeStateAsUpdate(pair.doc);
    expect(() => pair.store.apply(transaction)).toThrow('stale source'); expect(Y.encodeStateAsUpdate(pair.doc)).toEqual(before);
    expect(pair.store.read().toJSON()).toEqual(original.toJSON());
  } finally { pair.destroy(); }
});

it.each(['map', 'transaction'] as const)('returns relevant writes made by a %s observer, including matching-origin follow-up transactions', kind => {
  const pair = fixture();
  try {
    const field = pair.store.nodes.project().root.content[0].content[0].id;
    const stream = pair.store.text.project(field).streamId;
    const text = pair.doc.getMap('candidate-text:texts').get(stream) as Y.Text;
    let written = false;
    const observer = () => { if (!written) { written = true; pair.store.nodes.setAttribute('root', 'observer', kind); } };
    if (kind === 'map') text.observe(observer); else pair.doc.on('afterTransaction', observer);
    pair.editor.dispatch(pair.editor.createTransaction().insertText([0, 0], 2, 'X'));
    const value = pair.apply();
    expect(value.attrs.observer).toBe(kind); expect(value.child(0).textContent).toBe('AlXpha');
    expect(value.toJSON()).toEqual(pair.store.read().toJSON());
    if (kind === 'map') text.unobserve(observer); else pair.doc.off('afterTransaction', observer);
  } finally { pair.destroy(); }
});

it('returns text inserted by a matching-origin observer after the local projection', () => {
  const pair = fixture();
  try {
    const field = pair.store.nodes.project().root.content[0].content[0].id;
    const format = pair.store.text.project(field).runs[0].attributes;
    let written = false;
    const observer = () => { if (!written) { written = true; pair.store.text.insert(field, 0, 'Y', format); } };
    pair.doc.on('afterTransaction', observer);
    pair.editor.dispatch(pair.editor.createTransaction().insertText([0, 0], 2, 'X'));
    const value = pair.apply();
    expect(value.child(0).textContent).toBe('YAlXpha');
    expect(value.toJSON()).toEqual(pair.store.read().toJSON());
    pair.doc.off('afterTransaction', observer);
  } finally { pair.destroy(); }
});

it('returns each point-in-time result inside an outer transaction and exposes later observer state afterward', () => {
  const pair = fixture();
  try {
    let written = false;
    const observer = () => { if (!written) { written = true; pair.store.nodes.setAttribute('root', 'afterOuter', true); } };
    pair.doc.on('afterTransaction', observer);
    pair.doc.transact(() => {
      const first = pair.store.apply(EditorState.create({ schema: pair.editor.state.schema, doc: pair.store.read() }).createTransaction().insertText([0, 0], 2, 'X'));
      expect(first.child(0).textContent).toBe('AlXpha'); expect(first.attrs.afterOuter).toBeUndefined();
      pair.store.nodes.setAttribute('root', 'pending', true);
      const second = pair.store.apply(EditorState.create({ schema: pair.editor.state.schema, doc: pair.store.read() }).createTransaction().insertText([0, 0], 3, 'Y'));
      expect(second.child(0).textContent).toBe('AlXYpha'); expect(second.attrs.pending).toBe(true);
      expect(first.attrs.pending).toBeUndefined(); expect(second.attrs.afterOuter).toBeUndefined();
    });
    expect(pair.store.read().attrs).toMatchObject({ pending: true, afterOuter: true });
    pair.doc.off('afterTransaction', observer);
  } finally { pair.destroy(); }
});

it('reads observer writes even when a transaction has no document steps', () => {
  const pair = fixture();
  try {
    let written = false;
    const observer = () => { if (!written) { written = true; pair.store.nodes.setAttribute('root', 'emptyObserver', true); } };
    pair.doc.on('afterTransaction', observer);
    const value = pair.store.apply(pair.editor.createTransaction());
    expect(value.attrs.emptyObserver).toBe(true); expect(value.child(0).textContent).toBe('Alpha');
    pair.doc.off('afterTransaction', observer);
  } finally { pair.destroy(); }
});

it('rejects malformed observer output and can read again after the host repairs the shared record', () => {
  const pair = fixture();
  try {
    let written = false;
    const observer = () => { if (!written) { written = true; pair.store.nodes.setType('root', 'future-node'); } };
    pair.doc.on('afterTransaction', observer);
    pair.editor.dispatch(pair.editor.createTransaction().insertText([0, 0], 2, 'X'));
    expect(() => pair.apply()).toThrow('Unknown retained node type');
    pair.doc.off('afterTransaction', observer);
    pair.store.nodes.setType('root', 'doc');
    expect(pair.store.read().child(0).textContent).toBe('AlXpha');
  } finally { pair.destroy(); }
});

it('keeps unrelated observer namespaces separate from the returned document', () => {
  const pair = fixture();
  try {
    let written = false;
    const observer = () => { if (!written) { written = true; pair.doc.getMap('outside').set('counter', 1); } };
    pair.doc.on('afterTransaction', observer);
    pair.editor.dispatch(pair.editor.createTransaction().insertText([0, 0], 2, 'X'));
    const value = pair.apply();
    expect(value.toJSON()).toEqual(pair.editor.getJSON()); expect(pair.doc.getMap('outside').get('counter')).toBe(1);
    pair.doc.off('afterTransaction', observer);
  } finally { pair.destroy(); }
});

it.each([false, true])('distinguishes retained block movement from explicit replacement despite reused parent objects (replace: %s)', replace => {
  const pair = fixture({ ...source, content: [
    ...['Alpha', 'Beta', 'Gamma'].map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] })), source.content![1],
  ] });
  const active = () => pair.store.nodes.project().root.content.flatMap(parent => parent.content
    .filter(child => child.type === 'text' && pair.store.text.project(child.id).runs.some(run => run.text.length)).map(child => child.id));
  try {
    const before = active(), document = pair.editor.state.doc;
    if (replace) pair.editor.dispatch(pair.editor.createTransaction().replaceDocument(document.copy([
      document.child(1), document.child(2), document.child(0), document.child(3),
    ])));
    else expect(moveBlock(pair.editor, 0, 2)).toBe(true);
    pair.apply();
    expect(pair.store.read().toJSON()).toEqual(pair.editor.getJSON());
    expect(pair.editor.state.doc.content.slice(0, 3).map(node => node.textContent)).toEqual(['Beta', 'Gamma', 'Alpha']);
    const after = active();
    if (replace) expect(after.some(id => before.includes(id))).toBe(false);
    else expect([...after].sort()).toEqual([...before].sort());
  } finally { pair.destroy(); }
});

it('round-trips the exact native model, including adjacent identical leaves, empty leaves and inert metadata keys', () => {
  const attrs = JSON.parse('{"__proto__":{"preserved":true},"constructor":"data","":"empty-name","\\ud800":"unpaired-key"}');
  const pair = fixture({ type: 'doc', attrs, content: [{ type: 'paragraph', content: [
    { type: 'text', text: '', attrs }, { type: 'text', text: 'A\u200b😀', marks: [{ type: 'strong' }] },
    { type: 'text', text: 'B', marks: [{ type: 'strong' }] }, { type: 'text', text: '' },
    { type: 'hard_break' }, { type: 'text', text: 'C', attrs },
  ] }, source.content![1]] });
  try {
    expect(pair.store.read().toJSON()).toEqual(pair.editor.getJSON());
    const saved = new Y.Doc();
    try {
      Y.applyUpdate(saved, Y.encodeStateAsUpdate(pair.doc));
      const reopened = new RetainedDocumentStore(saved, 'candidate', pair.editor.state.schema, factory('reopened'));
      try { expect(reopened.read().toJSON()).toEqual(pair.editor.getJSON()); } finally { reopened.destroy(); }
    } finally { saved.destroy(); }
    expect(({} as Record<string, unknown>).preserved).toBeUndefined();
    expect(typeof globalThis.document).toBe('undefined');
  } finally { pair.destroy(); }
});

it.each(['quote', 'bullet', 'ordered', 'task', 'mark', 'split'] as const)('retains native history shapes through %s undo and redo', kind => {
  const pair = fixture();
  try {
    const original = pair.editor.getJSON();
    pair.editor.dispatch(pair.editor.createTransaction().setSelection(kind === 'mark'
      ? Selection.range([0, 0], 1, [0, 0], 4) : Selection.cursor([0, 0], 3)));
    expect(kind === 'quote' ? toggleQuote(pair.editor) : kind === 'mark' ? setMark(pair.editor, 'strong')
      : kind === 'split' ? splitBlock(pair.editor) : toggleList(pair.editor, kind)).toBe(true);
    const changed = pair.apply().toJSON();
    expect(undo(pair.editor)).toBe(true); expect(pair.apply().toJSON()).toEqual(original);
    expect(redo(pair.editor)).toBe(true); expect(pair.apply().toJSON()).toEqual(changed);
  } finally { pair.destroy(); }
});

it.each(['quote', 'bullet', 'ordered', 'task', 'mark', 'split'] as const)('applies the actual %s transaction without changing native model structure', kind => {
  const pair = fixture();
  try {
    pair.editor.dispatch(pair.editor.createTransaction().setSelection(kind === 'mark'
      ? Selection.range([0, 0], 1, [0, 0], 4) : Selection.cursor([0, 0], 3)));
    expect(kind === 'quote' ? toggleQuote(pair.editor) : kind === 'mark' ? setMark(pair.editor, 'strong')
      : kind === 'split' ? splitBlock(pair.editor) : toggleList(pair.editor, kind)).toBe(true);
    expect(pair.apply().toJSON()).toEqual(pair.editor.getJSON());
  } finally { pair.destroy(); }
});

it.each(['quote', 'bullet', 'ordered', 'task'] as const)('keeps untouched siblings in their original native placements when toggling %s', kind => {
  const content: NodeJSON = { ...source, content: [...source.content!, ...['Beta', 'Gamma', 'Delta'].map(text => ({
    type: 'paragraph', content: [{ type: 'text', text }],
  }))] };
  const pair = fixture(content);
  try {
    const siblings = pair.store.nodes.childrenOf('root').slice(1);
    const tokens = siblings.map(id => pair.store.nodes.placementIdentity(id));
    pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    const toggle = () => kind === 'quote' ? toggleQuote(pair.editor) : toggleList(pair.editor, kind);
    for (let index = 0; index < 2; index++) {
      expect(toggle()).toBe(true);
      expect(pair.apply().toJSON()).toEqual(pair.editor.getJSON());
      expect(pair.store.nodes.childrenOf('root').slice(1)).toEqual(siblings);
      expect(siblings.map(id => pair.store.nodes.placementIdentity(id))).toEqual(tokens);
    }
  } finally { pair.destroy(); }
});

for (const reverse of [false, true]) it.each(['quote', 'bullet', 'ordered', 'task', 'mark', 'split'] as const)(
  `retains offline peer typing through actual %s commands (reverse exchange: ${reverse})`, kind => {
    const pair = peers();
    try {
      pair.left.editor.dispatch(pair.left.editor.createTransaction().insertText([0, 0], 2, 'X')); pair.left.apply();
      pair.right.editor.dispatch(pair.right.editor.createTransaction().setSelection(kind === 'mark'
        ? Selection.range([0, 0], 1, [0, 0], 4) : Selection.cursor([0, 0], 3)));
      expect(kind === 'quote' ? toggleQuote(pair.right.editor) : kind === 'mark' ? setMark(pair.right.editor, 'strong')
        : kind === 'split' ? splitBlock(pair.right.editor) : toggleList(pair.right.editor, kind)).toBe(true);
      pair.right.apply(); pair.sync(reverse);
      const left = pair.left.store.read(), right = pair.right.store.read();
      expect(left.toJSON()).toEqual(right.toJSON());
      if (kind === 'split') expect(left.content.slice(0, 2).map(node => node.textContent)).toEqual(['AlXp', 'ha']);
      else expect(left.child(0).textContent).toBe('AlXpha');
      expect(left.content.at(-1)!.toJSON()).toEqual(pair.left.editor.state.schema.nodeFromJSON(source.content![1]).toJSON());
      expect(left.attrs).toEqual(source.attrs);
    } finally { pair.destroy(); }
  });

it.each([0, 5])('retains an explicit empty side when splitting at %s', offset => {
  const pair = fixture();
  try {
    pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.cursor([0, 0], offset)));
    expect(splitBlock(pair.editor)).toBe(true);
    expect(pair.apply().toJSON()).toEqual(pair.editor.getJSON());
  } finally { pair.destroy(); }
});

it('types into an existing empty stream, deletes all text, then types again', () => {
  const pair = fixture({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] });
  try {
    for (const [from, to, text] of [[0, 0, 'Alpha'], [0, 5, ''], [0, 0, 'Again']] as const) {
      pair.editor.dispatch(pair.editor.createTransaction().replaceText([0, 0], from, to, text));
      expect(pair.apply().toJSON()).toEqual(pair.editor.getJSON());
    }
  } finally { pair.destroy(); }
});

it('preserves both peers first typing into the same initially empty text stream', () => {
  const pair = peers({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] });
  try {
    for (const [peer, text] of [[pair.left, 'Ada'], [pair.right, 'Grace']] as const) {
      peer.editor.dispatch(peer.editor.createTransaction().insertText([0, 0], 0, text)); peer.apply();
    }
    pair.sync(false); const left = pair.left.store.read(), right = pair.right.store.read();
    expect(left.toJSON()).toEqual(right.toJSON());
    expect(left.textContent).toContain('Ada'); expect(left.textContent).toContain('Grace');
  } finally { pair.destroy(); }
});

it('retains unseen peer typing when all locally observed characters are deleted', () => {
  const pair = peers();
  try {
    pair.left.editor.dispatch(pair.left.editor.createTransaction().insertText([0, 0], 2, 'X')); pair.left.apply();
    pair.right.editor.dispatch(pair.right.editor.createTransaction().replaceText([0, 0], 0, 5, '')); pair.right.apply();
    pair.sync(false);
    expect(pair.left.store.read().child(0).textContent).toBe('X');
    expect(pair.left.store.read().toJSON()).toEqual(pair.right.store.read().toJSON());
  } finally { pair.destroy(); }
});

it('retains character formats when typing is undone and redone after a concurrent full deletion', () => {
  const pair = peers(), manager = new Y.UndoManager([...pair.left.store.scope], { captureTimeout: 0 });
  try {
    pair.left.editor.dispatch(pair.left.editor.createTransaction().insertText([0, 0], 2, 'X')); pair.left.apply();
    pair.right.editor.dispatch(pair.right.editor.createTransaction().replaceText([0, 0], 0, 5, '')); pair.right.apply();
    pair.sync(false); const original = pair.left.store.read().toJSON();
    manager.undo(); pair.sync(false); expect(pair.left.store.read().child(0).textContent).toBe('');
    manager.redo(); pair.sync(true); expect(pair.left.store.read().toJSON()).toEqual(original);
    expect(pair.right.store.read().toJSON()).toEqual(original);
  } finally { manager.destroy(); pair.destroy(); }
});

for (const reverse of [false, true]) it.each([false, true])(`preserves the actual mixed-leaf insertion style after full deletion (reverse exchange: ${reverse}, reverse IDs: %s)`, reverseIDs => {
  const pair = peers({ type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'AA' }, { type: 'text', text: 'BBBB', attrs: { source: 'middle' }, marks: [{ type: 'em' }] },
    { type: 'text', text: 'CC', marks: [{ type: 'strong' }] },
  ] }] }, reverseIDs);
  try {
    pair.left.editor.dispatch(pair.left.editor.createTransaction().insertText([0, 1], 2, 'Z\u200b😀')); pair.left.apply();
    pair.right.editor.dispatch(pair.right.editor.createTransaction().replaceRange(1, 9, '')); pair.right.apply(); pair.sync(reverse);
    const state = Y.encodeStateVector(pair.left.doc), left = pair.left.store.read(), right = pair.right.store.read();
    expect(left.toJSON()).toEqual(right.toJSON()); expect(left.child(0).textContent).toBe('Z\u200b😀');
    expect(left.child(0).child(0).attrs).toEqual({ source: 'middle' });
    expect(left.child(0).child(0).marks.map(mark => mark.type.name)).toEqual(['em']);
    expect(Y.encodeStateVector(pair.left.doc)).toEqual(state);
    expect(JSON.stringify(left.toJSON())).not.toContain('"$f":');
    const saved = new Y.Doc();
    try {
      Y.applyUpdate(saved, Y.encodeStateAsUpdate(pair.left.doc));
      const reopened = new RetainedDocumentStore(saved, 'candidate', pair.left.editor.state.schema, factory('reopened'));
      try { expect(reopened.read().toJSON()).toEqual(left.toJSON()); } finally { reopened.destroy(); }
    } finally { saved.destroy(); }
  } finally { pair.destroy(); }
});

it.each(['bullet', 'ordered', 'task'] as const)('splits a nested %s item with marked leaves and following blocks intact', kind => {
  const pair = fixture({ type: 'doc', content: [{ type: `${kind}_list`, content: [{
    type: kind === 'task' ? 'task_item' : 'list_item', attrs: { checked: true, audit: 'item' }, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Earlier' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'AA' }, { type: 'text', text: 'Alpha', marks: [{ type: 'em' }] }, { type: 'text', text: 'ZZ' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Tail' }] },
    ],
  }] }, source.content![1]] });
  try {
    pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.cursor([0, 0, 1, 1], 2)));
    expect(splitBlock(pair.editor)).toBe(true); expect(pair.apply().toJSON()).toEqual(pair.editor.getJSON());
    expect(undo(pair.editor)).toBe(true); expect(pair.apply().toJSON()).toEqual(pair.editor.getJSON());
  } finally { pair.destroy(); }
});

it('round-trips tables, inline and display math, code and an extension-defined structured widget without a DOM', () => {
  const widget = defineExtension({ name: 'candidate-widget', nodes: { lab_widget: { group: 'block', atom: true } } });
  const pair = fixture({ type: 'doc', attrs: { metadata: { title: 'Lab report', revision: 7 } }, content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Result ' }, { type: 'inline_math', attrs: { latex: 'x^2' } }] },
    { type: 'math_block', attrs: { latex: '\\int_0^1 x\\,dx=\\frac12', label: 'eq-result' } },
    { type: 'table', content: [{ type: 'table_row', content: [{ type: 'table_cell', content: [
      { type: 'paragraph', content: [{ type: 'text', text: '42', marks: [{ type: 'strong' }] }] },
    ] }] }] },
    { type: 'code_block', attrs: { language: 'lean' }, content: [{ type: 'text', text: 'example : 1 + 1 = 2 := by decide' }] },
    { type: 'lab_widget', attrs: { nodeId: 'lab-42', settings: { measured: [12, 19], owner: 'Ada' } } }, source.content![1],
  ] }, 101, [CoreExtension, MathExtension, widget]);
  try {
    expect(pair.store.read().toJSON()).toEqual(pair.editor.getJSON());
    const saved = new Y.Doc();
    try {
      Y.applyUpdate(saved, Y.encodeStateAsUpdate(pair.doc));
      const reopened = new RetainedDocumentStore(saved, 'candidate', pair.editor.state.schema, factory('reopened'));
      try { expect(reopened.read().toJSON()).toEqual(pair.editor.getJSON()); } finally { reopened.destroy(); }
    } finally { saved.destroy(); }
  } finally { pair.destroy(); }
});

it('refuses a later untruthful map before writing an earlier valid edit', () => {
  const pair = fixture();
  try {
    const transaction = pair.editor.createTransaction().insertText([0, 0], 2, 'X');
    class InvalidIdentityStep extends ReplaceDocumentStep { override getMaps() { return []; } }
    transaction.step(new InvalidIdentityStep(transaction.doc.copy([
      transaction.doc.child(0).copy([pair.editor.state.schema.text('Other!')]), transaction.doc.child(1),
    ])));
    const state = Y.encodeStateVector(pair.doc), original = pair.store.read().toJSON();
    expect(() => pair.store.apply(transaction)).toThrow('claim changed text was retained');
    expect(Y.encodeStateVector(pair.doc)).toEqual(state); expect(pair.store.read().toJSON()).toEqual(original);
  } finally { pair.destroy(); }
});

it('rejects overlong metadata names before changing shared state', () => {
  const pair = fixture();
  try {
    const transaction = pair.editor.createTransaction().replaceDocument(pair.editor.state.doc.withAttrs({ ['x'.repeat(201)]: true }));
    const state = Y.encodeStateVector(pair.doc);
    expect(() => pair.store.apply(transaction)).toThrow('storage bounds'); expect(Y.encodeStateVector(pair.doc)).toEqual(state);
  } finally { pair.destroy(); }
});

it.each(['quote', 'mark', 'split'] as const)('undoes and redoes only the local %s operation after peer typing', kind => {
  const pair = peers(), manager = new Y.UndoManager([...pair.right.store.scope], { captureTimeout: 0 });
  try {
    pair.left.editor.dispatch(pair.left.editor.createTransaction().insertText([0, 0], 2, 'X')); pair.left.apply();
    pair.right.editor.dispatch(pair.right.editor.createTransaction().setSelection(kind === 'mark'
      ? Selection.range([0, 0], 1, [0, 0], 4) : Selection.cursor([0, 0], 3)));
    expect(kind === 'quote' ? toggleQuote(pair.right.editor) : kind === 'mark' ? setMark(pair.right.editor, 'strong') : splitBlock(pair.right.editor)).toBe(true);
    pair.right.apply(); pair.sync(false);
    const changed = pair.right.store.read().toJSON();
    manager.undo(); pair.sync(true);
    expect(pair.right.store.read().child(0).textContent).toBe('AlXpha');
    expect(pair.right.store.read().child(0).type.name).toBe('paragraph');
    expect(pair.right.store.read().toJSON()).toEqual(pair.left.store.read().toJSON());
    manager.redo(); pair.sync(false);
    expect(pair.right.store.read().toJSON()).toEqual(changed);
    expect(pair.right.store.read().toJSON()).toEqual(pair.left.store.read().toJSON());
  } finally { manager.destroy(); pair.destroy(); }
});

for (const reverse of [false, true]) it.each([false, true])(`orders concurrent cuts by shared text boundaries (reverse exchange: ${reverse}, reverse IDs: %s)`, reverseIDs => {
  const pair = peers(source, reverseIDs);
  try {
    for (const [peer, offset] of [[pair.left, 2], [pair.right, 4]] as const) {
      peer.editor.dispatch(peer.editor.createTransaction().setSelection(Selection.cursor([0, 0], offset)));
      expect(splitBlock(peer.editor)).toBe(true); peer.apply();
    }
    pair.sync(reverse); const left = pair.left.store.read(), right = pair.right.store.read();
    expect(left.toJSON()).toEqual(right.toJSON());
    expect(left.content.slice(0, 3).map(node => node.textContent)).toEqual(['Al', 'ph', 'a']);
  } finally { pair.destroy(); }
});

it.each([false, true])('orders separate split families around unchanged siblings after exchange (reverse: %s)', reverse => {
  const content: NodeJSON = { type: 'doc', content: ['Alpha', 'Between', 'Gamma', 'After'].map(text => ({
    type: 'paragraph', content: [{ type: 'text', text }],
  })) };
  const pair = peers(content);
  try {
    for (const [peer, path] of [[pair.left, [0, 0]], [pair.right, [2, 0]]] as const) {
      peer.editor.dispatch(peer.editor.createTransaction().setSelection(Selection.cursor(path, 2)));
      expect(splitBlock(peer.editor)).toBe(true);
      peer.apply();
    }
    pair.sync(reverse);
    const left = pair.left.store.read(), right = pair.right.store.read();
    expect(left.toJSON()).toEqual(right.toJSON());
    expect(left.content.map(node => node.textContent)).toEqual(['Al', 'pha', 'Between', 'Ga', 'mma', 'After']);
    expect(Y.encodeStateAsUpdate(pair.left.doc)).toEqual(Y.encodeStateAsUpdate(pair.right.doc));
  } finally { pair.destroy(); }
});

it.each(['text only', 'type observer', 'transaction observer', 'new style'] as const)('reads a remote text edit with %s', kind => {
  const pair = peers();
  const reader = kind === 'new style' ? pair.left : pair.right;
  const writer = kind === 'new style' ? pair.right : pair.left;
  const project = vi.spyOn(reader.store.nodes, 'project');
  const stream = [...reader.doc.getMap('candidate-text:texts').values()][0] as Y.Text;
  let result: ReturnType<RetainedDocumentStore['read']> | undefined;
  let observed = false;
  const annotate = () => {
    if (observed) return;
    observed = true;
    reader.store.nodes.setAttribute('root', 'observer', kind);
  };
  const onAfter = (transaction: Y.Transaction) => {
    if (!transaction.local) result = reader.store.readAfterRemote(transaction);
  };
  try {
    if (kind === 'type observer') stream.observe(annotate);
    if (kind === 'transaction observer') reader.doc.on('afterTransaction', annotate);
    reader.doc.on('afterTransaction', onAfter);

    expect(writer.editor.dispatch(writer.editor.createTransaction().insertText([0, 0], 2, 'X'))).toBe(true);
    writer.apply();
    Y.applyUpdate(reader.doc, Y.encodeStateAsUpdate(writer.doc), 'transport');
    if (kind === 'text only') {
      const vector = Y.encodeStateVector(reader.doc);
      expect(writer.editor.dispatch(writer.editor.createTransaction().insertText([0, 0], 3, 'Y'))).toBe(true);
      writer.apply();
      Y.applyUpdate(reader.doc, Y.encodeStateAsUpdate(writer.doc, vector), 'transport');
    }

    expect(result?.child(0).textContent).toBe(kind === 'text only' ? 'AlXYpha' : 'AlXpha');
    expect(result?.child(1).toJSON()).toEqual(reader.editor.state.doc.child(1).toJSON());
    if (kind === 'text only') {
      expect(project).not.toHaveBeenCalled();
      expect(result?.attrs.observer).toBeUndefined();
    } else {
      expect(project).toHaveBeenCalledOnce();
      expect(result?.attrs.observer).toBe(kind === 'new style' ? undefined : kind);
    }
    expect(reader.store.read().toJSON()).toEqual(result?.toJSON());
  } finally {
    if (kind === 'type observer') stream.unobserve(annotate);
    if (kind === 'transaction observer') reader.doc.off('afterTransaction', annotate);
    reader.doc.off('afterTransaction', onAfter);
    project.mockRestore();
    pair.destroy();
  }
});
