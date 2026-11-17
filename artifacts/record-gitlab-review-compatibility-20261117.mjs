import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),prefix='artifacts/gitlab-compatibility/review-20261116/';
const bytes=path=>readFile(new URL(path,root)),json=async path=>JSON.parse(await bytes(path)),hash=value=>createHash('sha256').update(value).digest('hex');
const original=await json(prefix+'original-1/report.json'),fountain=await json(prefix+'fountain-1/report.json'),comparison=await json(prefix+'comparison-1/report.json');
assert.deepEqual(comparison.summary,{parity:21,improvement:0,regression:0,'shared-limitation':0,incomplete:0,total:21});
assert.equal(comparison.environment.matched,true);assert.equal(comparison.comparisonComplete,true);assert.equal(comparison.regressionGate.passed,true);assert.equal(comparison.featureAcceptance.passed,true);
for(const [side,report]of [['original',original],['fountain',fountain]]){
 assert.equal(report.collectionComplete,true);assert.deepEqual(report.errors,[]);assert.equal(report.suite,'reviews');assert.equal(report.fixtureHash,hash(await bytes(report.fixturePath)));
 for(const [path,sha]of Object.entries(report.harnessHashes))assert.equal(hash(await bytes(path)),sha);
 assert.equal(comparison.inputs[side].sha256,hash(await bytes(prefix+side+'-1/report.json')));
}
for(const [path,sha]of Object.entries(comparison.comparatorHashes))assert.equal(hash(await bytes(path)),sha);
const replay=await json('artifacts/gitlab-compatibility/switch-20261116/comparison-4/report.json'),deletion=await json('artifacts/gitlab-compatibility/deletion-keyboard-20261116/comparison-2/report.json');
assert.deepEqual(replay.summary,{parity:20,improvement:12,regression:0,'shared-limitation':4,incomplete:0,total:36});assert.equal(replay.featureAcceptance.passed,false);
assert.deepEqual(deletion.summary,{parity:26,improvement:4,regression:0,'shared-limitation':0,incomplete:0,total:30});
const unit=(await bytes('artifacts/compatibility-review-all-unit-20261116.log')).toString();assert.match(unit,/1383 passed/);assert.match(unit,/54 passed/);assert.equal((await bytes('artifacts/compatibility-review-types-20261116.log')).length,0);
const source=await json(prefix+'source-provenance.json');assert.equal(source.packagedServerSourcesMatch,true);assert.equal(source.nativeRuntimeSha256,(await json('artifacts/gitlab-compatibility/deletion-keyboard-20261116/source-provenance.json')).nativeRuntimeSha256);
const deployment=JSON.parse(execFileSync('wsl',['-d','Ubuntu','--','docker','inspect','fountain-gitlab-integration-baseline-1'],{encoding:'utf8'}))[0];assert.equal(deployment.State.Running,false);assert.equal(deployment.Config.Image,original.deployment.image);
const paths=['scripts/run-gitlab-compatibility.mjs','scripts/audit-gitlab-compatibility-suggestions.mjs','scripts/compare-gitlab-compatibility.mjs','integrations/gitlab/testing/compatibility.mjs',
'integrations/gitlab/fixtures/compatibility-reviews.json','tests/gitlab-compatibility.test.ts','integrations/gitlab/COMPATIBILITY_REVIEW_RESULTS.md','integrations/gitlab/COMPATIBILITY_SUITE_PLAN.md',
'artifacts/record-gitlab-review-source-20261116.mjs','artifacts/compatibility-review-original-20261116.log','artifacts/compatibility-review-fountain-20261116.log','artifacts/compatibility-review-all-unit-20261116.log','artifacts/compatibility-review-types-20261116.log',
'artifacts/gitlab-compatibility/switch-20261116/comparison-4/report.json','artifacts/gitlab-compatibility/switch-20261116/comparison-4/report.md',
'artifacts/gitlab-compatibility/deletion-keyboard-20261116/comparison-2/report.json','artifacts/gitlab-compatibility/deletion-keyboard-20261116/comparison-2/report.md',
...['original-1/report.json','fountain-1/report.json','comparison-1/report.json','comparison-1/report.md','source-provenance.json'].map(path=>prefix+path)];
for(const side of ['original-1','fountain-1'])for(const name of await readdir(new URL(prefix+side+'/',root)))if(name.endsWith('.png'))paths.push(prefix+side+'/'+name);
const hashes={};for(const path of paths)hashes[path]=hash(await bytes(path));
const receipt={scope:'One matched real posted source/range review, with separate source/history/save/reopen/repository invariants. Not full GitLab parity.',parentRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 comparison:{path:prefix+'comparison-1/report.json',...comparison.summary,environmentMatched:true,complete:true,regressionGatePassed:true,candidateReviewFixtureAcceptance:true},overallProductAcceptance:false,
 findings:['Both actual editors preserve edited special-character source while expanding the target range, undoing/redoing, saving and reopening.','Both apply only the intended three-line target as one child commit, with no repository write before Apply.','No extra superiority classification is assigned for the original two-action versus native one-action range history.'],
 diagnostics:{originalUndoActions:original.observations[0].review.undoSteps.length,fountainUndoActions:fountain.observations[0].review.undoSteps.length},
 verification:{integrationTests:1383,files:54,comparisonPolicyTests:19,strictTypes:true,applicationStopped:true,unchangedEditorRuntimeHash:true,sourceProvenance:source,
 visualReview:'Inspected actual original/native changed rich proposals, native range dialog, reopened source and Applied reader. Exact source/API/file bytes support character and commit evidence.'},
 retainedRequirements:['Applied-history retention after later prose-only edits still fails in the earlier matched corpus.','Stock whitespace-only suggestions still apply as deletion, not meaningful blank lines.','Shrinking/asymmetric/stale/concurrent ranges, roles, mobile/other browsers and matched restarts remain.'],
 limits:['One Linux Chromium run and one symmetric range expansion.','Undo action counts are diagnostics, not performance/ergonomics wins.','No engine runtime/API/capacity/version/publication/website claim change.'],hashes};
await writeFile(new URL('artifacts/gitlab-review-compatibility-integration-20261117.json',root),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({summary:comparison.summary,candidateReviewFixtureAcceptance:true,overallProductAcceptance:false,applicationStopped:true}));
