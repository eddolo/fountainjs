import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const reportPath = 'artifacts/gitlab-native-review-20261116/report.json';
const report = json(reportPath);
assert.equal(report.status, 'passed');
assert.equal(report.checks.length, 19);
assert.deepEqual(report.browserErrors, []);
assert.deepEqual(report.workflows.phases, ['reopened', 'restart']);
assert.deepEqual(report.review.phases, ['reopened', 'restart']);
assert.deepEqual(report.reviewContexts.map(item => item.phase), ['new-thread', 'edit-thread', 'reply-thread']);
assert.ok(report.reviewContexts.every(item => item.error === null));
for (const phase of ['edit-thread', 'reply-thread']) {
  const context = report.reviewContexts.find(item => item.phase === phase).suggestions;
  assert.equal(context.canSuggest, false);
  assert.equal(context.blobRawPath, null);
  assert.equal(context.lineRange, null);
}
assert.equal(report.nativeRuntime.sha256, json('artifacts/gitlab-native-browser-install/install.json').nativeRuntime.sha256);
for (const [path, expected] of Object.entries(report.nativeRuntime.inputs)) assert.equal(hash(path), expected, path);
const sources = ['integrations/gitlab/services/host_configuration.ts', 'tests/gitlab-host-configuration.test.ts',
  'scripts/audit-gitlab-native-review.mjs', 'scripts/audit-gitlab-product-baseline.mjs', 'scripts/run-gitlab-native-browser-audit.mjs'];
const checks = ['patch-verification', 'install-roundtrip'].map(name => `artifacts/gitlab-native-review-${name}-20261116.json`);
for (const path of checks) assert.equal(json(path).status, 'passed');
assert.equal(Object.keys(json(checks[0]).patches).length, 18);
assert.equal(json(checks[1]).files, 28);
const upstreamPath = 'artifacts/gitlab-review-upstream-20261116.json';
const upstream = json(upstreamPath);
assert.equal(upstream.success, true); assert.equal(upstream.numPassedTests, 540);
const summary = 'artifacts/review-upstream-summary-20261116.json';
write(summary, { passed: upstream.numPassedTests, skipped: upstream.numPendingTests,
  passedSuites: upstream.numPassedTestSuites,
  suites: upstream.testResults.map(item => ({ name: item.name.replace('/home/eddolo/.cache/fountainjs-gitlab-product/source/', ''), status: item.status })),
  raw: { path: upstreamPath, sha256: hash(upstreamPath), retainedLocally: true } });
const build = 'artifacts/review-rspack-20261116.log';
assert.match(readFileSync(build, 'utf8'), /Rspack 2\.2\.8 compiled with 2 warnings in 72\.12 s/);
const unitLog = 'artifacts/review-host-config-unit-20261116.log';
assert.match(readFileSync(unitLog, 'utf8'), /42 passed/);
assert.equal(readFileSync('artifacts/review-types-20261116.log', 'utf8').trim(), '');
const visualPath = 'artifacts/gitlab-native-review-20261116/visual-review.json';
const visual = json(visualPath);
for (const item of [...visual.screenshots, visual.frameSheet, visual.recording]) assert.equal(hash(item.path), item.sha256);
write('artifacts/review-integration-20261116.json', {
  date: new Date().toISOString(), status: 'verified-bounded-candidate',
  parentRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Actual general MR discussion creation, rich editing, reply and resolution, including saved API bodies and reopen/restart. Not inline review, code suggestions, review batching or full product acceptance.',
  source: sources.map(path => ({ path, sha256: hash(path) })),
  fix: 'Accept only the real NoteForm inactive blobRawPath:null and lineRange:null metadata. Active and unknown suggestion configurations remain refused.',
  verification: {
    report: reportPath, actualChecks: report.checks.length, browserErrors: report.browserErrors.length,
    focusedUnitCases: 42, focusedUnitLog: { path: unitLog, sha256: hash(unitLog), retainedLocally: true },
    typecheck: 'passed', selectedUpstream: summary, sourceVerification: checks,
    patches: 18, installedFiles: 28,
    frontendBuild: { status: 'passed', seconds: 72.12, existingSizeAdvisories: 2, path: build, sha256: hash(build), retainedLocally: true },
    nativeRuntimeSha256: report.nativeRuntime.sha256, footnoteServerOverlay: report.footnoteServerOverlay,
    engineAndPublicAPIChanged: false, fullRootSuiteRerun: false,
    previousEngineEvidence: 'artifacts/footnote-cut-integration-20261116.json'
  },
  witnesses: {
    regression: { path: 'artifacts/review-host-config-witness-20261116.log', sha256: hash('artifacts/review-host-config-witness-20261116.log'), retainedLocally: true, finding: 'Before the fix, the exact inactive NoteForm configuration throws; nine other cases pass.' },
    browser: 'Pre-fix browser attempts reached real thread creation but stopped on audit selectors, not the product defect. The trigger selector and edit accessible-name prefix were corrected to the pinned host implementation. A later run reached edit/reply but asserted during the host optimistic-save transition; it now waits for the reply form to close. Whole-thread resolution uses the dedicated discussion control. The first passing persistence run captured the top of the page after reopening; the final run explicitly reveals and captures the verified thread. No pre-fix browser failure claim.'
  },
  visualReview: visualPath,
  operationalState: { auditContainer: 'exited', sourceReinstalled: true, publication: 'none', packageAndAcceptanceLimitsChanged: false },
  remaining: ['Inline code review and suggestions; review batching and broader thread controls',
    'Task-list encoded leading-space drift observed in repeated MR/wiki rich/source cycles', 'UI creation, wiki history/templates and navigation', 'Roles/concurrency/reconnect/mobile/IME matrices',
    'Earlier image-403 diagnosis, physical Safari/OS clipboard, compiled deployment rollback', 'Remaining programme roadmap and naming evaluation']
});
console.log(JSON.stringify({ status: 'verified-bounded-candidate', checks: report.checks.length, review: report.review.phases }));
