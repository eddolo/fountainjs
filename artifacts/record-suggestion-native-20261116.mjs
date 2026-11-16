import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = async path => JSON.parse(await readFile(resolve(root, path)));
const live = await read('artifacts/suggestion-authoring-live-20261116/report.json');
const restart = await read('artifacts/suggestion-authoring-live-20261116/restart.json');
const upstream = await read('artifacts/gitlab-suggestion-upstream-20261116.json');
const patches = await read('artifacts/gitlab-native-suggestion-patch-verification-20261116.json');
const rollback = await read('artifacts/gitlab-native-suggestion-install-roundtrip-20261116.json');
const relation = await read('artifacts/suggestion-revision-relation-20261116.json');
if (live.errors.length || live.observations.length !== 5 || !live.applied || restart.commit !== live.applied.commit
  || restart.content !== live.applied.content || restart.body !== live.saved.body || !restart.readerAppliedVisible) throw new Error('Incomplete live/restart evidence.');
if (!upstream.success || upstream.numPassedTests !== 546 || upstream.numPendingTests !== 1 || upstream.numPassedTestSuites !== 23) throw new Error('Incomplete selected upstream result.');
if (Object.keys(patches.patches).length !== 19 || patches.status !== 'passed' || rollback.status !== 'passed' || rollback.files !== 28) throw new Error('Incomplete source patch/rollback proof.');
if (!relation.preview.parents.includes(relation.source.sha) || !relation.fileContentEqual) throw new Error('Missing revision relationship.');
const unit = await readFile(resolve(root, 'artifacts/suggestion-native-unit-final-20261116.log'), 'utf8');
if (!/1323 passed/u.test(unit) || !/51 passed/u.test(unit)) throw new Error('Incomplete integration unit result.');
if (live.palette.background !== 'rgba(0, 0, 0, 0)' || live.palette.color !== live.palette.parentColor
  || live.saved.body !== '```suggestion:-0+2\n' + live.proposal + '```\n\n' + live.marker) throw new Error('Visual/source repair checks missing.');
