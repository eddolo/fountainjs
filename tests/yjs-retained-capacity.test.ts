// @vitest-environment node
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, EditorState, Schema, composeExtensions, createEditor, getCollaborationState, undoCollaboration, reconnectCollaboration } from '../src';
import { createYjsCollaborationExtension } from '../src/yjs';
import { RetainedDocumentStore } from '../src/yjs/retained-document';
import { SplitNodeStep } from '../src/core/transaction/split-node-step';

function fillStyles(document: Y.Doc, name: string) {
  const styles = document.getMap(`${name}-text:styles`), initial = styles.size;
  document.transact(() => { for (let index = initial; index < 100_000; index++) styles.set(`999999:${index}`, '{}'); });
}

it('refuses a replacement at style capacity before deleting the selected shared text', () => {
  const document = new Y.Doc(), schema = new Schema(composeExtensions([CoreExtension]).schema);
  let id = 0;
  const createId = () => `capacity-${id++}`;
  const seeded = new RetainedDocumentStore(document, 'capacity', schema, createId);
  const source = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Alpha')])]);
  seeded.seed(source); seeded.destroy();
  fillStyles(document, 'capacity');
  const store = new RetainedDocumentStore(document, 'capacity', schema, createId);
  try {
    const original = store.read(), before = Y.encodeStateAsUpdate(document);
    const transaction = EditorState.create({ schema, doc: original }).createTransaction().replaceText([0, 0], 1, 2, 'X');
    expect(() => store.apply(transaction)).toThrow('Retained style definitions need compaction');
    expect(Buffer.from(Y.encodeStateAsUpdate(document)).equals(before), 'Rejected edit must leave shared bytes untouched').toBe(true);
    expect(store.read().toJSON()).toEqual(original.toJSON());
  } finally { store.destroy(); document.destroy(); }
});

it('allows native deletion and cached-style replacement at a full style pool', () => {
  const document = new Y.Doc(), schema = new Schema(composeExtensions([CoreExtension]).schema);
  let id = 0;
  const store = new RetainedDocumentStore(document, 'cached', schema, () => `cached-${id++}`);
  store.seed(schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Alpha')])]));
  fillStyles(document, 'cached');
  try {
    const replace = EditorState.create({ schema, doc: store.read() }).createTransaction().replaceText([0, 0], 1, 2, 'X');
    expect(store.apply(replace).textContent).toBe('AXpha');
    const remove = EditorState.create({ schema, doc: store.read() }).createTransaction().replaceText([0, 0], 1, 2, '');
    expect(store.apply(remove).textContent).toBe('Apha');
    expect(document.getMap('cached-text:styles').size).toBe(100_000);
  } finally { store.destroy(); document.destroy(); }
});

it('reserves the complete multi-step transaction before writing its first text edit', () => {
  const document = new Y.Doc(), schema = new Schema(composeExtensions([CoreExtension]).schema);
  let id = 0;
  const store = new RetainedDocumentStore(document, 'multi', schema, () => `multi-${id++}`);
  store.seed(schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Alpha')])]));
  fillStyles(document, 'multi');
  try {
    const original = store.read(), before = Y.encodeStateAsUpdate(document);
    const transaction = EditorState.create({ schema, doc: original }).createTransaction()
      .replaceText([0, 0], 1, 2, 'X')
      .replace(1, 1, [schema.node('paragraph', {}, [schema.text('New style identity')])]);
    expect(() => store.apply(transaction)).toThrow('need compaction');
    expect(Buffer.from(Y.encodeStateAsUpdate(document)).equals(before)).toBe(true);
    expect(store.read().toJSON()).toEqual(original.toJSON());
  } finally { store.destroy(); document.destroy(); }
});

it('includes text in newly created, split and later hidden partitions in stream capacity', () => {
  const document = new Y.Doc(), schema = new Schema(composeExtensions([CoreExtension]).schema);
  let id = 0;
  const store = new RetainedDocumentStore(document, 'growth', schema, () => `growth-${id++}`);
  store.seed(schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Alpha')])]));
  try {
    const original = store.read(), before = Y.encodeStateAsUpdate(document);
    const paragraph = schema.node('paragraph', {}, [schema.text('a'.repeat(4_000_000))]);
    const transaction = EditorState.create({ schema, doc: original }).createTransaction().replace(1, 1, [paragraph]);
    transaction.step(new SplitNodeStep([1], paragraph, [0], 2_000_000, [paragraph, paragraph.child(0)]))
      .replace(2, 3, []).insertText([1, 0], 0, 'b'.repeat(7_000_000));
    expect(transaction.doc.textContent.length).toBe(9_000_005);
    expect(() => store.apply(transaction)).toThrow('stream needs compaction');
    expect(Buffer.from(Y.encodeStateAsUpdate(document)).equals(before)).toBe(true);
    expect(store.read().toJSON()).toEqual(original.toJSON());
  } finally { store.destroy(); document.destroy(); }
});

it('keeps a refused public-adapter edit private and leaves its connected peer unchanged', () => {
  const document = new Y.Doc(), peerDocument = new Y.Doc();
  const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }] };
  const make = (document: Y.Doc, id: string) => {
    const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, captureTimeout: 0,
      user: { id, name: id, color: '#7048e8' } })]);
    return createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  };
  const seed = make(document, 'seed'); seed.destroy(); fillStyles(document, 'fountain');
  Y.applyUpdate(peerDocument, Y.encodeStateAsUpdate(document));
  const local = make(document, 'local'), peer = make(peerDocument, 'peer');
  try {
    const before = Y.encodeStateAsUpdate(document), peerBefore = peer.getJSON();
    const transaction = local.createTransaction().replaceText([0, 0], 1, 2, 'X');
    expect(local.dispatch(transaction)).toBe(true);
    expect(local.state.doc.textContent).toBe('AXpha');
    expect(getCollaborationState(local)).toMatchObject({ status: 'error', error: { recoverable: true } });
    expect(Buffer.from(Y.encodeStateAsUpdate(document)).equals(before)).toBe(true);
    Y.applyUpdate(peerDocument, Y.encodeStateAsUpdate(document));
    expect(peer.getJSON()).toEqual(peerBefore);
    expect(getCollaborationState(peer)?.status).toBe('connected');
    expect(undoCollaboration(local)).toBe(false);
    expect(reconnectCollaboration(local)).toBe(false);
    expect(local.state.doc.textContent).toBe('AXpha');
    expect(Buffer.from(Y.encodeStateAsUpdate(document)).equals(before)).toBe(true);
  } finally { local.destroy(); peer.destroy(); document.destroy(); peerDocument.destroy(); }
});

