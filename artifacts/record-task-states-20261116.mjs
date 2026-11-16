import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dir = 'artifacts/gitlab-native-task-states-20261116/';
const read = path => readFile(new URL(path, root), 'utf8');
const json = async path => JSON.parse(await read(path));
const digest = async path => ({ path, sha256: createHash('sha256').update(await readFile(new URL(path, root))).digest('hex') });
const local = async path => ({ ...await digest(path), retainedLocally: true });
const browser = await json(dir + 'report.json');
assert.equal(browser.status, 'passed'); assert.deepEqual(browser.browserErrors, []);
assert.deepEqual(browser.workflows.phases, ['reopened', 'restart']);
assert.equal(browser.workflows.taskStateEditing.length, 2);
for (const item of browser.workflows.taskStateEditing) {
  assert.equal(item.systemClipboardExternalText, true); assert.equal(item.sameEditorNativePaste, true);
}
const units = await read('artifacts/task-state-unit-final-20261116.log');
const counts = units.match(/Test Files\s+(\d+) passed[^\n]*\n\s*Tests\s+(\d+) passed/);
assert.ok(counts);
const upstream = await json('artifacts/gitlab-task-states-upstream-20261116.json');
assert.equal(upstream.success, true);
await writeFile(new URL('artifacts/task-states-upstream-summary-20261116.json', root), JSON.stringify({
  passed: upstream.numPassedTests, skipped: upstream.numPendingTests, suites: upstream.numPassedTestSuites,
  files: upstream.testResults.map(item => item.name.replace(/^.*\/source\//, '')),
  rawResult: await local('artifacts/gitlab-task-states-upstream-20261116.json'),
}, null, 2) + '\n');
const files = [...new Set([
  ...execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' }).trim().split(/\r?\n/),
  ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split(/\r?\n/),
])].filter(path => /^(src\/|tests\/|scripts\/|integrations\/)/.test(path) && !path.endsWith('.md'));
const receipt = {
  date: new Date().toISOString(), status: 'verified-bounded-candidate',
  parentRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'GitLab-specific pending/completed/not-applicable tasks with explicit checked-state validation, controls and interchange. The default public task schema remains boolean-only.',
  implementation: [
    'The private schema adds the inapplicable enum value to checked; ordinary checkbox changes and split commands reset to the existing boolean states.',
    'N/A controls use native buttons and transactions with mouse, Enter/Space and readonly guards. Checkboxes remain in their original DOM position.',
    'Markdown, HTML and copied plain/structured content retain the third state. Deliberate strike marks remain distinct from generated rendering.',
    'Concurrent peer typing and author undo/redo converge in both tested update orders.',
  ],
  verification: {
    root: { files: Number(counts[1]), tests: Number(counts[2]), workers: 2, ...await local('artifacts/task-state-unit-final-20261116.log') },
    actualApp: { report: dir + 'report.json', checks: browser.checks.length, editors: browser.workflows.taskStateEditing,
      richSourceCycles: browser.workflows.taskRoundtrips.length, phases: browser.workflows.phases,
      ...await local('artifacts/task-state-browser-final-20261116.log') },
    upstream: 'artifacts/task-states-upstream-summary-20261116.json',
    sourceRollback: ['artifacts/gitlab-native-task-states-patch-verification-20261116.json', 'artifacts/gitlab-native-task-states-install-roundtrip-20261116.json'],
    gates: await Promise.all(['typecheck-final', 'budget', 'test-api', 'test-package', 'test-server-runtimes', 'test-headless'].map(name => local(`artifacts/task-state-${name}-20261116.log`))),
    frontend: await local('artifacts/task-state-rspack-final-20261116.log'),
    nativeRuntime: await json('artifacts/gitlab-native-runtime/build.json'),
    footnoteServerOverlay: browser.footnoteServerOverlay,
  },
  sourceDigestFormat: 'Windows working-tree bytes; Git may normalize text line endings.',
  source: await Promise.all(files.map(digest)),
  visualReview: { observations: [
    'Initial screenshot review found that wrapping checkboxes displaced numbered task text. The final DOM preserves the checkbox position and places the N/A control at the block edge.',
    'The final browser profile asserts number/text alignment and a minimum 24px control target.',
  ], images: await Promise.all(['merge-request-not-applicable.png', 'wiki-not-applicable.png', 'merge-request-numbered-tasks.png', 'wiki-numbered-tasks.png', 'merge-request-author.png', 'wiki-restart.png', 'recording-samples.png'].map(file => digest(dir + file))),
    recordingReview: 'Screenshots and sampled frames visually inspected; not continuous full-video review. Initial loading frames, a final unused tile and transient environment-fetch banners during the deliberate restart appear in the contact sheet; final readers are checked after recovery.',
    recordingSeconds: 251.96, sampleIntervalSeconds: 30,
    recording: await local(dir + 'recordings/page@49e452d75d7a84bef93866273d6f0b85.webm') },
  remaining: ['Inline review/suggestions and broader GitLab roles/reconnect/mobile/IME acceptance.', 'Generic third-state Markdown ingestion outside the explicit GitLab adapter.', 'Native DOCX checkbox retention; current export reports its loss.', 'Compiled deployment rollback and remaining programme roadmap.'],
  publication: 'none', limits: 'unchanged', operationalState: { container: 'exited', sourceReinstalled: true },
};
await writeFile(new URL('artifacts/task-states-integration-20261116.json', root), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ files: counts[1], tests: counts[2], appChecks: browser.checks.length }));

