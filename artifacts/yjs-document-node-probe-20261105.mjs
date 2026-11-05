import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url), format = process.argv[2];
assert.ok(['es', 'cjs'].includes(format));
const noDOM = () => { for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(name in globalThis, false); };
noDOM();
const Y = format === 'es' ? await import('yjs') : require('yjs');
const engine = format === 'es' ? await import('../dist/index.js') : require('../dist/index.cjs');
const { RetainedDocumentStore } = format === 'es' ? await import('./yjs-document-build-20261105/retained-document.mjs') : require('./yjs-document-build-20261105/retained-document.cjs');
const factory = prefix => { let index = 0; return () => `${prefix}-${index++}`; };
const source = { type: 'doc', attrs: { audit: { owner: 'Ada', keep: true } }, content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }, { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure' } },
] };
function peer(doc, label, content, seed) {
  let transaction;
  const origin = {}, editor = engine.createEditor({ schema: engine.CoreSchemaSpec, content,
    onUpdate: (_state, update) => { if (update.docChanged) transaction = update; } });
  const store = new RetainedDocumentStore(doc, 'compiled-document', editor.state.schema, factory(label), origin);
  if (seed) store.seed(editor.state.doc); else store.read();
  return { doc, editor, store, origin, apply: () => {
    const projected = store.apply(transaction); assert.deepEqual(projected.toJSON(), editor.getJSON()); return projected;
  }, destroy: () => { store.destroy(); editor.destroy(); doc.destroy(); } };
}
function pair(reverseIDs = false) {
  const a = new Y.Doc(), b = new Y.Doc(); a.clientID = reverseIDs ? 202 : 101; b.clientID = reverseIDs ? 101 : 202;
  const left = peer(a, 'left', source, true); Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'seed');
  const right = peer(b, 'right', left.editor.getJSON(), false);
  return { left, right, sync: reverse => {
    const updateA = Y.encodeStateAsUpdate(a), updateB = Y.encodeStateAsUpdate(b);
    if (reverse) { Y.applyUpdate(b, updateA, 'peer'); Y.applyUpdate(a, updateB, 'peer'); }
    else { Y.applyUpdate(a, updateB, 'peer'); Y.applyUpdate(b, updateA, 'peer'); }
    const first = left.store.read(), second = right.store.read(); assert.deepEqual(first.toJSON(), second.toJSON()); return first;
  }, destroy: () => { left.destroy(); right.destroy(); } };
}
const results = [];
for (const reverse of [false, true]) for (const kind of ['quote', 'bullet', 'ordered', 'task', 'mark', 'split']) {
  const fixture = pair(), { left, right } = fixture;
  const manager = new Y.UndoManager([...right.store.scope], { trackedOrigins: new Set([right.origin]), captureTimeout: 0 });
  try {
    left.editor.dispatch(left.editor.createTransaction().insertText([0, 0], 2, 'X')); left.apply();
    right.editor.dispatch(right.editor.createTransaction().setSelection(kind === 'mark'
      ? engine.Selection.range([0, 0], 1, [0, 0], 4) : engine.Selection.cursor([0, 0], 3)));
    assert.equal(kind === 'quote' ? engine.toggleQuote(right.editor) : kind === 'mark' ? engine.setMark(right.editor, 'strong')
      : kind === 'split' ? engine.splitBlock(right.editor) : engine.toggleList(right.editor, kind), true);
    right.apply(); const changed = fixture.sync(reverse).toJSON();
    assert.equal(left.store.read().child(0).textContent, kind === 'split' ? 'AlXp' : 'AlXpha');
    if (kind === 'split') assert.equal(left.store.read().child(1).textContent, 'ha');
    assert.deepEqual(left.store.read().attrs, source.attrs);
    assert.deepEqual(left.store.read().content.at(-1).toJSON(), left.editor.state.schema.nodeFromJSON(source.content[1]).toJSON());
    assert.ok(manager.undo()); const undone = fixture.sync(reverse); assert.equal(undone.child(0).textContent, 'AlXpha');
    assert.equal(undone.child(0).type.name, 'paragraph'); assert.ok(manager.redo()); assert.deepEqual(fixture.sync(reverse).toJSON(), changed);
    results.push({ kind, reverse, actualEngineCommands: true, retainedPeerTyping: true, authorUndoRedo: true });
  } finally { manager.destroy(); fixture.destroy(); }
}
for (const reverse of [false, true]) for (const reverseIDs of [false, true]) {
  const fixture = pair(reverseIDs);
  try {
    for (const [current, offset] of [[fixture.left, 2], [fixture.right, 4]]) {
      current.editor.dispatch(current.editor.createTransaction().setSelection(engine.Selection.cursor([0, 0], offset)));
      assert.equal(engine.splitBlock(current.editor), true); current.apply();
    }
    assert.deepEqual(fixture.sync(reverse).content.slice(0, 3).map(node => node.textContent), ['Al', 'ph', 'a']);
    results.push({ kind: 'concurrent-cuts', reverse, reverseIDs, textBoundaryOrder: true });
  } finally { fixture.destroy(); }
}
// Preserve this known failure explicitly. A thrown projection is not a passed
// end-to-end edit, even though the underlying shared characters still exist.
{
  const fixture = pair();
  try {
    fixture.left.editor.dispatch(fixture.left.editor.createTransaction().insertText([0, 0], 2, 'X')); fixture.left.apply();
    fixture.right.editor.dispatch(fixture.right.editor.createTransaction().replaceText([0, 0], 0, 5, '')); fixture.right.apply();
    const a = Y.encodeStateAsUpdate(fixture.left.doc), b = Y.encodeStateAsUpdate(fixture.right.doc);
    Y.applyUpdate(fixture.left.doc, b, 'peer'); Y.applyUpdate(fixture.right.doc, a, 'peer');
    assert.throws(() => fixture.left.store.read(), /need a leaf identity/);
    assert.throws(() => fixture.right.store.read(), /need a leaf identity/);
    results.push({ kind: 'delete-all-versus-typing', knownFailureReproduced: true, candidateReady: false });
  } finally { fixture.destroy(); }
}
noDOM();
console.log(JSON.stringify({ format, noDOM: true, passingJourneys: 16, knownBlockersReproduced: 1, currentAdapterReplaced: false, results }));