it('reserves after transaction-start hooks and preserves only the hook write on refusal', () => {
  const document = new Y.Doc(), schema = new Schema(composeExtensions([CoreExtension]).schema);
  let id = 0;
  const store = new RetainedDocumentStore(document, 'hook', schema, () => `hook-${id++}`);
  store.seed(schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Alpha')])]));
  fillStyles(document, 'hook');
  let foreign: Uint8Array | undefined;
  const hook = () => {
    document.off('beforeTransaction', hook);
    const partition = store.nodes.project().root.content[0].content[0].id;
    store.nodes.setTextLayout(partition, { field: partition, empty: true });
    foreign = Y.encodeStateVector(document);
  };
  try {
    const transaction = EditorState.create({ schema, doc: store.read() }).createTransaction().replaceText([0, 0], 1, 2, 'X');
    document.on('beforeTransaction', hook);
    expect(() => store.apply(transaction)).toThrow('need compaction');
    expect(foreign).toBeDefined();
    // The hook's own overwritten metadata is garbage-collected at cleanup;
    // the rejected writer must contribute no additional native clock units.
    expect(Buffer.from(Y.encodeStateVector(document)).equals(foreign!)).toBe(true);
    expect(store.nodes.project().root.content[0].content[0].textLayout?.empty).toBe(true);
    expect(store.read().textContent).toBe('Alpha');
  } finally { document.off('beforeTransaction', hook); store.destroy(); document.destroy(); }
});

it('does not reserve untouched blocks when marking text in a large fresh document', () => {
  const document = new Y.Doc(), schema = new Schema(composeExtensions([CoreExtension]).schema);
  let id = 0;
  const store = new RetainedDocumentStore(document, 'large', schema, () => `large-${id++}`);
  const paragraph = schema.node('paragraph', {}, [schema.text('Alpha')]);
  store.seed(schema.node('doc', {}, Array.from({ length: 25_000 }, () => paragraph)));
  try {
    const pools = ['large-nodes:nodes', 'large-text:owners', 'large-text:texts'];
    const before = pools.map(key => document.getMap(key).size);
    const transaction = EditorState.create({ schema, doc: store.read() }).createTransaction()
      .addMark([12_000, 0], 1, 2, schema.mark('strong'));
    expect(store.apply(transaction).child(12_000).child(1).marks[0].type.name).toBe('strong');
    expect(pools.map(key => document.getMap(key).size)).toEqual(before);
    expect(store.read().childCount).toBe(25_000);
  } finally { store.destroy(); document.destroy(); }
}, 30_000);
