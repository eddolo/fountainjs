import {readFileSync,writeFileSync,readdirSync,statSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const base='artifacts/gitlab-compatibility/task-containers-20261117/';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const write=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const accepted=read(base+'comparison-1/report.json');
assert.deepEqual(accepted.summary,{parity:63,improvement:41,regression:0,'shared-limitation':0,incomplete:0,total:104});
assert.equal(accepted.environment.matched,true);assert.equal(accepted.comparisonComplete,true);
assert.equal(accepted.regressionGate.passed,true);assert.equal(accepted.featureAcceptance.passed,true);
for(const input of Object.values(accepted.inputs))assert.equal(sha(readFileSync(input.path)),input.sha256,input.path);
for(const folder of ['before-repair-production','representation-readiness-instrument','semantic-instrument']){
 for(const record of Object.values(read(base+folder+'/manifest.json').files))assert.equal(sha(readFileSync(record.archive)),record.sha256,record.archive);
}
const semantic=read(base+'semantic-instrument/manifest.json');
for(const side of ['original-3','fountain-3','fountain-4']){
 const run=read(base+side+'/report.json');assert.equal(run.collectionComplete,true,side);assert.deepEqual(run.errors,[],side);
 assert.equal(sha(readFileSync(run.fixturePath)),run.fixtureHash,side+' fixture');
 for(const [path,hash]of Object.entries(run.harnessHashes)){
  const current=sha(readFileSync(path));if(current===hash)continue;
  assert.notEqual(side,'fountain-4','visual run must match current instrument');
  assert.equal(semantic.files[path]?.sha256,hash,path);assert.equal(sha(readFileSync(semantic.files[path].archive)),hash,path);
 }
}
const runtime=read('artifacts/gitlab-native-runtime/build.json');
for(const [path,hash]of Object.entries(runtime.inputs))assert.equal(sha(readFileSync(path)),hash,path);
const installed=read('artifacts/gitlab-native-browser-install/install.json');
assert.deepEqual(installed.nativeRuntime,runtime);assert.equal(Object.keys(installed.files).length,30);
const upstream='//wsl.localhost/Ubuntu/home/eddolo/.cache/fountainjs-gitlab-product/source/';
for(const [path,hash]of Object.entries(installed.files))assert.equal(sha(readFileSync(upstream+path)),hash,path);
const replay=read(base+'prior-corpus-replay.json');assert.equal(replay.checks.length,13);assert.equal(replay.comparatorSha256,sha(readFileSync('integrations/gitlab/testing/compatibility.mjs')));
const visual=read(base+'visual-followup-checks.json');assert.equal(visual.checks.length,4);
for(const check of visual.checks)for(const [key,value]of Object.entries(check))if(key!=='case')assert.equal(value,true,key);
const testLog=readFileSync('artifacts/task-containers-integration-final.log','utf8');assert.match(testLog,/Tests\s+1500 passed/);assert.match(testLog,/Test Files\s+58 passed/);
assert.equal(readFileSync('artifacts/task-containers-types-final.log','utf8').trim(),'');
assert.match(readFileSync('artifacts/task-containers-upstream-jest.log','utf8'),/Tests:\s+26 passed/);
assert.match(readFileSync('artifacts/task-containers-rspack.log','utf8'),/compiled with 2 warnings/);
mkdirSync(base+'logs',{recursive:true});const logs={};
for(const name of readdirSync('artifacts').filter(name=>/^task-containers-.*\.log$/.test(name))){
 const bytes=readFileSync('artifacts/'+name);const readable=bytes.toString('utf8').replace(/\r\n/g,'\n').replace(/\t/g,'\\t').replace(/ +$/gm,spaces=>'\\x20'.repeat(spaces.length)).replace(/\n+$/u,'\n');
 const output=base+'logs/'+name.replace(/\.log$/,'.txt');writeFileSync(output,readable);
 logs[name]={rawSha256:sha(bytes),rawBase64:bytes.toString('base64'),readablePath:output,readableSha256:sha(readFileSync(output))};
}
write(base+'logs/manifest.json',{scope:'Exact original log bytes in base64; readable logs normalize CRLF and visibly escape tabs/trailing spaces and retain one terminal newline.',logs});
const reviewed=[
'fountain-3/quoted-conversion-prefill-code.png','fountain-3/quoted-conversion-parent-resaved.png','fountain-3/deep-quoted-conversion-prefill-code.png',
'fountain-4/quoted-conversion-prefill-code.png','fountain-4/deep-quoted-conversion-prefill-code.png','fountain-4/listed-quote-conversion-prefill-code.png','fountain-4/inline-quote-conversion-prefill-code.png',
'fountain-3/inline-quote-conversion-parent-resaved.png','fountain-3/listed-quote-conversion-parent-resaved.png','fountain-3/deep-quoted-conversion-child-reopened.png','original-3/deep-quoted-conversion-child-reopened.png'];
const production=execFileSync('git',['diff','HEAD','--name-only'],{encoding:'utf8'}).trim().split('\n').filter(path=>path&&!path.startsWith(base));
const additions=['integrations/gitlab/COMPATIBILITY_TASK_CONTAINER_RESULTS.md','integrations/gitlab/fixtures/compatibility-task-containers.json','integrations/gitlab/fixtures/task-containers-renderer.json','scripts/probe-gitlab-task-container-html.mjs','artifacts/replay-gitlab-task-containers-20261117.mjs','artifacts/finalize-gitlab-task-containers-20261117.mjs'];
const evidence=[];
function walk(dir){for(const name of readdirSync(dir)){const path=dir+name;if(statSync(path).isDirectory())walk(path+'/');else if(!path.endsWith('.png')&&!path.endsWith('/validation.json')&&!path.endsWith('/stage-files.json'))evidence.push(path);}}
walk(base);
const files=[...new Set([...production,...additions,...evidence,...reviewed.map(path=>base+path)])].sort();
for(const path of files){const bytes=readFileSync(path);if(!path.endsWith('.png'))assert.equal(/(?:gh[pousr]_[a-zA-Z0-9]{25,}|glpat-[a-zA-Z0-9_-]{15,})/.test(bytes.toString('utf8')),false,'Credential pattern in '+path);}
write(base+'validation.json',{
 date:'2026-11-17',parentRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Four real quoted/container child conversion workflows; not full GitLab acceptance.',
 acceptedPair:['original-3','fountain-3'],acceptedComparison:'comparison-1',summary:accepted.summary,regressionGate:accepted.regressionGate,featureAcceptance:accepted.featureAcceptance,
 beforeRepair:{pair:['original-3','fountain-2'],comparison:'comparison-before-repair',note:'Eight divergent failures, not absent observations, contribute to incomplete summary.'},
 excludedAttempts:{'original-1':'Pre-auth startup exit 1, OOM false.','fountain-1':'Pre-auth startup exit 1, OOM false.','original-2':'Three cases complete; malformed child representation defeated prose-only readiness. Retained, not scored.'},
 separateNativeVisualFollowup:{attempt:'fountain-4',addsMatchedScores:false,semanticIdentity:'All graph snapshots, exact source/title and parent links match fountain-3.',allCodeFullyVisible:true},
 unitTests:{passed:1500,files:58,workers:2},strictTypes:'passed',upstreamJestTests:26,upstreamLint:'passed',nativeBuildWarnings:2,priorCorpusReplayCount:13,
 runtimeInputsMatch:true,installedFilesVerified:30,installerFormat:14,publicCoreOrBudgetChanged:false,publication:'Not published; GitHub CLI signed out at checkpoint.',
 preexistingImprovements:2,remaining:['Tabbed/custom container prefixes and source-column ambiguity','Other roles and platforms','Broader application acceptance and UI polish','Separate GitLab cold-start reconfiguration exits'],
 visuallyReviewedPNGBytes:reviewed,visualCaveat:'Two fountain-3 prefills clip code; fountain-4 uses normal collapse/scroll controls to show the full code. PNG review is selected, not every captured frame.',
 files:Object.fromEntries(files.map(path=>[path,sha(readFileSync(path))]))
});
write(base+'stage-files.json',[...files,base+'validation.json',base+'stage-files.json']);
console.log(JSON.stringify({checkedFiles:files.length,logArchives:Object.keys(logs).length,reviewedPNGs:reviewed.length,runtimeInputs:Object.keys(runtime.inputs).length,installedFiles:30,summary:accepted.summary}));
