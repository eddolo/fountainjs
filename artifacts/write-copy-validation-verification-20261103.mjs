import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestPath = 'artifacts/copy-validation-verification-20261103.json';
const files = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(file => file && file !== manifestPath);
git('diff', '--quiet');
const log = name => readFileSync(`artifacts/copy-validation-${name}-20261103.log`, 'utf8');
const report = name => JSON.parse(readFileSync(`artifacts/copy-validation-${name}-20261103.json`, 'utf8'));
assert.match(log('full-tests'), /Tests\s+3262 passed/u);
assert.match(log('focused-final'), /Tests\s+40 passed/u);
assert.match(log('browser'), /21 passed/u);
assert.match(log('api'), /415 declaration/u);
assert.match(log('headless'), /111 modules/u);
assert.match(log('types'), /0 errors and 0 warnings/u);
const first = report('performance-report'), second = report('performance-confirmation-report');
assert.deepEqual(first.failures, []); assert.deepEqual(second.failures, []);
assert.deepEqual(first.limits, second.limits);
git('diff', '--exit-code', 'HEAD', '--', 'scripts/check-performance-budgets.mjs', 'scripts/performance-sampling.mjs');
const retention = JSON.parse(log('mapping-retention-final'));
assert.equal(retention.validatedEverySnapshot, true);
assert.ok(retention.retainedBytes < retention.retainedLimitBytes);
assert.ok(retention.releasedBytes < retention.releasedLimitBytes);
const captures = files.filter(file => file.startsWith('artifacts/copy-validation-browser-20261103/') && file.endsWith('.png'));
assert.equal(captures.length, 10);
const baseline = JSON.parse(readFileSync('artifacts/performance-core-profile-report-20261103.json', 'utf8'));
const candidate = report('core-profile-report');
const profiles = baseline.map(before => {
  const after = candidate.find(item => item.size === before.size && item.mode === before.mode);
  assert.equal(before.edits, after.edits);
  return { blocks: before.size, mode: before.mode, edits: before.edits,
    beforeWallMs: before.wallMs, afterWallMs: after.wallMs,
    beforeThreadCpuMs: before.threadCpuMs, afterThreadCpuMs: after.threadCpuMs };
});
const hashes = Object.fromEntries(files.map(file => [file, sha(git('show', ':' + file))]));
const manifest = {
  date: '2026-11-03', baseCommit: git('rev-parse', 'HEAD').toString().trim(),
  scope: 'Avoid repeated full sibling validation and grammar matching for validated immutable Node.copy snapshots',
  verified: {
    fullSuite: { tests: 3262, files: 236, runtimeCodeChangedAfterRun: false,
      note: 'One nested-container contract was added afterward; final focused run includes that additional test.' },
    finalFocused: { tests: 40, files: 3, newContracts: 25, deterministicDifferentialEdits: 240 },
    browser: { passed: 21, desktopEngines: ['chromium', 'firefox', 'webkit'],
      mobileEmulation: ['mobile-chrome', 'mobile-safari'], workers: 1, headless: true,
      port: 4194, reuseExistingServer: false, scenarios: ['100k virtualized native editing and offscreen updates',
        'distant backward selection, split/merge, exact history and reopening', 'empty-source start/end focus', 'native form validation'],
      representativePNGsReviewed: captures, videosRecorded: true, videosManuallyReviewed: false },
    publicAPIDeclarations: 415, headlessModules: 111,
    packedESMAndCJS: 'passed', frameworkTypes: 'passed', serverNodeAndWorkerd: 'passed',
    libraryBuild: 'passed', websiteBuild: 'passed', reviewedSizeGate: 'passed',
    markdownProfiles: [563, 613, 631, 635], safeHTMLExactNativeReopens: '1286/1304',
  },
  performance: {
    unchangedGateRunsPassed: 2, failures: [first.failures, second.failures],
    benchmarkBlobSHA256: sha(git('show', 'HEAD:scripts/check-performance-budgets.mjs')),
    samplingBlobSHA256: sha(git('show', 'HEAD:scripts/performance-sampling.mjs')),
    numericalLatencyAndHeapLimitsChanged: false, samplingChanged: false,
    affinityMask: 192, priority: 'BelowNormal', profiles,
    workCountControl: report('probes-report'),
    sharedDirectionRetention: JSON.parse(log('direction-retention')),
    historicalRetentionBeforeStrengthening: JSON.parse(log('mapping-retention')),
    historicalRetentionWithEverySnapshotValidated: retention,
    limits: 'Diagnostic timings are same-host observations, not universal speed guarantees or competitor benchmarks. Earlier failing samples remain tracked.',
  },
  bundleReview: { ESMBytes: 1686670, CJSBytes: 1403935, addedESMBytes: 2052, addedCJSBytes: 1782,
    oldESMCapKiB: 1645.25, ESMCapKiB: 1647.25, oldCJSCapKiB: 1369.5, CJSCapKiB: 1371.25,
    individualEntryCapsChanged: false, CSSCapChanged: false, dependenciesChanged: false,
    preReviewFailure: 'artifacts/copy-validation-size-before-review-20261103.log' },
  limitations: { wholeParityGoalComplete: false, constantTimeEdits: false,
    generalSchemaHotReconfiguration: false, physicalDeviceOrAssistiveTechnologyCertification: false,
    newSourceCloudGates: 'pending push', npmRelease: 'none; still 0.4.0-beta.2', parityRowsPromoted: 0 },
  sourceBinding: 'SHA-256 of staged Git blobs; manifest excluded to avoid a circular hash.', hashes,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Bound ${files.length} files, ${captures.length} reviewed captures, two unchanged performance passes.`);
