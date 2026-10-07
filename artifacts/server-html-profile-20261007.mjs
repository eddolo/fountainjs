import { performance } from 'node:perf_hooks';
import { CoreExtension, Schema, composeExtensions } from '../dist/index.js';
import { ServerHTMLImporter } from '../dist/html-server.js';

const schema = new Schema(composeExtensions([CoreExtension]).schema);
const importer = new ServerHTMLImporter({ maxInputBytes: 2 * 1024 * 1024, maxNodes: 100_000 });
for (const size of [1000, 5000, 10000]) {
  const source = Array.from({ length: size }, (_, index) =>
    `<p data-index="${index}"><strong>Paragraph ${index}</strong> with <a href="https://example.com/${index}">a safe link</a>.</p>`).join('');
  importer.parse(source, schema);
  const samples = [];
  let result;
  for (let index = 0; index < 6; index++) {
    const started = performance.now();
    result = importer.parse(source, schema);
    samples.push(performance.now() - started);
    if (result.childCount !== size) throw new Error('Incomplete document');
  }
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({ size, samples, p50: samples[2], p95: samples[5], last: result.child(size - 1).toJSON() }));
}
