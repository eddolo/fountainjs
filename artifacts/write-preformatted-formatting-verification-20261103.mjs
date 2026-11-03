import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const output = 'artifacts/preformatted-formatting-verification-20261103.json';
const files = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(file => file && file !== output);
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, ''));
const log = name => readFileSync(`artifacts/preformatted-formatting-${name}-20261103.log`, 'utf8');
git('diff', '--quiet');
git('diff', '--exit-code', 'HEAD', '--', 'scripts/check-performance-budgets.mjs',
  'scripts/performance-sampling.mjs', 'scripts/check-shared-direction-retention.mjs', 'scripts/check-position-mapping-retention.mjs',
  'scripts/check-markdown-conformance.mjs', 'scripts/check-complete-source-conformance.mjs', 'tests/fixtures/markdown',
  'api-surface.json', 'package.json', 'pnpm-lock.yaml');
const originalLimits = git('show', 'HEAD:scripts/check-build-budgets.mjs').toString();
assert.equal(readFileSync('scripts/check-build-budgets.mjs', 'utf8'), originalLimits
  .replace("'all ESM runtime code': 1649.5 * kibibyte", "'all ESM runtime code': 1651.75 * kibibyte")
  .replace("'all CommonJS runtime code': 1373 * kibibyte", "'all CommonJS runtime code': 1375 * kibibyte"));
assert.match(log('final-full-tests'), /Tests\s+3377 passed/u);
assert.match(log('final-full-tests'), /Test Files\s+240 passed/u);
assert.match(log('browser-final-css'), /5 passed/u);
assert.match(log('api'), /415 declaration/u);
assert.match(log('headless'), /113 modules/u);
assert.match(log('package'), /Packed ESM root\/core: 14\/14 preformatted-formatting/u);
assert.match(log('package'), /Packed CommonJS root\/core: 14\/14 preformatted-formatting/u);
assert.match(log('server-runtimes'), /Compiled runtime: 14 preformatted-formatting/u);
assert.match(log('server-runtimes'), /workerd \(Miniflare\): 14 preformatted-formatting/u);
const checks = json('artifacts/preformatted-formatting-check-results-20261103.json');
assert.equal(checks.length, 11);
assert.deepEqual(checks.filter(check => check.exitCode !== 0).map(check => check.name), ['size']);
const size = log('final-size');
assert.match(size, /all ESM runtime code exceeds/u);
assert.match(size, /all CommonJS runtime code exceeds/u);
assert.doesNotMatch(size, /dist\/styles.css exceeds/u);
const corpus = json('artifacts/preformatted-formatting-complete-corpus-20261103.json');
assert.equal(corpus.projectionVersion, 13);
assert.equal(corpus.matching, 635);
assert.equal(corpus.sourceChecks, 1304); assert.equal(corpus.jsonChecks, 1304);
assert.equal(corpus.safeHTMLMatches, 1298);
assert.deepEqual([...new Set(corpus.records.filter(row => !row.safeHTMLMatch).map(row => row.number))], [148, 187, 494]);
assert.deepEqual(corpus.regressions, []); assert.deepEqual(corpus.gains, []);
const timing = json('artifacts/preformatted-formatting-performance-report-20261103.json');
assert.deepEqual(timing.failures, []);
const previousTiming = JSON.parse(git('show', 'HEAD:artifacts/html-attribute-performance-report-20261103.json'));
assert.deepEqual(timing.limits, previousTiming.limits);
const review = json('artifacts/preformatted-formatting-visual-review-20261103.json');
const comparison = json('artifacts/preformatted-formatting-css-visual-comparison-20261103.json');
assert.equal(review.reviewed.length, 22); assert.equal(comparison.comparisons.length, 22);
for (const row of comparison.comparisons) {
  assert.equal(row.byteIdentical, true); assert.equal(row.SHA256, row.baselineSHA256);
  assert.equal(sha(git('show', ':' + row.path)), row.SHA256);
  assert.equal(review.reviewed.find(previous => previous.path === row.baseline)?.sha256, row.SHA256);
}
const folder = 'artifacts/preformatted-formatting-browser-final-css-20261103/';
const observations = files.filter(file => file.startsWith(folder) && file.endsWith('preformatted-break-observations.json'));
assert.equal(observations.length, 5);
for (const file of observations) {
  const observation = json(file);
  for (const name of ['actualDownloadReopen', 'nativeTypingUndoRedo', 'formattedWordEditingUndoRedo',
    'supportedEmphasisRetained', 'projectionNoticeDisclosed', 'actualMarkdownLossReportAndReopen']) assert.equal(observation[name], true);
  assert.deepEqual(observation.errors, []);
}
const css = json('artifacts/preformatted-formatting-css-runtime-comparison-20261103.json');
assert.equal(css.runtimeFiles, 168); assert.equal(css.allByteIdentical, true); assert.equal(css.CSSBytes, 89593);
const proposal = json('artifacts/preformatted-formatting-capacity-proposal-20261103.json');
assert.equal(proposal.currentSizeGate, 'fails; do not claim all checks pass');
const approval = json('artifacts/preformatted-formatting-capacity-approval-20261103.json');
assert.equal(approval.userDecision, 'Approve the measured code-size allowance');
const approvedSize = log('approved-size');
assert.doesNotMatch(approvedSize, /exceeds|Build budget failed/u);
assert.match(approvedSize, /all ESM runtime code: 1651\.6 KiB \/ 1651\.8 KiB/u);
assert.match(approvedSize, /all CommonJS runtime code: 1374\.8 KiB \/ 1375 KiB/u);
const currentChecks = checks.map(check => check.name === 'size'
  ? { name: 'size', exitCode: 0, log: approval.verificationLog } : check);
