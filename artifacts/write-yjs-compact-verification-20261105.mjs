import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const base = '724a5fe1', root = process.cwd(), hash = value => createHash('sha256').update(value).digest('hex');
const read = path => readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
const json = path => JSON.parse(read(path));
const tests = json('artifacts/yjs-compact-tests-20261105.json');
assert.equal(tests.numPassedTests, 145); assert.equal(tests.numFailedTests, 6); assert.equal(tests.numTotalTests, 151); assert.equal(tests.numPendingTests, 0);
const failures = tests.testResults.flatMap(file => file.assertionResults.filter(test => test.status === 'failed')
  .map(test => ({ file: relative(root, file.name).replaceAll('\\', '/'), name: test.fullName })));
assert.equal(failures.length, 6); assert.ok(failures.every(test => test.file === 'tests/yjs-document-range.test.ts'));
const candidate = tests.testResults.filter(file => !file.name.replaceAll('\\', '/').endsWith('/tests/yjs-document-range.test.ts'));
assert.equal(candidate.length, 4); assert.equal(candidate.reduce((sum, file) => sum + file.assertionResults.length, 0), 129);
assert.ok(candidate.every(file => file.assertionResults.every(test => test.status === 'passed')));
const compiled = ['es', 'cjs'].map(format => json(`artifacts/yjs-compact-node-${format}-20261105.json`));
for (const result of compiled) { assert.equal(result.noDOM, true); assert.equal(result.passingJourneys, 24); assert.equal(result.currentAdapterReplaced, false); assert.equal(result.candidateDirectory, 'yjs-compact-build-20261105'); }
const matches = [];
for (const name of ['retained-document.mjs.map', 'retained-document.cjs.map']) {
  const file = `artifacts/yjs-compact-build-20261105/${name}`, map = json(file);
  map.sources.forEach((source, index) => {
    const actual = readFileSync(resolve(dirname(file), source), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(map.sourcesContent[index].replace(/\r\n/g, '\n'), actual, `${name}: ${source}`); matches.push({ map: name, source, sha256: hash(actual) });
  });
}
for (const path of ['src/core', 'src/headless', 'src/index.ts', 'src/yjs/index.ts', 'tests/yjs-document-range.test.ts',
  'package.json', 'pnpm-lock.yaml', 'api-surface.json', 'scripts/check-build-budgets.mjs']) {
  assert.equal(execFileSync('git', ['diff', base, '--', path], { encoding: 'utf8' }), '', `${path} changed`);
}
for (const name of readdirSync('dist').filter(name => /\.(?:js|cjs)\.map$/.test(name))) {
  assert.ok(!json(`dist/${name}`).sources.some(source => /\/yjs\/retained-(?:document|text|nodes|mapping)\.ts$/.test(source)), `Candidate leaked into ${name}`);
}
assert.equal(read('artifacts/yjs-compact-types-20261105.log').trim(), '');
const cost = json('artifacts/yjs-compact-cost-20261105.json'), sample = cost.medians.filter(result => result.characters === 1024);
assert.equal(cost.results.length, 12); assert.equal(sample.length, 2); assert.ok(cost.results.every(result => result.modelTextLeaves === 1));
const before = sample.find(result => result.label === 'full-provenance-candidate'), after = sample.find(result => result.label === 'compact-candidate');
assert.ok(before && after); assert.equal(before.trials, 3); assert.equal(after.trials, 3);
const profilePath = 'artifacts/yjs-compact-before-20261105.cpuprofile';
let profileSummary = { scope: 'optional historical diagnostic; not needed to reproduce the acceptance checks', rawRetainedLocally: false };
if (existsSync(profilePath)) {
  const profile = json(profilePath), counts = new Map();
  for (const id of profile.samples ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  profileSummary = { scope: 'before exact-decoder cache; callframe names only; compiled candidate subsequently rebuilt',
    rawRetainedLocally: true, rawSha256: hash(readFileSync(profilePath)),
    hottestFrames: profile.nodes.map(node => ({ function: node.callFrame.functionName, samples: counts.get(node.id) ?? 0 }))
      .sort((a, b) => b.samples - a.samples).slice(0, 12) };
}
const paths = ['src/yjs/retained-text.ts', 'src/yjs/retained-document.ts', 'tests/yjs-retained-text.test.ts', 'tests/yjs-retained-document.test.ts',
  ...readdirSync('artifacts/yjs-compact-build-20261105').map(name => `artifacts/yjs-compact-build-20261105/${name}`),
  'artifacts/yjs-compact-node-es-20261105.json', 'artifacts/yjs-compact-node-cjs-20261105.json', 'artifacts/yjs-compact-cost-20261105.json'];
const receipt = {
  createdAt: new Date().toISOString(), baseCommit: execFileSync('git', ['rev-parse', base], { encoding: 'utf8' }).trim(), state: 'local-unexported-work-in-progress',
  published: false, userPreference: 'Keep the new commit local for now',
  checks: { sourceTypecheck: 'passed', candidateSource: { files: 4, passed: 129, failed: 0, skipped: 0 },
    focusedAcceptance: { total: 151, passed: 145, failed: 6, skipped: 0, failures }, compiledNode: compiled,
    fullSourceSuiteRerun: false, apiDeclarations: 423, headlessSourceModules: 132, productionBudgetCertified: false, acceptanceLimitsChanged: false },
  formatProtocol: { document: 3, text: 3, nodes: 2, liveMigration: false, oldProvisionalCodecsRefused: true },
  defaultAdapterReplaced: false, publicRuntimeChanged: false, browserJourneyClaimed: false,
  diagnosticCostSample: cost, diagnosticComparison: { workload: '1024 single-character transactions in one paragraph',
    medianSequenceSpeedup: before.medianElapsedMs / after.medianElapsedMs, encodedStateReductionFraction: 1 - after.encodedSharedStateBytes / before.encodedSharedStateBytes,
    productionCertification: false }, profileSummary, compiledSourceMatches: matches,
  adoptionBlockers: ['Full-stream/document projection and lookup at the original large-document targets',
    'Existing node-count guards do not establish 100000-paragraph capacity', 'History/offline-aware dictionary and placement compaction, released heap and update growth',
    'Selections/presence/review/structured-state, provider lifecycle and explicit recoverable legacy cutover', 'General moves/joins/custom invariants, original six acceptance tests and recorded browser journeys'],
  rawUnitCapture: { path: 'artifacts/yjs-compact-tests-20261105.json', retainedLocally: true, sha256: hash(readFileSync('artifacts/yjs-compact-tests-20261105.json')) },
  files: paths.map(path => ({ path, sha256: hash(readFileSync(path)) })),
};
writeFileSync('artifacts/yjs-compact-verification-20261105.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ candidateSourcePassed: 129, defaultAdapterFailures: 6, compiledNodePassed: 48, sourceMatches: matches.length,
  diagnosticComparison: receipt.diagnosticComparison, candidateAdoptionReady: false }));
