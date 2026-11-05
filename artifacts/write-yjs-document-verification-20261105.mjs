import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const base = '6589ceb6387290e451b787947b3b8bef7c6ab687';
const root = process.cwd(), sha = value => createHash('sha256').update(value).digest('hex');
const read = name => readFileSync(name, 'utf8').replace(/^\uFEFF/, '');
const parse = name => JSON.parse(read(name));
const unit = parse('artifacts/yjs-document-unit-20261105.json');
const failures = unit.testResults.flatMap(file => file.assertionResults.filter(test => test.status === 'failed')
  .map(test => ({ file: relative(root, file.name).replaceAll('\\', '/'), name: test.fullName })));
assert.equal(unit.numTotalTests, 4233); assert.equal(unit.numPassedTests, 4226);
assert.equal(unit.numFailedTests, 7); assert.equal(unit.numPendingTests, 0);
assert.equal(failures.filter(test => test.file === 'tests/yjs-document-range.test.ts').length, 6);
assert.deepEqual(failures.filter(test => test.file !== 'tests/yjs-document-range.test.ts'), [{
  file: 'tests/yjs-retained-document.test.ts', name: 'retains unseen peer typing when all locally observed characters are deleted',
}]);
const compiled = ['es', 'cjs'].map(format => parse(`artifacts/yjs-document-node-${format}-20261105.json`));
for (const result of compiled) {
  assert.equal(result.noDOM, true); assert.equal(result.passingJourneys, 16);
  assert.equal(result.knownBlockersReproduced, 1); assert.equal(result.currentAdapterReplaced, false);
}
const mapMatches = [];
for (const name of ['retained-document.mjs.map', 'retained-document.cjs.map']) {
  const file = `artifacts/yjs-document-build-20261105/${name}`, map = parse(file);
  map.sources.forEach((source, index) => {
    const actual = readFileSync(resolve(dirname(file), source), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(map.sourcesContent[index].replace(/\r\n/g, '\n'), actual, `${name}: ${source}`);
    mapMatches.push({ map: name, source, sha256: sha(actual) });
  });
}
for (const file of ['src/yjs/index.ts', 'tests/yjs-document-range.test.ts', 'package.json', 'pnpm-lock.yaml', 'scripts/check-build-budgets.mjs', 'api-surface.json']) {
  assert.equal(execFileSync('git', ['diff', base, '--', file], { encoding: 'utf8' }), '', `${file} changed`);
}
for (const name of readdirSync('dist').filter(name => /\.(?:js|cjs)\.map$/.test(name))) {
  const map = parse(`dist/${name}`);
  assert.ok(!map.sources.some(source => /\/yjs\/retained-(?:document|nodes|text|mapping)\.ts$/.test(source)), `Candidate leaked into ${name}`);
}
assert.match(read('artifacts/yjs-document-types-20261105.log'), /0 errors and 0 warnings/);
assert.match(read('artifacts/yjs-document-headless-20261105.log'), /verified across 132 modules/);
assert.match(read('artifacts/yjs-document-package-20261105.log'), /package exports loaded successfully/);
const files = [
  'src/core/transaction/split-node-step.ts', 'src/yjs/retained-document.ts', 'src/yjs/retained-nodes.ts', 'src/yjs/retained-text.ts', 'src/yjs/retained-mapping.ts',
  'tests/yjs-retained-document.test.ts', 'tests/yjs-retained-nodes.test.ts',
  'artifacts/yjs-document-node-es-20261105.json', 'artifacts/yjs-document-node-cjs-20261105.json',
  ...readdirSync('artifacts/yjs-document-build-20261105').map(name => `artifacts/yjs-document-build-20261105/${name}`),
];
const report = {
  createdAt: new Date().toISOString(), baseCommit: base, state: 'local-unexported-work-in-progress',
  publication: { userPreference: 'Keep the new commit local for now', pushed: false, npm: false, site: false },
  checks: { build: 'passed', fullTypes: 'passed', publicApiDeclarations: 423, headlessModules: 132, packageSmoke: 'passed',
    fullSource: { passed: unit.numPassedTests, failed: unit.numFailedTests, total: unit.numTotalTests, files: unit.testResults.length, skipped: 0, failures },
    candidateSource: { passed: 42, failed: 1, total: 43 }, compiledNode: compiled,
    budgets: { status: 'failed', ceilingsChanged: false, failures: ['core ESM +0.1 KiB', 'aggregate ESM +67.0 KiB', 'aggregate CommonJS +52.5 KiB'] } },
  defaultAdapterReplaced: false, liveMigration: false, publicExportsChanged: false, browserJourneyClaimed: false,
  compiledSourceMatches: mapMatches,
  requiredNext: ['Independent recoverable text/format ownership through concurrent full deletion',
    'General moves/joins, multi-peer cases and custom intermediate invariants', 'Selection/presence/review/structured-state and provider lifecycle integration',
    'Explicit recoverable legacy protocol cutover', 'Large-document lookup/projection, memory, history and compaction budgets',
    'Unchanged original six acceptance tests and recorded browser/IME/clipboard journeys'],
  fullUnitRawCapture: { path: 'artifacts/yjs-document-unit-20261105.json', retainedLocally: true,
    sha256: sha(readFileSync('artifacts/yjs-document-unit-20261105.json')) },
  files: files.map(path => ({ path, sha256: sha(readFileSync(path)) })),
};
writeFileSync('artifacts/yjs-document-verification-20261105.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ source: report.checks.fullSource, compiledPassing: 32, reproducedBlockers: 2, candidateReady: false, compiledSourceMatches: mapMatches.length }));
