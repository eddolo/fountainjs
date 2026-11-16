import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const reportPath = 'artifacts/gitlab-native-footnote-controls-20261116/report.json';
const report = json(reportPath);
assert.equal(report.status, 'passed'); assert.equal(report.checks.length, 29);
assert.deepEqual(report.browserErrors, []);
const scans = [...report.footnoteAccessibility, ...report.footnoteRenameAccessibility, ...report.footnoteControlsAccessibility];
assert.equal(scans.length, 9); assert.ok(scans.every(scan => scan.violations.length === 0));
assert.equal(report.footnoteControlsFocus.inside, true);
const install = json('artifacts/gitlab-native-browser-install/install.json');
assert.equal(report.nativeRuntime.sha256, install.nativeRuntime.sha256);
for (const [path, expected] of Object.entries(report.nativeRuntime.inputs)) assert.equal(hash(path), expected, path);
const verificationPaths = ['patch-verification', 'install-roundtrip'].map(suffix => `artifacts/gitlab-native-note-controls-${suffix}-20261116.json`);
for (const path of verificationPaths) assert.equal(json(path).status, 'passed');
const upstreamPath = 'artifacts/gitlab-note-controls-upstream-20261116.json', upstream = json(upstreamPath);
assert.equal(upstream.success, true); assert.equal(upstream.numPassedTests, 540); assert.equal(upstream.numFailedTests, 0);
const upstreamSummary = 'artifacts/note-controls-upstream-summary-20261116.json';
write(upstreamSummary, { passed: upstream.numPassedTests, skipped: upstream.numPendingTests, passedSuites: upstream.numPassedTestSuites,
  suites: upstream.testResults.map(suite => ({ name: suite.name.replace('/home/eddolo/.cache/fountainjs-gitlab-product/source/', ''), status: suite.status })),
  rawReport: { path: upstreamPath, sha256: hash(upstreamPath), retainedLocally: true } });
const buildPath = 'artifacts/note-controls-rspack-20261116.log';
assert.match(readFileSync(buildPath, 'utf8'), /Rspack 2\.2\.8 compiled with 2 warnings in 71\.68 s/);
const images = ['note-toolbar-1440.png', 'note-toolbar-1100.png', 'note-toolbar-360.png', 'note-actions-1440.png', 'footnote-media-controls.png']
  .map(name => `artifacts/gitlab-native-footnote-controls-20261116/${name}`);
const video = 'artifacts/gitlab-native-footnote-controls-20261116/recordings/page@174c3e8f2d99f8c4d29f069892336c2b.webm';
const visualPath = 'artifacts/gitlab-native-footnote-controls-20261116/visual-review.json';
write(visualPath, { scope: 'Named screenshots and sampled video frames visually inspected; not an uninterrupted review of the full recording.',
  observations: ['1440px viewport: a single 49px toolbar row with Note beside document tools.',
    '1100px viewport: wrapping keeps Note with document tools; attachment and Markdown controls remain together.',
    '360px viewport: full-width note panel without horizontal overflow; edit and removal rows remain distinct.',
    'Note and Media panels prioritize editing, align secondary actions and divide destructive actions.',
    'Sampled frames retain real GitLab author/dialog/reader structure; first two samples show the pre-navigation blank surface.'],
  screenshots: images.map(path => ({ path, sha256: hash(path) })),
  frameSheet: { path: 'artifacts/note-controls-frames-20261116.png', sha256: hash('artifacts/note-controls-frames-20261116.png'), sampling: 'From 40 seconds, one frame per 10 seconds for 90 seconds.' },
  recording: { path: video, sha256: hash(video), durationSeconds: 180.2, retainedLocally: true } });
const result = { date: new Date().toISOString(), status: 'verified-bounded-candidate', parentRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Private GitLab contextual Note controls and shared toolbar layout; not a release or full GitLab acceptance.',
  source: ['integrations/gitlab/components/fountain_formatting_toolbar.vue', 'scripts/audit-gitlab-native-footnote-controls.mjs',
    'scripts/audit-gitlab-product-baseline.mjs', 'scripts/run-gitlab-native-browser-audit.mjs'].map(path => ({ path, sha256: hash(path) })),
  verification: { nativeReport: reportPath, actualChecks: 29, scopedAccessibilityScans: 9, browserErrors: 0,
    selectedUpstream: upstreamSummary, sourceVerification: verificationPaths, patchCount: 18, installedFiles: 28,
    frontendBuild: { status: 'passed', seconds: 71.68, existingSizeAdvisories: 2, rawLog: buildPath, sha256: hash(buildPath), rawRetainedLocally: true },
    runtimeSha256: report.nativeRuntime.sha256, footnoteServerOverlay: report.footnoteServerOverlay,
    previousEngineEvidence: { revision: '5f1ade93', path: 'artifacts/footnote-cut-integration-20261116.json', currentRootSuiteRerun: false, engineChanged: false } },
  auditCorrection: { firstRun: 'An immediate post-Cancel focus assertion failed during modal closing. The audit now waits for the dialog to hide and polls the same focus expectation. No product focus workaround or expectation reduction.',
    witness: 'artifacts/gitlab-note-controls-transition-witness-20261116/report.json', witnessSha256: hash('artifacts/gitlab-note-controls-transition-witness-20261116/report.json') },
  visualReview: visualPath,
  operationalState: { auditContainer: 'exited', sourceReinstalled: true, publication: 'none', publicAPIChanged: false, packageVersionChanged: false, acceptanceLimitsChanged: false },
  remaining: ['Full actual GitLab MR/wiki/provider/permissions/reconnect/mobile/IME workflow acceptance',
    'Physical Safari and installed WebKit OS clipboard transport', 'Broader cut-selection/collaboration/role matrices',
    'Earlier intermittent host-image 403 remains open', 'Compiled deployment rollback and programme roadmap'] };
write('artifacts/note-controls-integration-20261116.json', result);
console.log(JSON.stringify({ status: result.status, actualChecks: 29, scopedAccessibilityScans: 9, selectedUpstreamPassed: 540 }));