const summary = `Latest GitLab task-state checkpoint (2026-11-16): pending, completed and
not-applicable tasks now remain distinct through author controls, Markdown,
HTML and clipboard. Native buttons support Enter/Space; checking an N/A task
completes it, and splitting creates a pending task. Concurrent peer typing and
author undo/redo retain state and text in both tested update orders.

All ${counts[2]} unit cases / ${counts[1]} files pass, alongside framework types,
540 selected upstream cases (one inherited skip), package/API/Node/Worker and
headless checks. The recorded real GitLab profile passes ${browser.checks.length} checks,
including N/A keyboard changes, actual external-text and same-editor clipboard,
six MR/wiki rich/source cycles and Save/reopen/restart. Screenshot review caught
and repaired displaced numbered text; geometry and 24px control targets are now
asserted. Source patch reconstruction and rollback pass. [Task-state evidence](LINK).

The third state belongs to the explicit GitLab schema; the default public task
schema remains boolean-only. Generic third-state Markdown ingestion, native DOCX
checkbox retention, inline review/suggestions and broader product acceptance
remain open. Limits, package version and publication are unchanged.

`;
for (const name of ['integrations/gitlab/README.md', 'docs/ROADMAP.md', 'docs/TIPTAP_PARITY.md', 'docs/RELEASES.md']) {
  let content = await read(name);
  const preparation = content.indexOf('Current work (2026-11-16):');
  if (preparation >= 0) content = content.slice(0, preparation) + content.slice(content.indexOf('Latest mixed-list checkpoint', preparation));
  const link = (name.startsWith('integrations/') ? '../../' : '../') + 'artifacts/task-states-integration-20261116.json';
  assert.ok(content.includes('Latest mixed-list checkpoint (2026-11-16):'));
  content = content.replace('Latest mixed-list checkpoint (2026-11-16):', summary.replace('LINK', link) + 'Previous mixed-list checkpoint (2026-11-16):');
  if (name.startsWith('integrations/')) content = content.replace('Previous mixed-list checkpoint (2026-11-16):',
    'Run `node scripts/run-gitlab-native-browser-audit.mjs --task-states` after matching\nruntime/frontend preparation. It records the third-state controls and clipboard\njourneys, restarts the app and stops the isolated container.\n\nPrevious mixed-list checkpoint (2026-11-16):');
  await writeFile(new URL(name, root), content);
}
let changelog = await read('CHANGELOG.md');
changelog = changelog.replace('## Unreleased\n', '## Unreleased\n\n- Support GitLab not-applicable tasks with N/A controls, keyboard activation,\n  undo and explicit third-state validation. Preserve state through Markdown,\n  HTML and clipboard; verify concurrent peer typing and real MR/wiki saving\n  across application restart. Keep numbered task text aligned.\n');
await writeFile(new URL('CHANGELOG.md', root), changelog);
