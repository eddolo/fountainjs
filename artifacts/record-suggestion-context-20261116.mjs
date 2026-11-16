import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const capturePath = 'artifacts/suggestion-context-live-20261116/context.json';
const capture = JSON.parse(await readFile(resolve(root, capturePath)));
const fixture = JSON.parse(await readFile(resolve(root, 'integrations/gitlab/fixtures/suggestion-context-live.json')));
if (JSON.stringify(capture.fixtures) !== JSON.stringify(fixture.fixtures) || capture.fixtures.map(value => value.name).join(',') !== 'unicode,empty,trailing-spaces') throw new Error('Incomplete actual context fixture.');
const state = execFileSync('wsl', ['-d', 'Ubuntu', '--exec', 'docker', 'inspect', '--format', '{{.State.Status}}', 'fountain-gitlab-integration-baseline-1'], { encoding: 'utf8', timeout: 30000 }).trim();
if (state !== 'exited') throw new Error('Isolated GitLab was not stopped.');
const paths = [capturePath, 'integrations/gitlab/fixtures/suggestion-context-live.json', 'integrations/gitlab/services/code_suggestion_editing.ts',
  'integrations/gitlab/services/host_configuration.ts', 'integrations/gitlab/SUGGESTION_ADAPTER_PLAN.md',
  'tests/gitlab-suggestion-editing.test.ts', 'tests/gitlab-host-configuration.test.ts',
  'scripts/capture-gitlab-suggestion-context.mjs', 'scripts/capture-gitlab-alert-rendering.mjs', 'scripts/run-gitlab-native-browser-audit.mjs',
  'artifacts/suggestion-context-unit-20261116.log', 'artifacts/suggestion-context-unit-accepted-20261116.log', 'artifacts/suggestion-context-types-20261116.log',
  'artifacts/suggestion-context-live-20261116.log', 'artifacts/suggestion-context-live-accepted-20261116.log', 'artifacts/suggestion-context-live-rapid-20261116.log', 'artifacts/suggestion-context-live-final-20261116.log',
  ...['unicode.png', 'empty.png', 'trailing-spaces.png', 'legacy-selector-failure.json', 'legacy-selector-failure.png', 'rapid-role-selector-failure.json', 'rapid-initialization-failure.json'].map(file => 'artifacts/suggestion-context-live-20261116/' + file)];
const hashes = {};
for (const path of paths) hashes[path] = createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
await writeFile(resolve(root, 'artifacts/suggestion-context-integration-20261116.json'), JSON.stringify({
  scope: 'Observed real default Rapid Diffs form contexts and private service validation; not production suggestion editing/posting/applying/batching acceptance.',
  parentRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  tests: { gitlabIntegration: { passed: 1307, files: 50, workers: 2 }, types: 'pnpm exec tsc --noEmit passed', capture: { passed: 3, cases: ['unicode', 'empty', 'trailing-spaces'] } },
  source: { interface: 'Rapid Diffs default UI', upstream: capture.upstream, mergeRequest: capture.mergeRequest, setupSHA: capture.setupSHA, previewHeadSHAs: capture.previewHeadSHAs },
  observations: ['Actual hover/click opens the host form; no private Vue state mutation', 'Read-only Vue context capture matches actual authenticated raw file source',
    'Native form shows the intentional active-suggestion guard error, not working production controls', 'Known preview file/revision fields are validated/frozen and included in edit ownership',
    'Malformed/unknown preview fields and changed base revision refuse edits without model mutation', 'Screenshots inspected; no credentialed recording, trace, cookies or storage state retained'],
  remaining: ['Multiline, literal backslash-n and context-line transport cases', 'MR API sha versus preview head_sha relationship and current branch-head verification',
    'Context-aware expanded suggestion-preview codec', 'Production source/range controls and shortcut submission interaction', 'Real MR posting/editing/applying/batching with repository verification', 'Coherent native runtime/frontend/upstream/rollback/restart acceptance'],
  containerStopped: state === 'exited',
  unchanged: ['Active host configuration guard', 'Public API/size/performance limits', 'Package version and publication'],
  hashes,
}, null, 2) + '\n');
console.log('Recorded live suggestion context evidence.');
