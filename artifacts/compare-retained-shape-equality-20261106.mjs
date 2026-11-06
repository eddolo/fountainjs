import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const read=async name=>JSON.parse(await readFile(`artifacts/${name}-20261106.json`,'utf8'));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const costs=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-shape-equality-cost-${kind}`)));
assert.deepEqual(costs[0].identity,costs[1].identity);
for(const report of costs){assert.equal(report.trials,3);assert.equal(report.rows.length,18);assert(report.rows.every(row=>row.documentMatchesPlain));}
const summary=[1000,5000,10000].map(blocks=>{
 const sets=costs.map(report=>report.rows.filter(row=>row.retained&&row.blocks===blocks));assert(sets.every(rows=>rows.length===3));
 for(const key of ['documentSha256','sharedSha256','sharedBytes'])assert.equal(new Set(sets.flat().map(row=>row[key])).size,1,key);
 const summaries=sets.map(rows=>({medianInitializationMs:median(rows.map(row=>row.initializationMs)),medianOfEditMediansMs:median(rows.map(row=>row.p50Ms)),maximumTimedEditMs:Math.max(...rows.map(row=>row.p95Ms)),sharedBytes:rows[0].sharedBytes,sharedSha256:rows[0].sharedSha256,trials:rows}));
 return {blocks,documentsAndEncodedBytesIdentical:true,before:summaries[0],after:summaries[1]};
});
const sessions=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-shape-equality-session-${kind}`)));
const stages=row=>row.rows.map(({stage,sharedBytes,sharedV2Bytes,textDeltaOperations,containers})=>({stage,sharedBytes,sharedV2Bytes,textDeltaOperations,containers}));
for(const report of sessions){assert.equal(report.trials,3);assert.equal(report.cases.length,3);assert.equal(report.domRequired,false);}
const reference=sessions[0].cases[0];
for(const row of sessions.flatMap(report=>report.cases)){
 assert.equal(row.edits,1024);assert.equal(row.exactConvergence,true);assert.equal(row.authorOnlyFullUndoRedo,true);assert.equal(row.reopenMatches,true);
 assert.deepEqual(row.released,{left:true,right:true,leftDoc:true,rightDoc:true});
 assert.equal(row.documentSha256,reference.documentSha256);assert.equal(row.sharedSha256,reference.sharedSha256);assert.deepEqual(stages(row),stages(reference));
}
const interop=await read('retained-shape-equality-interop');assert.equal(interop.passed,28);assert(interop.cases.every(row=>row.exactConvergence&&row.authorHistoryPreserved&&row.rootAndImagePreserved));
const allocations=[];
for(const blocks of [1000,5000,10000]){
 const [before,after]=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-shape-equality-allocation-${kind}-${blocks}`)));
 for(const row of [before,after]){assert.equal(row.blocks,blocks);assert.equal(row.instrumentedEdits,1);assert.equal(row.documentMatchesPlain,true);assert.equal(row.domRequired,false);}
 for(const key of ['documentSha256','sharedSha256','sharedBytes'])assert.equal(before[key],after[key],key);
 assert.equal(before.nodeJSONCallsDuringEdit,4*blocks+2);assert.equal(after.nodeJSONCallsDuringEdit,0);
 allocations.push({blocks,before,after,documentsAndEncodedBytesIdentical:true});
}
const report={baselineCommit:'50842bfe',runtime:costs[0].runtime,summary,allocations,sessions:{trialsPerBuild:3,editsPerTrial:1024,documentsAndEncodedBytesIdentical:true,allEditorsAndDocumentsReleased:true,stages:stages(reference)},interopJourneys:28,interpretation:'Use existing model equality on the fully fresh validated projection before falling back to portable JSON equality. Unchanged immutable branches avoid full JSON allocation. Equivalent metadata with different key order retains the fallback; actual unexpected metadata still rejects. Full shared projection and preflight remain. Local sequential diagnostics, not a general latency or adoption claim. No default switch, compaction, migration, version/limit increase or publication.'};
await writeFile('artifacts/retained-shape-equality-comparison-20261106.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary.map(({blocks,before,after})=>({blocks,beforeInitializationMs:before.medianInitializationMs,afterInitializationMs:after.medianInitializationMs,beforeEditMs:before.medianOfEditMediansMs,afterEditMs:after.medianOfEditMediansMs,sharedBytes:after.sharedBytes}))));
