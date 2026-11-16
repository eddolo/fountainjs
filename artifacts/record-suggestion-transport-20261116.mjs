import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const json = async path => JSON.parse(await read(path));
const units = await read('artifacts/suggestion-transport-all-unit-20261116.log');
assert.match(units, /1351 passed/); assert.match(units, /52 passed/);
assert.equal(await read('artifacts/suggestion-transport-types-20261116.log'), '');
const upstream = await json('artifacts/gitlab-suggestion-transport-upstream-20261116.json');
assert.equal(upstream.success, true); assert.equal(upstream.numPassedTests, 552); assert.equal(upstream.numPendingTests, 1);
const capture = await json('artifacts/suggestion-transport-live-20261116/context.json');
assert.equal(capture.fixtures.length, 6);
assert.deepEqual(capture.fixtures[0].context.lines, capture.fixtures[1].context.lines);
const live = await json('artifacts/suggestion-transport-authoring-live-20261116/report.json');
const restart = await json('artifacts/suggestion-transport-authoring-live-20261116/restart.json');
assert.deepEqual(live.errors, []); assert.equal(live.saved.position.line_range.start.new_line, 1);
assert.equal(live.saved.position.line_range.end.new_line, 2);
assert.equal(live.saved.body, '```suggestion:-1+1\n' + live.proposal + '```\n\n' + live.marker);
assert.equal(live.applied.content, live.proposal + live.original.split('\n').slice(3).join('\n'));
assert.equal(live.applied.commit, live.applied.branchHead);
assert.equal(restart.content, live.applied.content); assert.equal(restart.commit, live.applied.commit);
assert.equal(restart.readerAppliedVisible, true);
const patches = await json('artifacts/gitlab-native-suggestion-transport-patch-verification-20261116.json');
assert.equal(patches.status, 'passed'); assert.equal(Object.keys(patches.patches).length, 19);
const rollback = await json('artifacts/gitlab-native-suggestion-transport-install-roundtrip-20261116.json');
assert.equal(rollback.status, 'passed'); assert.equal(rollback.files, 28);
assert.match(await read('artifacts/suggestion-transport-frontend-20261116.log'), /compiled with 2 warnings/);
const paths = [
  'integrations/gitlab/services/code_suggestion_editing.ts', 'integrations/gitlab/services/content_editor.ts',
  'integrations/gitlab/components/fountain_content_editor.vue', 'integrations/gitlab/specs/fountain_code_menu_spec.js',
  'integrations/gitlab/fixtures/suggestion-transport-live.json', 'tests/gitlab-suggestion-insertion.test.ts',
  'integrations/gitlab/patches/gitlab-19.5.3-native-suggestion-tests.patch',
  'tests/browser/gitlab-suggestion-editing-fixture.ts',
  ...['capture-gitlab-suggestion-context', 'audit-gitlab-suggestion-authoring', 'capture-gitlab-alert-rendering',
    'run-gitlab-native-browser-audit', 'check-gitlab-native-patches', 'check-gitlab-native-install'].map(name => 'scripts/' + name + '.mjs'),
  'artifacts/gitlab-native-runtime/build.json', 'artifacts/gitlab-native-browser-install/install.json',
  'artifacts/gitlab-native-suggestion-transport-patch-verification-20261116.json',
  'artifacts/gitlab-native-suggestion-transport-install-roundtrip-20261116.json',
  'artifacts/suggestion-transport-all-unit-20261116.log', 'artifacts/suggestion-transport-types-20261116.log',
  'artifacts/suggestion-transport-upstream-20261116.log', 'artifacts/suggestion-transport-frontend-20261116.log',
  'artifacts/suggestion-transport-runtime-20261116.log', 'artifacts/suggestion-transport-capture-20261116.log',
  'artifacts/suggestion-transport-authoring-20261116.log', 'artifacts/suggestion-transport-restart-20261116.log',
  'artifacts/run-suggestion-transport-upstream-20261116.mjs',
  'artifacts/suggestion-transport-live-20261116/context.json', 'artifacts/suggestion-transport-live-20261116/multiline.png',
  ...['report.json','restart.json','source-and-range.png','native-draft.png','posted-reader.png','applied.png','after-restart.png']
    .map(name => 'artifacts/suggestion-transport-authoring-live-20261116/' + name),
];
const hashes = {};
for (const path of paths) hashes[path] = createHash('sha256').update(await readFile(new URL(path, root))).digest('hex');
const receipt = {
  scope: 'Scoped native selected-multiline suggestion raw-source integrity, exact posting/application and cold restart; not full GitLab or overall parity.',
  parentRevision: execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim(),
  finding: 'Pinned Rapid Diffs encodes literal backslash-n as U+E000, colliding with genuine source U+E000. Six actual contexts include a real two-line drag selection.',
  repair: 'Native insertion fetches and validates raw repository lines, preserves their original characters, and uses the existing mapped async insertion queue. Displayed sentinels are never reversed or stripped.',
  verification: {
    integrationUnit: { passed:1351, files:52, workers:2, addedSourceInsertionCases:28 },
    types: 'strict TypeScript passed', upstream:{passed:552,suites:23,inheritedSkip:1},
    frontend:'passed with two existing warnings; two Rspack threads',
    actualContexts:6, sourcePatches:19, guardedRollbackFiles:28,
    pureNode:'No DOM/shim; cancellation, stale source/context/permissions, mapped unrelated edits, overlap refusal, one-step undo, CRLF, raw Unicode and JSON-like text covered.',
    host:'Real Vue/Axios raw text handling, duplicate button disable, handoff blocking, changed context and unmount abort verified.',
    liveChecks:live.observations, restart:{passed:true,commit:restart.commit,readerAppliedVisible:true},
    visualReview:'Inspected actual source/range modal, native draft, posted reader, Applied overview and cold-restart screenshots.',
  },
  actual:{mergeRequest:live.mergeRequest,noteId:live.saved.noteId,body:live.saved.body,commit:live.applied.commit,content:live.applied.content},
  remaining:[
    'Actual unchanged/context-line and broader legacy source transport variants',
    'Editing already-posted/applied/outdated proposals; actual empty deletion/blank replacements',
    'Review batches, actual role revocation, branch/file changes and concurrent/conflicting proposals',
    'Retained resolved Rapid Diffs gutter reopening issue; MR overview Applied works',
    'Broader native browser/mobile and hosted/full-root release checks',
  ],
  constraints:[
    'Native component explicitly opts into known adapter; default host guard remains closed',
    'Actual live native UI uses Chromium and stock pinned GitLab server; no credentialed trace/video/auth storage retained',
    'No public package/API/capacity limit/version/publication change or overall parity-row promotion',
    'Application stopped after acceptance; source rollback verified only while stopped',
  ], hashes,
};
await writeFile(new URL('artifacts/suggestion-transport-integration-20261116.json',root),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({units:1351,upstream:552,contexts:6,commit:restart.commit,status:'passed'}));
