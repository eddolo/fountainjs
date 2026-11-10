// @vitest-environment node
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, EditorState, Schema, composeExtensions } from '../src';
import { RetainedDocumentStore } from '../src/yjs/retained-document';

function fixture() {
  const base = composeExtensions([CoreExtension]).schema;
  const attributes = Object.fromEntries(Array.from({ length: 1_200 }, (_, index) => [`field${index}`, { default: undefined }]));
  const schema = new Schema({ ...base, nodes: { ...base.nodes, text: { ...base.nodes.text, attrs: attributes } } });
  const document = new Y.Doc();
  let sequence = 0;
  const store = new RetainedDocumentStore(document, 'format-capacity', schema, () => `format-${sequence++}`);
  const attrs = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`field${index}`, 'original']));
  store.seed(schema.node('doc', {}, [schema.node('paragraph', {}, [schema.nodes.text.create(attrs, [], 'Alpha')])]));
  return { schema, document, store, destroy: () => { store.destroy(); document.destroy(); } };
}

const replaceAttributes = (from: number, count: number) => Object.fromEntries(
  Array.from({ length: 1_200 }, (_, index) => [`field${index}`, index >= from && index < from + count ? 'updated' : undefined]),
);

it('refuses an oversized format patch before committing an earlier step', () => {
  const { schema, document, store, destroy } = fixture();
  try {
    const original = store.read(), before = Y.encodeStateAsUpdate(document);
    // Both source and destination are individually valid 600-attribute text
    // nodes. Removing the old fields and adding disjoint new ones needs 1,200
    // wire fields, because removal is recorded against insertion provenance.
    const transaction = EditorState.create({ schema, doc: original }).createTransaction()
      .setNodeAttrs([0], { editedBeforeFailure: true })
      .setNodeAttrs([0, 0], replaceAttributes(600, 600));
    expect(() => store.apply(transaction)).toThrow();
    expect(Buffer.from(Y.encodeStateAsUpdate(document)).equals(before), 'Rejected formatting must not commit earlier steps').toBe(true);
    expect(store.read().toJSON()).toEqual(original.toJSON());
  } finally { destroy(); }
});

it('counts historical removed fields when preflighting a later format change', () => {
  const { schema, document, store, destroy } = fixture();
  try {
    const first = EditorState.create({ schema, doc: store.read() }).createTransaction()
      .setNodeAttrs([0, 0], replaceAttributes(600, 100));
    expect(store.apply(first).toJSON()).toEqual(first.doc.toJSON());
    const original = store.read(), before = Y.encodeStateAsUpdate(document);
    // Only 100 attributes remain visible, but 600 removal fields still live
    // on the shared text. Another disjoint 400 fields would exceed wire limits
    // even though the semantic source/destination union has only 500 fields.
    const transaction = EditorState.create({ schema, doc: original }).createTransaction()
      .setNodeAttrs([0], { editedBeforeFailure: true })
      .setNodeAttrs([0, 0], replaceAttributes(700, 400));
    expect(() => store.apply(transaction)).toThrow();
    expect(Buffer.from(Y.encodeStateAsUpdate(document)).equals(before), 'Historical wire fields must be counted before any shared writes').toBe(true);
    expect(store.read().toJSON()).toEqual(original.toJSON());
  } finally { destroy(); }
});

it('reserves formatting capacity for text created by an earlier step', () => {
  const { schema, document, store, destroy } = fixture();
  try {
    const original = store.read(), before = Y.encodeStateAsUpdate(document);
    const paragraph = schema.node('paragraph', {}, [schema.nodes.text.create(original.child(0).child(0).attrs, [], 'New content')]);
    const end = original.childCount;
    const transaction = EditorState.create({ schema, doc: original }).createTransaction()
      .replace(end, end, [paragraph])
      .setNodeAttrs([1, 0], replaceAttributes(600, 600));
    expect(() => store.apply(transaction)).toThrow();
    expect(Buffer.from(Y.encodeStateAsUpdate(document)).equals(before), 'New partitions need reservations before earlier steps create them').toBe(true);
    expect(store.read().toJSON()).toEqual(original.toJSON());
  } finally { destroy(); }
});

it('allows select-all alignment across 200 paragraphs without reserving replacement nodes', () => {
  const schema = new Schema(composeExtensions([CoreExtension]).schema), document = new Y.Doc();
  let sequence = 0;
  const store = new RetainedDocumentStore(document, 'batch-alignment', schema, () => `alignment-${sequence++}`);
  const pools = ['batch-alignment-nodes:nodes', 'batch-alignment-nodes:identities',
    'batch-alignment-text:owners', 'batch-alignment-text:texts', 'batch-alignment-text:styles'];
  try {
    store.seed(schema.node('doc', {}, Array.from({ length: 200 }, () => schema.node('paragraph', {}, [schema.text('Alpha')]))));
    const sizes = pools.map(name => document.getMap(name).size);
    const transaction = EditorState.create({ schema, doc: store.read() }).createTransaction();
    // The public alignment command uses one attribute step per selected block.
    for (let index = 0; index < 200; index++) transaction.setNodeAttrs([index], { align: 'center' });
    expect(store.apply(transaction).toJSON()).toEqual(transaction.doc.toJSON());
    expect(store.read().content.every(node => node.attrs.align === 'center')).toBe(true);
    expect(pools.map(name => document.getMap(name).size)).toEqual(sizes);
  } finally { store.destroy(); document.destroy(); }
});
