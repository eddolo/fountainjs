import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dir = 'artifacts/gitlab-native-mixed-lists-20261116/';
const read = path => readFile(new URL(path, root), 'utf8');
const json = async path => JSON.parse(await read(path));
const digest = async path => ({ path, sha256: createHash('sha256').update(await readFile(new URL(path, root))).digest('hex') });
const local = async path => ({ ...await digest(path), retainedLocally: true });
const browser = await json(dir + 'report.json');
assert.equal(browser.status, 'passed');
assert.equal(browser.checks.length, 20);
assert.deepEqual(browser.browserErrors, []);
assert.deepEqual(browser.workflows.phases, ['reopened', 'restart']);
assert.equal(browser.workflows.taskRoundtrips.length, 6);
const units = (await read('artifacts/mixed-lists-unit-accepted-20261116.log')).replace(/\x1b\[[0-9;]*m/g, '');
const counts = units.match(/Test Files\s+(\d+) passed[^\n]*\n\s*Tests\s+(\d+) passed/);
assert.ok(counts, 'Final full suite must pass');
const upstream = await json('artifacts/gitlab-mixed-lists-upstream-20261116.json');
assert.equal(upstream.success, true);
assert.equal(upstream.numFailedTests, 0);
const upstreamSummary = {
  status: 'passed', passed: upstream.numPassedTests, skipped: upstream.numPendingTests,
  suites: upstream.numPassedTestSuites,
  selectedSuites: upstream.testResults.map(item => item.name.replace(/^.*\/source\//, '')),
  rawResult: await local('artifacts/gitlab-mixed-lists-upstream-20261116.json'),
};
await writeFile(new URL('artifacts/mixed-lists-upstream-summary-20261116.json', root), JSON.stringify(upstreamSummary, null, 2) + '\n');
const sources = [...new Set([
  ...execFileSync('git', ['diff', '--name-only', '--diff-filter=AM'], { encoding: 'utf8' }).trim().split(/\r?\n/),
  ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split(/\r?\n/),
])].filter(path => /^(src\/|tests\/|scripts\/|integrations\/|playwright.config.ts$)/.test(path) && !path.endsWith('.md'));
const visuals = ['merge-request-mixed-tasks.png', 'merge-request-numbered-tasks.png', 'wiki-mixed-tasks.png',
  'wiki-numbered-tasks.png', 'wiki-restart.png', 'merge-request-restart.png', 'recording-samples.png'];
const visualReview = {
  scope: 'Final screenshots and sampled recording frames were visually inspected; not continuous full-video review.',
  observations: [
    'Ordinary bullets remain visible among checkboxes; nested ordinary content is not struck through by completed tasks.',
    'Numbered checkboxes retain their 3/4/5 sequence alongside an ordinary numbered item.',
    'Final post-restart MR/wiki readers retain lists, checked states, table, math and decoded figure.',
    'Recording samples include initial loading frames and a transient environment-fetch banner while the deliberately restarted server was unavailable; final reader screenshots are checked after recovery.',
    'Chromium and Firefox public-editor screenshots and sampled frames cover native split/join, checkbox undo, external text paste and same-editor structured paste.',
  ],
  images: await Promise.all(visuals.map(name => digest(dir + name))),
  recording: await local(dir + 'recordings/page@615acea2673e7329280034254226a877.webm'),
  sampleIntervalSeconds: 30, recordingSeconds: 258.68,
};
await writeFile(new URL(dir + 'visual-review.json', root), JSON.stringify(visualReview, null, 2) + '\n');
const checks = ['typecheck', 'build', 'test-api', 'test-package', 'test-budget', 'test-server-runtimes', 'test-headless'];
const receipt = {
  date: new Date().toISOString(), status: 'verified-bounded-candidate',
  parentRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Mixed ordinary/task lists and numbered checkboxes in the public engine and pinned real GitLab MR/wiki workflows. No publication or overall parity promotion.',
  fixes: [
    'A shared listItem schema group allows ordinary items and tasks to coexist without fragmenting one source list.',
    'Markdown, DOM/server HTML and clipboard preserve item kinds, checked states, numbering and authored source spacing.',
    'Indent/lift, split/join and selected item conversion retain siblings; structural transactions preserve concurrent peer text and author undo/redo.',
    'Retained Yjs recovery recognizes empty displaced wrappers under the new list group.',
    'Ordinary nested bullets do not inherit completed-task decoration; numbered tasks display both number and checkbox.',
    'DOCX explicitly reports task-state-omitted for tasks inside ordinary/numbered lists. It is not a task-fidelity export claim.',
  ],
  sourceDigests: 'Working-tree bytes from the Windows audit; Git may normalize text line endings.',
  source: await Promise.all(sources.map(digest)),
  verification: {
    fullRoot: { files: Number(counts[1]), cases: Number(counts[2]), workers: 2, ...await local('artifacts/mixed-lists-unit-accepted-20261116.log') },
    actualGitLab: { report: dir + 'report.json', checks: 20, richSourceCycles: 6, phases: browser.workflows.phases, browserErrors: 0, ...await local('artifacts/mixed-lists-browser-accepted-20261116.log') },
    desktop: { projects: ['chromium', 'firefox'], cases: 2, workers: 1, ...await local('artifacts/mixed-lists-desktop-20261116.log'),
      artifacts: await Promise.all(['chromium', 'firefox'].map(async name => ({
        project: name,
        reviewed: await Promise.all(['editor.png', 'observations.json', 'before.json', 'after.json', 'external-paste.txt'].map(file => digest(`artifacts/mixed-lists-desktop-20261116/${name}/${file}`))),
        localRecording: await Promise.all(['video.webm', 'video-1.webm', 'frames.png'].map(file => local(`artifacts/mixed-lists-desktop-20261116/${name}/${file}`))),
      }))),
    },
    upstream: 'artifacts/mixed-lists-upstream-summary-20261116.json',
    actualRendererFixtures: { total: 29, accepted: 21, sourcePreservingInapplicableRefusals: 8 },
    checks: await Promise.all(checks.map(name => local(`artifacts/mixed-lists-${name}-accepted-20261116.log`))),
    priorPerformanceAndMarkdownChecks: await Promise.all(['test-performance', 'test-markdown-conformance'].map(name => local(`artifacts/mixed-lists-${name}-20261116.log`))),
    sourceVerification: ['artifacts/gitlab-native-mixed-lists-patch-verification-20261116.json', 'artifacts/gitlab-native-mixed-lists-install-roundtrip-20261116.json'],
    patches: 18, installedFiles: 28,
    frontend: { seconds: 75.56, existingAdvisories: 2, ...await local('artifacts/mixed-lists-rspack-20261116.log') },
    nativeRuntime: await json('artifacts/gitlab-native-runtime/build.json'),
    footnoteServerOverlay: browser.footnoteServerOverlay,
    visualReview: dir + 'visual-review.json',
  },
  implementationFindings: [
    'Concurrent conversion initially relocated peer typing; RestructureChildrenStep preserves text identity and both update orders now pass.',
    'Initial schema change exposed four existing retained-wrapper tests; the recovery guard now recognizes the shared list group.',
    'Audit-only failures: default Playwright caret hiding detached owned child NodeViews; screenshots now preserve the actual caret. Reader li locator now includes self. Failed attempts remain local; the final profile passed.',
  ],
  capacity: { cssBeforeBytes: 90906, cssAfterBytes: 91242, addedBytes: 336, capBeforeBytes: 90944, capAfterBytes: 91264, javascriptAndPerformanceLimits: 'unchanged' },
  operationalState: { container: 'exited', sourceReinstalled: true, publication: 'none', packageVersion: '0.5.0-beta.1' },
  remaining: [
    'GitLab inapplicable [~] tasks remain explicitly refused with exact original source preserved.',
    'Native DOCX task/check-state retention; current export reports unsupported semantics.',
    'Inline review/suggestions, role/reconnect/concurrency/mobile/IME and full GitLab product acceptance.',
    'Compiled deployment rollback, physical Safari clipboard and remaining programme roadmap.',
  ],
};
await writeFile(new URL('artifacts/mixed-lists-integration-20261116.json', root), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ files: Number(counts[1]), cases: Number(counts[2]), checks: 20, sourceFiles: sources.length }));
