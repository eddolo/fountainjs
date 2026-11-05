import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
const base = new URL(process.argv[2] ?? '../dist/', import.meta.url);
const { CoreExtension, Schema, composeExtensions } = await import(new URL('index.js', base));
const { ServerHTMLImporter } = await import(new URL('html-server.js', base));
const schema = new Schema(composeExtensions([CoreExtension]).schema);
const importer = new ServerHTMLImporter({ maxInputBytes: 2 * 1024 * 1024, maxNodes: 100_000 });
const results = [];
for (const size of [100, 1000, 5000, 10000]) {
  const html = Array.from({ length: size }, (_, index) => `<p data-index="${index}"><strong>Paragraph ${index}</strong> with <a href="https://example.com/${index}">a safe link</a>.</p>`).join('');
  const samples = [];
  for (let index = 0; index < 7; index++) {
    const cpu = process.cpuUsage(), start = performance.now();
    const doc = importer.parse(html, schema);
    const elapsed = performance.now() - start, used = process.cpuUsage(cpu);
    if (doc.childCount !== size || doc.child(size - 1).textContent !== `Paragraph ${size - 1} with a safe link.`) throw new Error('Incomplete parse');
    samples.push({ wallMs: elapsed, cpuMs: (used.user + used.system) / 1000 });
  }
  results.push({ size, samples });
}
writeFileSync(process.argv[3] ?? 'artifacts/server-html-profile-samples-20261105.json', JSON.stringify({
  profileOverhead: process.execArgv.includes('--cpu-prof'), acceptanceGate: false, availableParallelism: availableParallelism(), results,
}, null, 2) + '\n');
console.log(JSON.stringify(results.map(item => ({ size: item.size, wallMs: item.samples.map(row => +row.wallMs.toFixed(2)), cpuMs: item.samples.map(row => +row.cpuMs.toFixed(2)) }))));
