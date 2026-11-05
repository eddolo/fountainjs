import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as Y from 'yjs';
import * as engine from '../dist/index.js';
import { RetainedDocumentStore as Before } from './yjs-format-build-20261105/retained-document.mjs';
import { RetainedDocumentStore as Candidate } from './yjs-compact-build-20261105/retained-document.mjs';

const results = [];
const stores = process.argv.includes('--candidate-only') ? [['compact-candidate', Candidate]] : [['full-provenance-candidate', Before], ['compact-candidate', Candidate]];
for (let trial = 0; trial < 3; trial++) for (const characters of [256, 1024]) for (const [label, Store] of (trial % 2 ? [...stores].reverse() : stores)) {
  let transaction, identity = 0;
  const document = new Y.Doc(), editor = engine.createEditor({ schema: engine.CoreSchemaSpec,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
    onUpdate: (_state, change) => { if (change.docChanged) transaction = change; } });
  document.clientID = 101;
  const store = new Store(document, 'sample', editor.state.schema, () => `sample-${identity++}`);
  try {
    store.seed(editor.state.doc); const started = performance.now();
    for (let index = 0; index < characters; index++) {
      editor.dispatch(editor.createTransaction().insertText([0, 0], index, 'x')); store.apply(transaction);
    }
    const elapsedMs = performance.now() - started, projected = store.read();
    assert.equal(projected.textContent, 'x'.repeat(characters)); assert.deepEqual(projected.toJSON(), editor.getJSON());
    assert.equal(projected.child(0).childCount, 1);
    results.push({ label, trial, characters, elapsedMs, millisecondsPerEdit: elapsedMs / characters,
      encodedSharedStateBytes: Y.encodeStateAsUpdate(document).byteLength, modelTextLeaves: projected.child(0).childCount });
  } finally { store.destroy(); editor.destroy(); document.destroy(); }
}
const medians = [256, 1024].flatMap(characters => stores.map(([label]) => {
  const samples = results.filter(result => result.characters === characters && result.label === label);
  const times = samples.map(result => result.elapsedMs).sort((a, b) => a - b), sizes = new Set(samples.map(result => result.encodedSharedStateBytes));
  assert.equal(sizes.size, 1);
  return { label, characters, medianElapsedMs: times[1], encodedSharedStateBytes: [...sizes][0], trials: samples.length };
}));
console.log(JSON.stringify({ scope: 'isolated candidates, three alternating-order trials in one process; not production performance certification', medians, results }, null, 2));
