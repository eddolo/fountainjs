import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';
import * as Y from 'yjs';
import * as adapter from 'fountainjs-editor/yjs';

const require = createRequire(import.meta.url);
const scope = process.cwd().replaceAll('\\', '/') + '/node_modules/fountainjs-editor/dist/';
for (const entry of ['fountainjs-editor', 'fountainjs-editor/core', 'fountainjs-editor/yjs']) {
  assert.ok(decodeURI(import.meta.resolve(entry)).includes(scope));
  assert.ok(require.resolve(entry).replaceAll('\\', '/').includes(scope));
}
for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(name in globalThis, false, name);
const cjs = require('fountainjs-editor'), cjsCore = require('fountainjs-editor/core');
const p = (text, id) => ({ type: 'paragraph', attrs: { nodeId: id, audit: { owner: 'Ada' } }, content: [{ type: 'text', text }] });
const source = { type: 'doc', attrs: { audit: 'packed-formatting' }, content: [p('Before', 'before'), p('Left', 'selected'),
  { type: 'image_super', attrs: { src: '/figure.png', alt: 'Retained figure' } }, p('After', 'after')] };
const results = [];
for (const [entry, api, spec] of [['esm-root', root, root.StarterKit.schema], ['esm-core', core, root.StarterKit.schema],
  ['cjs-root', cjs, cjs.StarterKit.schema], ['cjs-core', cjsCore, cjs.StarterKit.schema]]) {
  for (const backward of [false, true]) {
    let mapping;
    const editor = api.createEditor({ schema: spec, content: source, plugins: [api.createHistoryPlugin()],
      onUpdate: (_state, transaction) => { if (transaction.docChanged) mapping = transaction.mapping; } });
    try {
      const before = editor.state.doc, selection = new api.RangeSelection(before, backward ? 16 : 11, backward ? 11 : 16);
      editor.dispatch(editor.createTransaction().setSelection(selection));
      assert.equal(editor.runCommandBatch(() => api.setTextAlignment(editor, 'center')
        && api.setBlockType(editor, 'heading', { level: 2 }) && api.setTextDirection(editor, 'rtl')), true);
      const formatted = editor.getJSON();
      assert.equal(editor.state.doc.child(0), before.child(0));
      assert.equal(editor.state.doc.child(2), before.child(2));
      assert.equal(editor.state.doc.child(3), before.child(3));
      assert.deepEqual(editor.state.doc.attrs, before.attrs);
      assert.equal(editor.state.doc.child(1).type.name, 'heading');
      assert.equal(editor.state.doc.child(1).attrs.nodeId, 'selected');
      assert.deepEqual(editor.state.doc.child(1).attrs.audit, { owner: 'Ada' });
      assert.equal(editor.state.doc.child(1).attrs.align, 'center');
      assert.equal(editor.state.doc.child(1).attrs.dir, 'rtl');
      assert.equal(editor.state.selection.eq(selection), true);
      for (let position = 0; position <= before.nodeSize - 2; position++) {
        assert.equal(mapping.mapResult(position).position, position);
        assert.equal(mapping.mapResult(position).deleted, false);
      }
      assert.equal(api.undo(editor), true); assert.deepEqual(editor.getJSON(), before.toJSON());
      assert.equal(editor.state.selection.eq(selection), true);
      assert.equal(api.redo(editor), true); assert.deepEqual(editor.getJSON(), formatted);
      results.push({ entry, backward, exactOutsideContentAndMetadata: true, identityPositionMap: true, singleHistoryBatch: true });
    } finally { editor.destroy(); }
  }
  const replay = api.createEditor({ schema: spec, content: source, plugins: [api.createHistoryPlugin()] });
  try {
    const before = replay.getJSON();
    replay.dispatch(replay.createTransaction().setSelection(api.Selection.cursor([1, 0], 2)));
    assert.equal(replay.runCommandBatch(() => api.insertText(replay, 'X') && api.setBlockType(replay, 'heading', { level: 2 })), true);
    assert.equal(replay.state.doc.child(1).textContent, 'LeXft');
    assert.equal(replay.state.doc.child(1).type.name, 'heading');
    assert.equal(api.undo(replay), true); assert.deepEqual(replay.getJSON(), before);
    results.push({ entry, replayAfterTextStep: true });
  } finally { replay.destroy(); }
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
    left.dispatch(left.createTransaction().setSelection(api.Selection.cursor([1, 0], 2)));
    right.dispatch(right.createTransaction().setSelection(api.Selection.cursor([1, 0], 0)));
    const sharedRoot = rightY.getXmlFragment('fountain').get(0), sharedBlock = sharedRoot.get(1);
    assert.equal(api.insertText(left, 'L'), true);
    assert.equal(right.runCommandBatch(() => api.setTextAlignment(right, 'center')
      && api.setBlockType(right, 'heading', { level: 2 }) && api.insertText(right, 'R')), true);
    assert.equal(sharedRoot.get(1), sharedBlock);
    sync(); assert.deepEqual(left.getJSON(), right.getJSON());
    assert.equal(left.state.doc.child(1).textContent, 'RLeLft');
    assert.equal(left.state.doc.child(1).type.name, 'heading');
    assert.equal(api.undoCollaboration(right), true); sync();
    assert.deepEqual(left.getJSON(), right.getJSON());
    assert.equal(left.state.doc.child(1).textContent, 'LeLft');
    assert.equal(left.state.doc.child(1).type.name, 'paragraph');
    assert.equal(api.redoCollaboration(right), true); sync();
    assert.deepEqual(left.getJSON(), right.getJSON());
    assert.equal(left.state.doc.child(1).textContent, 'RLeLft');
    assert.equal(left.state.doc.child(1).type.name, 'heading');
    results.push({ entry, sameSharedElement: true, concurrentOfflineTextPreserved: true, authorUndoRedoPreservesRemoteText: true });
  } finally { left.destroy(); right.destroy(); leftY.destroy(); rightY.destroy(); }
}
console.log(JSON.stringify({ actualTarball: true, noDOM: true, cases: results.length, results }));
