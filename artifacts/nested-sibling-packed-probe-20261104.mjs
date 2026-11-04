import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as root from 'fountainjs-editor';
import * as core from 'fountainjs-editor/core';
import { checkMarkdownSourceProof } from '../../../scripts/fixtures/markdown-source-proof-check.mjs';
import { checkMarkdownContainerReferences } from '../../../scripts/fixtures/markdown-container-reference-check.mjs';

assert.ok(import.meta.resolve('fountainjs-editor').includes('/nested-sibling-tarball-20261104/consumer/node_modules/fountainjs-editor/'));
for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(name in globalThis, false, name);
const require = createRequire(import.meta.url), cjs = require('fountainjs-editor');
const modules = [[root, root.CoreSchemaSpec], [core, root.CoreSchemaSpec], [cjs, cjs.CoreSchemaSpec], [require('fountainjs-editor/core'), cjs.CoreSchemaSpec]];
const proofResults = modules.map(([api, spec]) => checkMarkdownSourceProof(api, spec));
const containerResults = modules.map(([api, spec]) => checkMarkdownContainerReferences(api, spec));
assert.deepEqual(proofResults, [25, 25, 25, 25]);
assert.deepEqual(containerResults, [36, 36, 36, 36]);
const paragraph = text => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const cases = [
  { name: 'quote', path: [0], wrap: content => ({ type: 'blockquote', content }) },
  { name: 'list', path: [0, 0], wrap: content => ({ type: 'bullet_list', content: [{ type: 'list_item', content }] }) },
  { name: 'cell', path: [0, 0, 0], wrap: content => ({ type: 'table', content: [{ type: 'table_row', content: [{ type: 'table_cell', content }] }] }) },
];
const rangeResults = [];
for (const [api, spec] of modules) for (const item of cases) {
  const editor = api.createEditor({ schema: spec, plugins: [api.createHistoryPlugin()], content: { type: 'doc', content: [
    item.wrap([paragraph('Left'), { type: 'image_super', attrs: { src: '/figure.png' } }, paragraph('Right')]), paragraph('After.'),
  ] } });
  try {
    const before = editor.state.doc;
    const start = [...item.path, 0, 0], end = [...item.path, 2, 0];
    const step = new api.ReplaceTextRangeStep(start, 2, end, 3, 'X');
    const result = step.apply(before);
    assert.equal(step.getMap(before).map(before.nodeSize - 2), result.nodeSize - 2);
    editor.dispatch(editor.createTransaction().setSelection(api.Selection.range(start, 2, end, 3)));
    assert.equal(api.insertText(editor, 'X'), true);
    assert.equal(editor.state.doc.eq(result), true);
    let parent = editor.state.doc;
    for (const index of item.path) parent = parent.child(index);
    assert.equal(parent.childCount, 1);
    assert.equal(parent.textContent, 'LeXht');
    assert.equal(editor.state.doc.child(1), before.child(1));
    assert.equal(api.undo(editor), true);
    assert.equal(editor.state.doc.eq(before), true);
    assert.equal(api.redo(editor), true);
    assert.equal(editor.state.doc.eq(result), true);
    rangeResults.push(item.name);
  } finally { editor.destroy(); }
}
console.log(JSON.stringify({ actualTarball: true, entries: 4, noFakeDOM: true, proofResults, containerResults, rangeResults }));
