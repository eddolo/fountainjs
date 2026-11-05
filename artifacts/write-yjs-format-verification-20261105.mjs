import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const base = 'b6d86e18', root = process.cwd(), hash = value => createHash('sha256').update(value).digest('hex');
const read = path => readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
const json = path => JSON.parse(read(path));
const focused = json('artifacts/yjs-format-focused-20261105.json'), legacy = json('artifacts/yjs-format-default-20261105.json');
assert.equal(focused.numPassedTests, 118); assert.equal(focused.numFailedTests, 0); assert.equal(focused.numPendingTests, 0);
assert.equal(legacy.numPassedTests, 16); assert.equal(legacy.numFailedTests, 6); assert.equal(legacy.numPendingTests, 0);
const failures = legacy.testResults.flatMap(file => file.assertionResults.filter(test => test.status === 'failed')
  .map(test => ({ file: relative(root, file.name).replaceAll('\\', '/'), name: test.fullName })));
assert.equal(failures.length, 6); assert.ok(failures.every(test => test.file === 'tests/yjs-document-range.test.ts'));
const compiled = ['es', 'cjs'].map(format => json(`artifacts/yjs-format-node-${format}-20261105.json`));
for (const result of compiled) { assert.equal(result.noDOM, true); assert.equal(result.passingJourneys, 24); assert.equal(result.currentAdapterReplaced, false); }
const matches = [];
for (const name of ['retained-document.mjs.map', 'retained-document.cjs.map']) {
  const file = `artifacts/yjs-format-build-20261105/${name}`, map = json(file);
  map.sources.forEach((source, index) => {
    const actual = readFileSync(resolve(dirname(file), source), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(map.sourcesContent[index].replace(/\r\n/g, '\n'), actual, `${name}: ${source}`);
    matches.push({ map: name, source, sha256: hash(actual) });
  });
}
for (const path of ['src/core', 'src/headless', 'src/index.ts', 'src/yjs/index.ts', 'tests/yjs-document-range.test.ts',
  'package.json', 'pnpm-lock.yaml', 'api-surface.json', 'scripts/check-build-budgets.mjs']) {
  assert.equal(execFileSync('git', ['diff', base, '--', path], { encoding: 'utf8' }), '', `${path} changed`);
}
for (const name of readdirSync('dist').filter(name => /\.(?:js|cjs)\.map$/.test(name))) {
  assert.ok(!json(`dist/${name}`).sources.some(source => /\/yjs\/retained-(?:document|text|nodes|mapping)\.ts$/.test(source)), `Candidate leaked into ${name}`);
}
assert.equal(read('artifacts/yjs-format-types-20261105.log').trim(), '');
const cost = json('artifacts/yjs-format-cost-20261105.json');
assert.equal(cost.measurementsAreNotCertification, true);
assert.ok(cost.results.every(result => result.modelTextLeaves === 1));
const sample = cost.results.filter(result => result.characters === 1024);
assert.equal(sample.length, 2); assert.ok(sample[1].encodedSharedStateBytes > sample[0].encodedSharedStateBytes);
const paths = ['src/yjs/retained-text.ts', 'src/yjs/retained-document.ts', 'tests/yjs-retained-text.test.ts', 'tests/yjs-retained-document.test.ts',
  ...readdirSync('artifacts/yjs-format-build-20261105').map(name => `artifacts/yjs-format-build-20261105/${name}`),
  'artifacts/yjs-format-node-es-20261105.json', 'artifacts/yjs-format-node-cjs-20261105.json', 'artifacts/yjs-format-cost-20261105.json'];
const receipt = {
  createdAt: new Date().toISOString(), baseCommit: execFileSync('git', ['rev-parse', base], { encoding: 'utf8' }).trim(),
  state: 'local-unexported-work-in-progress', published: false, userPreference: 'Keep the new commit local for now',
  checks: { sourceTypecheck: 'passed', candidateSource: { files: 4, passed: 118, failed: 0, skipped: 0 },
    defaultAdapter: { files: 1, passed: 16, failed: 6, skipped: 0, failures }, fullSourceSuiteRerun: false,
    combinedFocusedRuns: { total: 140, passed: 134, failed: 6, skipped: 0 }, compiledNode: compiled,
    apiDeclarations: 423, headlessSourceModules: 132,
    productionBudgets: { unchanged: true, rerunAtThisCheckpoint: false, lastKnownStatus: 'failed', candidateCertified: false } },
  formatProtocol: { document: 2, text: 2, nodes: 2, liveMigration: false, oldProvisionalCodecRefused: true },
  defaultAdapterReplaced: false, publicRuntimeChanged: false, browserJourneyClaimed: false,
  resolvedCandidateRegression: 'retains unseen peer typing when all locally observed characters are deleted',
  adoptionBlockers: ['Measured per-insertion shared-state growth and full-projection typing cost',
    'Large-document incremental lookup/projection, long histories, wire growth and compaction',
    'Selections/presence/review/structured-state integration and provider lifecycle', 'Explicit recoverable legacy cutover',
    'General moves/joins/custom invariants, original default-adapter acceptance and recorded browser journeys'],
  diagnosticCostSample: cost, compiledSourceMatches: matches,
  rawUnitCapturesRetainedLocally: ['focused', 'default'].map(name => ({ path: `artifacts/yjs-format-${name}-20261105.json`,
    sha256: hash(readFileSync(`artifacts/yjs-format-${name}-20261105.json`)) })),
  files: paths.map(path => ({ path, sha256: hash(readFileSync(path)) })),
};
writeFileSync('artifacts/yjs-format-verification-20261105.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ candidateSourcePassed: 118, defaultAdapterFailures: 6, compiledNodePassed: 48, compiledSourceMatches: matches.length,
  candidateAdoptionReady: false, measuredStorageAndProjectionCost: true, fullSourceSuiteRerun: false }));
