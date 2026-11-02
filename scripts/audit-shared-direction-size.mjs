import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const baselinePackage = JSON.parse(git(['show', 'f3444cd:package.json']));
const currentPackage = JSON.parse(read('package.json'));
for (const key of ['dependencies', 'peerDependencies', 'devDependencies']) assert.deepEqual(currentPackage[key], baselinePackage[key], key);
assert.equal(git(['diff', 'f3444cd', '--', 'src/angular', 'tsconfig.angular.json', 'tsconfig.angular-demo.json', 'vite.lib.config.ts', 'pnpm-lock.yaml']), '');
const angular = read('dist/angular/index.js');
const normalize = source => source.includes('/node_modules/') ? `node_modules/${source.split('/node_modules/').at(-1)}`
  : source.includes('\0') ? source.slice(source.indexOf('\0')) : source;
const modules = report => {
  const result = new Map();
  for (const chunk of report.chunks) for (const module of chunk.modules) if (module.renderedLength > 0) {
    const source = normalize(module.source), known = result.get(source) ?? { length: 0, chunks: [] };
    known.length += module.renderedLength; known.chunks.push(chunk.file); result.set(source, known);
  }
  return result;
};
const formats = [];
for (const format of ['es', 'cjs']) {
  const current = JSON.parse(read(`artifacts/shared-direction-size-audit-${format}-20261011.json`));
  const baseline = JSON.parse(read(`artifacts/shared-direction-size-baseline-${format}-20261011.json`));
  for (const chunk of current.chunks) {
    const built = read(`artifacts/shared-direction-size-audit-dist-20261011/${chunk.file}`);
    assert.equal(built.length, chunk.bytes, `Audit byte length: ${chunk.file}`);
    assert.equal(createHash('sha256').update(built).digest('hex'), chunk.sha256);
    // Diagnostic instrumentation must not change the shipped output.
    assert.equal(createHash('sha256').update(read(`dist/${chunk.file}`)).digest('hex'), chunk.sha256, `Package output: ${chunk.file}`);
  }
  const sum = report => report.chunks.filter(chunk => !/^emoji-data\./.test(chunk.file)).reduce((total, chunk) => total + chunk.bytes, 0)
    + (format === 'es' ? angular.length : 0);
  const before = modules(baseline), after = modules(current);
  const changes = [...new Set([...before.keys(), ...after.keys()])].map(source => ({
    source, before: before.get(source)?.length ?? 0, after: after.get(source)?.length ?? 0,
    delta: (after.get(source)?.length ?? 0) - (before.get(source)?.length ?? 0),
    emittedChunks: after.get(source)?.chunks ?? [],
  })).filter(change => change.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const privateModules = [...after].filter(([source]) => /src\/(core|view)\/(shared-direction(?:-index)?|first-strong-direction|bidi-strong-data)\.ts$/.test(source));
  for (const [source, value] of privateModules) assert.equal(value.chunks.length, 1, `Duplicated private module: ${source}`);
  formats.push({ format, baselineBytes: sum(baseline), currentBytes: sum(current), deltaBytes: sum(current) - sum(baseline),
    privateModules: privateModules.map(([source, value]) => ({ source, ...value })), moduleChanges: changes,
  });
}
const report = { baselineCommit: git(['rev-parse', 'f3444cd']), currentCommit: git(['rev-parse', 'HEAD']),
  scope: 'Same diagnostic build configuration and dependency tree; package runtime code byte-identical to current audit outputs',
  excluded: 'Source maps, CSS/assets, full emoji data; exactly the existing aggregate runtime definition',
  angular: 'Unchanged Angular source/build configuration; same generated ESM bytes added to both totals, not rebuilt in archived baseline',
  attributionCaveat: 'Rollup renderedLength is pre-final-render metadata, not an additive final-byte causal decomposition',
  historicalComparison: 'The rebuilt ESM baseline is 1600.692 KiB, versus 1598.5 in the earlier frozen log; this variation is not explained or relabeled as a size optimization. Capacity is based on current byte-identical package output, not subtraction from that historical number.',
  dependenciesUnchanged: true, formats,
};
writeFileSync(new URL('artifacts/shared-direction-size-attribution-20261011.json', root), JSON.stringify(report, null, 2) + '\n');
for (const result of formats) console.log(`${result.format}: ${(result.baselineBytes / 1024).toFixed(3)} → ${(result.currentBytes / 1024).toFixed(3)} KiB; delta ${(result.deltaBytes / 1024).toFixed(3)} KiB; private modules emitted once each.`);
