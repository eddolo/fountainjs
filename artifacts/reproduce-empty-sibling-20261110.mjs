import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const requirePackage = createRequire(resolve(process.argv[2], 'package.json'));
const Y = requirePackage('yjs');
const { CoreExtension, Selection, composeExtensions, createEditor, getCollaborationState, splitBlock, undoCollaboration, redoCollaboration } = requirePackage('fountainjs-editor');
const { createYjsCollaborationExtension } = requirePackage('fountainjs-editor/yjs');
const paragraph = text => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const marked = () => ({ type: 'paragraph', content: [{ type: 'text', text: 'Before ' }, { type: 'text', text: 'marked', marks: [{ type: 'em' }], attrs: { source: 'technical' } }, { type: 'text', text: ' after' }] });
const content = { type: 'doc', content: [paragraph('Alpha'), ...Array.from({ length: 24 }, marked), paragraph('')] };
for (const reverse of [false, true]) {
  const documents = [new Y.Doc(), new Y.Doc()]; documents[0].clientID = 101; documents[1].clientID = 202;
  const make = (document, id) => { const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, captureTimeout: 0, user: { id, name: id, color: '#a855f7' } })]); return createEditor({ schema: kit.schema, plugins: kit.plugins, content }); };
  const left = make(documents[0], 'left'); Y.applyUpdate(documents[1], Y.encodeStateAsUpdate(documents[0])); const right = make(documents[1], 'right');
  let stage = 'offline edits';
  const sync = () => {
    const updates = documents.map(doc => Y.encodeStateAsUpdate(doc));
    for (const index of reverse ? [1, 0] : [0, 1]) Y.applyUpdate(documents[index], updates[1 - index], 'peer');
    for (const editor of [left, right]) assert.equal(getCollaborationState(editor)?.status, 'connected', getCollaborationState(editor)?.error?.message);
    assert.deepEqual(left.getJSON(), right.getJSON());
  };
  try {
    assert.equal(left.dispatch(left.createTransaction().insertText([1, 1], 3, 'X').insertText([25, 0], 0, 'Empty now typed')), true);
    right.dispatch(right.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    assert.equal(splitBlock(right), true); sync(); const merged = right.getJSON();
    stage = 'undo split and exchange'; assert.equal(undoCollaboration(right), true); sync();
    assert.equal(right.state.doc.child(0).textContent, 'Alpha');
    assert.equal(right.state.doc.child(1).child(1).text, 'marXked');
    assert.equal(right.state.doc.content.at(-1).textContent, 'Empty now typed');
    stage = 'redo split'; assert.equal(redoCollaboration(right), true); sync(); assert.deepEqual(right.getJSON(), merged);
    console.log(JSON.stringify({ reverse, passed: true }));
  } catch (error) { console.log(JSON.stringify({ reverse, passed: false, stage, error: error.message })); process.exitCode = 1; }
  finally { left.destroy(); right.destroy(); documents.forEach(doc => doc.destroy()); }
}
