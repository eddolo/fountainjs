import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import * as before from './markdown-source-export-proof-tarball-20261104/consumer/node_modules/fountainjs-editor/dist/index.js';
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
    assert.equal(retainedUnrelatedSource, true);
    const distinct = Array.from({ length: 6 }, (_, index) => imported.document.copy([imported.document.child(0), quote.copy(quote.content.map((paragraph, item) => item === middle ? schema.node('paragraph', {}, [schema.text('Distinct ' + index + '.')]) : paragraph))]));
    let next = 0;
    const distinctExports = measure(() => { const index = next++ % distinct.length; const result = api.MarkdownExporter.exportWithSource(distinct[index], imported.source); assert.equal(result.markdown, source.replace(`Paragraph ${middle} with __source__ [reference][r${middle}].`, 'Distinct ' + index + '.')); });
    record[label] = { distinctExports, firstEditExportMs, retainedUnrelatedSource,
      capture: measure(() => api.MarkdownImporter.parseWithSource(source, schema)), repeatedExport: measure(run) };
  }
  records.push(record);
}
// A rejected draft must still pay for the existing local repair pipeline.
// Measure that cost separately rather than implying every export is faster.
const fallbackCount = 1000;
const fallbackSource = '# Keep [link][r0] ###\n\n' + Array.from({ length: fallbackCount }, (_, index) => `> [r${index}]: /target/${index}`).join('\n') + '\n>\n> # Title ###\n'
  + Array.from({ length: fallbackCount }, (_, index) => `> Paragraph ${index} with __source__ [reference][r${index}].`).join('\n>\n') + '\n';
const rejectedDraftProbe = { count: fallbackCount, scenario: 'Heading changed to paragraph requires quoted blank-line repair' };
for (const [label, api] of [['before', before], ['after', after]]) {
  const schema = new api.Schema(api.CoreSchemaSpec), captured = api.MarkdownImporter.parseWithSource(fallbackSource, schema);
  const quote = captured.document.child(1), changed = captured.document.copy([captured.document.child(0), quote.copy([
    schema.node('paragraph', {}, [schema.text('Changed.')]), ...quote.content.slice(1),
  ])]);
  const expected = fallbackSource.replace('> # Title ###\n', '> Changed.\n> \n');
  const run = () => api.MarkdownExporter.exportWithSource(changed, captured.source);
  const first = run();
  assert.equal(first.markdown, expected);
  assert.deepEqual(api.MarkdownImporter.parse(first.markdown, schema).toJSON(), changed.toJSON());
  rejectedDraftProbe[label] = measure(run);
}
await writeFile('artifacts/markdown-boundary-repair-performance-review-20261104.json', JSON.stringify({
  baseline: 'actual 979c670 tarball', samples: 5, hardLimitsChanged: false, rejectedDraftProbe,
  scope: 'Source-preserving serialization of one edited quoted paragraph with container-carried global definitions; not keystroke latency', records,
}, null, 2) + '\n');
console.log(JSON.stringify(records.map(item => ({ count: item.count,
  beforeCaptureMs: item.before.capture.medianMs, afterCaptureMs: item.after.capture.medianMs,
  beforeWarmExportMs: item.before.repeatedExport.medianMs, afterWarmExportMs: item.after.repeatedExport.medianMs })), null, 2));
