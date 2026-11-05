import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url), format = process.argv[2];
assert.ok(['es', 'cjs'].includes(format));
const noDOM = () => { for (const key of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(key in globalThis, false); };
noDOM();
const Y = format === 'es' ? await import('yjs') : require('yjs');
const engine = format === 'es' ? await import('../dist/index.js') : require('../dist/index.cjs');
const { RetainedDocumentStore } = format === 'es' ? await import('./yjs-format-build-20261105/retained-document.mjs') : require('./yjs-format-build-20261105/retained-document.cjs');
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
function pair(reverseIDs = false, content = source) {
  const a = new Y.Doc(), b = new Y.Doc(); a.clientID = reverseIDs ? 202 : 101; b.clientID = reverseIDs ? 101 : 202;
  const left = peer(a, 'left', content, true); Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'seed');
  const right = peer(b, 'right', left.editor.getJSON(), false);
  return { left, right, sync: reverse => {
    const a = Y.encodeStateAsUpdate(left.doc), b = Y.encodeStateAsUpdate(right.doc);
    if (reverse) { Y.applyUpdate(right.doc, a, 'peer'); Y.applyUpdate(left.doc, b, 'peer'); }
    else { Y.applyUpdate(left.doc, b, 'peer'); Y.applyUpdate(right.doc, a, 'peer'); }
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
    assert.ok(manager.undo()); assert.equal(fixture.sync(reverse).child(0).textContent, 'AlXpha');
    assert.ok(manager.redo()); assert.deepEqual(fixture.sync(reverse).toJSON(), changed);
    results.push({ kind, reverse, retainedPeerTyping: true, authorUndoRedo: true });
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
    results.push({ kind: 'concurrent-cuts', reverse, reverseIDs });
  } finally { fixture.destroy(); }
}
for (const reverse of [false, true]) for (const reverseIDs of [false, true]) for (const mixed of [false, true]) {
  const fixture = pair(reverseIDs, mixed ? { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'AA' }, { type: 'text', text: 'BBBB', attrs: { source: 'middle' }, marks: [{ type: 'em' }] }, { type: 'text', text: 'CC' },
  ] }] } : source);
  const { left, right } = fixture;
  const manager = new Y.UndoManager([...left.store.scope], { trackedOrigins: new Set([left.origin]), captureTimeout: 0 });
  try {
    left.editor.dispatch(left.editor.createTransaction().insertText([0, mixed ? 1 : 0], 2, 'Z\u200b😀')); left.apply();
    right.editor.dispatch(mixed ? right.editor.createTransaction().replaceRange(1, 9, '') : right.editor.createTransaction().replaceText([0, 0], 0, 5, '')); right.apply();
    const projection = fixture.sync(reverse), expected = projection.toJSON(), state = Y.encodeStateVector(left.doc);
    assert.equal(projection.child(0).textContent, 'Z\u200b😀');
    if (mixed) { assert.deepEqual(projection.child(0).child(0).attrs, { source: 'middle' }); assert.deepEqual(projection.child(0).child(0).marks.map(mark => mark.type.name), ['em']); }
    assert.ok(!JSON.stringify(expected).includes('$fountain:format')); left.store.read(); assert.deepEqual(Y.encodeStateVector(left.doc), state);
    assert.ok(manager.undo()); assert.equal(fixture.sync(reverse).child(0).textContent, '');
    assert.ok(manager.redo()); assert.deepEqual(fixture.sync(reverse).toJSON(), expected);
    const saved = new Y.Doc();
    try {
      Y.applyUpdate(saved, Y.encodeStateAsUpdate(left.doc), 'saved');
      const reopened = new RetainedDocumentStore(saved, 'compiled-document', left.editor.state.schema, factory('reopened'));
      try { assert.deepEqual(reopened.read().toJSON(), expected); } finally { reopened.destroy(); }
    } finally { saved.destroy(); }
    results.push({ kind: 'delete-all-versus-typing', reverse, reverseIDs, mixed, actualStyleRetained: true, authorUndoRedo: true, savedStateReopened: true });
  } finally { manager.destroy(); fixture.destroy(); }
}
noDOM();
console.log(JSON.stringify({ format, noDOM: true, passingJourneys: results.length, currentAdapterReplaced: false, results }));
