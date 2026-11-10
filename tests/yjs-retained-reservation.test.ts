// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, EditorState, Schema, composeExtensions, type Transaction } from '../src';
import { SplitNodeStep } from '../src/core/transaction/split-node-step';
import { RetainedDocumentStore } from '../src/yjs/retained-document';

type Case = { name: string; change: (transaction: Transaction, schema: Schema) => void };
const split = (transaction: Transaction, offset: number) => {
  const paragraph = transaction.doc.child(0);
  transaction.step(new SplitNodeStep([0], paragraph, [0], offset, [paragraph, paragraph.child(0)]));
};
const cases: Case[] = [
  { name: 'native character replacement', change: tr => { tr.replaceText([0, 0], 1, 2, 'X'); } },
  { name: 'full leaf replacement', change: tr => { tr.replaceText([0, 0], 0, 5, 'Replaced'); } },
  { name: 'clear then type into the empty leaf', change: tr => { tr.replaceText([0, 0], 0, 5, '').insertText([0, 0], 0, 'Again'); } },
  { name: 'empty leaf before retained text', change: (tr, schema) => {
    const paragraph = tr.doc.child(0); tr.replaceNode([0], [paragraph.copy([schema.text(''), paragraph.child(0)])]);
  } },
  { name: 'empty leaf after retained text', change: (tr, schema) => {
    const paragraph = tr.doc.child(0); tr.replaceNode([0], [paragraph.copy([paragraph.child(0), schema.text('')])]);
  } },
  { name: 'empty leaves around retained text', change: (tr, schema) => {
    const paragraph = tr.doc.child(0); tr.replaceNode([0], [paragraph.copy([schema.text(''), paragraph.child(0), schema.text('')])]);
  } },
  { name: 'split at the beginning', change: tr => { split(tr, 0); } },
  { name: 'split in the middle then change metadata', change: tr => { split(tr, 2); tr.setNodeAttrs([1], { align: 'center' }); } },
  { name: 'split at the end', change: tr => { split(tr, 5); } },
  { name: 'wrap then unwrap a retained paragraph', change: (tr, schema) => {
    tr.replace(0, 1, [schema.node('blockquote', {}, [tr.doc.child(0)])]);
    tr.replace(0, 1, [tr.doc.child(0).child(0)]);
  } },
  { name: 'reorder existing blocks', change: tr => { tr.replace(0, 3, [tr.doc.child(2), tr.doc.child(0), tr.doc.child(1)]); } },
  { name: 'split mark leaves then change metadata', change: (tr, schema) => {
    tr.addMark([0, 0], 1, 4, schema.mark('strong')).setNodeAttrs([0], { align: 'center' });
  } },
];

it.each(cases)('reserves at least the actual shared allocations for $name', ({ change }) => {
  const schema = new Schema(composeExtensions([CoreExtension]).schema), document = new Y.Doc();
  let sequence = 0;
  const store = new RetainedDocumentStore(document, 'reservation', schema, () => `reservation-${sequence++}`);
  const pools = ['reservation-nodes:nodes', 'reservation-nodes:identities', 'reservation-text:owners', 'reservation-text:texts', 'reservation-text:styles'];
  const reserved = [0, 0, 0, 0, 0];
  const nodeCheck = store.nodes.checkCapacity.bind(store.nodes), textCheck = store.text.checkCapacity.bind(store.text);
  const nodeSpy = vi.spyOn(store.nodes, 'checkCapacity').mockImplementation((nodes, references) => {
    reserved[0] += nodes; reserved[1] += references; nodeCheck(nodes, references);
  });
  const textSpy = vi.spyOn(store.text, 'checkCapacity').mockImplementation((partitions, streams, styles, formats, keys, growth) => {
    // Exact native formats may reuse an existing style; counting all requested
    // formats is a safe upper bound for the allocation contract being tested.
    reserved[2] += partitions; reserved[3] += streams; reserved[4] += styles + formats.length;
    textCheck(partitions, streams, styles, formats, keys, growth);
  });
  try {
    store.seed(schema.node('doc', {}, ['Alpha', 'Bravo', 'Charlie'].map(text => schema.node('paragraph', {}, [schema.text(text)]))));
    const before = pools.map(name => document.getMap(name).size);
    reserved.fill(0);
    const transaction = EditorState.create({ schema, doc: store.read() }).createTransaction();
    change(transaction, schema);
    expect(store.apply(transaction).toJSON()).toEqual(transaction.doc.toJSON());
    expect(store.read().toJSON()).toEqual(transaction.doc.toJSON());
    for (let index = 0; index < pools.length; index++) {
      const allocated = document.getMap(pools[index]).size - before[index];
      expect(reserved[index], `${pools[index]} reservation must cover ${allocated} new entries`).toBeGreaterThanOrEqual(allocated);
    }
  } finally { nodeSpy.mockRestore(); textSpy.mockRestore(); store.destroy(); document.destroy(); }
});
