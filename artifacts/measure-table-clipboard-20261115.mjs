import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Selection, StarterKit, TableMap, createEditor, pasteTableCells } from '../dist/index.js';

function sample(count) {
  const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins });
  try {
    const { schema } = editor.state;
    const cell = text => schema.node('table_cell', {}, [schema.node('paragraph', {}, [schema.text(text)])]);
    const target = schema.node('table', {}, [schema.node('table_row', {}, [cell('Before')])]);
    editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [target])));
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0, 0], 0)));
    const source = schema.node('table', {}, Array.from({ length: count / 10 }, (_, row) =>
      schema.node('table_row', {}, Array.from({ length: 10 }, (_, column) => cell(`${row}:${column}`)))));
    const start = performance.now(); assert.equal(pasteTableCells(editor, source), true);
    const milliseconds = performance.now() - start;
    const map = TableMap.create(editor.state.doc.child(0));
    assert.equal(map.valid, true); assert.equal(map.cells.length, count);
    assert.equal(map.cellAt(0, 0).node.textContent, '0:0');
    assert.equal(map.cellAt(count / 10 - 1, 9).node.textContent, `${count / 10 - 1}:9`);
    return milliseconds;
  } finally { editor.destroy(); }
}
const results = [];
for (const cells of [100, 1000, 10_000]) {
  const samples = Array.from({ length: 3 }, () => { globalThis.gc?.(); return sample(cells); });
  const ordered = [...samples].sort((left, right) => left - right);
  results.push({ cells, samplesMilliseconds: samples, medianMilliseconds: ordered[1], maximumMilliseconds: ordered[2] });
}
const report = { date: new Date().toISOString(), node: process.version, platform: process.platform,
  scope: 'Observed headless rich-grid paste plus table growth; excludes fixture creation and post-timing integrity assertions; not browser latency or a new acceptance threshold',
  unchangedGates: 'The existing runtime, curve and retention checks are run separately', results };
writeFileSync(new URL('./table-clipboard-headless-cost-20261115.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