const state = execFileSync('wsl', ['-d', 'Ubuntu', '--exec', 'docker', 'inspect', '--format', '{{.State.Status}}', 'fountain-gitlab-integration-baseline-1'], { encoding: 'utf8', timeout: 30000 }).trim();
if (state !== 'exited') throw new Error('Isolated application is still running.');
const paths = [
  'integrations/gitlab/components/fountain_code_menu.vue', 'integrations/gitlab/components/fountain_content_editor.vue', 'integrations/gitlab/components/fountain_editor_surface.vue',
  'integrations/gitlab/services/code_suggestion_editing.ts', 'integrations/gitlab/services/content_editor.ts', 'integrations/gitlab/services/host_configuration.ts',
  'integrations/gitlab/specs/fountain_code_menu_spec.js', 'integrations/gitlab/fixtures/suggestion-preview-live.json', 'integrations/gitlab/patches/gitlab-19.5.3-native-suggestion-tests.patch',
  'integrations/gitlab/SUGGESTION_ADAPTER_PLAN.md', 'tests/gitlab-suggestion-editing.test.ts', 'tests/gitlab-suggestion-preview.test.ts', 'tests/gitlab-host-configuration.test.ts',
  'scripts/audit-gitlab-suggestion-authoring.mjs', 'scripts/capture-gitlab-suggestion-context.mjs', 'scripts/capture-gitlab-alert-rendering.mjs', 'scripts/run-gitlab-native-browser-audit.mjs',
  'scripts/prepare-gitlab-suggestion-tests.mjs', 'scripts/check-gitlab-native-patches.mjs', 'scripts/check-gitlab-native-install.mjs',
  'artifacts/gitlab-native-runtime/build.json', 'artifacts/gitlab-native-browser-install/install.json',
  'artifacts/gitlab-native-suggestion-patch-verification-20261116.json', 'artifacts/gitlab-native-suggestion-install-roundtrip-20261116.json',
  'artifacts/suggestion-revision-relation-20261116.json', 'artifacts/read-suggestion-revisions-20261116.mjs', 'artifacts/run-suggestion-upstream-20261116.mjs',
  'artifacts/suggestion-native-unit-final-20261116.log', 'artifacts/suggestion-native-types-final-20261116.log', 'artifacts/suggestion-upstream-final-20261116.log',
  'artifacts/suggestion-frontend-final-20261116.log', 'artifacts/suggestion-native-runtime-final-20261116.log',
  'artifacts/suggestion-preview-capture-20261116.log', 'artifacts/suggestion-preview-live-20261116/preview.json',
  'artifacts/suggestion-authoring-live-20261116.log', 'artifacts/suggestion-authoring-live-accepted-20261116.log', 'artifacts/suggestion-authoring-live-final-20261116.log',
  'artifacts/suggestion-authoring-reader-20261116.log', 'artifacts/suggestion-authoring-restart-20261116.log',
  ...['report.json', 'restart.json', 'source-and-range.png', 'native-draft.png', 'posted-reader.png', 'applied.png', 'after-restart.png'].map(name => 'artifacts/suggestion-authoring-live-20261116/' + name),
  ...['report.json', 'native-draft.png'].map(name => 'artifacts/suggestion-authoring-before-visual-fix-20261116/' + name),
  ...['failure.json', 'failure.png'].map(name => 'artifacts/suggestion-authoring-gutter-probe-20261116/' + name),
];
const hashes = {}; for (const path of paths) hashes[path] = createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
await writeFile(resolve(root, 'artifacts/suggestion-native-integration-20261116.json'), JSON.stringify({
  scope: 'Scoped native GitLab single-anchor authoring, expanded source range, exact posting, single repository application and cold restart; not full GitLab or overall parity.',
  parentRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  verification: { integrationUnit: { passed: 1323, files: 51, workers: 2 }, types: 'pnpm exec tsc --noEmit passed',
    upstream: { passed: 546, suites: 23, inheritedSkip: 1 }, contextualPreviews: 10, liveChecks: live.observations,
    sourcePatches: 19, guardedRollbackFiles: 28, restart: { passed: true, commit: restart.commit, readerAppliedVisible: true },
    visualReview: 'Inspected real modal, repaired native draft, posted reader, Applied overview and cold-restart screenshots.' },
  repaired: ['Atomic source+range edit and one-step undo', 'Handled code exit stops host quick submission', 'Host inline-code CSS no longer obscures replacement text', 'Sole default empty paragraph is replaced and prose marks cleared on insertion'],
  revisionFinding: { source: relation.source.sha, preview: relation.preview.sha, relationship: 'Actual merge-result commit containing source head; selected file identical at both.' },
  actual: { mergeRequest: live.mergeRequest, noteId: live.saved.noteId, commit: live.applied.commit, content: live.applied.content },
  remaining: ['Immediate: disambiguate literal backslash-n versus real U+E000 using verified raw-source prefill and safe asynchronous insertion',
    'Selected multiline/context-line and broader source transport variants', 'Editing already-posted, applied/outdated proposals; real deletion/blank replacements',
    'Review batching, real roles/revocation, branch/file changes and concurrent/conflicting proposals',
    'Resolved Rapid Diffs gutter reopening: probe failed; MR overview Applied display works', 'Broader actual native browser/mobile journeys and hosted/full-root release checks'],
  constraints: ['Native component explicitly opts into the known adapter; default guard callers still reject active config',
    'Actual live UI profile uses Chromium; previous local Chromium/Firefox service journeys are separate evidence', 'No credentialed trace/video or auth/session storage retained',
    'No public API/size/performance limit, package-version or publication change', 'No overall parity-row promotion; application stopped after audit'],
  hashes,
}, null, 2) + '\n');
console.log('Recorded verified native suggestion authoring/application/restart evidence and retained gaps.');
