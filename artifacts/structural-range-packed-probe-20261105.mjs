import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';
import * as Y from 'yjs';
import * as adapter from 'fountainjs-editor/yjs';

const require = createRequire(import.meta.url);
const expectedScope = process.cwd().replaceAll('\\', '/') + '/node_modules/fountainjs-editor/dist/';
for (const entry of ['fountainjs-editor', 'fountainjs-editor/core', 'fountainjs-editor/yjs']) {
  assert.ok(decodeURI(import.meta.resolve(entry)).includes(expectedScope), 'ESM must resolve inside the actual extracted archive');
  assert.ok(require.resolve(entry).replaceAll('\\', '/').includes(expectedScope), 'CJS must resolve inside the actual extracted archive');
}
for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(name in globalThis, false, name);
const cjs = require('fountainjs-editor'), cjsCore = require('fountainjs-editor/core');
const p = text => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const image = { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure' } };
const source = { type: 'doc', attrs: { audit: 'packed-root-metadata' }, content: [p('Left'), image] };
const results = [];
for (const [entry, api, spec] of [['esm-root', root, root.StarterKit.schema], ['esm-core', core, root.StarterKit.schema],
  ['cjs-root', cjs, cjs.StarterKit.schema], ['cjs-core', cjsCore, cjs.StarterKit.schema]]) {
  for (const backward of [false, true]) {
    const editor = api.createEditor({ schema: spec, plugins: [api.createHistoryPlugin()], content: source });
    try {
      const before = editor.state.doc;
      const step = new api.ReplaceRangeStep(3, 8, 'X'), after = step.apply(before);
      assert.equal(after.child(0).textContent, 'LeX'); assert.equal(after.childCount, 1);
      assert.equal(step.getMap(before).map(before.nodeSize - 2), after.nodeSize - 2);
      editor.dispatch(editor.createTransaction().setSelection(new api.RangeSelection(before, backward ? 8 : 3, backward ? 3 : 8)));
      assert.equal(api.insertText(editor, 'X'), true); assert.deepEqual(editor.getJSON(), after.toJSON());
      assert.equal(api.undo(editor), true); assert.deepEqual(editor.getJSON(), before.toJSON());
      assert.equal(editor.state.selection.anchor, backward ? 8 : 3); assert.equal(editor.state.selection.head, backward ? 3 : 8);
      assert.equal(api.redo(editor), true); assert.deepEqual(editor.getJSON(), after.toJSON());
      results.push({ entry, backward, modelMappingDirectionHistory: true });
    } finally { editor.destroy(); }
  }
  const editor = api.createEditor({ schema: spec, content: source });
  try {
    const originalAttrs = editor.state.doc.attrs;
    const fragment = editor.state.schema.nodeFromJSON({ type: 'doc', content: [p('ft'), image] });
    editor.dispatch(editor.createTransaction().setSelection(new api.RangeSelection(editor.state.doc, 0, 8)));
    assert.equal(api.insertDocument(editor, fragment), true);
    assert.equal(editor.state.selection.kind, 'gap', 'Pasting at a structural boundary must leave an insertion caret after media');
    assert.equal(api.insertText(editor, 'After'), true);
    assert.deepEqual(editor.state.doc.content.map(node => node.type.name), ['paragraph', 'image_super', 'paragraph']);
    assert.deepEqual(editor.state.doc.attrs, originalAttrs);
    assert.equal(editor.state.doc.child(0).textContent, 'ft'); assert.equal(editor.state.doc.child(2).textContent, 'After');
    results.push({ entry, structuralRichPasteAndFollowingTyping: true });
  } finally { editor.destroy(); }
}
for (const [entry, api, y, binding] of [['esm-yjs', root, Y, adapter], ['cjs-yjs', cjs, require('yjs'), require('fountainjs-editor/yjs')]]) {
  const leftY = new y.Doc(), rightY = new y.Doc();
  const make = (document, id) => {
    const kit = api.composeExtensions([api.CoreExtension, binding.createYjsCollaborationExtension({ document,
      user: { id, name: id, color: '#a855f7' }, captureTimeout: 0 })]);
    return api.createEditor({ schema: kit.schema, plugins: kit.plugins, content: source });
  };
  const left = make(leftY, 'left'); y.applyUpdate(rightY, y.encodeStateAsUpdate(leftY)); const right = make(rightY, 'right');
  const sync = () => { const a = y.encodeStateAsUpdate(leftY), b = y.encodeStateAsUpdate(rightY); y.applyUpdate(leftY, b); y.applyUpdate(rightY, a); };
  try {
    left.dispatch(left.createTransaction().setSelection(new api.RangeSelection(left.state.doc, 8, 3)));
    right.dispatch(right.createTransaction().setSelection(api.Selection.cursor([0, 0], 0)));
    assert.equal(api.insertText(right, 'Z'), true); sync();
    assert.equal(left.state.selection.anchor, 9); assert.equal(left.state.selection.head, 4);
    assert.equal(api.insertText(left, 'X'), true); sync();
    assert.equal(api.undoCollaboration(left), true);
    assert.equal(left.state.doc.child(0).textContent, 'ZLeft'); assert.equal(left.state.doc.child(1).type.name, 'image_super');
    assert.equal(left.state.selection.anchor, 9); assert.equal(left.state.selection.head, 4);
    assert.equal(api.redoCollaboration(left), true); sync();
    assert.deepEqual(left.getJSON(), right.getJSON()); assert.equal(left.state.doc.child(0).textContent, 'ZLeX');
    results.push({ entry, relativeMixedRangeAndCollaborativeUndo: true });
  } finally { left.destroy(); right.destroy(); leftY.destroy(); rightY.destroy(); }
}
console.log(JSON.stringify({ actualTarball: true, noDOM: true, cases: results.length, results }));
