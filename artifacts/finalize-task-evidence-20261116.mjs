import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
const reportPath = 'artifacts/gitlab-native-task-roundtrip-20261116/report.json', report = json(reportPath);
assert.equal(report.status, 'passed'); assert.equal(report.checks.length, 20); assert.deepEqual(report.browserErrors, []);
assert.deepEqual(report.workflows.phases, ['reopened', 'restart']);
assert.deepEqual(report.review.phases, ['reopened', 'restart']);
assert.equal(report.workflows.taskRoundtrips.length, 6);
for (const name of ['merge-request', 'wiki']) {
 const rounds = report.workflows.taskRoundtrips.filter(item => item.name === name);
 assert.deepEqual(rounds.map(item => item.cycle), [1, 2, 3]);
 for (const round of rounds) assert.deepEqual(round.tasks, ['- [ ] Verify deployment', '- [ ] Review migration']);
 const saved = name === 'wiki' ? report.workflows.wiki.saved : report.workflows.mergeRequest.saved;
 assert.deepEqual(saved.split(/\r?\n/u).filter(line => /^- \[[ x]\]/u.test(line)), rounds[0].tasks);
}
assert.equal(report.nativeRuntime.sha256, json('artifacts/gitlab-native-browser-install/install.json').nativeRuntime.sha256);
for (const [path, expected] of Object.entries(report.nativeRuntime.inputs)) assert.equal(hash(path), expected, path);
const corpusPath = 'integrations/gitlab/fixtures/task-live-html.json', corpus = json(corpusPath);
assert.equal(corpus.fixtures.length, 17); assert.equal(corpus.upstream.revision, report.pin.commit);
const checks = ['patch-verification', 'install-roundtrip'].map(name => `artifacts/gitlab-native-task-${name}-20261116.json`);
for (const path of checks) assert.equal(json(path).status, 'passed');
assert.equal(Object.keys(json(checks[0]).patches).length, 18); assert.equal(json(checks[1]).files, 28);
const upstreamPath = 'artifacts/gitlab-task-upstream-20261116.json', upstream = json(upstreamPath);
assert.equal(upstream.success, true); assert.equal(upstream.numPassedTests, 540);
const summary = 'artifacts/task-upstream-summary-20261116.json';
write(summary, { passed: upstream.numPassedTests, skipped: upstream.numPendingTests, passedSuites: upstream.numPassedTestSuites,
 suites: upstream.testResults.map(item => ({ name: item.name.replace('/home/eddolo/.cache/fountainjs-gitlab-product/source/', ''), status: item.status })),
 raw: { path: upstreamPath, sha256: hash(upstreamPath), retainedLocally: true } });
const unitLog = 'artifacts/task-whitespace-gitlab-20261116.log';
assert.match(readFileSync(unitLog, 'utf8'), /1167 passed/); assert.match(readFileSync(unitLog, 'utf8'), /43 passed/);
assert.equal(readFileSync('artifacts/task-whitespace-types-20261116.log', 'utf8').trim(), '');
const build = 'artifacts/task-rspack-20261116.log';
const seconds = readFileSync(build, 'utf8').match(/Rspack 2\.2\.8 compiled with 2 warnings in ([\d.]+) s/)?.[1];
assert.ok(seconds);
const visualPath = 'artifacts/gitlab-native-task-roundtrip-20261116/visual-review.json', visual = json(visualPath);
for (const item of [...visual.screenshots, visual.frameSheet, visual.recording]) assert.equal(hash(item.path), item.sha256);
const source = ['integrations/gitlab/services/markdown_codec.ts', corpusPath, 'tests/gitlab-task-whitespace.test.ts',
 'scripts/capture-gitlab-task-rendering.mjs', 'scripts/capture-gitlab-alert-rendering.mjs',
 'scripts/audit-gitlab-native-workflows.mjs', 'scripts/audit-gitlab-product-baseline.mjs', 'scripts/run-gitlab-native-browser-audit.mjs'];
write('artifacts/task-whitespace-integration-20261116.json', {
 date: new Date().toISOString(), status: 'verified-bounded-candidate',
 parentRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
 scope: 'GitLab task checkbox and nested-block whitespace conversion. Actual MR/wiki checkbox undo/redo and three rich/source cycles each, with unrelated prose edits, saved source and restart. Nested/whitespace/escaped entity cases use actual renderer fixtures in Node tests.',
 fix: 'Remove only renderer-owned checkbox spacing and structural newlines. Consult original source positions to retain authored terminal newline entities; preserve spaces, tabs, NBSP and literal escaped entities.',
 source: source.map(path => ({ path, sha256: hash(path) })),
 verification: { report: reportPath, actualChecks: report.checks.length, conversionCycles: 6, browserErrors: report.browserErrors.length,
  actualRendererCases: corpus.fixtures.length, gitlabUnitCases: 1167, unitFiles: 43,
  unitLog: { path: unitLog, sha256: hash(unitLog), retainedLocally: true }, typecheck: 'passed', selectedUpstream: summary,
  sourceVerification: checks, patches: 18, installedFiles: 28,
  frontendBuild: { status: 'passed', seconds: Number(seconds), existingSizeAdvisories: 2, path: build, sha256: hash(build), retainedLocally: true },
  nativeRuntimeSha256: report.nativeRuntime.sha256, footnoteServerOverlay: report.footnoteServerOverlay,
  engineAndPublicAPIChanged: false, fullRootSuiteRerun: false, previousEngineEvidence: 'artifacts/footnote-cut-integration-20261116.json' },
 witnesses: ['artifacts/task-whitespace-before-20261116.log', 'artifacts/task-nested-diagnosis-20261116.log'].map(path => ({ path, sha256: hash(path), retainedLocally: true })),
 visualReview: visualPath,
 operationalState: { auditContainer: 'exited', sourceReinstalled: true, publication: 'none', packageAndAcceptanceLimitsChanged: false },
 remaining: ['Mixed task/bullet and inapplicable task support beyond the accepted conversion contract',
  'Inline review/suggestions, review batching, roles/concurrency/reconnect/mobile/IME matrices',
  'Wiki creation/history/templates, broader real-product acceptance', 'Physical Safari/OS clipboard, earlier image-403 diagnosis, compiled deployment rollback',
  'Remaining programme roadmap and naming evaluation']
});
console.log(JSON.stringify({ status: 'verified-bounded-candidate', checks: report.checks.length, cycles: 6, fixtures: corpus.fixtures.length }));
