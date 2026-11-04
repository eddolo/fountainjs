import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import * as before from './markdown-source-boundaries-tarball-20261104/consumer/node_modules/fountainjs-editor/dist/index.js';
import * as after from '../dist/index.js';

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const measure = action => {
  action();
  const samples = [];
  for (let index = 0; index < 5; index++) { const start = performance.now(); action(); samples.push(performance.now() - start); }
  return { medianMs: median(samples), samplesMs: samples };
};
const records = [];
for (const count of [100, 1000, 5000]) {
  const source = Array.from({ length: count }, (_, index) => `*   Item ${index} __source__.`).join('\n') + '\n';
  const record = { count, inputCodeUnits: source.length };
  for (const [label, api] of [['before', before], ['after', after]]) {
    const schema = new api.Schema(api.CoreSchemaSpec);
    const imported = api.MarkdownImporter.parseWithSource(source, schema);
    const target = Math.floor(count / 2), list = imported.document.child(0);
    const changed = imported.document.copy([list.copy(list.content.map((item, index) => index !== target ? item
      : item.copy([schema.node('paragraph', {}, [schema.text('Changed.')])])))]);
    const start = performance.now();
    const first = api.MarkdownExporter.exportWithSource(changed, imported.source);
    const firstExportMs = performance.now() - start;
    assert.deepEqual(api.MarkdownImporter.parse(first.markdown, schema).toJSON(), changed.toJSON());
    const untouchedSourceRetained = first.markdown.includes('*   Item 0 __source__.');
    if (label === 'after') assert.equal(untouchedSourceRetained, true);
    record[label] = { firstExportMs, untouchedSourceRetained,
      capture: measure(() => api.MarkdownImporter.parseWithSource(source, schema)),
      repeatedExport: measure(() => api.MarkdownExporter.exportWithSource(changed, imported.source)) };
  }
  records.push(record);
}
await writeFile('artifacts/markdown-nested-source-performance-review-20261104.json', JSON.stringify({
  baseline: 'actual parent source-boundary packed consumer', samples: 5, hardLimitsChanged: false, records,
}, null, 2) + '\n');
console.log(JSON.stringify(records, null, 2));
