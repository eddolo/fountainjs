import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),prefix='artifacts/gitlab-compatibility/deletion-keyboard-20261116/';
const bytes=path=>readFile(new URL(path,root)),json=async path=>JSON.parse(await bytes(path));
const hash=value=>createHash('sha256').update(value).digest('hex');
const original=await json(prefix+'original-1/report.json'),fountain=await json(prefix+'fountain-1/report.json'),comparison=await json(prefix+'comparison-1/report.json');
assert.deepEqual(comparison.summary,{parity:26,improvement:4,regression:0,'shared-limitation':0,incomplete:0,total:30});
assert.equal(comparison.environment.matched,true);assert.equal(comparison.comparisonComplete,true);assert.equal(comparison.regressionGate.passed,true);assert.equal(comparison.featureAcceptance.passed,true);
for(const [side,report]of [['original',original],['fountain',fountain]]){
 assert.equal(report.collectionComplete,true);assert.deepEqual(report.errors,[]);assert.equal(report.suite,'deletions');
 assert.equal(report.fixtureHash,hash(await bytes(report.fixturePath)));
 for(const [path,sha]of Object.entries(report.harnessHashes))assert.equal(hash(await bytes(path)),sha);
 assert.equal(comparison.inputs[side].sha256,hash(await bytes(prefix+side+'-1/report.json')));
}
for(const [path,sha]of Object.entries(comparison.comparatorHashes))assert.equal(hash(await bytes(path)),sha);
const replay=await json('artifacts/gitlab-compatibility/switch-20261116/comparison-3/report.json');
assert.deepEqual(replay.summary,{parity:20,improvement:12,regression:0,'shared-limitation':4,incomplete:0,total:36});assert.equal(replay.featureAcceptance.passed,false);
assert.match((await bytes('artifacts/compatibility-deletion-all-unit-20261116.log')).toString(),/1381 passed/);
assert.match((await bytes('artifacts/compatibility-deletion-all-unit-20261116.log')).toString(),/54 passed/);
assert.equal((await bytes('artifacts/compatibility-deletion-types-20261116.log')).length,0);
const source=await json(prefix+'source-provenance.json');assert.equal(source.packagedServerSourcesMatch,true);
const prior=await json('artifacts/gitlab-compatibility/switch-20261116/source-provenance.json');assert.equal(source.nativeRuntimeSha256,prior.nativeRuntimeSha256);
const discovery=await json('artifacts/gitlab-compatibility/deletion-20261116/original-1/report.json');assert.equal(discovery.collectionComplete,false);
const deployment=JSON.parse(execFileSync('wsl',['-d','Ubuntu','--','docker','inspect','fountain-gitlab-integration-baseline-1'],{encoding:'utf8'}))[0];
assert.equal(deployment.State.Running,false);assert.equal(deployment.Config.Image,original.deployment.image);
const paths=['scripts/run-gitlab-compatibility.mjs','scripts/audit-gitlab-compatibility-suggestions.mjs','scripts/compare-gitlab-compatibility.mjs',
'integrations/gitlab/testing/compatibility.mjs','integrations/gitlab/fixtures/compatibility-deletions.json','tests/gitlab-compatibility.test.ts',
'integrations/gitlab/COMPATIBILITY_DELETION_RESULTS.md','integrations/gitlab/COMPATIBILITY_RESULTS.md','integrations/gitlab/COMPATIBILITY_SUITE_PLAN.md',
'artifacts/record-gitlab-deletion-source-20261116.mjs',
'artifacts/compatibility-deletion-original-20261116.log','artifacts/compatibility-deletion-keyboard-original-20261116.log','artifacts/compatibility-deletion-keyboard-fountain-20261116.log',
'artifacts/compatibility-deletion-all-unit-20261116.log','artifacts/compatibility-deletion-types-20261116.log',
'artifacts/gitlab-compatibility/deletion-20261116/original-1/report.json',
'artifacts/gitlab-compatibility/deletion-20261116/original-1/empty-deletion-deletion-draft.png',
'artifacts/gitlab-compatibility/deletion-20261116/original-1/whitespace-deletion-failure.png',
'artifacts/gitlab-compatibility/switch-20261116/comparison-3/report.json','artifacts/gitlab-compatibility/switch-20261116/comparison-3/report.md',
...['original-1/report.json','fountain-1/report.json','comparison-1/report.json','comparison-1/report.md','source-provenance.json'].map(path=>prefix+path)];
for(const side of ['original-1','fountain-1'])for(const name of await readdir(new URL(prefix+side+'/',root)))if(name.endsWith('.png'))paths.push(prefix+side+'/'+name);
const hashes={};for(const path of paths)hashes[path]=hash(await bytes(path));
const receipt={scope:'Matched empty and one-newline deletion proposals in actual stock GitLab and Fountain UI; separate from original source-handoff/history corpus.',
 parentRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),comparison:{path:prefix+'comparison-1/report.json',...comparison.summary,environmentMatched:true,complete:true,regressionGatePassed:true,candidateDeletionFixtureAcceptance:true},
 overallProductAcceptance:false,findings:[
 'Explicit textual deletion explanations are observed on Fountain in both cases; original shows its diff without that explicit wording.',
 'Native whitespace Apply deletion is blocked until affirmative visible consent; original accepts the direct rich source edit without that additional control.',
 'Both save the one-newline source exactly; original rich reopen/source inspection drops it, native preserves it. Inspection is canceled without overwriting the saved note.',
 'Both apply deletion to only the selected line, producing exact keep/last content in one child commit of the fixture seed.',
 ],verification:{integrationTests:1381,files:54,comparisonPolicyTests:17,strictTypes:true,applicationStopped:true,unchangedEditorRuntimeHash:true,
 visualReview:'Inspected original and native rich deletion drafts, native warning/disabled action and reopened source fields; API/source commit bytes prove saved/application effects.',sourceProvenance:source},
 retainedFailures:[
 'Earlier generic-fill driver attempt failed and is excluded from classifications; corrected keyboard driver verifies actual selected source.',
 'Meaningful blank-line application remains unsupported on this unchanged stock backend; whitespace is deletion.',
 'Applied-history retention after prose-only editing remains failed in the earlier matched corpus; its extended-comparator replay is unchanged.',
 ],limits:['One Linux Chromium run per case; single-line target and one newline only.','No matched multirange/Unicode-whitespace/roles/concurrency/other-browser/mobile/restart claim.','No editor runtime/API/capacity/version/publication/website claim change.'],hashes};
await writeFile(new URL('artifacts/gitlab-deletion-compatibility-integration-20261116.json',root),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({summary:comparison.summary,candidateDeletionFixtureAcceptance:true,overallProductAcceptance:false,applicationStopped:true}));
