import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as Y from 'yjs';
import * as engine from '../dist/index.js';
import { RetainedDocumentStore as Before } from './yjs-document-build-20261105/retained-document.mjs';
import { RetainedDocumentStore as Candidate } from './yjs-format-build-20261105/retained-document.mjs';

const results = [];
for (const characters of [256, 1024]) for (const [label, Store] of [['previous-candidate', Before], ['format-candidate', Candidate]]) {
  let transaction, identity = 0;
  const document = new Y.Doc(), editor = engine.createEditor({ schema: engine.CoreSchemaSpec,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
    onUpdate: (_state, change) => { if (change.docChanged) transaction = change; } });
  const store = new Store(document, 'sample', editor.state.schema, () => `sample-${identity++}`);
  try {
    store.seed(editor.state.doc); const started = performance.now();
    for (let index = 0; index < characters; index++) {
      editor.dispatch(editor.createTransaction().insertText([0, 0], index, 'x')); store.apply(transaction);
    }
    const elapsedMs = performance.now() - started, projected = store.read();
    assert.equal(projected.textContent, 'x'.repeat(characters)); assert.deepEqual(projected.toJSON(), editor.getJSON());
    assert.equal(projected.child(0).childCount, 1);
    results.push({ label, characters, elapsedMs, millisecondsPerEdit: elapsedMs / characters,
      encodedSharedStateBytes: Y.encodeStateAsUpdate(document).byteLength, modelTextLeaves: projected.child(0).childCount });
  } finally { store.destroy(); editor.destroy(); document.destroy(); }
}
console.log(JSON.stringify({ scope: 'isolated candidate, single-process diagnostic; not a production performance gate or default-adapter comparison',
  measurementsAreNotCertification: true, results }, null, 2));
