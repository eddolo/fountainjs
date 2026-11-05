import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';

for (const entry of ['fountainjs-editor', 'fountainjs-editor/core']) {
  assert.ok(import.meta.resolve(entry).includes('/cross-container-tarball-20261105/consumer/node_modules/fountainjs-editor/'));
}
for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(name in globalThis, false, name);
const require = createRequire(import.meta.url);
for (const entry of ['fountainjs-editor', 'fountainjs-editor/core']) {
  assert.ok(require.resolve(entry).replaceAll('\\', '/').includes('/cross-container-tarball-20261105/consumer/node_modules/fountainjs-editor/'));
}
const cjs = require('fountainjs-editor'), cjsCore = require('fountainjs-editor/core');
const paragraph = text => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const quote = (...content) => ({ type: 'blockquote', content });
const item = (...content) => ({ type: 'list_item', content });
const list = (...content) => ({ type: 'bullet_list', content });
const image = { type: 'image_super', attrs: { src: '/selected.png', alt: 'Selected image' } };
const merged = { type: 'paragraph', content: [{ type: 'text', text: 'LeX' }, { type: 'text', text: 'ht' }] };
const fixtures = [
  [[quote(paragraph('Left'), image), image, paragraph('Right')], [0, 0, 0], [2, 0], [quote(merged)]],
  [[paragraph('Left'), image, quote(image, paragraph('Right'), paragraph('Tail'))], [0, 0], [2, 1, 0], [merged, quote(paragraph('Tail'))]],
  [[quote(paragraph('Left'), image), image, quote(image, paragraph('Right'), paragraph('Tail'))], [0, 0, 0], [2, 1, 0], [quote(merged, paragraph('Tail'))]],
  [[quote(paragraph('Left'), image), list(item(image, paragraph('Right')), item(paragraph('Tail')))], [0, 0, 0], [1, 0, 1, 0], [quote(merged), list(item(paragraph('Tail')))]],
  [[list(item(paragraph('Left'), image)), quote(image, paragraph('Right'), paragraph('Tail'))], [0, 0, 0, 0], [1, 1, 0], [list(item(merged)), quote(paragraph('Tail'))]],
  [[list(item(paragraph('Left'), image), item(image, paragraph('Right'), paragraph('Tail')), item(paragraph('Last')))], [0, 0, 0, 0], [0, 1, 1, 0], [list(item(merged, paragraph('Tail')), item(paragraph('Last')))]],
  [[quote(quote(paragraph('Left'), image)), paragraph('Right')], [0, 0, 0, 0], [1, 0], [quote(quote(merged))]],
];
const results = [];
for (const [name, api, spec] of [['esm-root', root, root.StarterKit.schema], ['esm-core', core, root.StarterKit.schema],
  ['cjs-root', cjs, cjs.StarterKit.schema], ['cjs-core', cjsCore, cjs.StarterKit.schema]]) {
  for (const [index, [content, start, end, expectedContent]] of fixtures.entries()) {
    const editor = api.createEditor({ schema: spec, plugins: [api.createHistoryPlugin()], content: {
      type: 'doc', content: [...content, paragraph('After')],
    } });
    try {
      const before = editor.state.doc;
      const expected = editor.state.schema.nodeFromJSON({ type: 'doc', content: [...expectedContent, paragraph('After')] });
      const step = new api.ReplaceTextRangeStep(start, 2, end, 3, 'X');
      const after = step.apply(before), map = step.getMap(before);
      assert.deepEqual(after.toJSON(), expected.toJSON());
      assert.equal(map.map(before.nodeSize - 2), after.nodeSize - 2);
      assert.equal(map.map(api.textPointToPosition(before, [before.childCount - 1, 0], 2)),
        api.textPointToPosition(after, [after.childCount - 1, 0], 2));
      editor.dispatch(editor.createTransaction().setSelection(api.Selection.range(start, 2, end, 3)));
      assert.equal(api.insertText(editor, 'X'), true);
      assert.deepEqual(editor.state.doc.toJSON(), expected.toJSON());
      assert.equal(api.undo(editor), true);
      assert.deepEqual(editor.state.doc.toJSON(), before.toJSON());
      assert.equal(api.redo(editor), true);
      assert.deepEqual(editor.state.doc.toJSON(), expected.toJSON());
      results.push({ entry: name, case: index, completeModelMappingAndHistory: true });
    } finally { editor.destroy(); }
  }
}
console.log(JSON.stringify({ actualTarball: true, noDOM: true, cases: results.length, results }));
