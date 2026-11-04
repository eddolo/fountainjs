import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import * as current from '../dist/index.js';
import { ServerHTMLImporter as CurrentHTML } from '../dist/html-server.js';
import * as baseline from './list-layout-tarball-consumer-20261103/node_modules/fountainjs-editor/dist/index.js';
import { ServerHTMLImporter as BaselineHTML } from './list-layout-tarball-consumer-20261103/node_modules/fountainjs-editor/dist/html-server.js';

const html = Array.from({ length: 100 }, (_, index) => `<p data-index="${index}"><strong>Paragraph ${index}</strong> with <a href="https://example.com/${index}">a safe link</a>.</p>`).join('');
const entry = (api, Importer) => ({ schema: new api.Schema(api.composeExtensions([api.CoreExtension]).schema),
  importer: new Importer({ maxInputBytes: 2 * 1024 * 1024, maxNodes: 100_000 }) });
const entries = { current: entry(current, CurrentHTML), baseline: entry(baseline, BaselineHTML) };
const samples = [];
for (let pair = 0; pair < 12; pair++) {
  const documents = {};
  for (const name of pair % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
    const { schema, importer } = entries[name];
    const usage = process.cpuUsage(), start = performance.now();
    documents[name] = importer.parse(html, schema);
    const wallMs = performance.now() - start, cpu = process.cpuUsage(usage);
    samples.push({ pair, name, wallMs, cpuMs: (cpu.user + cpu.system) / 1000 });
  }
  assert.deepEqual(documents.current.toJSON(), documents.baseline.toJSON());
}
const summary = Object.fromEntries(['baseline', 'current'].map(name => {
  const sorted = samples.filter(sample => sample.name === name).map(sample => sample.wallMs).sort((a, b) => a - b);
  return [name, { medianMs: (sorted[5] + sorted[6]) / 2, maximumMs: sorted.at(-1) }];
}));
const report = { baseline: 'retained d8e6f3d package', input: 'unchanged 100-paragraph performance fixture',
  purpose: 'Alternating-order causal diagnostic only; not a replacement for the original standalone performance gate.',
  productionGateChanged: false, warmupIterations: 0, completeDocumentEquality: true, samples, summary };
writeFileSync('artifacts/paragraph-spacing-parser-diagnostic-20261104.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(summary));