const manifest = {
  date: '2026-11-03', baseCommit: git('rev-parse', 'HEAD').toString().trim(),
  scope: 'Supported preformatted text marks, owned font/layout context, safe reader palette and honest Markdown fence-loss reporting',
  verification: { unitTests: 3377, unitFiles: 240, newContracts: 29, browserJourneys: 5,
    finalCaptures: comparison.comparisons.map(row => row.path), finalCapturesByteIdenticalToManuallyReviewed: 22,
    visualFindings: review.findings, publicDeclarations: 415, headlessModules: 113,
    packageAndNodeAndWorkerdFormattingContracts: 14, independentRuntimeFilesByteIdenticalAfterCSSCleanup: 168,
    frameworksAndSite: 'passed', checks: currentChecks, preApprovalChecks: checks,
    headless: true, workers: 1, affinityMask: 192, priority: 'BelowNormal' },
  retention: { projectionVersion: 13, bodyProfiles: [563, 613, 631, 635], fixtureRangesChanged: false,
    untouchedSource: 1304, nativeJSON: 1304, safeHTMLNative: '1298/1304', previousSafeHTMLNative: '1288/1304',
    remainingNativeExamplesBothEndings: [148, 187, 494], modelStatuses: corpus.modelStatuses,
    allMetricsIndependent: true },
  performance: { normalRuns: 1, failures: timing.failures, limitsAndSamplingChanged: false,
    serverHTMLP95Ms: Object.fromEntries(Object.entries(timing.serverHTML).map(([size, measured]) => [size, measured.p95])),
    priorFailuresRetained: true, universalLatencyOrSpeedupClaimed: false, independentRetention: 'passed' },
  capacity: { status: 'passes after explicit user-approved aggregate capacity adjustment',
    originalProposal: proposal, approval, stylesheetLimitChanged: false, aggregateCodeLimitsChanged: true,
    otherLimitsChanged: false },
  limitations: { arbitraryCSSOrMediaLayout: false, exactTextLeafSegmentation: false, pixelParity: false,
    completeCommonMarkConformance: false, physicalDevices: false, videosManuallyWatched: false,
    newSourceCloudVerification: 'pending push', parityRowsPromoted: 0, npm: 'unchanged at 0.4.0-beta.2' },
  sourceBinding: 'SHA-256 of staged Git blobs, manifest excluded to avoid circular hashing; cloud verification must be checked separately.',
  hashes: Object.fromEntries(files.map(file => [file, sha(git('show', ':' + file))])),
};
writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Bound ${files.length} source/evidence files; local checks pass including the explicitly approved capacity gate.`);
