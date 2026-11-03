import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestPath = 'artifacts/html-attribute-verification-20261103.json';
const files = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(file => file && file !== manifestPath);
git('diff', '--quiet');
const log = name => readFileSync(`artifacts/html-attribute-${name}-20261103.log`, 'utf8');
assert.match(log('before'), /1 failed \| 12 passed/u);
assert.match(log('before'), /expected 2000/u);
assert.match(log('focused'), /Tests\s+119 passed/u);
assert.match(log('full-tests'), /Tests\s+3348 passed/u);
assert.match(log('browser'), /5 passed/u);
assert.match(log('api'), /415 declaration/u);
assert.match(log('headless'), /111 modules/u);
assert.match(log('package'), /Packed ESM root\/core: 11\/11 preformatted/u);
assert.match(log('package'), /Packed CommonJS root\/core: 11\/11 preformatted/u);
assert.match(log('server-runtimes'), /Compiled runtime: 11 preformatted/u);
assert.match(log('server-runtimes'), /workerd \(Miniflare\): 11 preformatted/u);
git('diff', '--exit-code', 'HEAD', '--', 'scripts/check-performance-budgets.mjs', 'scripts/performance-sampling.mjs',
  'scripts/check-shared-direction-retention.mjs', 'scripts/check-position-mapping-retention.mjs',
  'scripts/check-build-budgets.mjs', 'scripts/check-markdown-conformance.mjs', 'scripts/check-complete-source-conformance.mjs',
  'tests/fixtures/markdown', 'api-surface.json', 'package.json', 'pnpm-lock.yaml');

const first = JSON.parse(readFileSync('artifacts/html-attribute-performance-report-20261103.json'));
const second = JSON.parse(readFileSync('artifacts/html-attribute-second-performance-report-20261103.json'));
assert.deepEqual(first.failures, []);
assert.equal(second.failures.length, 1); assert.match(second.failures[0], /10000-block server HTML p95/u);
assert.deepEqual(first.limits, second.limits);
assert.deepEqual(first.limits, JSON.parse(git('show', 'HEAD:artifacts/preformatted-breaks-performance-report-20261103.json')).limits);
assert.ok(first.serverHTML['100'].p95 < first.limits.serverHTMLP95['100']);
assert.ok(second.serverHTML['100'].p95 < second.limits.serverHTMLP95['100']);
const mapping = JSON.parse(log('mapping-retention'));
assert.equal(mapping.validatedEverySnapshot, true);
assert.ok(mapping.retainedBytes <= mapping.retainedLimitBytes && mapping.releasedBytes <= mapping.releasedLimitBytes);

const visual = JSON.parse(readFileSync('artifacts/html-attribute-visual-comparison-20261103.json'));
assert.equal(visual.comparisons.length, 17);
for (const row of visual.comparisons) {
  assert.equal(row.byteIdentical, true);
  assert.equal(sha(git('show', ':' + row.path)), row.SHA256);
  assert.equal(sha(git('show', 'HEAD:' + row.baseline)), row.baselineSHA256);
  assert.equal(row.SHA256, row.baselineSHA256);
}
const captures = visual.comparisons.map(row => row.path);
const folder = 'artifacts/html-attribute-browser-20261103/';
const observations = files.filter(file => file.startsWith(folder) && file.endsWith('preformatted-break-observations.json'));
const exports = files.filter(file => file.startsWith(folder) && file.endsWith('preformatted-edited.html'));
assert.equal(observations.length, 5); assert.equal(exports.length, 5);
for (const file of observations) {
  const observed = JSON.parse(readFileSync(file));
  assert.equal(observed.actualDownloadReopen, true); assert.equal(observed.nativeTypingUndoRedo, true);
  assert.equal(observed.formattingLossDisclosed, true); assert.deepEqual(observed.errors, []);
}
const corpus = JSON.parse(readFileSync('artifacts/html-attribute-corpus-summary-20261103.json'));
assert.equal(corpus.projectionVersion, 13); assert.equal(corpus.bodyMatches, 635);
assert.equal(corpus.safeHTMLNativeMatches, 1288); assert.equal(corpus.exactNativeJSON, 1304);

const manifest = {
  date: '2026-11-03', baseCommit: git('rev-parse', 'HEAD').toString().trim(),
  scope: 'Preserve readonly server HTML attribute semantics while avoiding repeated parser attribute-object arrays',
  verified: { fullSuite: { tests: 3348, files: 239 }, focusedTests: 119, newContracts: 13,
    differentialReference: 'actual parse5/htmlparser2 attribute-list oracle, six source classes in both document and fragment paths',
    repeatedInspectionAttributeArrayAllocations: { before: 2000, after: 0 },
    browser: { passed: 5, projects: ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari'],
      captures, byteIdenticalToReviewedBaseline: true, additionalManualReviewClaimed: false,
      actualDownloads: exports, observations, nativeExternalClipboardProjects: ['chromium', 'firefox'],
      headless: true, workers: 1, port: 4194, reuseExistingServer: false, videosManuallyReviewed: false },
    publicAPIDeclarations: 415, headlessModules: 111, frameworkTypes: 'passed',
    packageAndCompiledNodeAndWorkerd: 'passed', libraryBuild: 'passed', websiteBuild: 'passed', corpus },
  performance: { status: 'small-import gate passes both runs; overall local latency unresolved',
    firstRunFailures: first.failures, secondRunFailures: second.failures,
    smallImportP95Ms: [first.serverHTML['100'].p95, second.serverHTML['100'].p95],
    tenThousandImportP95Ms: [first.serverHTML['10000'].p95, second.serverHTML['10000'].p95],
    limitsAndSamplingChanged: false, allEarlierFailuresRetained: true,
    affinityMask: 192, priority: 'BelowNormal', independentDirectionAndMappingRetention: 'passed',
    diagnosticProfileCountsAsAcceptance: false },
  bundle: { ESMBytes: 1688848, CJSBytes: 1405869, addedESMBytes: 61, addedCJSBytes: 54,
    CSSBytes: 89426, budgetsChanged: false, dependenciesChanged: false, publicAPIOrSchemaChanged: false },
  limitations: { completeCommonMarkConformance: false, richPreformattedFormatting: false, universalSpeedupClaimed: false,
    physicalDeviceCertification: false, parityRowsPromoted: 0, newSourceCloudGates: 'pending push',
    npmRelease: 'none; still 0.4.0-beta.2' },
  sourceBinding: 'SHA-256 of staged Git blobs; manifest excluded to avoid circular hashes.',
  hashes: Object.fromEntries(files.map(file => [file, sha(git('show', ':' + file))])),
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Bound ${files.length} source/evidence files; 13 new contracts, five real browser journeys, 17 exact visual comparisons.`);
