import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import * as before from './markdown-nested-source-tarball-20261104/consumer/node_modules/fountainjs-editor/dist/index.js';
import * as after from '../dist/index.js';

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const measure = action => {
  action();
  const samplesMs = [];
  for (let index = 0; index < 5; index++) { const start = performance.now(); action(); samplesMs.push(performance.now() - start); }
  return { medianMs: median(samplesMs), samplesMs };
};
const records = [];
for (const count of [100, 1000, 5000]) {
  const source = Array.from({ length: count }, (_, index) => `[r${index}]: /target/${index}`).join('\n') + '\n\n'
    + Array.from({ length: count }, (_, index) => `Paragraph ${index} with __source__ [reference][r${index}].`).join('\n\n') + '\n';
  const record = { count, referenceCount: count, inputCodeUnits: source.length };
  for (const [label, api] of [['before', before], ['after', after]]) {
    const schema = new api.Schema(api.CoreSchemaSpec), imported = api.MarkdownImporter.parseWithSource(source, schema);
    const changed = imported.document.copy(imported.document.content.map((node, index) => index !== Math.floor(count / 2)
      ? node : schema.node('paragraph', {}, [schema.text('Changed.')]))) ;
    const moved = imported.document.copy([...imported.document.content.slice(1), imported.document.child(0)]);
    const run = document => api.MarkdownExporter.exportWithSource(document, imported.source);
    const firstStart = performance.now();
    const firstMoved = run(moved);
    const firstMoveMs = performance.now() - firstStart;
    assert.deepEqual(api.MarkdownImporter.parse(firstMoved.markdown, schema).toJSON(), moved.toJSON());
    assert.deepEqual(api.MarkdownImporter.parse(run(changed).markdown, schema).toJSON(), changed.toJSON());
    record[label] = { firstMoveMs, capture: measure(() => api.MarkdownImporter.parseWithSource(source, schema)),
      unrelatedEdit: measure(() => run(changed)), structuralMove: measure(() => run(moved)) };
  }
  records.push(record);
}
await writeFile('artifacts/markdown-reference-boundaries-performance-review-20261104.json', JSON.stringify({
  baseline: 'actual PR #10 tarball', samples: 5, hardLimitsChanged: false, records,
}, null, 2) + '\n');
console.log(JSON.stringify(records.map(item => ({ count: item.count,
  beforeCaptureMs: item.before.capture.medianMs, afterCaptureMs: item.after.capture.medianMs,
  beforeFirstMoveMs: item.before.firstMoveMs, afterFirstMoveMs: item.after.firstMoveMs,
  beforeMoveMs: item.before.structuralMove.medianMs, afterMoveMs: item.after.structuralMove.medianMs })), null, 2));
