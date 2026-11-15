import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const json = async path => JSON.parse(await read(path));
const hash = async path => createHash('sha256').update(await readFile(new URL(path, root))).digest('hex');
const directory = 'artifacts/gitlab-native-table-clipboard-20261115/';
const native = await json(directory + 'report.json');
assert.equal(native.status, 'passed'); assert.deepEqual(native.browserErrors, []);
assert.equal(native.nativeTableClipboard.tables.length, 3);
assert.equal(native.nativeTableClipboard.definitions.length, 3);
assert.equal(native.nativeTableClipboard.references.length, 3);
assert.equal(native.nativeTableClipboard.refusedBodySlice, true);
assert.deepEqual(native.nativeTableClipboard.accessibility, []);
for (const phase of ['saved', 'reopened', 'restart'])
  assert.ok(native.checks.some(check => check.startsWith('All three real tables retain') && check.endsWith(`(${phase})`)));
assert.deepEqual(native.nativeControlsLayout.layouts.map(layout => layout.width), [1440, 1100, 390]);
for (const layout of native.nativeControlsLayout.layouts) {
  assert.deepEqual(layout.accessibility, []); assert.ok(layout.overflow <= 1);
}
const upstream = await json('artifacts/gitlab-table-clipboard-upstream-20261115.json');
assert.equal(upstream.numPassedTests, 540); assert.equal(upstream.numFailedTests, 0);
assert.equal(upstream.numPassedTestSuites, 23); assert.equal(upstream.numPendingTests, 1);
assert.match(await read('artifacts/controls-final-all-units-20261115.log'), /6553 passed/);
assert.match(await read('artifacts/controls-final-clipboard-browser-20261115.log'), /4 passed/);
assert.match(await read('artifacts/controls-final-page-browser-20261115.log'), /3 passed/);
const rollback = await json('artifacts/gitlab-native-table-clipboard-install-roundtrip-20261115.json');
const patches = await json('artifacts/gitlab-native-table-clipboard-patch-verification-20261115.json');
assert.equal(rollback.status, 'passed'); assert.equal(rollback.files, 28);
assert.equal(patches.status, 'passed'); assert.equal(Object.keys(patches.patches).length, 18);
const runtime = await json('artifacts/gitlab-native-runtime/build.json');
for (const [path, digest] of Object.entries(runtime.inputs)) assert.equal(await hash(path), digest, path);
const api = execFileSync(process.execPath, ['scripts/check-api-surface.mjs'], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim();
assert.match(api, /452 declaration files/);
execFileSync(process.execPath, ['scripts/check-build-budgets.mjs'], { cwd: fileURLToPath(root), stdio: 'pipe' });
const budget = await read('artifacts/controls-final-budget-20261115.log');
const recordings = [];
for (const name of await readdir(new URL(directory + 'recordings/', root))) {
  if (!name.endsWith('.webm')) continue;
  const path = directory + 'recordings/' + name, info = await stat(new URL(path, root));
  if (info.mtimeMs >= Date.parse(native.date)) recordings.push(path);
}
assert.equal(recordings.length, 1, 'Select the passed recording, not a previous failed attempt');
const recording = { path: recordings[0], sha256: await hash(recordings[0]),
  seconds: Number(execFileSync('C:/ProgramData/chocolatey/bin/ffprobe.exe', ['-v', 'error', '-show_entries',
    'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', fileURLToPath(new URL(recordings[0], root))], { encoding: 'utf8' }).trim()) };
const visual = await json(directory + 'visual-review.json');
assert.equal(visual.scope, 'Reviewed named screenshots and sampled recording frames; not a full-movie review');
assert.equal(visual.recordingSha256, recording.sha256);
for (const image of visual.images) assert.equal(await hash(image.path), image.sha256);
const evidence = {
  date: new Date().toISOString(), status: 'bounded-delivery-with-open-platform-validation', parent: runtime.parentRevision,
  scope: 'Rich cell-grid clipboard ownership/placement and private GitLab control polish; not full clipboard, product or parity acceptance',
  changes: [
    'Cell selections use native document/HTML ownership hooks and span-aware TSV; rich paste preserves cell roles, attributes, marks, nested widget data and complete owned notes.',
    'Paste grows bounds, tiles/clips source spans, splits crossing target spans and retains untouched subtree mappings; explicit nested-table insertion stays available.',
    'Advertised rich HTML waits for delivery; missing HTML keeps TSV grid placement with an explicit loss report. Refusal preserves exact state without publishing intermediate updates.',
    'Private toolbar wraps labelled control groups, keeps clipboard tools together and presents media actions as a readable list with divided deletion.',
    'Whole-editor accessibility scans found invalid footnote container/reference role hosts. Definitions now use aside and reference roles/names belong to their links; older section input retains native IDs and source labels.'
  ],
  tests: { root: { passed: 6553, suites: 383, workers: 2,
      defaultParallelAttempt: { passed: 6552, timedOut: 1, expectationsAndTimeoutsChanged: false } },
    upstream: { passed: 540, suites: 23, inheritedSkip: 1 }, api,
    publicOSClipboard: { passed: ['Windows Chromium', 'Windows Firefox'], cases: 4, externalRichAndPlainDestinations: true },
    footnoteDOM: { passed: ['Windows Chromium', 'Windows Firefox', 'Windows WebKit'], cases: 3, distinctFromOSClipboardTransport: true },
    native: { checks: native.checks.length, tables: 3, definitions: 3, references: 3,
      accessibilityScans: 1 + native.nativeControlsLayout.layouts.reduce((sum, layout) => sum + layout.accessibilityScans, 0),
      browserErrors: 0, phases: ['saved', 'reopened', 'restart'], controlWidths: [1440, 1100, 390] },
    types: 'TypeScript, Svelte and Angular passed', package: 'ESM/CommonJS/optional exports passed',
    server: 'Node and Cloudflare workerd passed', headless: '144-module no-DOM boundary and TypeScript passed',
    runtime: 'Existing latency, growth and retained-memory gates passed; separate grid-growth measurements are observational',
    patches: 18, rollbackFiles: 28 },
  build: { esmKiB: Number(budget.match(/all ESM runtime code: ([\d.]+)/)[1]),
    commonjsKiB: Number(budget.match(/all CommonJS runtime code: ([\d.]+)/)[1]), commonjsCapacityKiB: 1440,
    acceptanceLimits: 'Unchanged in this checkpoint', newDependencies: 0 },
  recording,
  evidence: { native: directory + 'report.json', visual: directory + 'visual-review.json',
    originalCellFailures: 'artifacts/table-clipboard-parent-witness-20261115.log',
    originalDeferredFailures: 'artifacts/table-clipboard-deferred-witness-20261115.log',
    accessibilityWitness: 'artifacts/gitlab-native-table-clipboard-accessibility-witness-20261115/report.json',
    referenceRoleWitness: 'artifacts/gitlab-native-table-clipboard-reference-witness-20261115/report.json',
    staleFixtureExpectation: 'artifacts/gitlab-native-table-clipboard-fixture-witness-20261115/report.json',
    narrowLayoutWitness: 'artifacts/gitlab-controls-narrow-layout-witness-20261115.png',
    defaultParallelTimeout: 'artifacts/controls-default-parallel-timeout-witness-20261115.log',
    observedGridGrowth: 'artifacts/table-clipboard-headless-cost-20261115.json',
    minimalWindowsClipboardReproduction: 'artifacts/webkit-clipboard-platform-probe-win32-20261115.json',
    minimalLinuxClipboardReproduction: 'artifacts/webkit-clipboard-platform-probe-linux-20261115.json' },
  accessibilityReferences: ['https://www.w3.org/TR/html-aria/#el-aside', 'https://www.w3.org/TR/dpub-aria-1.1/#doc-noteref'],
  harnessCorrection: 'Only the table-editing profile replaces the baseline Pending-cell expectation with its intentional saved row values; the full reader cell graph is checked in every save/reopen/restart phase. Other profiles still require Pending.',
  open: ['Same-editor cut/move identity reuse and broader clipboard/column-layout combinations remain open.',
    'The default-parallel full-suite attempt hit one SQLite fixture deadline; bounded-concurrency success does not establish default-parallel reliability.',
    'Installed WebKit OS-format transport failures remain independently reproduced; physical Safari is unverified.',
    'Previously observed intermittent host-image 403 responses remain unresolved; this passing profile does not diagnose their cause.',
    'GitLab GFM cannot represent arbitrary merged tables or standalone TD-only slices; source-retaining refusal is not format support.',
    'Full GitLab workflows, roles, IME/touch/browser matrices, cache rollout and compiled deployment rollback remain open.'],
  publication: 'No package version, npm publication, project rename or parity-row promotion'
};
await writeFile(new URL('artifacts/gitlab-table-clipboard-integration-20261115.json', root), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ status: evidence.status, nativeChecks: native.checks.length, units: 6553, recording: recording.sha256 }));
