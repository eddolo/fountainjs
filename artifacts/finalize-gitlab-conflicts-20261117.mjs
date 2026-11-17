import {readFileSync,writeFileSync,readdirSync,statSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const base='artifacts/gitlab-compatibility/conflicts-20261117/';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const write=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const comparison=read(base+'comparison-1/report.json');
assert.deepEqual(comparison.summary,{parity:37,improvement:0,regression:0,'shared-limitation':0,incomplete:0,total:37});
assert.equal(comparison.environment.matched,true);assert.equal(comparison.comparisonComplete,true);assert.equal(comparison.regressionGate.passed,true);assert.equal(comparison.featureAcceptance.passed,true);
for(const record of Object.values(comparison.inputs))assert.equal(sha(readFileSync(record.path)),record.sha256,record.path);
const semantic=read(base+'semantic-instrument/manifest.json');
for(const record of Object.values(semantic.files))assert.equal(sha(readFileSync(record.archive)),record.sha256,record.archive);
const firstNative=read(base+'fountain-1/report.json');
for(const name of ['original-1','fountain-1','fountain-2']){
 const run=read(base+name+'/report.json');assert.equal(run.collectionComplete,true);assert.deepEqual(run.errors,[]);
 assert.equal(sha(readFileSync(run.fixturePath)),run.fixtureHash);
 for(const [path,hash]of Object.entries(run.harnessHashes)){
  if(sha(readFileSync(path))===hash)continue;
  assert.notEqual(name,'fountain-2');assert.equal(semantic.files[path]?.sha256,hash);assert.equal(sha(readFileSync(semantic.files[path].archive)),hash);
 }
 for(const item of run.observations){
  assert.equal(item.status,'observed');assert.equal(item.independentContexts,true);assert.equal(item.serverBeforeRemote.description,item.input.markdown);
  assert.equal(item.noAutomaticOverwrite,true);assert.equal(item.localSourceAfterRemote,item.localSource);assert.equal(item.remoteSaved.description,item.remoteSource);
  assert.equal(item.conflictSource,item.remoteSaved.description);assert.equal(item.conflictSourceReadonly,true);assert.equal(item.freshSource,item.resolvedSaved.description);assert.equal(item.finalSource,item.finalSaved.description);assert.deepEqual(item.remoteErrors??[],[]);
  if(name==='fountain-2'){
   const initial=firstNative.observations.find(x=>x.id===item.id);assert.deepEqual(item.graphs,initial.graphs);
   for(const key of ['localSource','remoteSource','localSourceAfterRemote','conflictSource','freshSource','resumedSource','finalSource'])assert.equal(item[key],initial[key],key);
   assert.equal(item.decisionControl.fullyVisible,true);assert.equal(item.decisionControl.unobstructed,true);
  }
 }
}
const runtime=read('artifacts/gitlab-native-runtime/build.json');
for(const [path,hash]of Object.entries(runtime.inputs))assert.equal(sha(readFileSync(path)),hash,path);
const install=read('artifacts/gitlab-native-browser-install/install.json');assert.deepEqual(install.nativeRuntime,runtime);assert.equal(Object.keys(install.files).length,30);
for(const [path,hash]of Object.entries(install.files))assert.equal(sha(readFileSync('//wsl.localhost/Ubuntu/home/eddolo/.cache/fountainjs-gitlab-product/source/'+path)),hash,path);
assert.equal(execFileSync('git',['diff','HEAD','--name-only','--','src','integrations/gitlab/services','integrations/gitlab/components','integrations/gitlab/runtime','artifacts/gitlab-native-runtime/build.json','artifacts/gitlab-native-browser-install/install.json'],{encoding:'utf8'}).trim(),'');
const replay=read(base+'prior-corpus-replay.json');assert.equal(replay.checks.length,14);assert.equal(replay.comparatorSha256,sha(readFileSync('integrations/gitlab/testing/compatibility.mjs')));
assert.match(readFileSync('artifacts/conflicts-integration-final.log','utf8'),/Tests\s+1504 passed/);assert.match(readFileSync('artifacts/conflicts-integration-final.log','utf8'),/Test Files\s+58 passed/);assert.equal(readFileSync('artifacts/conflicts-types-final.log','utf8').trim(),'');
mkdirSync(base+'logs',{recursive:true});const logs={};
for(const name of readdirSync('artifacts').filter(x=>/^conflicts-.*\.log$/.test(x))){
 const bytes=readFileSync('artifacts/'+name);assert.equal(/(?:gh[pousr]_[a-zA-Z0-9]{25,}|glpat-[a-zA-Z0-9_-]{15,})/.test(bytes.toString('utf8')),false,'Credential pattern in '+name);
 const readable=bytes.toString('utf8').replace(/\r\n/g,'\n').replace(/\t/g,'\\t').replace(/ +$/gm,s=>'\\x20'.repeat(s.length)).replace(/\n+$/u,'\n');
 const path=base+'logs/'+name.replace(/\.log$/,'.txt');writeFileSync(path,readable);logs[name]={rawSha256:sha(bytes),rawBase64:bytes.toString('base64'),readablePath:path,readableSha256:sha(readFileSync(path))};
}
write(base+'logs/manifest.json',{scope:'Exact raw bytes in base64; readable logs normalize CRLF, escape tabs/trailing spaces and retain one final newline.',logs});
const reviewed=['original-1/conflict-discard-conflict.png','original-1/conflict-overwrite-reopened.png','fountain-1/conflict-discard-conflict.png','fountain-1/conflict-overwrite-reopened.png','fountain-2/conflict-discard-decision.png','fountain-2/conflict-overwrite-decision.png','original-1/conflict-discard-resolved.png','fountain-1/conflict-discard-resolved.png'];
const changed=execFileSync('git',['diff','HEAD','--name-only'],{encoding:'utf8'}).trim().split('\n').filter(path=>path&&!path.startsWith(base));
const additions=['integrations/gitlab/COMPATIBILITY_CONFLICT_RESULTS.md','integrations/gitlab/fixtures/compatibility-conflicts.json','scripts/audit-gitlab-compatibility-conflicts.mjs','artifacts/replay-gitlab-conflicts-20261117.mjs','artifacts/finalize-gitlab-conflicts-20261117.mjs'];
const evidence=[];function walk(dir){for(const name of readdirSync(dir)){const path=dir+name;if(statSync(path).isDirectory())walk(path+'/');else if(!path.endsWith('.png')&&!path.endsWith('/validation.json')&&!path.endsWith('/stage-files.json'))evidence.push(path);}}walk(base);
const files=[...new Set([...changed,...additions,...evidence,...reviewed.map(path=>base+path)])].sort();
for(const path of files)if(!path.endsWith('.png'))assert.equal(/(?:gh[pousr]_[a-zA-Z0-9]{25,}|glpat-[a-zA-Z0-9_-]{15,})/.test(readFileSync(path,'utf8')),false,'Credential pattern in '+path);
write(base+'validation.json',{
 date:'2026-11-17',parentRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Two independent sessions, same root actor; real local-draft conflict disclosure and explicit resolution. Not multi-role/offline/atomic-concurrency certification.',
 acceptedPair:['original-1','fountain-1'],acceptedComparison:'comparison-1',summary:comparison.summary,regressionGate:comparison.regressionGate,featureAcceptance:comparison.featureAcceptance,
 independentNativeVisualFollowup:{attempt:'fountain-2',addsMatchedComparisonScores:false,graphsAndExactSourcesMatch:true,bothDecisionControlsVisibleAndUnobstructed:true},
 unitTests:{passed:1504,files:58,workers:2},strictTypes:'passed',priorCorpusReplayCount:14,runtimeInputsUnchanged:true,runtimeInputCount:Object.keys(runtime.inputs).length,installedFilesUnchanged:30,
 productionCoreHostOrBudgetChanged:false,initialFailure:'Audit-policy test-fixture typing only; corrected before real runs. Raw log retained.',
 visuallyReviewedPNGBytes:reviewed,visualCaveat:'First native conflict capture clips decision controls. Native-2 decision screenshots show them after normal scrolling. Reader screenshots have ready description content while unrelated child/activity panels still load.',
 remaining:['Different users/roles and revoked permissions','Offline/late/racing updates and simultaneous submits','Server atomic locking/merging not established by UI warning','Mobile/other engines and broader product acceptance'],
 publication:'Local review only; GitHub CLI signed out at checkpoint.',files:Object.fromEntries(files.map(path=>[path,sha(readFileSync(path))]))
});
write(base+'stage-files.json',[...files,base+'validation.json',base+'stage-files.json']);console.log(JSON.stringify({verifiedFiles:files.length,rawLogs:Object.keys(logs).length,reviewedPNGs:reviewed.length,summary:comparison.summary}));
