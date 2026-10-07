import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

// Diagnostic only: compile two artifact bundles without editing src or dist.
const require = createRequire(import.meta.url);
const { build } = await import(pathToFileURL(require.resolve('esbuild', { paths: ['C:/Users/cappu'] })));
const original = readFileSync('src/html/server.ts', 'utf8');
const before = `    const value = htmlparser2Adapter.getAttrList(this.raw)
      .find((attribute) => attribute.name.toLowerCase() === name.toLowerCase())?.value;
    return value ?? null;`;
const after = `    const attributes = this.raw.attribs;
    const wanted = name.toLowerCase();
    for (const key of Object.keys(attributes)) {
      if (key.toLowerCase() === wanted) return attributes[key] ?? null;
    }
    return null;`;
assert.ok(original.includes(before), 'Attribute lookup prototype source changed');
const proposed = original.replace(before, after);
const entry = `export { Schema } from '../src/core/schema';
export { CoreExtension, composeExtensions, defineExtension } from '../src/extensions';
export { ServerHTMLImporter } from '../src/html/server';`;
for (const [name, contents] of [['baseline', original], ['candidate', proposed]]) {
  await build({
    stdin: { contents: entry, sourcefile: 'attribute-prototype.ts', resolveDir: resolve('artifacts'), loader: 'ts' },
    outfile: `artifacts/server-html-attribute-${name}-20261007.mjs`,
    format: 'esm', platform: 'node', target: 'node24', bundle: true, packages: 'external',
    plugins: [{ name: 'isolated-source', setup(plugin) {
      plugin.onLoad({ filter: /[\\/]src[\\/]html[\\/]server\.ts$/ }, () => ({ contents, loader: 'ts', resolveDir: resolve('src/html') }));
    } }],
  });
}
const runtimes = await Promise.all(['baseline', 'candidate'].map(name => import(`./server-html-attribute-${name}-20261007.mjs`)));
const names = ['DATA-PROBE', 'data-probe', 'viewbox', 'viewBox', 'HREF', 'xlink:href', 'xml:lang', '__proto__', 'constructor', 'missing', 'empty'];
const schemas = runtimes.map(runtime => new runtime.Schema(runtime.composeExtensions([runtime.CoreExtension, runtime.defineExtension({
  name: 'attribute-probe',
  marks: { attribute_probe: { attrs: { values: { default: [] } }, parseHTML: [{ tag: '[data-probe]', getAttrs(element) {
    const values = names.map(name => [name, element.getAttribute(name)]);
    // Match existing observable fresh lookup semantics if a host changes the raw tree.
    const raw = element.raw;
    if (raw) {
      raw.attribs['data-probe'] = 'changed';
      values.push(['changed', element.getAttribute('DATA-PROBE')]);
      delete raw.attribs['data-probe'];
      values.push(['removed', element.getAttribute('data-probe')]);
    }
    return { values };
  } }] } },
})]).schema));
const fixtures = [
  '<p data-probe="one" empty="" __proto__="safe" constructor="data">Text <strong>B</strong> <a href="/safe">link</a></p>',
  '<p DATA-PROBE="first" data-probe="second">Duplicate</p>',
  '<svg data-probe="svg" viewBox="0 0 1 1" xlink:href="#x" xml:lang="en"><text>SVG</text></svg>',
  '<ul><li>A</li><li><p>B</p><ol start="0"><li>C</li></ol></li></ul>',
  '<table width="100%"><tr><th rowspan="2">H</th><td>A</td></tr><tr><td>B</td></tr></table>',
  '<figure><img src="https://example.com/a.png" alt="Image"><figcaption>Caption</figcaption></figure>',
  '<p><a href="javascript:alert(1)">Unsafe</a><a href="/url\\back">Backslash</a></p>',
];
for (const html of fixtures) {
  const results = runtimes.map((runtime, at) => {
    const imported = new runtime.ServerHTMLImporter({ sourceTokens: true }).parseWithReport(html, schemas[at]);
    return { document: imported.document.toJSON(), issues: imported.issues };
  });
  assert.deepEqual(results[1], results[0]);
}
console.log(JSON.stringify({ equivalenceFixtures: fixtures.length, attributeNames: names.length, sourceUnchanged: readFileSync('src/html/server.ts', 'utf8') === original }));
for (const size of [1000, 5000, 10000]) {
  const source = Array.from({ length: size }, (_, index) => `<p data-index="${index}"><strong>Paragraph ${index}</strong> with <a href="https://example.com/${index}">a safe link</a>.</p>`).join('');
  const importers = runtimes.map(runtime => new runtime.ServerHTMLImporter({ maxInputBytes: 2 * 1024 * 1024, maxNodes: 100000 }));
  const kits = runtimes.map(runtime => new runtime.Schema(runtime.composeExtensions([runtime.CoreExtension]).schema));
  const run = at => { const result = importers[at].parse(source, kits[at]); assert.equal(result.childCount, size); };
  for (let i = 0; i < 3; i++) { run(0); run(1); }
  const samples = [[], []];
  for (let i = 0; i < 12; i++) for (const at of i % 2 ? [1, 0] : [0, 1]) {
    const start = performance.now(); run(at); samples[at].push(performance.now() - start);
  }
  console.log(JSON.stringify({ size, samples: samples.map(values => values.sort((a,b) => a-b)), labels: ['baseline', 'candidate'], qualification: 'Alternating warmed artifact-only diagnostic; not release-gate evidence.' }));
}
assert.equal(readFileSync('src/html/server.ts', 'utf8'), original);
