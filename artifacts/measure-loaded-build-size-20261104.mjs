import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { createRequire } from 'node:module';
const { parse } = createRequire(import.meta.resolve('vite'))('acorn');

// Diagnostic, not a new acceptance ceiling. Static ESM closure measurements
// exclude dynamically imported features and external peer dependencies.
const packageRoot = resolve(process.argv[2] ?? '.');
const root = resolve(packageRoot, 'dist'), cache = new Map();
async function inspect(path) {
  if (cache.has(path)) return cache.get(path);
  assert.ok(path.startsWith(root + '\\') || path.startsWith(root + '/'), 'Import escaped dist');
  const buffer = await readFile(path);
  const tree = parse(buffer.toString('utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
  const record = { path: relative(root, path).replaceAll('\\', '/'), raw: buffer.length,
    gzip: gzipSync(buffer).length, brotli: brotliCompressSync(buffer).length,
    imports: [], external: [], dynamic: [] };
  cache.set(path, record);
  for (const statement of tree.body) {
    if (!['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(statement.type) || !statement.source) continue;
    const specifier = statement.source.value;
    assert.equal(typeof specifier, 'string', 'Nonliteral static module specifier');
    if (specifier.startsWith('.')) record.imports.push(resolve(dirname(path), specifier));
    else record.external.push(specifier);
  }
  const visit = node => {
    if (node.type === 'ImportExpression') {
      record.dynamic.push(node.source.type === 'Literal' ? node.source.value : '<computed>');
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => { if (child && typeof child.type === 'string') visit(child); });
      else if (value && typeof value.type === 'string') visit(value);
    }
  };
  visit(tree);
  return record;
}
const packageJSON = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')), entries = [];
for (const [name, conditions] of Object.entries(packageJSON.exports)) {
  const target = conditions?.import?.default;
  if (typeof target !== 'string' || !target.endsWith('.js')) continue;
  const visited = new Set(), records = [];
  const walk = async path => {
    if (visited.has(path)) return;
    visited.add(path);
    const record = await inspect(path);
    records.push(record);
    for (const dependency of record.imports) await walk(dependency);
  };
  await walk(resolve(packageRoot, target));
  entries.push({ entry: name, facadeRawBytes: records[0].raw,
    closureRawBytes: records.reduce((sum, item) => sum + item.raw, 0),
    closureGzipBytes: records.reduce((sum, item) => sum + item.gzip, 0),
    closureBrotliBytes: records.reduce((sum, item) => sum + item.brotli, 0),
    chunks: records.map(item => item.path), external: [...new Set(records.flatMap(item => item.external))],
    dynamic: [...new Set(records.flatMap(item => item.dynamic))] });
}
for (const name of ['.', './core']) {
  const entry = entries.find(item => item.entry === name);
  assert.ok(entry && !entry.chunks.includes('docx.js') && !entry.chunks.includes('emoji-data.js'));
}
await writeFile(process.argv[3] ?? 'artifacts/loaded-build-size-review-20261104.json', JSON.stringify({
  method: 'Static ESM import/re-export closure, each emitted chunk compressed independently',
  excludes: ['dynamic imports', 'external peers', 'CSS', 'browser/framework application code', 'HTTP headers'],
  doesNotApplyConsumerTreeShaking: true,
  estimatesNetworkPayloadOnly: true, measuresRuntimeSpeed: false, acceptanceLimitsChanged: false, entries,
}, null, 2) + '\n');
console.table(entries.filter(item => ['.', './core', './docx', './react'].includes(item.entry))
  .map(item => ({ entry: item.entry, facadeKiB: +(item.facadeRawBytes / 1024).toFixed(1),
    staticRawKiB: +(item.closureRawBytes / 1024).toFixed(1), staticGzipKiB: +(item.closureGzipBytes / 1024).toFixed(1),
    staticBrotliKiB: +(item.closureBrotliBytes / 1024).toFixed(1) })));
