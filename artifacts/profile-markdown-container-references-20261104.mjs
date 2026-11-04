import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import * as before from './markdown-nested-references-tarball-20261104/consumer/node_modules/fountainjs-editor/dist/index.js';
import * as after from '../dist/index.js';

const measure = action => {
  action();
  const samplesMs = [];
  for (let index = 0; index < 5; index++) { const start = performance.now(); action(); samplesMs.push(performance.now() - start); }
  return { medianMs: [...samplesMs].sort((a, b) => a - b)[2], samplesMs };
};
const records = [];
for (const count of [100, 1000, 5000]) {
  const source = '# Keep [link][r0] ###\n\n' + Array.from({ length: count }, (_, index) => `> [r${index}]: /target/${index}`).join('\n') + '\n>\n'
    + Array.from({ length: count }, (_, index) => `> Paragraph ${index} with __source__ [reference][r${index}].`).join('\n>\n') + '\n';
  const record = { count, referenceCount: count, inputCodeUnits: source.length };
  for (const [label, api] of [['before', before], ['after', after]]) {
    const schema = new api.Schema(api.CoreSchemaSpec), imported = api.MarkdownImporter.parseWithSource(source, schema);
    const middle = Math.floor(count / 2), quote = imported.document.child(1);
    const changedQuote = quote.copy(quote.content.map((paragraph, index) => index !== middle ? paragraph
      : schema.node('paragraph', {}, [schema.text('Changed.')])));
    const changed = imported.document.copy([imported.document.child(0), changedQuote]);
    const run = () => api.MarkdownExporter.exportWithSource(changed, imported.source);
    const firstStart = performance.now(), first = run(), firstEditExportMs = performance.now() - firstStart;
    assert.deepEqual(api.MarkdownImporter.parse(first.markdown, schema).toJSON(), changed.toJSON());
    const expected = source.replace(`Paragraph ${middle} with __source__ [reference][r${middle}].`, 'Changed.');
    const retainedUnrelatedSource = first.markdown === expected;
    assert.equal(retainedUnrelatedSource, label === 'after');
    record[label] = { firstEditExportMs, retainedUnrelatedSource,
      capture: measure(() => api.MarkdownImporter.parseWithSource(source, schema)), repeatedExport: measure(run) };
  }
  records.push(record);
}
await writeFile('artifacts/markdown-container-references-performance-review-20261104.json', JSON.stringify({
  baseline: 'actual PR #13 tarball', samples: 5, hardLimitsChanged: false,
  scope: 'Source-preserving serialization of one edited quoted paragraph with container-carried global definitions; not keystroke latency', records,
}, null, 2) + '\n');
console.log(JSON.stringify(records.map(item => ({ count: item.count,
  beforeCaptureMs: item.before.capture.medianMs, afterCaptureMs: item.after.capture.medianMs,
  beforeWarmExportMs: item.before.repeatedExport.medianMs, afterWarmExportMs: item.after.repeatedExport.medianMs })), null, 2));
