import {readFileSync,writeFileSync,readdirSync,statSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const base='artifacts/gitlab-compatibility/access-repair-20261117/',genuine='artifacts/gitlab-compatibility/access-repair-genuine-20261117/';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const write=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const comparison=read(base+'comparison-2/report.json');
assert.deepEqual(comparison.summary,{parity:24,improvement:7,regression:0,'shared-limitation':0,incomplete:0,total:31});
assert.equal(comparison.environment.matched,true);assert.equal(comparison.comparisonComplete,true);assert.equal(comparison.regressionGate.passed,true);assert.equal(comparison.featureAcceptance.passed,true);
for(const record of Object.values(comparison.inputs))assert.equal(sha(readFileSync(record.path)),record.sha256,record.path);
for(const [path,hash]of Object.entries(comparison.comparatorHashes))assert.equal(sha(readFileSync(path)),hash,path);
for(const folder of ['artifacts/gitlab-compatibility/access-20261117/semantic-instrument/',base+'before-ui-repair/'])for(const record of Object.values(read(folder+'manifest.json').files))assert.equal(sha(readFileSync(record.archive)),record.sha256,record.archive);
const actorIds=[];
for(const name of ['original-1','fountain-1','fountain-2']){
 const run=read(base+name+'/report.json');assert.equal(run.collectionComplete,true);assert.deepEqual(run.errors,[]);assert.equal(sha(readFileSync(run.fixturePath)),run.fixtureHash);
 for(const [path,hash]of Object.entries(run.harnessHashes))assert.equal(sha(readFileSync(path)),hash,path);
 for(const item of run.observations){assert.equal(item.status,'observed');assert.equal(item.actor.id,3);assert.equal(item.actor.isAdmin,false);assert.equal(item.setup.authorId,1);assert.equal(item.cleanupMembership.accessLevel,10);assert.deepEqual(item.actorErrors,[]);}
 const item=run.observations.find(x=>x.input.kind==='revocation');assert.equal(item.permissionBefore,true);assert.equal(item.permissionRevoked,false);assert.equal(item.permissionRestored,true);
 const denied=item.mutations.find(x=>x.stage==='revoke-edit-access'),restored=item.mutations.find(x=>x.stage==='restore-and-recover');assert.equal(denied.canUpdate,false);assert.equal(denied.status,200);assert.deepEqual(denied.errors,[]);assert.deepEqual(denied.updateErrors,[]);assert.equal(restored.canUpdate,true);
 assert.equal(item.afterRevokedSave.description,item.confirmedSource);assert.notEqual(item.pendingSource,item.confirmedSource);
 if(name==='original-1'){assert.equal(item.retainedSource,null);assert.equal(item.finalSourceExact,false);}else for(const key of ['deniedSaveReported','draftRetainedAfterDenial','draftRecoveredAfterReload','finalSourceExact','finalReopenExact'])assert.equal(item[key],true,key);
 actorIds.push(run.observations.map(x=>x.actor));
}
assert.deepEqual(actorIds[0],actorIds[2]);
const before=read(base+'feedback-before-fix/report.json'),after=read(base+'feedback-after-fix/report.json');assert.equal(before.passed,false);assert.equal(before.checks[0].noFalseConflict,false);assert.equal(after.passed,true);assert.equal(after.input.sha256,comparison.inputs.fountain.sha256);
for(const feedback of [before,after]){assert.equal(sha(readFileSync(feedback.input.path)),feedback.input.sha256);assert.equal(feedback.verifierSha256,sha(readFileSync('integrations/gitlab/testing/access-feedback.mjs')));}
const control=read(base+'genuine-control.json');assert.equal(control.passed,true);assert.equal(control.checks.length,2);assert.equal(sha(readFileSync(control.input.path)),control.input.sha256);
const genuineRun=read(control.input.path);assert.equal(genuineRun.collectionComplete,true);assert.deepEqual(genuineRun.errors,[]);for(const [path,hash]of Object.entries(genuineRun.harnessHashes))assert.equal(sha(readFileSync(path)),hash,path);
const runtime=read('artifacts/gitlab-native-runtime/build.json'),oldRuntime=read('artifacts/gitlab-compatibility/access-20261117/production-before-repair/artifacts__gitlab-native-runtime__build.json');assert.equal(runtime.sha256,oldRuntime.sha256);assert.equal(runtime.bytes,oldRuntime.bytes);
for(const [path,hash]of Object.entries(runtime.inputs))assert.equal(sha(readFileSync(path)),hash,path);
const install=read('artifacts/gitlab-native-browser-install/install.json');assert.equal(install.formatVersion,16);assert.deepEqual(install.nativeRuntime,runtime);assert.equal(Object.keys(install.files).length,32);
const upstream='//wsl.localhost/Ubuntu/home/eddolo/.cache/fountainjs-gitlab-product/source/';for(const [path,hash]of Object.entries(install.files))assert.equal(sha(readFileSync(upstream+path)),hash,path);
const restored=read(base+'restore-smoke-final/install-restored.json');assert.equal(restored.restored,true);assert.equal(restored.formatVersion,16);const smoke=read(base+'restore-smoke-final/checks.json');assert.equal(smoke.exactPinnedParentRestored,true);assert.equal(smoke.exactPreparedDescriptionRestored,true);
const sourceTests=['spec/frontend/work_items/components/work_item_detail_spec.js','spec/frontend/work_items/components/work_item_description_spec.js'];
assert.equal(execFileSync('git',['diff','HEAD','--name-only','--','src','package.json','pnpm-lock.yaml','scripts/check-build-budgets.mjs'],{encoding:'utf8'}).trim(),'');
const replay=read(base+'prior-corpus-replay.json');assert.equal(replay.checks.length,16);assert.equal(replay.comparatorSha256,sha(readFileSync('integrations/gitlab/testing/compatibility.mjs')));
assert.match(readFileSync('artifacts/access-repair-integration-complete.log','utf8'),/Tests\s+1531 passed/);assert.match(readFileSync('artifacts/access-repair-integration-complete.log','utf8'),/Test Files\s+60 passed/);assert.equal(readFileSync('artifacts/access-repair-types-complete.log','utf8').trim(),'');
assert.match(readFileSync('artifacts/access-repair-upstream-ui.log','utf8'),/Tests:\s+187 passed/);assert.match(readFileSync('artifacts/access-repair-rspack-ui.log','utf8'),/compiled with 2 warnings/);
mkdirSync(base+'logs',{recursive:true});const logs={};const credentials=/(?:gh[pousr]_[a-zA-Z0-9]{25,}|glpat-[a-zA-Z0-9_-]{15,})/;
for(const name of readdirSync('artifacts').filter(x=>/^access-repair-.*\.log$/.test(x))){const bytes=readFileSync('artifacts/'+name);assert.equal(credentials.test(bytes.toString('utf8')),false,'Credential pattern in '+name);const readable=bytes.toString('utf8').replace(/\r\n/g,'\n').replace(/\t/g,'\\t').replace(/ +$/gm,s=>'\\x20'.repeat(s.length)).replace(/\n+$/u,'\n');const path=base+'logs/'+name.replace(/\.log$/,'.txt');writeFileSync(path,readable);logs[name]={rawSha256:sha(bytes),rawBase64:bytes.toString('base64'),readablePath:path,readableSha256:sha(readFileSync(path))};}
write(base+'logs/manifest.json',{scope:'Exact raw bytes in base64; readable logs normalize CRLF, escape tabs/trailing spaces and retain one final newline.',logs});
const reviewed=[base+'original-1/developer-revocation-save-denied.png',base+'fountain-1/developer-revocation-save-denied.png',base+'fountain-1/developer-revocation-recovered-draft.png',base+'fountain-2/developer-revocation-save-denied.png',base+'fountain-2/developer-revocation-reopened.png',genuine+'fountain-1/conflict-discard-decision.png'];
const changed=execFileSync('git',['diff','HEAD','--name-only'],{encoding:'utf8'}).trim().split('\n').filter(path=>path&&!path.startsWith(base)&&!path.startsWith(genuine));
const additions=['integrations/gitlab/COMPATIBILITY_ACCESS_REPAIR_RESULTS.md','integrations/gitlab/fixtures/work-item-detail-upstream.vue','integrations/gitlab/fixtures/work-item-description-prepared.vue','integrations/gitlab/fixtures/work-item-description-spec-prepared.js','integrations/gitlab/services/save_authority_patch.mjs','integrations/gitlab/services/save_authority_patch.d.mts','integrations/gitlab/testing/access-feedback.mjs','integrations/gitlab/patches/gitlab-19.5.3-native-save-authority-tests.patch','scripts/prepare-gitlab-save-authority-tests.mjs','scripts/prepare-gitlab-save-baseline-tests.mjs','scripts/check-gitlab-access-feedback.mjs','tests/gitlab-save-authority.test.ts','tests/gitlab-access-feedback.test.ts','artifacts/replay-gitlab-access-repair-20261117.mjs','artifacts/check-gitlab-access-genuine-20261117.mjs','artifacts/finalize-gitlab-access-repair-20261117.mjs'];
const evidence=[];function walk(dir){for(const name of readdirSync(dir)){const path=dir+name;if(statSync(path).isDirectory())walk(path+'/');else if(!path.endsWith('.png')&&!path.endsWith('/validation.json')&&!path.endsWith('/stage-files.json'))evidence.push(path);}}
walk(base);walk(genuine);walk('artifacts/gitlab-compatibility/access-20261117/semantic-instrument/');
const files=[...new Set([...changed,...additions,...evidence,...reviewed])].sort();for(const path of files)if(!path.endsWith('.png'))assert.equal(credentials.test(readFileSync(path,'utf8')),false,'Credential pattern in '+path);
write(base+'validation.json',{
 date:'2026-11-17',parentRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Bounded revoked-description Save repair plus no-false-conflict feedback and genuine-conflict positive controls. Not full application acceptance.',
 acceptedPair:['original-1','fountain-2'],acceptedComparison:'comparison-2',summary:comparison.summary,regressionGate:comparison.regressionGate,featureAcceptance:comparison.featureAcceptance,feedbackPassed:true,scopedAcceptance:true,
 firstCandidate:{pair:['original-1','fountain-1'],comparison:'comparison-1',semanticAcceptance:true,feedbackPassed:false,reason:'Pending draft retained but unchanged server content triggered a misleading conflict.'},
 authority:{revokedResponse:false,restoredResponse:true,httpStatus:200,errorListsEmpty:true},genuineControl:{passed:true,cases:2,addsMatchedScore:false},
 unitTests:{passed:1531,files:60,workers:2},focusedHostAndFeedbackTests:21,strictTypes:'passed',upstreamComponentTests:187,upstreamSuites:2,upstreamLint:'passed',buildWarnings:2,priorCorpusReplayCount:16,
 runtimeBundleByteIdenticalToRedBaseline:true,runtimeInputCount:Object.keys(runtime.inputs).length,installedFilesVerified:32,installerFormat:16,rollbackBothHostBoundariesByteExact:true,
 publicEngineApiDependencyVersionCssOrBudgetChanged:false,generatedUpstreamTests:Object.fromEntries(sourceTests.map(path=>[path,sha(readFileSync(upstream+path))])),
 visuallyReviewedPNGBytes:reviewed,visualCaveat:'Selected actual PNGs, not every captured frame. Full alert receipts establish absence of the hidden spurious conflict; genuine positive control includes visible decision actions.',
 preparationNotes:'Initial broad retry assertion selected an unrelated stack-trace alert; a formatter guard refusal and later test-preparation syntax error are retained and superseded by measured final checks. No acceptance limits changed.',
 remaining:['Other roles and author exceptions','Full membership removal and concurrent role changes','Offline/late/racing saves and atomic locking','Other browsers/mobile and broader product acceptance'],publication:'Not published; GitHub CLI signed out at checkpoint.',
 files:Object.fromEntries(files.map(path=>[path,sha(readFileSync(path))]))
});write(base+'stage-files.json',[...files,base+'validation.json',base+'stage-files.json']);console.log(JSON.stringify({verifiedFiles:files.length,rawLogs:Object.keys(logs).length,reviewedPNGs:reviewed.length,summary:comparison.summary,scopedAcceptance:true}));
