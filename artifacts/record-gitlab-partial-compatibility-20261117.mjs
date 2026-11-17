import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),base='artifacts/gitlab-compatibility/',prefix=base+'partial-ready-20261117/';
const bytes=path=>readFile(new URL(path,root)),json=async path=>JSON.parse(await bytes(path)),hash=value=>createHash('sha256').update(value).digest('hex');
const original=await json(prefix+'original-1/report.json'),fountain=await json(prefix+'fountain-1/report.json'),comparison=await json(prefix+'comparison-1/report.json');
assert.deepEqual(comparison.summary,{parity:188,improvement:0,regression:0,'shared-limitation':0,incomplete:0,total:188});
assert.equal(comparison.environment.matched,true);assert.equal(comparison.comparisonComplete,true);assert.equal(comparison.regressionGate.passed,true);assert.equal(comparison.featureAcceptance.passed,true);
for(const [side,report]of [['original',original],['fountain',fountain]]){
 assert.equal(report.collectionComplete,true);assert.deepEqual(report.errors,[]);assert.equal(report.suite,'partial');assert.equal(report.observations.length,4);assert.equal(report.fixtureHash,hash(await bytes(report.fixturePath)));
 for(const [path,sha]of Object.entries(report.harnessHashes))assert.equal(hash(await bytes(path)),sha);
 assert.equal(comparison.inputs[side].sha256,hash(await bytes(prefix+side+'-1/report.json')));
 for(const item of report.observations){assert.equal(item.copySelection.direction,item.input.direction);assert.equal(item.cutSelection.direction,item.input.direction);assert.equal(item.documentReady.initial,true);assert.equal(item.documentReady.reopened,true);}
}
for(const [path,sha]of Object.entries(comparison.comparatorHashes))assert.equal(hash(await bytes(path)),sha);
const raw=await json(base+'partial-20261117/original-1/report.json'),early=await json(base+'partial-paced-20261117/comparison-2/report.json');
assert.equal(raw.collectionComplete,false);assert.equal(raw.observations.length,4);assert.equal(early.summary.incomplete,8);assert.equal(early.regressionGate.passed,false);
const paths=['scripts/run-gitlab-compatibility.mjs','scripts/audit-gitlab-compatibility-partial.mjs','scripts/audit-gitlab-compatibility-clipboard.mjs','scripts/audit-gitlab-compatibility-suggestions.mjs','scripts/compare-gitlab-compatibility.mjs',
'integrations/gitlab/testing/compatibility.mjs','integrations/gitlab/fixtures/compatibility-partial.json','tests/gitlab-compatibility.test.ts','integrations/gitlab/COMPATIBILITY_PARTIAL_RESULTS.md','integrations/gitlab/COMPATIBILITY_SUITE_PLAN.md',
'artifacts/record-gitlab-partial-ready-source-20261117.mjs','artifacts/compatibility-partial-original-20261117.log','artifacts/compatibility-partial-paced-original-20261117.log','artifacts/compatibility-partial-paced-fountain-20261117.log','artifacts/compatibility-partial-ready-original-20261117.log','artifacts/compatibility-partial-ready-fountain-20261117.log','artifacts/compatibility-partial-ready-all-unit-20261117.log','artifacts/compatibility-partial-ready-types-20261117.log',
...['original-1/report.json','fountain-1/report.json','comparison-1/report.json','comparison-1/report.md','source-provenance.json'].map(path=>prefix+path)];
for(const run of ['partial-20261117','partial-paced-20261117']){
 const folder=base+run+'/',manifest=await json(folder+'instrument/manifest.json'),report=await json(folder+'original-1/report.json');paths.push(folder+'instrument/manifest.json',folder+'original-1/report.json');
 for(const [target,item]of Object.entries(manifest)){assert.equal(item.sha256,target===report.fixturePath?report.fixtureHash:report.harnessHashes[target]);assert.equal(hash(await bytes(item.archive)),item.sha256);paths.push(item.archive);}
 if(run==='partial-paced-20261117')paths.push(folder+'fountain-1/report.json',folder+'comparison-2/report.json',folder+'comparison-2/report.md');
}
for(const [run,ordinal,expected]of [['switch-20261116',7,{parity:20,improvement:12,regression:0,'shared-limitation':4,incomplete:0,total:36}],['deletion-keyboard-20261116',5,{parity:26,improvement:4,regression:0,'shared-limitation':0,incomplete:0,total:30}],['review-20261116',4,{parity:21,improvement:0,regression:0,'shared-limitation':0,incomplete:0,total:21}],['clipboard-ready-20261117',2,{parity:84,improvement:0,regression:0,'shared-limitation':0,incomplete:0,total:84}]]){
 const path=base+run+'/comparison-'+ordinal+'/report.json';assert.deepEqual((await json(path)).summary,expected);paths.push(path,path.replace('.json','.md'));
}
const unit=(await bytes('artifacts/compatibility-partial-ready-all-unit-20261117.log')).toString();assert.match(unit,/1393 passed/);assert.match(unit,/54 passed/);assert.equal((await bytes('artifacts/compatibility-partial-ready-types-20261117.log')).length,0);
const source=await json(prefix+'source-provenance.json');assert.equal(source.packagedServerSourcesMatch,true);assert.equal(source.nativeRuntimeSha256,(await json(base+'clipboard-ready-20261117/source-provenance.json')).nativeRuntimeSha256);
const deployment=JSON.parse(execFileSync('wsl',['-d','Ubuntu','--','docker','inspect','fountain-gitlab-integration-baseline-1'],{encoding:'utf8'}))[0];assert.equal(deployment.State.Running,false);assert.equal(deployment.Config.Image,original.deployment.image);
for(const side of ['original-1','fountain-1']){
 for(const id of ['keyboard-forward','keyboard-backward','pointer-forward','pointer-backward'])for(const suffix of ['selected','cut','reopened'])paths.push(prefix+side+'/'+id+'-'+suffix+'.png');
 for(const id of ['keyboard-backward','pointer-backward'])paths.push(prefix+side+'/'+id+'-external.png');paths.push(prefix+side+'/pointer-backward-pasted.png');
}
paths.push(base+'partial-20261117/original-1/pointer-backward-failure.png',base+'partial-paced-20261117/original-1/pointer-forward-reopened.png');
assert.equal(paths.length,new Set(paths).size);const hashes={};for(const path of paths)hashes[path]=hash(await bytes(path));
const receipt={scope:'Four actual matched paced keyboard/pointer forward/backward partial-selection workflows. Semantic outcomes, not literal editor AST or caret-wrapper equality.',parentRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 comparison:{path:prefix+'comparison-1/report.json',...comparison.summary,environmentMatched:true,complete:true,regressionGatePassed:true,candidatePartialFixtureAcceptance:true},overallProductAcceptance:false,superiorityClaimApproved:false,
 findings:['Both preserve requested direction/text and rich fragment marks/link targets through copy/cut, external/internal paste, history and saved reopening.','Zero-length bold-content observations are normalized; nonempty observations including zero-width content still fail when unexpected. Prose is independently checked.','Explicit document-ready receipts reject early empty snapshots as capability evidence.','Earlier unpaced original cuts/caret failures are retained as unmatched diagnostic evidence; rapid-input reliability remains open.'],
 verification:{integrationTests:1393,files:54,comparisonPolicyTests:29,strictTypes:true,applicationStopped:true,unchangedEditorRuntimeHash:true,sourceProvenance:source,
 visualReview:'Inspected actual original/native backward selection, cut, external rich fragment and saved/reopened views. Browser range records, clipboard payloads and API results provide direction and semantic proof.'},
 retainedRequirements:['Matched rapid-input/repeated profiles, cross-block/multiline/Unicode/bidi/IME selection and cell-grid/custom ownership remain.','External app-specific imports, other roles/browsers/mobile/concurrency/restart remain.','Shared Applied-history retention and meaningful blank-line replacement remain unmet.'],
 limits:['One Linux Chromium run per paced case; 188 correlated checks, not features.','20 ms key action delay and 700 ms input settling do not prove typing performance.','No engine runtime/API/capacity/version/publication/website claim change.'],hashes};
await writeFile(new URL('artifacts/gitlab-partial-compatibility-integration-20261117.json',root),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({summary:comparison.summary,superiorityClaimApproved:false,overallProductAcceptance:false,applicationStopped:true}));
