import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const nativePath = 'artifacts/gitlab-native-footnote-cut-20261116/report.json';
const report = json(nativePath), install = json('artifacts/gitlab-native-browser-install/install.json');
assert.equal(report.status, 'passed'); assert.equal(report.checks.length, 28); assert.deepEqual(report.browserErrors, []);
assert.equal(report.nativeRuntime.sha256, install.nativeRuntime.sha256);
for (const [path, expected] of Object.entries(report.nativeRuntime.inputs)) assert.equal(hash(path), expected, path);
assert.deepEqual(report.nativeFootnoteCut.before.definitions, report.nativeFootnoteCut.moved.definitions);
assert.equal(report.nativeFootnoteCut.cut.references.length, 3);
assert.equal(report.nativeFootnoteCut.moved.references.length, 6);
const scans = [...report.footnoteAccessibility, ...report.footnoteRenameAccessibility];
assert.equal(scans.length, 6); assert.ok(scans.every(scan => !scan.violations.length));
const patchPath = 'artifacts/gitlab-native-footnote-cut-patch-verification-20261116.json';
const installPath = 'artifacts/gitlab-native-footnote-cut-install-roundtrip-20261116.json';
assert.equal(json(patchPath).status, 'passed'); assert.equal(json(installPath).status, 'passed');
assert.match(readFileSync('artifacts/footnote-cut-unit-20261116.log','utf8'), /6572 passed/);
assert.match(readFileSync('artifacts/footnote-cut-browser-final-20261116.log','utf8'), /2 passed/);
const publicScreens = ['chromium', 'firefox'].flatMap(browser => ['cut-reference-shared-body.png', 'repeat-paste-independent-note.png'].map(file =>
  `artifacts/footnote-cut-browser-final-20261116/footnote-clipboard-real-mo-2e834-then-copies-on-repeat-paste-${browser}/${file}`));
const nativeScreens = ['footnote-cut-moved-graph.png', 'original-reopened.png', 'original-after-restart.png'].map(file => 'artifacts/gitlab-native-footnote-cut-20261116/' + file);
const nativeVideo = 'artifacts/gitlab-native-footnote-cut-20261116/recordings/' + readdirSync('artifacts/gitlab-native-footnote-cut-20261116/recordings').find(file => file.endsWith('.webm'));
const sourceFiles = ['src/core/clipboard-write.ts', 'src/core/plugin.ts', 'src/pages/clipboard.ts', 'src/view/input.ts',
  'integrations/gitlab/services/footnote_labels.ts', 'tests/footnote-cut-move.test.ts', 'tests/gitlab-footnote-clipboard.test.ts',
  'tests/browser/footnote-clipboard-journey.ts', 'scripts/audit-gitlab-native-footnote-clipboard.mjs'];
const gates = ['unit', 'typecheck', 'build', 'api', 'budgets', 'headless', 'package', 'server-runtimes', 'performance', 'source-roundtrip'];
const visual = {
  scope: 'Named editor/reader screenshots and sampled frames inspected; not an uninterrupted review of either recording.',
  observations: [
    'After the whole-line cut, moved and remaining text share note 1; the second paste adds independent note 2.',
    'Initial Firefox click selected only the atom; tightened coordinates and explicit moved-prose assertions now cover the same whole line in both browsers.',
    'Real GitLab author and saved/reopened/restarted reader retain four note bodies, bold marks and six references.',
    'Contextual Footnote actions still appears on its own row during label editing; retained as UI follow-up.',
  ],
  screenshots: [...publicScreens, ...nativeScreens].map(path => ({ path, sha256: hash(path) })),
  frameSheets: ['artifacts/footnote-cut-firefox-frames-20261116.png', 'artifacts/footnote-cut-gitlab-move-frames-20261116.png'].map(path => ({ path, sha256: hash(path) })),
  nativeRecording: { path: nativeVideo, sha256: hash(nativeVideo), durationSeconds: 207.52, sampledSeconds: [84,87,90,93,96,99], retainedLocally: true },
};
writeFileSync('artifacts/gitlab-native-footnote-cut-20261116/visual-review.json', JSON.stringify(visual, null, 2) + '\n');
const result = {
  date: new Date().toISOString(), status: 'verified-bounded-candidate', parentRevision: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  scope: 'Same-live-editor footnote cut/move identity, distinct copy semantics, owned dependency retention and actual GitLab persistence. Not full product parity or a release.',
  sourceFiles: sourceFiles.map(path => ({ path, sha256: hash(path) })),
  implementation: ['One-use editor-owned transfer matched against native bytes or marked equivalent HTML; marker alone is insufficient.',
    'Reuse unchanged definitions; propagate changed dependency conflicts through shared/cyclic graphs without overwriting current bodies.',
    'Restore owned definitions removed by the paste selection; separate cut/paste undo and atomic refusal.',
    'Invalidate on new editor copy/cut, undo/redo, whole-document replacement and view teardown; rejected paste can retry.',
    'Keep GitLab labels for reused notes; ordinary/repeated/foreign-editor pastes remain copies.',
    'Refused cut reports copied-but-not-removed; a clipboard observer cannot redirect deletion.'],
  regressionWitnesses: [
    { path: 'artifacts/footnote-cut-parent-witness-20261116.log', scope: 'Two valid native/HTML duplication failures; two other initial fixture errors were corrected before final tests.' },
    { path: 'artifacts/footnote-cut-destination-witness-20261116.log', scope: 'New destination-selection regression failed until owned bodies were restored.' }],
  verification: { unitTests: 6572, unitFiles: 384, workers: 2, actualGitLabChecks: 28, accessibilityScans: 6, browserErrors: 0,
    nativeReport: nativePath, runtimeSha256: report.nativeRuntime.sha256, footnoteServerOverlay: report.footnoteServerOverlay,
    rootClipboardRun: { path: 'artifacts/footnote-cut-browser-20261116.log', passed: 6, scope: 'Copy, rich table, and initial cut journeys on Chromium/Firefox.' },
    strengthenedCutRun: { path: 'artifacts/footnote-cut-browser-final-20261116.log', passed: 2, scope: 'Whole-line prose/reference cut, shared identity, independent second paste and keyboard history.' },
    gates: gates.map(name => { const path = `artifacts/footnote-cut-${name}-20261116.log`; return { name, path, sha256: hash(path) }; }),
    sourceVerification: [patchPath, installPath], patchCount: 18, installedFiles: 28, publicDeclarations: 452,
    currentSelectedUpstreamRerun: false, previousSelectedUpstream: { passed: 540, inheritedSkip: 1, evidence: 'artifacts/gitlab-table-clipboard-upstream-20261115.json' },
  },
  size: { aggregateESMKiB: 1612.1, aggregateCJSKiB: 1435.4, esmLimitKiB: 1691.25, cjsLimitKiB: 1440, changedLimits: false, addedDependencies: false },
  visualReview: 'artifacts/gitlab-native-footnote-cut-20261116/visual-review.json',
  operationalState: { auditContainer: 'exited', publication: 'none', packageVersion: '0.5.0-beta.1', parityRowsPromoted: false },
  remaining: ['Installed WebKit OS-format transport and physical Safari', 'Broader cut selection, collaboration and role matrices',
    'Footnote actions contextual control placement', 'Intermittent host-image 403 from earlier profiles remains unresolved',
    'Full GitLab MR/wiki/provider/permissions/touch/IME acceptance and compiled deployment rollback', 'Remaining programme roadmap and naming evaluation'],
};
writeFileSync('artifacts/footnote-cut-integration-20261116.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({status:result.status, unitTests:6572, nativeChecks:28, runtime:result.verification.runtimeSha256}));
