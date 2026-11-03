import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestPath = 'artifacts/empty-heading-verification-20261103.json';
const files = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(file => file && file !== manifestPath);
git('diff', '--quiet');
const log = name => readFileSync(`artifacts/empty-heading-${name}-20261103.log`, 'utf8');
const json = name => JSON.parse(readFileSync(`artifacts/empty-heading-${name}-20261103.json`, 'utf8'));
assert.match(log('before'), /14 failed \| 18 passed/u);
assert.match(log('full-tests'), /Tests\s+3295 passed/u);
assert.match(log('focused'), /Tests\s+103 passed/u);
assert.match(log('browser-final'), /5 passed/u);
assert.match(log('api'), /415 declaration/u);
assert.match(log('headless'), /111 modules/u);
assert.match(log('package'), /Packed ESM root\/core: 24\/24 empty-heading/u);
assert.match(log('package'), /Packed CommonJS root\/core: 24\/24 empty-heading/u);
assert.match(log('server-runtimes'), /Compiled runtime: 24 empty-heading/u);
assert.match(log('server-runtimes'), /workerd \(Miniflare\): 24 empty-heading/u);
const corpus = json('corpus-summary'), performance = json('performance-report');
assert.equal(corpus.safeHTMLNativeMatches, 1288);
assert.equal(corpus.bodyMatches, 635);
assert.equal(corpus.remainingSafeHTMLNativeDifferences.length, 8);
assert.deepEqual(performance.failures, []);
const oldPerformance = JSON.parse(readFileSync('artifacts/copy-validation-performance-report-20261103.json', 'utf8'));
assert.deepEqual(performance.limits, oldPerformance.limits);
git('diff', '--exit-code', 'HEAD', '--', 'scripts/check-performance-budgets.mjs', 'scripts/performance-sampling.mjs',
  'scripts/check-markdown-conformance.mjs', 'scripts/check-complete-source-conformance.mjs', 'tests/fixtures/markdown');
const folder = 'artifacts/empty-heading-browser-final-20261103/';
const captures = files.filter(file => file.startsWith(folder) && file.endsWith('.png'));
const exports = files.filter(file => file.startsWith(folder) && file.endsWith('.html'));
const observations = files.filter(file => file.startsWith(folder) && file.endsWith('-observations.json'));
assert.equal(captures.length, 15); assert.equal(exports.length, 5); assert.equal(observations.length, 5);
for (const file of observations) {
  const observed = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(observed.nativeHTMLReaderChecked, true);
  assert.equal(observed.exactRoundTrips, 3);
  assert.ok(observed.emptyHeadingHeight > 20);
  assert.deepEqual(observed.errors, []);
}
const manifest = {
  date: '2026-11-03', baseCommit: git('rev-parse', 'HEAD').toString().trim(),
  scope: 'Preserve one empty native heading text leaf through safe HTML and real download/reopen/native editing',
  verified: { fullSuite: { tests: 3295, files: 237 }, focusedTests: 103, newContracts: 32,
    retainedInitialFailure: { failed: 14, passed: 18, file: 'artifacts/empty-heading-before-20261103.log' },
    browser: { passed: 5, projects: ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari'],
      headless: true, workers: 1, port: 4194, reuseExistingServer: false,
      workflow: 'public conversion lab: import Markdown, exact HTML check, actual download, independent native HTML reader, file-picker reopen, native typing/undo/redo and exact reopening',
      finalPNGsReviewed: captures, downloadedHTML: exports, observations,
      videosRecorded: 10, videosManuallyReviewed: false },
    packedRootAndCoreESMAndCommonJS: '24 contracts each', node: '24 contracts', workerd: '24 contracts',
    publicAPIDeclarations: 415, headlessModules: 111, frameworkTypes: 'passed',
    libraryBuild: 'passed', websiteBuild: 'passed', reviewedSizeGate: 'passed',
    markdownProfiles: [563, 613, 631, 635], exactUntouchedSource: 1304, exactNativeJSON: 1304,
    safeHTMLNative: '1288/1304', sourceModelStatuses: corpus.sourceModelStatuses,
    remainingSafeHTMLNativeCases: corpus.remainingSafeHTMLNativeDifferences.map(row => row.number),
    sourceCaptureBodyMatches: 633, sourceCaptureFrontmatterDifferences: [96, 98] },
  performance: { failures: performance.failures, numericalLatencyAndHeapLimitsChanged: false, samplingChanged: false,
    affinityMask: 192, priority: 'BelowNormal', independentDirectionAndMappingRetention: 'passed',
    historicalSnapshotValidation: JSON.parse(log('mapping-retention')).validatedEverySnapshot,
    benchmarkBlobSHA256: sha(git('show', 'HEAD:scripts/check-performance-budgets.mjs')),
    comparatorBlobSHA256: sha(git('show', 'HEAD:scripts/check-markdown-conformance.mjs')) },
  bundleReview: { ESMBytes: 1687011, CJSBytes: 1404230, addedESMBytes: 341, addedCJSBytes: 295,
    oldESMCapKiB: 1647.25, ESMCapKiB: 1647.5, oldCJSCapKiB: 1371.25, CJSCapKiB: 1371.5,
    individualEntryCapsChanged: false, CSSCapChanged: false, dependenciesChanged: false,
    preReviewFailure: 'artifacts/empty-heading-size-before-review-20261103.log' },
  limitations: { completeCommonMarkConformance: false, referenceASTEqualityRequired: false,
    arbitraryHTMLStylingOrTextLeafSegmentation: false, physicalDeviceCertification: false,
    universalPixelParity: false, APIOrSchemaChanged: false, parityRowsPromoted: 0,
    newSourceCloudGates: 'pending push', npmRelease: 'none; still 0.4.0-beta.2' },
  sourceBinding: 'SHA-256 of staged Git blobs; manifest excluded to avoid a circular hash.',
  hashes: Object.fromEntries(files.map(file => [file, sha(git('show', ':' + file))])),
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Bound ${files.length} files; 15 reviewed captures, five actual exports, unchanged semantic/performance limits.`);
