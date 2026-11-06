import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const read=async name=>JSON.parse(await readFile(`artifacts/${name}-20261106.json`,'utf8'));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const costs=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-frame-cost-${kind}`)));
assert.deepEqual(costs[0].identity,costs[1].identity);
for(const report of costs){assert.equal(report.trials,3);assert.equal(report.rows.length,18);assert(report.rows.every(row=>row.documentMatchesPlain));}
const summary=[100,500,1000].map(blocks=>{
 const sets=costs.map(report=>report.rows.filter(row=>row.retained&&row.blocks===blocks));
 const rows=sets.flat();assert.equal(rows.length,6);
 for(const key of ['documentSha256','sharedSha256','sharedBytes'])assert.equal(new Set(rows.map(row=>row[key])).size,1,key);
 const summaries=sets.map(rows=>({medianOfEditMediansMs:median(rows.map(row=>row.p50Ms)),maximumTimedSampleMs:Math.max(...rows.map(row=>row.p95Ms)),medianInitializationMs:median(rows.map(row=>row.initializationMs)),extraEditSizeGetterCalls:rows.map(row=>row.diagnosticExtraEdit.sizeGetterCalls),trials:rows}));
 assert(summaries[1].extraEditSizeGetterCalls.every((count,index)=>count===summaries[0].extraEditSizeGetterCalls[index]-33));
 return {blocks,sharedBytes:rows[0].sharedBytes,before:summaries[0],after:summaries[1]};
});
const sessions=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-frame-session-${kind}-trials`)));
for(const report of sessions){assert.equal(report.trials,3);assert.equal(report.cases.length,3);assert.equal(report.deterministicIdentities,true);assert.equal(report.domRequired,false);}
const stages=row=>row.rows.map(({stage,sharedBytes,sharedV2Bytes,textDeltaOperations,containers})=>({stage,sharedBytes,sharedV2Bytes,textDeltaOperations,containers}));
const reference=sessions[0].cases[0];
for(const row of sessions.flatMap(report=>report.cases)){
 assert.equal(row.edits,1024);assert.equal(row.exactConvergence,true);assert.equal(row.authorOnlyFullUndoRedo,true);assert.equal(row.reopenMatches,true);
 assert.deepEqual(row.released,{left:true,right:true,leftDoc:true,rightDoc:true});
 assert.equal(row.documentSha256,reference.documentSha256);assert.equal(row.sharedSha256,reference.sharedSha256);assert.deepEqual(stages(row),stages(reference));
 const converged=row.rows.find(row=>row.stage==='converged'),redone=row.rows.find(row=>row.stage==='all-redone');
 assert(redone.sharedBytes>converged.sharedBytes);assert.equal(redone.textDeltaOperations,converged.textDeltaOperations);
}
const sessionSummary=sessions.map(report=>({directory:report.directory,medianFinal128EditMs:median(report.cases.map(row=>row.rows.find(row=>row.stage==='edit-1024').editMedianMs)),medianUndoMs:median(report.cases.map(row=>row.undoMs)),medianRedoMs:median(report.cases.map(row=>row.redoMs)),postGcTotals:report.cases.map(row=>row.after.total),postGcDeltas:report.cases.map(row=>row.retainedDelta)}));
const report={baselineCommit:'29f8e6ea',runtime:costs[0].runtime,controlled:summary,session:{editsPerTrial:1024,trialsPerBuild:3,stages:stages(reference),before:sessionSummary[0],after:sessionSummary[1],identicalSharedStateAndDocuments:true,allEditorsAndSharedDocumentsReleased:true},interpretation:'Fewer repeated reads, not a universal speedup. Timings vary and are not acceptance gates. History/wire growth remains; V2 is diagnostic only. GC observations include runtime warmup and diagnostic records, and do not certify bounded memory. No compaction, public adapter switch or acceptance-limit change.'};
await writeFile('artifacts/retained-frame-comparison-20261106.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({controlled:summary.map(({blocks,before,after})=>({blocks,beforeMs:before.medianOfEditMediansMs,afterMs:after.medianOfEditMediansMs})),session:sessionSummary}));
