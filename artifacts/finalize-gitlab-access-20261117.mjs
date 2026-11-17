import {readFileSync,writeFileSync,readdirSync,statSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const base='artifacts/gitlab-compatibility/access-20261117/';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const write=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const comparison=read(base+'comparison-1/report.json');
assert.deepEqual(comparison.summary,{parity:24,improvement:0,regression:0,'shared-limitation':7,incomplete:0,total:31});
assert.equal(comparison.environment.matched,true);assert.equal(comparison.comparisonComplete,true);assert.equal(comparison.regressionGate.passed,true);assert.equal(comparison.featureAcceptance.passed,false);
for(const record of Object.values(comparison.inputs))assert.equal(sha(readFileSync(record.path)),record.sha256,record.path);
for(const [path,hash]of Object.entries(comparison.comparatorHashes))assert.equal(sha(readFileSync(path)),hash,path);
for(const folder of ['identity-proof-instrument','credential-setup-instrument','password-route-instrument','reader-readiness-instrument','production-before-repair'])for(const record of Object.values(read(base+folder+'/manifest.json').files))assert.equal(sha(readFileSync(record.archive)),record.sha256,record.archive);
const actors=[];
for(const name of ['original-5','fountain-2']){
 const run=read(base+name+'/report.json');assert.equal(run.collectionComplete,true);assert.deepEqual(run.errors,[]);assert.equal(run.observations.length,2);
 assert.equal(sha(readFileSync(run.fixturePath)),run.fixtureHash);for(const [path,hash]of Object.entries(run.harnessHashes))assert.equal(sha(readFileSync(path)),hash,path);
 for(const item of run.observations){assert.equal(item.status,'observed');assert.equal(item.actor.id,3);assert.equal(item.actor.isAdmin,false);assert.equal(item.actor.username,run.fixture.username);assert.equal(item.setup.authorId,1);assert.equal(item.adminIdentityProof.isAdmin,false);assert.equal(item.adminIdentityProof.id,item.actor.id);assert.equal(item.membership.id,item.actor.id);assert.equal(item.cleanupMembership.accessLevel,10);assert.deepEqual(item.actorErrors,[]);}
 const guest=run.observations.find(x=>x.input.kind==='guest'),revoked=run.observations.find(x=>x.input.kind==='revocation');
 assert.equal(guest.permissionBefore,false);assert.equal(guest.denialStatus,403);assert.equal(guest.afterDenied.description,guest.input.markdown);assert.deepEqual(guest.anonymousPage,{status:200,path:'/users/sign_in'});assert.equal(guest.anonymousAPIStatus,404);
 assert.equal(revoked.permissionBefore,true);assert.equal(revoked.permissionRevoked,false);assert.equal(revoked.permissionRestored,true);assert.equal(revoked.draftStayedLocal,true);assert.equal(revoked.saveVisibleAfterRevocation,true);
 const mutation=revoked.mutations.find(x=>x.stage==='revoke-edit-access');assert.ok(mutation);assert.equal(mutation.status,200);assert.deepEqual(mutation.errors,[]);assert.deepEqual(mutation.updateErrors,[]);assert.ok(mutation.updatedId);
 assert.equal(revoked.afterRevokedSave.description,revoked.confirmedSource);assert.notEqual(revoked.pendingSource,revoked.confirmedSource);assert.equal(revoked.retainedSource,null);assert.equal(revoked.recoveredSource,revoked.confirmedSource);assert.equal(revoked.finalSaved.description,revoked.confirmedSource);
 for(const key of ['deniedSaveReported','draftRetainedAfterDenial','draftRecoveredAfterReload','finalSourceExact','finalReopenExact'])assert.equal(revoked[key],false,key);
 actors.push(run.observations.map(x=>x.actor));
}
assert.deepEqual(actors[0],actors[1]);
const runtime=read('artifacts/gitlab-native-runtime/build.json');for(const [path,hash]of Object.entries(runtime.inputs))assert.equal(sha(readFileSync(path)),hash,path);
const install=read('artifacts/gitlab-native-browser-install/install.json');assert.deepEqual(install.nativeRuntime,runtime);assert.equal(Object.keys(install.files).length,30);
const upstream='//wsl.localhost/Ubuntu/home/eddolo/.cache/fountainjs-gitlab-product/source/';for(const [path,hash]of Object.entries(install.files))assert.equal(sha(readFileSync(upstream+path)),hash,path);
assert.equal(execFileSync('git',['diff','HEAD','--name-only','--','src','integrations/gitlab/services','integrations/gitlab/components','integrations/gitlab/runtime','artifacts/gitlab-native-runtime/build.json','artifacts/gitlab-native-browser-install/install.json'],{encoding:'utf8'}).trim(),'');
const replay=read(base+'prior-corpus-replay.json');assert.equal(replay.checks.length,15);assert.equal(replay.comparatorSha256,sha(readFileSync('integrations/gitlab/testing/compatibility.mjs')));
assert.match(readFileSync('artifacts/access-integration-final.log','utf8'),/Tests\s+1510 passed/);assert.match(readFileSync('artifacts/access-integration-final.log','utf8'),/Test Files\s+58 passed/);assert.equal(readFileSync('artifacts/access-types-final.log','utf8').trim(),'');
mkdirSync(base+'logs',{recursive:true});const logs={};const credentials=/(?:gh[pousr]_[a-zA-Z0-9]{25,}|glpat-[a-zA-Z0-9_-]{15,})/;
for(const name of readdirSync('artifacts').filter(x=>/^access-.*\.log$/.test(x))){const bytes=readFileSync('artifacts/'+name);assert.equal(credentials.test(bytes.toString('utf8')),false,'Credential pattern in '+name);const readable=bytes.toString('utf8').replace(/\r\n/g,'\n').replace(/\t/g,'\\t').replace(/ +$/gm,s=>'\\x20'.repeat(s.length)).replace(/\n+$/u,'\n');const path=base+'logs/'+name.replace(/\.log$/,'.txt');writeFileSync(path,readable);logs[name]={rawSha256:sha(bytes),rawBase64:bytes.toString('base64'),readablePath:path,readableSha256:sha(readFileSync(path))};}
write(base+'logs/manifest.json',{scope:'Exact raw bytes in base64; readable logs normalize CRLF, escape tabs/trailing spaces and retain one final newline.',logs});
const reviewed=['original-2/guest-readonly-failure.png','original-3/guest-readonly-failure.png','original-4/guest-readonly-failure.png','original-5/developer-revocation-save-denied.png','fountain-2/developer-revocation-save-denied.png','fountain-2/developer-revocation-recovered-draft.png','fountain-2/guest-readonly-reader.png','fountain-2/developer-revocation-draft-before-revocation.png'];
const changed=execFileSync('git',['diff','HEAD','--name-only'],{encoding:'utf8'}).trim().split('\n').filter(path=>path&&!path.startsWith(base));
const additions=['integrations/gitlab/COMPATIBILITY_ACCESS_RESULTS.md','integrations/gitlab/fixtures/compatibility-access.json','scripts/audit-gitlab-compatibility-access.mjs','artifacts/replay-gitlab-access-20261117.mjs','artifacts/finalize-gitlab-access-20261117.mjs'];
const evidence=[];function walk(dir){for(const name of readdirSync(dir)){const path=dir+name;if(statSync(path).isDirectory())walk(path+'/');else if(!path.endsWith('.png')&&!path.endsWith('/validation.json')&&!path.endsWith('/stage-files.json'))evidence.push(path);}}walk(base);
const files=[...new Set([...changed,...additions,...evidence,...reviewed.map(path=>base+path)])].sort();for(const path of files)if(!path.endsWith('.png'))assert.equal(credentials.test(readFileSync(path,'utf8')),false,'Credential pattern in '+path);
write(base+'validation.json',{
 date:'2026-11-17',parentRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Receipt validation for a real red product workflow; verifying these receipts does not satisfy feature acceptance.',
 acceptedPair:['original-5','fountain-2'],acceptedComparison:'comparison-1',summary:comparison.summary,regressionGate:comparison.regressionGate,featureAcceptance:comparison.featureAcceptance,productAcceptance:false,
 defect:'A success-shaped revoked Save closes the editor and loses the pending description, even though the backend retains the previous source. Both implementations share it.',
 verifiedActor:{id:3,username:'fountain_compat_access',isAdmin:false,rootAuthorId:1},verifiedRoles:[10,30,10,30],cleanupRole:10,mutationHTTP:200,mutationErrors:[],draftRepairApplied:false,
 excludedOriginalAttempts:{1:'Non-admin self response omitted is_admin; identity observer failure.',2:'Mandatory password update after admin reset.',3:'Password-update route assumption missed the actual form.',4:'Reader accessible-heading-name mismatch despite visible exact content.'},
 excludedNativeAttempt:{1:'Pre-auth deployment exit 1, OOM false, zero editor observations.'},
 unitTests:{passed:1510,files:58,workers:2},strictTypes:'passed',priorCorpusReplayCount:15,runtimeInputsUnchanged:true,installedFilesUnchanged:30,productionCoreHostOrBudgetChanged:false,
 visuallyReviewedPNGBytes:reviewed,visualCaveat:'Reader claims cover the description region; unrelated panels/composers may still load. Failed password-update screenshots contain empty fields only.',
 nextRequiredRepair:'Guard host Save acknowledgement before draft clearing/editMode=false; preserve the draft and show a failure on revoked description authority. Verify authorized/empty/quick-action controls and actual returned authority, then rerun the same matched workflow.',
 publication:'Local review only; no release. GitHub sign-in pending at prior checkpoint.',files:Object.fromEntries(files.map(path=>[path,sha(readFileSync(path))]))
});write(base+'stage-files.json',[...files,base+'validation.json',base+'stage-files.json']);console.log(JSON.stringify({verifiedFiles:files.length,rawLogs:Object.keys(logs).length,reviewedPNGs:reviewed.length,summary:comparison.summary,productAcceptance:false}));
