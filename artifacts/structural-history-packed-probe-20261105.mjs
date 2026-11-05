import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';

const require = createRequire(import.meta.url), results = [];
const scope = process.cwd().replaceAll('\\', '/') + '/node_modules/fountainjs-editor/dist/';
for (const entry of ['fountainjs-editor', 'fountainjs-editor/core']) {
  assert.ok(decodeURI(import.meta.resolve(entry)).includes(scope));
  assert.ok(require.resolve(entry).replaceAll('\\', '/').includes(scope));
}
for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(name in globalThis, false);
const cjs = require('fountainjs-editor'), cjsCore = require('fountainjs-editor/core');
const p = text => ({ type: 'paragraph', attrs: { audit: { owner: 'Ada' } }, content: [{ type: 'text', text }] });
for (const [entry, api, spec] of [['esm-root', root, root.StarterKit.schema], ['esm-core', core, root.StarterKit.schema],
  ['cjs-root', cjs, cjs.StarterKit.schema], ['cjs-core', cjsCore, cjs.StarterKit.schema]]) {
  for (const kind of ['quote', 'bullet', 'ordered', 'task']) {
    const editor = api.createEditor({ schema: spec, plugins: [api.createHistoryPlugin()], content: {
      type: 'doc', attrs: { audit: 'packed wrapping' }, content: [p('Before'), p('Left'),
        { type: 'image_super', attrs: { src: '/figure.png', alt: 'Retained figure' } }, p('After')],
    } });
    try {
      const before = editor.state.doc;
      editor.dispatch(editor.createTransaction().setSelection(new api.RangeSelection(before,
        api.textPointToPosition(before, [1, 0], 2), api.nodeRangeAtPath(before, [2]).to)));
      assert.equal(kind === 'quote' ? api.toggleQuote(editor) : api.toggleList(editor, kind), true);
      const wrapped = editor.getJSON();
      assert.equal(editor.state.doc.child(0), before.child(0));
      assert.equal(editor.state.doc.child(2), before.child(3));
      const wrapper = editor.state.doc.child(1);
      assert.equal(wrapper.type.name, kind === 'quote' ? 'blockquote' : `${kind}_list`);
      assert.equal(kind === 'quote' ? wrapper.child(0) : wrapper.child(0).child(0), before.child(1));
      assert.equal(kind === 'quote' ? wrapper.child(1) : wrapper.child(1).child(0), before.child(2));
      assert.deepEqual(editor.state.doc.attrs, before.attrs);
      assert.equal(api.undo(editor), true); assert.deepEqual(editor.getJSON(), before.toJSON());
      assert.equal(api.redo(editor), true); assert.deepEqual(editor.getJSON(), wrapped);
      results.push({ entry, kind, originalObjectsAndMetadata: true, exactHistory: true });
    } finally { editor.destroy(); }
  }
  for (const replacement of ['', 'BB']) {
    const editor = api.createEditor({ schema: spec, plugins: [api.createHistoryPlugin()], content: {
      type: 'doc', attrs: { audit: 'packed history' }, content: [p('Alpha'), p('Outside')],
    } });
    try {
      const outside = editor.state.doc.child(1);
      editor.dispatch(editor.createTransaction().setSelection(api.Selection.cursor([0, 0], 2)));
      assert.equal(api.splitBlock(editor), true);
      editor.dispatch(editor.createTransaction().replaceText([1, 0], 0, 1, replacement).setMeta('addToHistory', false));
      assert.equal(api.undo(editor), true);
      assert.equal(editor.state.doc.child(0).textContent, `Al${replacement}ha`);
      assert.equal(editor.state.doc.child(1), outside);
      assert.equal(api.redo(editor), true);
      assert.deepEqual(editor.state.doc.content.map(node => node.textContent), ['Al', `${replacement}ha`, 'Outside']);
      assert.equal(editor.state.doc.child(2), outside);
      assert.deepEqual(editor.state.doc.attrs, { audit: 'packed history' });
      results.push({ entry, replacement, independentTextRetained: true, exactOutsideObjectAndMetadata: true });
    } finally { editor.destroy(); }
  }
  const editor = api.createEditor({ schema: spec, content: { type: 'doc', content: [p('Alpha')] } });
  try {
    const before = editor.state.doc, after = before.copy([before.child(0).copy([editor.state.schema.text('AZZpha')])]);
    const maps = [new api.StepMap([2, 1, 0]), new api.StepMap([2, 0, 2])];
    class Compound extends api.ReplaceDocumentStep { getMaps() { return maps; } }
    const transaction = editor.createTransaction().step(new Compound(after));
    assert.deepEqual(transaction.mapping.maps, maps);
    assert.equal(transaction.mapping.map(2, -1), 2); assert.equal(transaction.mapping.map(2, 1), 4);
    assert.equal(editor.dispatch(transaction), true);
    results.push({ entry, compoundStepMapSequence: true });
  } finally { editor.destroy(); }
}
console.log(JSON.stringify({ actualTarball: true, noDOM: true, cases: results.length, results }));
