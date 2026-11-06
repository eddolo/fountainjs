import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const read=async name=>JSON.parse(await readFile(`artifacts/${name}-20261106.json`,'utf8'));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const costs=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-native-plan-cost-${kind}`)));
assert.deepEqual(costs[0].identity,costs[1].identity);
for(const report of costs){assert.equal(report.trials,3);assert.equal(report.rows.length,18);assert(report.rows.every(row=>row.documentMatchesPlain));}
const summary=[1000,5000,10000].map(blocks=>{
 const sets=costs.map(report=>report.rows.filter(row=>row.retained&&row.blocks===blocks));assert(sets.every(rows=>rows.length===3));
 for(const key of ['documentSha256','sharedSha256','sharedBytes'])assert.equal(new Set(sets.flat().map(row=>row[key])).size,1,key);
 const summaries=sets.map(rows=>({medianInitializationMs:median(rows.map(row=>row.initializationMs)),medianOfEditMediansMs:median(rows.map(row=>row.p50Ms)),maximumTimedEditMs:Math.max(...rows.map(row=>row.p95Ms)),sharedBytes:rows[0].sharedBytes,sharedSha256:rows[0].sharedSha256,trials:rows}));
 return {blocks,documentsAndEncodedBytesIdentical:true,before:summaries[0],after:summaries[1]};
});
const sessions=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-native-plan-session-${kind}`)));
const stages=row=>row.rows.map(({stage,sharedBytes,sharedV2Bytes,textDeltaOperations,containers})=>({stage,sharedBytes,sharedV2Bytes,textDeltaOperations,containers}));
for(const report of sessions){assert.equal(report.trials,3);assert.equal(report.cases.length,3);assert.equal(report.domRequired,false);}
const reference=sessions[0].cases[0];
for(const row of sessions.flatMap(report=>report.cases)){
 assert.equal(row.edits,1024);assert.equal(row.exactConvergence,true);assert.equal(row.authorOnlyFullUndoRedo,true);assert.equal(row.reopenMatches,true);
 assert.deepEqual(row.released,{left:true,right:true,leftDoc:true,rightDoc:true});
 assert.equal(row.documentSha256,reference.documentSha256);assert.equal(row.sharedSha256,reference.sharedSha256);assert.deepEqual(stages(row),stages(reference));
}
const interop=await read('retained-native-plan-interop');assert.equal(interop.passed,28);assert(interop.cases.every(row=>row.exactConvergence&&row.authorHistoryPreserved&&row.rootAndImagePreserved));
const work=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-native-plan-work-${kind}`)));
for(const row of work){assert.equal(row.blocks,5000);assert.equal(row.instrumentedEdits,1);assert.equal(row.documentMatchesPlain,true);assert.equal(row.domRequired,false);}
for(const key of ['documentSha256','sharedSha256','sharedBytes'])assert.equal(work[0][key],work[1][key]);
assert.equal(work[0].stringSliceCallsDuringEdit,10006);assert.equal(work[1].stringSliceCallsDuringEdit,6);
const snapshots=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-native-plan-snapshots-${kind}`)));
for(const row of snapshots){assert.equal(row.blocks,1000);assert.equal(row.edits,64);assert.equal(row.snapshotCount,65);assert.equal(row.uniqueModelNodes,2193);assert.equal(row.allSnapshotsRemainExact,true);assert.equal(row.exactConvergence,true);}
for(const key of ['documentSha256','sharedSha256','sharedBytes'])assert.equal(snapshots[0][key],snapshots[1][key]);
const peers=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-native-plan-peer-${kind}`)));
for(const report of peers){assert.equal(report.trials,1);assert.equal(report.domRequired,false);assert.equal(report.rows.length,3);assert(report.rows.every(row=>row.exactConvergence&&row.documentMatchesPlain));}
for(let index=0;index<3;index++)for(const key of ['documentSha256','sharedSha256','sharedBytes','deliveredBytes'])assert.equal(peers[0].rows[index][key],peers[1].rows[index][key]);
const report={baselineCommit:'e994643a',runtime:costs[0].runtime,summary,provenanceWork:{before:work[0],after:work[1]},snapshotDiagnostic:{trialsPerBuild:1,before:snapshots[0],after:snapshots[1],note:'Explicit snapshot and live-cache GC diagnostic, not a bounded-memory or compaction certificate.'},peerDiagnostic:{trialsPerBuild:1,before:peers[0],after:peers[1],note:'Exploratory receiver timing; remote projections retain full shared acquisition.'},sessions:{trialsPerBuild:3,editsPerTrial:1024,documentsAndEncodedBytesIdentical:true,allEditorsAndDocumentsReleased:true,stages:stages(reference)},interopJourneys:28,interpretation:'A single native text operation can prove character provenance from its exact native map, unchanged path/ancestor metadata and marks, unchanged sibling identities and exact resulting text. A copied path and scalar fields pin the validated operation across transaction-start hooks. All custom/multi-step cases retain full preflight; ineligible shared writes derive a generic plan before writing. Final factory/model/shared-frame checks remain. Scoped local diagnostics, not adoption gates. Normalization, history/storage growth, compaction and migration remain. No default switch, version/limit increase or publication.'};
await writeFile('artifacts/retained-native-plan-comparison-20261106.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary.map(({blocks,before,after})=>({blocks,beforeInitializationMs:before.medianInitializationMs,afterInitializationMs:after.medianInitializationMs,beforeEditMs:before.medianOfEditMediansMs,afterEditMs:after.medianOfEditMediansMs,sharedBytes:after.sharedBytes}))));
