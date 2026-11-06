import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const read=async name=>JSON.parse(await readFile(`artifacts/${name}-20261106.json`,'utf8'));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const costs=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-text-seed-cost-${kind}`)));
assert.deepEqual(costs[0].identity,costs[1].identity);for(const report of costs){assert.equal(report.trials,3);assert.equal(report.rows.length,18);assert(report.rows.every(row=>row.documentMatchesPlain));}
const summary=[1000,5000,10000].map(blocks=>{
 const sets=costs.map(report=>report.rows.filter(row=>row.retained&&row.blocks===blocks));assert(sets.every(rows=>rows.length===3));
 for(const key of ['documentSha256','sharedSha256','sharedBytes'])assert.equal(new Set(sets.flat().map(row=>row[key])).size,1,key);
 const summaries=sets.map(rows=>({medianInitializationMs:median(rows.map(row=>row.initializationMs)),medianOfEditMediansMs:median(rows.map(row=>row.p50Ms)),maximumTimedEditMs:Math.max(...rows.map(row=>row.p95Ms)),sharedBytes:rows[0].sharedBytes,sharedSha256:rows[0].sharedSha256,trials:rows}));
 return {blocks,documentsAndEncodedBytesIdentical:true,before:summaries[0],after:summaries[1]};
});
const before=await read('retained-text-seed-before'),after=await read('retained-text-seed-after');for(const row of [before,after]){assert.equal(row.blocks,5000);assert.equal(row.exactDocument,true);assert.equal(row.domRequired,false)}assert(after.mapSizeEntries<before.mapSizeEntries);assert.equal(after.arrayEntries,before.arrayEntries);
const sessions=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-text-seed-session-${kind}`)));
const stages=row=>row.rows.map(({stage,sharedBytes,sharedV2Bytes,textDeltaOperations,containers})=>({stage,sharedBytes,sharedV2Bytes,textDeltaOperations,containers}));
for(const report of sessions){assert.equal(report.trials,3);assert.equal(report.cases.length,3);assert.equal(report.domRequired,false)}
const reference=sessions[0].cases[0];for(const row of sessions.flatMap(report=>report.cases)){assert.equal(row.edits,1024);assert.equal(row.exactConvergence,true);assert.equal(row.authorOnlyFullUndoRedo,true);assert.equal(row.reopenMatches,true);assert.deepEqual(row.released,{left:true,right:true,leftDoc:true,rightDoc:true});assert.equal(row.documentSha256,reference.documentSha256);assert.equal(row.sharedSha256,reference.sharedSha256);assert.deepEqual(stages(row),stages(reference));}
const interop=await read('retained-text-seed-interop');assert.equal(interop.passed,28);assert(interop.cases.every(row=>row.exactConvergence&&row.authorHistoryPreserved&&row.rootAndImagePreserved));
const report={baselineCommit:'744c2731',runtime:costs[0].runtime,summary,profiles:{before,after},sessions:{trialsPerBuild:3,editsPerTrial:1024,documentsAndEncodedBytesIdentical:true,allEditorsAndDocumentsReleased:true,stages:stages(reference)},interopJourneys:28,interpretation:'Fresh text capacity is validated/reserved before writes; ordinary operations keep fresh validation and per-insertion provenance. Encoded state matches the prior node-seeding candidate. Timing is diagnostic, not an adoption gate. Full projection/editing cost and history growth remain; no compaction, public adapter switch, version/limit increase or publication.'};
await writeFile('artifacts/retained-text-seed-comparison-20261106.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(summary.map(({blocks,before,after})=>({blocks,beforeInitializationMs:before.medianInitializationMs,afterInitializationMs:after.medianInitializationMs,beforeEditMs:before.medianOfEditMediansMs,afterEditMs:after.medianOfEditMediansMs,sharedBytes:after.sharedBytes}))));
