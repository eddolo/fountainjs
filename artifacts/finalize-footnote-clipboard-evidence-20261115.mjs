import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const json = async path => JSON.parse(await read(path));
const hash = async path => createHash('sha256').update(await readFile(new URL(path, root))).digest('hex');
const directory = 'artifacts/gitlab-native-footnote-clipboard-20261115/';
const native = await json(directory + 'report.json');
assert.equal(native.status, 'passed'); assert.equal(native.checks.length, 27);
assert.deepEqual(native.browserErrors, []);
assert.equal(native.nativeFootnoteClipboard.definitions.length, 4);
assert.equal(native.nativeFootnoteClipboard.references.length, 6);
assert.equal(new Set(native.nativeFootnoteClipboard.definitions.map(note => note.id)).size, 4);
for (const phase of ['saved', 'reopened', 'restart'])
  assert.ok(native.checks.some(check => check.startsWith('All six real reader references') && check.endsWith(`(${phase})`)));
const accessibility = [...native.footnoteAccessibility, ...native.footnoteRenameAccessibility];
assert.equal(accessibility.length, 6);
for (const scan of accessibility) assert.deepEqual(scan.violations, []);
const upstream = await json('artifacts/gitlab-footnote-clipboard-upstream-20261115.json');
assert.equal(upstream.numPassedTests, 540); assert.equal(upstream.numFailedTests, 0);
assert.equal(upstream.numPassedTestSuites, 23); assert.equal(upstream.numPendingTests, 1);
assert.match(await read('artifacts/footnote-clipboard-all-units-final-20261115.log'), /6526 passed/);
assert.match(await read('artifacts/footnote-clipboard-dedicated-20261115.log'), /2 passed/);
assert.equal((await json('artifacts/footnote-clipboard-dedicated-webkit-20261115/.last-run.json')).status, 'failed');
const platform = await json('artifacts/webkit-clipboard-platform-probe-win32-20261115.json');
assert.equal(platform.platform, 'win32');
assert.equal(platform.results[0].value, 'Native plain text');
assert.equal(platform.results.find(result => result.mode === 'plain').value, '');
const linux = await json('artifacts/webkit-clipboard-platform-probe-linux-20261115.json');
assert.equal(linux.platform, 'linux');
assert.equal(linux.results.find(result => result.mode === 'html').value, 'Projected plain text');
assert.equal(linux.events.find(event => event.type === 'paste' && event.mode === 'html').html, '');
const rollback = await json('artifacts/gitlab-native-footnote-clipboard-install-roundtrip-20261115.json');
const patches = await json('artifacts/gitlab-native-footnote-clipboard-patch-verification-20261115.json');
assert.equal(rollback.status, 'passed'); assert.equal(rollback.files, 28);
assert.equal(patches.status, 'passed'); assert.equal(Object.keys(patches.patches).length, 18);
const runtime = await json('artifacts/gitlab-native-runtime/build.json');
for (const [path, digest] of Object.entries(runtime.inputs)) assert.equal(await hash(path), digest, path);
const api = execFileSync(process.execPath, ['scripts/check-api-surface.mjs'], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim();
assert.match(api, /452 declaration files/);
execFileSync(process.execPath, ['scripts/check-build-budgets.mjs'], { cwd: fileURLToPath(root), stdio: 'pipe' });
const recordings = [];
for (const name of await readdir(new URL(directory + 'recordings/', root))) {
  if (!name.endsWith('.webm')) continue;
  const path = directory + 'recordings/' + name, info = await stat(new URL(path, root));
  if (info.mtimeMs >= Date.parse(native.date)) recordings.push({ path, modified: info.mtimeMs });
}
assert.equal(recordings.length, 1, 'Use this passed run, not a prior failure recording');
const recording = { path: recordings[0].path, sha256: await hash(recordings[0].path), seconds: 199.24 };
const reviewedImages = [directory + 'footnote-toolbar-ui.png', directory + 'footnote-copied-graph.png',
  directory + 'original-reopened.png', directory + 'original-after-restart.png', directory + 'recording-copied-bodies.png'];
for (const browser of ['chromium', 'firefox']) for (const file of ['external-plain-footnotes.png', 'same-editor-pasted-notes.png'])
  reviewedImages.push(`artifacts/footnote-clipboard-dedicated-20261115/footnote-clipboard-real-ke-92e49-ough-native-clipboard-input-${browser}/${file}`);
const visualReview = { date: new Date().toISOString(), scope: 'Reviewed screenshots and sampled video frames, not the entire movie',
  recording, images: await Promise.all(reviewedImages.map(async path => ({ path, sha256: await hash(path) }))),
  samples: { overview: '7.5 seconds then every 15 seconds, 13 populated frames',
    copyWindow: '76.25 through 83.75 seconds at 0.5-second intervals, 16 frames', fullFrame: 83.25 },
  findings: ['Plain-text destinations contain readable reference labels and complete note bodies.',
    'Rich paste shows separate original/copied numbering and preserved bold note bodies.',
    'All four bodies remain visible in the saved and restarted reader.',
    'Toolbar attachment, paste and contextual controls retain one desktop row.'],
  limits: ['Physical Safari and installed WebKit OS-format validation remain open.'] };
await writeFile(new URL(directory + 'visual-review.json', root), JSON.stringify(visualReview, null, 2) + '\n');
const evidence = { date: new Date().toISOString(), status: 'bounded-delivery-with-open-platform-validation',
  parent: runtime.parentRevision,
  scope: 'Footnote model clipboard ownership and private GitLab host isolation; not full clipboard/product/parity acceptance',
  changes: ['Copied references carry complete transitive/cyclic owned definitions without unrelated unused notes.',
    'Paste remaps colliding note IDs and host labels, preserves shared references/marks and root placement, and supports atomic Undo/Redo.',
    'Clipboard-only text serialization leaves Node.textContent unchanged; semantic paste refusal rolls back without a lossy second insertion.',
    'Private GitLab view prevents its global reader transformer from overwriting handled copy/cut/paste; unhandled events still bubble.'],
  tests: { root: { passed: 6526, suites: 380 }, upstream: { passed: 540, suites: 23, inheritedSkip: 1 },
    publicOSClipboard: { passed: ['Windows Chromium', 'Windows Firefox'], openFailure: 'Windows WebKit; independently reproduced outside Fountain' },
    native: { checks: 27, definitions: 4, references: 6, accessibilityScans: 6, browserErrors: 0,
      phases: ['saved', 'reopened', 'restart'] }, api, types: 'TypeScript, Svelte and Angular passed',
    package: 'ESM/CommonJS and optional export smoke passed', server: 'Node and Cloudflare workerd smoke passed',
    headless: '143-module boundary plus no-DOM TypeScript passed', runtime: 'Unchanged latency, curve and retained-memory gates passed',
    frontend: 'Rspack compiled with two existing warnings in 72.31 seconds', patches: 18, rollbackFiles: 28 },
  build: { esmKiB: 1605.5, commonjsKiB: 1430.1, commonjsCapacityKiB: { before: 1427, after: 1440 },
    otherLimits: 'Unchanged', newDependencies: 0 }, recording,
  evidence: { native: directory + 'report.json', visual: directory + 'visual-review.json',
    hostOverwriteWitness: 'artifacts/gitlab-native-footnote-clipboard-host-copy-witness-20261115/report.json',
    minimalWindowsReproduction: 'artifacts/webkit-clipboard-platform-probe-win32-20261115.json',
    minimalLinuxReproduction: 'artifacts/webkit-clipboard-platform-probe-linux-20261115.json',
    reproductionScript: 'artifacts/probe-webkit-clipboard-20261115.mjs',
    webkitFailure: 'artifacts/footnote-clipboard-dedicated-webkit-20261115.log',
    units: 'artifacts/footnote-clipboard-all-units-final-20261115.log',
    upstream: 'artifacts/gitlab-footnote-clipboard-upstream-20261115.json',
    originalCapacityFailure: 'artifacts/footnote-clipboard-budget-final-before-review-20261115.log' },
  open: ['Table-cell grid clipboard still has its own path and needs complete footnote ownership tests/repair.',
    'Same-editor cut/move identity reuse requires its own matrix.',
    'Installed WebKit ports lose custom copy formats; physical Safari is unverified.',
    'Full grammar, authored placement, host reader conversion, product workflows/roles/browsers, cache rollout, large-document costs and compiled deployment rollback remain open.'],
  publication: 'No package version, npm publication, project rename or parity-row promotion' };
await writeFile(new URL('artifacts/gitlab-footnote-clipboard-integration-20261115.json', root), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ status: evidence.status, nativeChecks: 27, units: 6526, upstream: 540, recording: recording.sha256 }));
