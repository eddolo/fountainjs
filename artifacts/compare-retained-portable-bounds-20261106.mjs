import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const read=async name=>JSON.parse(await readFile(`artifacts/${name}-20261106.json`,'utf8'));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const costs=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-portable-bounds-cost-${kind}`)));
assert.deepEqual(costs[0].identity,costs[1].identity);
for(const report of costs){assert.equal(report.trials,3);assert.equal(report.rows.length,18);assert(report.rows.every(row=>row.documentMatchesPlain));}
const summary=[1000,5000,10000].map(blocks=>{
 const sets=costs.map(report=>report.rows.filter(row=>row.retained&&row.blocks===blocks));assert(sets.every(rows=>rows.length===3));
 for(const key of ['documentSha256','sharedSha256','sharedBytes'])assert.equal(new Set(sets.flat().map(row=>row[key])).size,1,key);
 const summaries=sets.map(rows=>({medianInitializationMs:median(rows.map(row=>row.initializationMs)),medianOfEditMediansMs:median(rows.map(row=>row.p50Ms)),maximumTimedEditMs:Math.max(...rows.map(row=>row.p95Ms)),sharedBytes:rows[0].sharedBytes,sharedSha256:rows[0].sharedSha256,trials:rows}));
 return {blocks,documentsAndEncodedBytesIdentical:true,before:summaries[0],after:summaries[1]};
});
const sessions=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-portable-bounds-session-${kind}`)));
const stages=row=>row.rows.map(({stage,sharedBytes,sharedV2Bytes,textDeltaOperations,containers})=>({stage,sharedBytes,sharedV2Bytes,textDeltaOperations,containers}));
for(const report of sessions){assert.equal(report.trials,3);assert.equal(report.cases.length,3);assert.equal(report.domRequired,false);}
const reference=sessions[0].cases[0];
for(const row of sessions.flatMap(report=>report.cases)){
 assert.equal(row.edits,1024);assert.equal(row.exactConvergence,true);assert.equal(row.authorOnlyFullUndoRedo,true);assert.equal(row.reopenMatches,true);
 assert.deepEqual(row.released,{left:true,right:true,leftDoc:true,rightDoc:true});
 assert.equal(row.documentSha256,reference.documentSha256);assert.equal(row.sharedSha256,reference.sharedSha256);assert.deepEqual(stages(row),stages(reference));
}
const interop=await read('retained-portable-bounds-interop');assert.equal(interop.passed,28);assert(interop.cases.every(row=>row.exactConvergence&&row.authorHistoryPreserved&&row.rootAndImagePreserved));
const work=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-portable-bounds-work-${kind}`)));
for(const row of work){assert.equal(row.blocks,5000);assert.equal(row.instrumentedEdits,1);assert.equal(row.documentMatchesPlain,true);assert.equal(row.domRequired,false);}
for(const key of ['documentSha256','sharedSha256','sharedBytes'])assert.equal(work[0][key],work[1][key]);
assert(work[1].jsonStringifyCallsDuringEdit<work[0].jsonStringifyCallsDuringEdit);
const snapshots=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-portable-bounds-snapshots-${kind}`)));
for(const row of snapshots){assert.equal(row.blocks,1000);assert.equal(row.edits,64);assert.equal(row.snapshotCount,65);assert.equal(row.uniqueModelNodes,2193);assert.equal(row.allSnapshotsRemainExact,true);assert.equal(row.exactConvergence,true);}
for(const key of ['documentSha256','sharedSha256','sharedBytes'])assert.equal(snapshots[0][key],snapshots[1][key]);
const peers=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-portable-bounds-peer-${kind}`)));
for(const report of peers){assert.equal(report.trials,1);assert.equal(report.domRequired,false);assert.equal(report.rows.length,3);assert(report.rows.every(row=>row.exactConvergence&&row.documentMatchesPlain));}
for(let index=0;index<3;index++)for(const key of ['documentSha256','sharedSha256','sharedBytes','deliveredBytes'])assert.equal(peers[0].rows[index][key],peers[1].rows[index][key]);
const report={baselineCommit:'aa793b20',runtime:costs[0].runtime,summary,serializationWork:{before:work[0],after:work[1]},snapshotDiagnostic:{trialsPerBuild:1,before:snapshots[0],after:snapshots[1],note:'Explicit snapshot and live-cache GC diagnostic, not a bounded-memory or compaction certificate.'},peerDiagnostic:{trialsPerBuild:1,before:peers[0],after:peers[1],note:'Exploratory receiver timing; remote projections retain full shared acquisition.'},sessions:{trialsPerBuild:3,editsPerTrial:1024,documentsAndEncodedBytesIdentical:true,allEditorsAndDocumentsReleased:true,stages:stages(reference)},interopJourneys:28,interpretation:'Immutable portable-data bounds are weakly certified per schema and node, with live type-name inventories and conservative host serializer fallback. Every occurrence still contributes its exact node/character/depth bounds, and schema/factory validation remains live. A checked shared frame may be reused only for a clean single native text transaction after freshly rereading its full edited stream and proving all other shared types and existing styles unchanged. Every schema/factory rule and final model check still runs. Transaction identity, insertion state and deletions gate cache freshness; explicit reads, remote/structural edits and uncertain cases acquire full shared state. Diagnostic timings, not adoption gates. Normalization, preflight, history growth, compaction and migration remain. No default switch, version/limit increase or publication.'};
await writeFile('artifacts/retained-portable-bounds-comparison-20261106.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary.map(({blocks,before,after})=>({blocks,beforeInitializationMs:before.medianInitializationMs,afterInitializationMs:after.medianInitializationMs,beforeEditMs:before.medianOfEditMediansMs,afterEditMs:after.medianOfEditMediansMs,sharedBytes:after.sharedBytes}))));
