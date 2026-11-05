import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
const modules = [];
for (const [name, relative] of [['parent', './code-label-tarball-20261104/consumer/node_modules/fountainjs-editor/dist/'], ['candidate', '../dist/']]) {
  const base = new URL(relative, import.meta.url), root = await import(new URL('index.js', base));
  const { ServerHTMLImporter } = await import(new URL('html-server.js', base));
  modules.push({ name, schema: new root.Schema(root.composeExtensions([root.CoreExtension]).schema), importer: new ServerHTMLImporter({ maxInputBytes: 2 * 1024 * 1024, maxNodes: 100_000 }) });
}
const results = [];
for (const size of [100, 1000, 5000, 10000]) {
  const html = Array.from({ length: size }, (_, index) => `<p data-index="${index}"><strong>Paragraph ${index}</strong> with <a href="https://example.com/${index}">a safe link</a>.</p>`).join('');
  const reference = modules[0].importer.parseWithReport(html, modules[0].schema);
  const candidate = modules[1].importer.parseWithReport(html, modules[1].schema);
  assert.deepEqual(candidate.document.toJSON(), reference.document.toJSON());
  assert.deepEqual(candidate.issues, reference.issues);
  const samples = [];
  for (let index = 0; index < 7; index++) {
    for (const entry of index % 2 ? [...modules].reverse() : modules) {
      const cpu = process.cpuUsage(), start = performance.now();
      const doc = entry.importer.parse(html, entry.schema);
      const wallMs = performance.now() - start, used = process.cpuUsage(cpu);
      assert.equal(doc.childCount, size);
      samples.push({ name: entry.name, iteration: index, wallMs, cpuMs: (used.user + used.system) / 1000 });
    }
  }
  results.push({ size, completeModelAndIssuesEqual: true, samples });
}
writeFileSync(process.argv[2], JSON.stringify({ acceptanceGate: false, method: 'Same process, alternate order, seven runs; no discarded samples; two independently loaded implementations.', results }, null, 2) + '\n');
console.log(JSON.stringify(results.map(row => ({ size: row.size, samples: row.samples.map(v => ({ ...v, wallMs: +v.wallMs.toFixed(2) })) }))));
