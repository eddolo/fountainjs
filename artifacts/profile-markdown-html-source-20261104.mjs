import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import * as before from './markdown-reference-boundaries-tarball-20261104/consumer/node_modules/fountainjs-editor/dist/index.js';
import * as after from '../dist/index.js';

const measure = action => {
  action();
  const samplesMs = [];
  for (let index = 0; index < 5; index++) { const start = performance.now(); action(); samplesMs.push(performance.now() - start); }
  return { medianMs: [...samplesMs].sort((a, b) => a - b)[2], samplesMs };
};
const records = [];
for (const count of [100, 1000, 5000]) {
  const source = Array.from({ length: count }, (_, index) => `[r${index}]: /target/${index}`).join('\n') + '\n\n'
    + Array.from({ length: count }, (_, index) => `Paragraph ${index} with __source__ [reference][r${index}].`).join('\n\n') + '\n';
  const record = { count, referenceCount: count, inputCodeUnits: source.length };
  for (const [label, api, options] of [['parentNative', before, {}], ['currentNative', after, {}], ['currentHTMLPolicy', after, { parseHTMLBlock: () => null }]]) {
    const schema = new api.Schema(api.CoreSchemaSpec), imported = api.MarkdownImporter.parseWithSource(source, schema, options);
    const changed = imported.document.copy(imported.document.content.map((node, index) => index !== Math.floor(count / 2)
      ? node : schema.node('paragraph', {}, [schema.text('Changed.')])));
    const moved = imported.document.copy([...imported.document.content.slice(1), imported.document.child(0)]);
    const run = document => api.MarkdownExporter.exportWithSource(document, imported.source);
    const firstStart = performance.now();
    const firstMoved = run(moved);
    const firstMoveMs = performance.now() - firstStart;
    assert.deepEqual(api.MarkdownImporter.parse(firstMoved.markdown, schema, options).toJSON(), moved.toJSON());
    assert.deepEqual(api.MarkdownImporter.parse(run(changed).markdown, schema, options).toJSON(), changed.toJSON());
    record[label] = { firstMoveMs, capture: measure(() => api.MarkdownImporter.parseWithSource(source, schema, options)),
      unrelatedEdit: measure(() => run(changed)), structuralMove: measure(() => run(moved)) };
  }
  records.push(record);
}
const report = { baseline: 'actual PR #11 tarball', samples: 5, hardLimitsChanged: false,
  scope: 'Synchronous source export with and without a registered HTML block policy; not editor keystroke latency', records };
await writeFile('artifacts/markdown-html-source-performance-review-20261104.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(records.map(item => ({ count: item.count,
  parentNativeWarmMoveMs: item.parentNative.structuralMove.medianMs,
  currentNativeWarmMoveMs: item.currentNative.structuralMove.medianMs,
  HTMLPolicyWarmMoveMs: item.currentHTMLPolicy.structuralMove.medianMs,
  HTMLPolicyWarmEditMs: item.currentHTMLPolicy.unrelatedEdit.medianMs })), null, 2));
