import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url), read=path=>readFile(new URL(path,root),'utf8'), json=async path=>JSON.parse(await read(path));
assert.match(await read('artifacts/suggestion-effects-all-unit-20261116.log'),/1364 passed/);
assert.match(await read('artifacts/suggestion-effects-all-unit-20261116.log'),/53 passed/);
assert.equal(await read('artifacts/suggestion-effects-types-20261116.log'),'');
const upstream=await json('artifacts/gitlab-suggestion-effects-upstream-20261116.json');
assert.equal(upstream.success,true); assert.equal(upstream.numPassedTests,555); assert.equal(upstream.numPendingTests,1);
const live=await json('artifacts/suggestion-review-live-20261116/report.json'), restart=await json('artifacts/suggestion-review-live-20261116/restart.json');
assert.deepEqual(live.cases.map(value=>value.kind),['replacement','deletion','whitespace-deletion']);
assert.deepEqual(live.errors,[]); assert.equal(live.acceptancePassed,false); assert.equal(restart.acceptancePassed,false);
assert.equal(live.retainedIssues.length,3); assert.equal(restart.checks.length,3);
for(const entry of live.cases){
  assert.equal(entry.checks.length,5); assert.deepEqual(entry.applied.parents,[entry.seedCommit]);
  assert.equal(entry.applied.commit,entry.applied.branchHead);
  assert.equal(entry.savedBody,'```suggestion:-0+0\n'+entry.replacement+'```\n\n'+entry.marker);
  assert.equal(entry.finalBody,entry.savedBody+' — confirmed');
  const expected=(entry.kind==='replacement'?entry.replacement:'')+'keep();\nlast();\n';
  assert.equal(entry.applied.content,expected);
  assert.equal(entry.beforeProseEdit[0].applied,true); assert.equal(entry.afterProseEdit[0].applied,false);
  assert.notEqual(entry.beforeProseEdit[0].id,entry.afterProseEdit[0].id);
  assert.equal(entry.beforeProseEdit[0].to_content,entry.afterProseEdit[0].to_content);
  const retained=restart.checks.find(value=>value.kind===entry.kind);
  assert.equal(retained.body,entry.finalBody); assert.equal(retained.content,expected); assert.equal(retained.commit,entry.applied.commit);
}
assert.equal(live.serverControl.before[0].applied,true); assert.equal(live.serverControl.after[0].applied,false);
assert.notEqual(live.serverControl.before[0].id,live.serverControl.after[0].id);
assert.equal(live.serverControl.sourceUnchanged,true);
assert.equal(restart.negativeBlank.source,'\n'); assert.equal(restart.negativeBlank.serverSuggestion.to_content,'');
assert.notEqual(restart.negativeBlank.actualContent,restart.negativeBlank.desiredContent);
const patches=await json('artifacts/gitlab-native-suggestion-effects-patch-verification-20261116.json');
assert.equal(patches.status,'passed'); assert.equal(Object.keys(patches.patches).length,19);
const rollback=await json('artifacts/gitlab-native-suggestion-effects-install-roundtrip-20261116.json');
assert.equal(rollback.status,'passed'); assert.equal(rollback.files,28);
assert.match(await read('artifacts/suggestion-effects-live-final-20261116.log'),/GITLAB_REVIEW_RETAINED_APPLIED_METADATA_ISSUE/);
assert.match(await read('artifacts/suggestion-effects-frontend-20261116.log'),/compiled with 2 warnings/);
const paths=[
'integrations/gitlab/runtime/browser.ts','integrations/gitlab/services/code_suggestion_source.ts','integrations/gitlab/services/code_suggestion_node.ts',
'integrations/gitlab/components/fountain_code_menu.vue','integrations/gitlab/specs/fountain_code_menu_spec.js',
'integrations/gitlab/fixtures/suggestion-whitespace-live.json','tests/gitlab-suggestion-effects.test.ts',
'integrations/gitlab/patches/gitlab-19.5.3-native-suggestion-tests.patch',
'scripts/audit-gitlab-suggestion-review.mjs','scripts/capture-gitlab-alert-rendering.mjs','scripts/run-gitlab-native-browser-audit.mjs',
'scripts/check-gitlab-native-patches.mjs','scripts/check-gitlab-native-install.mjs',
'integrations/gitlab/COMPATIBILITY_SUITE_PLAN.md',
'artifacts/gitlab-native-runtime/build.json','artifacts/gitlab-native-browser-install/install.json',
'artifacts/gitlab-native-suggestion-effects-patch-verification-20261116.json','artifacts/gitlab-native-suggestion-effects-install-roundtrip-20261116.json',
'artifacts/gitlab-suggestion-whitespace-oracle-20261116.json','artifacts/probe-suggestion-whitespace-20261116.mjs','artifacts/run-suggestion-effects-upstream-20261116.mjs',
'artifacts/suggestion-effects-all-unit-20261116.log','artifacts/suggestion-effects-types-20261116.log','artifacts/suggestion-effects-upstream-20261116.log',
'artifacts/suggestion-effects-runtime-20261116.log','artifacts/suggestion-effects-frontend-20261116.log','artifacts/suggestion-effects-live-final-20261116.log',
'artifacts/suggestion-effects-restart-20261116.log','artifacts/suggestion-effects-restart-final-20261116.log','artifacts/suggestion-effects-rollback-20261116.log',
'artifacts/suggestion-review-before-effects-20261116/failure.json','artifacts/suggestion-review-before-effects-20261116/failure.png',
...['report.json','restart.json','whitespace-deletion-warning.png','whitespace-deletion-edited-draft.png',
'deletion-edited-draft.png','deletion-posted-reader.png','replacement-posted-reader.png',
'replacement-after-restart.png','deletion-after-restart.png','whitespace-deletion-after-restart.png'].map(name=>'artifacts/suggestion-review-live-20261116/'+name),
];
const hashes={}; for(const path of paths)hashes[path]=createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
const result={scope:'Private GitLab native deletion-effect safeguard and real posted review workflows; overall review acceptance remains failed on stock server Applied metadata retention.',
parentRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
verification:{integrationUnit:{passed:1364,files:53,workers:2},types:'strict TypeScript passed',upstream:{passed:555,suites:23,inheritedSkip:1},
sourceWorkflows:live.cases.map(entry=>({kind:entry.kind,mergeRequest:entry.mergeRequest,noteId:entry.noteId,checks:entry.checks,body:entry.finalBody,commit:entry.applied.commit,content:entry.applied.content})),
coldRestart:'Exact source/comments/commits and persisted suggestion fields verified; computed eligibility recorded separately',
sourcePatches:19,guardedRollbackFiles:28,unicodeOracle:'Every Unicode scalar compared against the actual pinned embedded Ruby whitespace predicate',
visualReview:'Inspected settled warning with disabled Apply deletion, visible intent checkbox, deletion captions, saved readers and cold-restart reader.'},
repair:'Native deletion captions and explicit Apply deletion action. Nonempty whitespace-only source requires affirmative intent; changing source resets intent. Command guard and pending-draft handoff remain enforced. Source is never cleaned or rewritten.',
overallReviewAcceptance:{passed:false,reason:'Stock Notes::UpdateService deletes/recreates suggestion records on prose-only updates, clearing Applied metadata. Confirmed independently by real REST control.'},
retained:live.retainedIssues,
unsupportedHostMeaningfulBlankLine:restart.negativeBlank,
computedEligibility:restart.serverControl.computedEligibility,
pairedComparison:{status:'pending-original-editor-workflows',classification:null,plan:'integrations/gitlab/COMPATIBILITY_SUITE_PLAN.md',
reason:'Native journeys and API-only controls do not substitute for paired original-editor UI runs.'},
remaining:['Applied-metadata reconciliation through a verified host contract','Original-editor matched runs and per-invariant classifications',
'Actual unchanged/context/legacy source variants, outdated proposals, review batches, roles/concurrency, wider native browser/mobile and hosted/full-root release checks'],
constraints:['Actual native UI uses Chromium and stock pinned server; no credentialed trace/video/auth storage retained',
'No public package/API/capacity limit/version/publication change or overall parity-row promotion','Application stopped after audit'],hashes};
await writeFile(new URL('artifacts/suggestion-effects-integration-20261116.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sourceSafeguard:'verified',units:1364,upstream:555,sourceWorkflows:3,overallReviewAcceptance:false,pairedClassification:null}));
