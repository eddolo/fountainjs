import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const reportPath = 'artifacts/gitlab-native-workflows-20261116/report.json', report = json(reportPath);
assert.equal(report.status, 'passed'); assert.equal(report.checks.length, 16); assert.deepEqual(report.browserErrors, []);
assert.equal(report.nativeRuntime.sha256, json('artifacts/gitlab-native-browser-install/install.json').nativeRuntime.sha256);
for (const [path, expected] of Object.entries(report.nativeRuntime.inputs)) assert.equal(hash(path), expected, path);
assert.deepEqual(report.workflows.phases, ['reopened', 'restart']);
assert.equal(report.workflows.mathProjection.length, 2);
assert.ok(report.workflows.mathProjection.every(value => value.width <= 1 && value.height <= 1 && value.position === 'absolute'));
const paths = ['patch-verification', 'install-roundtrip'].map(suffix => `artifacts/gitlab-native-workflows-${suffix}-20261116.json`);
for (const path of paths) assert.equal(json(path).status, 'passed');
const upstreamPath = 'artifacts/gitlab-workflows-upstream-20261116.json', upstream = json(upstreamPath);
assert.equal(upstream.success, true); assert.equal(upstream.numPassedTests, 540);
const summary = 'artifacts/workflows-upstream-summary-20261116.json';
write(summary, { passed: upstream.numPassedTests, skipped: upstream.numPendingTests, passedSuites: upstream.numPassedTestSuites,
  suites: upstream.testResults.map(value => ({ name: value.name.replace('/home/eddolo/.cache/fountainjs-gitlab-product/source/', ''), status: value.status })),
  raw: { path: upstreamPath, sha256: hash(upstreamPath), retainedLocally: true },
  recordkeeping: 'The runner initially reused the preceding note-controls local raw-report path. This run was copied to its own path; the committed earlier summary and counts remain unchanged, but its old local raw-report bytes are no longer available. Future runs use the separate workflow runner.' });
const buildPath = 'artifacts/workflows-rspack-20261116.log';
assert.match(readFileSync(buildPath, 'utf8'), /Rspack 2\.2\.8 compiled with 2 warnings in 71\.61 s/);
const screenshots = ['merge-request-author.png', 'merge-request-reopened.png', 'merge-request-restart.png', 'wiki-author.png', 'wiki-reopened.png', 'wiki-restart.png']
  .map(file => `artifacts/gitlab-native-workflows-20261116/${file}`);
const recordings = 'artifacts/gitlab-native-workflows-20261116/recordings/';
const video = recordings + readdirSync(recordings).filter(file => file.endsWith('.webm')).sort((a,b) => statSync(recordings+b).mtimeMs - statSync(recordings+a).mtimeMs)[0];
const duration = Number(execFileSync('C:/ProgramData/chocolatey/bin/ffprobe.exe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',video], { encoding:'utf8' }).trim());
const visual = { scope: 'Named screenshots and sampled frames inspected, not uninterrupted full-video review or pixel equality with stock GitLab.',
  observations: ['Direct merge-request entry now renders one equation; previously both accessible MathML and HTML were visible.',
    'Wiki document editing and its separate comment composer coexist; audit interactions target the document form.',
    'Real author and reader pages retain headings, tasks, tables, math, decoded image and the new bold paragraphs.',
    'Host reader typography differs from authoring typography; this checkpoint does not claim identical page layout.',
    'Sampled reader-loading frames show transient raw/unstyled math before GitLab finishes loading; final readers are checked after rendering. Reader loading polish remains open.'],
  screenshots: screenshots.map(path => ({ path, sha256: hash(path) })),
  recording: { path: video, sha256: hash(video), durationSeconds: duration, retainedLocally: true },
  frameSheet: { path: 'artifacts/workflows-frames-20261116.png', sha256: hash('artifacts/workflows-frames-20261116.png'), sampling: 'From 70 seconds, one frame per 10 seconds for 90 seconds.' } };
write('artifacts/gitlab-native-workflows-20261116/visual-review.json', visual);
const source = ['integrations/gitlab/components/fountain_content_editor.vue', 'scripts/audit-gitlab-native-workflows.mjs', 'scripts/audit-gitlab-product-baseline.mjs', 'scripts/run-gitlab-native-browser-audit.mjs'];
write('artifacts/workflows-integration-20261116.json', { date: new Date().toISOString(), status: 'verified-bounded-candidate',
  parentRevision: execFileSync('git', ['rev-parse','HEAD'], { encoding:'utf8' }).trim(),
  scope: 'Real existing merge-request description and wiki-page editing, mode handoff, immediate rich submission and reader persistence. Records are seeded through authenticated GitLab APIs. Not full MR review/wiki/product acceptance.',
  source: source.map(path => ({ path, sha256: hash(path) })),
  fix: 'Load the already installed KaTeX stylesheet with the editor itself, including direct editor-entry routes.',
  verification: { actualChecks: report.checks.length, report: reportPath, browserErrors: report.browserErrors.length,
    selectedUpstream: summary, sourceVerification: paths, patches: 18, installedFiles: 28,
    frontendBuild: { status: 'passed', seconds: 71.61, existingSizeAdvisories: 2, rawLog: buildPath, sha256: hash(buildPath), retainedLocally: true },
    nativeEngineRuntimeSha256: report.nativeRuntime.sha256, footnoteServerOverlay: report.footnoteServerOverlay,
    engineAndPublicAPIChanged: false, rootSuiteRerun: false, previousEngineEvidence: 'artifacts/footnote-cut-integration-20261116.json' },
  witnesses: [
    { path: 'artifacts/gitlab-workflows-first-witness-20261116/report.json', finding: 'Audit used button instead of the actual Cancel link. Its author screenshot separately exposes the genuine missing math stylesheet.' },
    { path: 'artifacts/gitlab-workflows-image-fixture-witness-20261116/report.json', finding: 'Audit constructed a 404 image URL; corrected to the server-returned upload full_path. Not a product image fix.' },
    { path: 'artifacts/gitlab-workflows-host-selection-witness-20261116/report.json', finding: 'Wiki mounts a document editor and a comment editor; the audit now scopes its controls to the document form.' } ],
  visualReview: 'artifacts/gitlab-native-workflows-20261116/visual-review.json',
  operationalState: { auditContainer: 'exited', sourceReinstalled: true, publication: 'none', packageAndAcceptanceLimitsChanged: false },
  remaining: ['MR discussion and inline code-review/suggestion workflows', 'UI creation, wiki links/history/templates and navigation',
    'Role/permission, concurrent editing, reconnect and mobile/IME matrices', 'Earlier image-403 diagnosis, physical Safari/OS clipboard, compiled deployment rollback', 'Remaining programme roadmap and naming evaluation'] });
console.log(JSON.stringify({ status: 'verified-bounded-candidate', checks: report.checks.length, phases: report.workflows.phases }));
