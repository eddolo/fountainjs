import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestPath = 'artifacts/preformatted-breaks-verification-20261103.json';
const files = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(file => file && file !== manifestPath);
git('diff', '--quiet');
const log = name => readFileSync(`artifacts/preformatted-breaks-${name}-20261103.log`, 'utf8');
assert.match(log('before'), /24 failed \| 3 passed/u);
assert.match(log('full-tests'), /Tests\s+3335 passed/u);
assert.match(readFileSync('artifacts/code-gutter-browser-verified-20261103.log', 'utf8'), /20 passed/u);
const additional = readFileSync('artifacts/code-gutter-browser-20261103.log', 'utf8').split('\n').filter(line =>
  /^\s+ok\s+\d+/u.test(line) && /list-first code text-click|edits RTL blocks with native|1,000-block input|refreshes live direction from an unmounted anchor/u.test(line));
assert.equal(additional.length, 12);
assert.match(log('api'), /415 declaration/u);
assert.match(log('headless'), /111 modules/u);
assert.match(log('package'), /Packed ESM root\/core: 11\/11 preformatted/u);
assert.match(log('package'), /Packed CommonJS root\/core: 11\/11 preformatted/u);
assert.match(log('server-runtimes'), /Compiled runtime: 11 preformatted/u);
assert.match(log('server-runtimes'), /workerd \(Miniflare\): 11 preformatted/u);

// Version 13 changes the oracle deliberately; none of its fixture ranges or
// policy classifications may change to accept the production implementation.
const fixtures = files.filter(file => /^tests\/fixtures\/markdown\/commonmark-.*-v1\.json$/u.test(file));
assert.equal(fixtures.length, 8);
for (const file of fixtures) {
  const previous = JSON.parse(git('show', 'HEAD:' + file)), current = JSON.parse(git('show', ':' + file));
  assert.equal(previous.projectionVersion, 12); assert.equal(current.projectionVersion, 13);
  for (const key of ['projectionVersion', 'note', 'profile']) { delete previous[key]; delete current[key]; }
  assert.deepEqual(current, previous, `Fixture ranges/policies changed: ${file}`);
}
git('diff', '--exit-code', 'HEAD', '--', 'scripts/check-performance-budgets.mjs', 'scripts/performance-sampling.mjs',
  'scripts/check-shared-direction-retention.mjs', 'scripts/check-position-mapping-retention.mjs',
  'scripts/check-complete-source-conformance.mjs', 'package.json', 'pnpm-lock.yaml');

const corpus = JSON.parse(readFileSync('artifacts/preformatted-breaks-corpus-summary-20261103.json'));
assert.equal(corpus.projectionVersion, 13); assert.equal(corpus.bodyMatches, 635);
assert.equal(corpus.safeHTMLNativeMatches, 1288); assert.equal(corpus.exactUntouchedMarkdown, 1304);
const performance = JSON.parse(readFileSync('artifacts/preformatted-breaks-performance-report-20261103.json'));
const controlPerformance = JSON.parse(readFileSync('artifacts/preformatted-breaks-control-performance-report-20261103.json'));
const pairedPerformance = JSON.parse(readFileSync('artifacts/preformatted-breaks-paired-performance-report-20261103.json'));
assert.equal(performance.failures.length, 1);
assert.match(performance.failures[0], /100-block server HTML p95/u);
assert.equal(pairedPerformance.failures.length, 1);
assert.match(pairedPerformance.failures[0], /100-block server HTML p95/u);
assert.ok(controlPerformance.failures.some(failure => /100-block server HTML p95/u.test(failure)));
assert.deepEqual(performance.limits, JSON.parse(readFileSync('artifacts/empty-heading-performance-report-20261103.json')).limits);
assert.deepEqual(controlPerformance.limits, performance.limits);
assert.deepEqual(pairedPerformance.limits, performance.limits);
const controlSource = JSON.parse(readFileSync('artifacts/preformatted-breaks-control-source-20261103.json'));
assert.equal(controlSource.commit, git('rev-parse', 'HEAD').toString().trim());
assert.equal(controlSource.filesVerified, 262);
const oldAPI = JSON.parse(git('show', 'HEAD:api-surface.json'));
const newAPI = JSON.parse(git('show', ':api-surface.json'));
assert.deepEqual(Object.keys(newAPI.files).filter(file => newAPI.files[file] !== oldAPI.files[file]).sort(), [
  'dist/extensions/plugins/syntax-highlight.d.cts', 'dist/extensions/plugins/syntax-highlight.d.ts',
]);
assert.match(log('api-comment-review'), /reversing only the two documentation comments restores the previous declaration hash/u);

