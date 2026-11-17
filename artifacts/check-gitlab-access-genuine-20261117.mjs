import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const path='artifacts/gitlab-compatibility/access-repair-genuine-20261117/fountain-1/report.json',bytes=readFileSync(path),report=JSON.parse(bytes);
assert.equal(report.side,'fountain');assert.equal(report.collectionComplete,true);assert.deepEqual(report.errors,[]);assert.equal(report.observations.length,2);
const checks=[];
for(const item of report.observations){
 assert.equal(item.status,'observed');assert.equal(item.editorProof.native,true);assert.equal(item.remoteEditorProof.native,true);
 for(const key of ['independentContexts','noAutomaticOverwrite','localDraftRetained','conflictObserved','conflictSourceExact','conflictSourceReadonly','resolutionSourceExact','freshWarningAbsent','freshSourceMatchesServer','normalSaveReachable','finalSourceMatchesServer'])assert.equal(item[key],true,key);
 if(item.input.resolution==='overwrite')assert.equal(item.explicitOverwrite,true);
 assert.deepEqual(item.remoteErrors??[],[]);
 for(const [phase,key]of [['initial','expectedInitial'],['remoteInitial','expectedInitial'],['local','expectedLocal'],['remoteSaved','expectedRemote'],['resolved','expectedResolved'],['final','expectedFinal']])assert.deepEqual(item.graphs[phase],item.input[key],phase);
 checks.push({case:item.id,genuineConflictDisclosed:true,exactRemoteSourceReadonly:true,draftRetained:true,resolutionAndFreshSaveCorrect:true});
}
writeFileSync('artifacts/gitlab-compatibility/access-repair-20261117/genuine-control.json',JSON.stringify({scope:'Native-only real two-session positive controls; no new matched-comparison score.',input:{path,sha256:createHash('sha256').update(bytes).digest('hex')},checks,passed:true},null,2)+'\n',{flag:'wx'});console.log('Both genuine conflict controls pass.');