const folder = 'artifacts/code-gutter-browser-verified-20261103/';
const observations = files.filter(file => file.startsWith(folder) && file.endsWith('preformatted-break-observations.json'));
const captures = files.filter(file => file.startsWith(folder) && file.endsWith('.png'));
const exports = files.filter(file => file.startsWith(folder) && file.endsWith('preformatted-edited.html'));
assert.equal(observations.length, 5); assert.equal(captures.length, 17); assert.equal(exports.length, 5);
for (const file of observations) {
  const observed = JSON.parse(readFileSync(file));
  assert.equal(observed.actualDownloadReopen, true); assert.equal(observed.nativeTypingUndoRedo, true);
  assert.equal(observed.formattingLossDisclosed, true); assert.equal(observed.gutter.supported, true);
  assert.equal(observed.gutter.sourceOnlyText, 'first\nsecond');
  assert.ok(Math.abs(observed.editorGaps[1] / observed.editorGaps[0] - 2) < .05);
  assert.deepEqual(observed.errors, []);
}
const desktopClipboard = observations.filter(file => /download-(?:chromium|firefox)\//u.test(file));
assert.equal(desktopClipboard.length, 2);
for (const file of desktopClipboard) assert.equal(JSON.parse(readFileSync(file)).externalClipboard.trusted, true);

const manifest = {
  date: '2026-11-03', baseCommit: git('rev-parse', 'HEAD').toString().trim(),
  scope: 'Physical preformatted HTML breaks, explicit projection reports, equivalent native caret affinity and non-widget code gutters',
  verified: { fullSuite: { tests: 3335, files: 238 }, newUnitContracts: 40,
    browser: { finalRunPassed: 20, additionalPassed: 12,
      additionalRun: 'artifacts/code-gutter-browser-20261103.log',
      additionalCases: 'three engines each: list-first native code focus, RTL native editing, 1k input paint, 100k virtual editing',
      finalPNGsReviewed: captures, downloadedHTML: exports, observations,
      externalClipboard: 'trusted native copy/paste into independent textarea in Chromium and Firefox; native newline control retained',
      headless: true, workers: 1, port: 4194, reuseExistingServer: false, videosManuallyReviewed: false },
    packedRootAndCoreESMAndCommonJS: '11 contracts each', node: '11 contracts', workerd: '11 contracts',
    publicAPIDeclarations: 415, headlessModules: 111, frameworkTypes: 'passed', libraryBuild: 'passed', websiteBuild: 'passed',
    profiles: [563, 613, 631, 635], corpus },
  oracleReview: { previousProjection: 12, currentProjection: 13, additionalNegativeControls: 4,
    additionalPositiveControls: 2, fixtureRangesAndPoliciesChanged: false,
    referenceASTEqualityRequired: false, priorOracleFailure: 'artifacts/preformatted-breaks-oracle-before-20261103.log' },
  performance: { status: 'unresolved; no clean latency certification',
    initialFailures: performance.failures, previousCommitControlFailures: controlPerformance.failures,
    pairedCurrentFailures: pairedPerformance.failures, limitsAndSamplingChanged: false,
    previousCommitControlSource: controlSource,
    affinityMask: 192, priority: 'BelowNormal', independentDirectionAndMappingRetention: 'passed' },
  bundleReview: { ESMBytes: 1688787, CJSBytes: 1405815, CSSBytes: 89426,
    addedESMBytes: 1776, addedCJSBytes: 1585, addedCSSBytes: 612,
    ESMCapKiB: 1649.5, CJSCapKiB: 1373, CSSCapKiB: 87.5,
    individualEntryCapsChanged: false, dependenciesChanged: false,
    priorFailures: ['artifacts/preformatted-breaks-size-before-review-20261103.log', 'artifacts/code-gutter-size-before-review-20261103.log'] },
  limitations: { richPreformattedFormatting: 'still projected to plain code; warning is not retention',
    completeCommonMarkConformance: false, physicalDeviceCertification: false, universalPixelParity: false,
    APIOrSchemaChanged: false, APIHashRefresh: 'two documentation comments only; reverse-comment hashes match prior declarations',
    parityRowsPromoted: 0, newSourceCloudGates: 'pending push', npmRelease: 'none; still 0.4.0-beta.2' },
  sourceBinding: 'SHA-256 of staged Git blobs; manifest excluded to avoid a circular hash.',
  hashes: Object.fromEntries(files.map(file => [file, sha(git('show', ':' + file))])),
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Bound ${files.length} files; five verified import/edit/export journeys, 17 reviewed captures, v13 oracle controls.`);
