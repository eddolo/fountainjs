import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const read=async name=>JSON.parse(await readFile(`artifacts/${name}-20261106.json`,'utf8'));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const costs=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-seed-cost-${kind}`)));
assert.deepEqual(costs[0].identity,costs[1].identity);
for(const report of costs){assert.equal(report.trials,3);assert.equal(report.rows.length,18);assert(report.rows.every(row=>row.documentMatchesPlain));}
const summary=[100,500,1000].map(blocks=>{
 const sets=costs.map(report=>report.rows.filter(row=>row.retained&&row.blocks===blocks));assert(sets.every(rows=>rows.length===3));
 assert.equal(new Set(sets.flat().map(row=>row.documentSha256)).size,1);
 const summaries=sets.map(rows=>{
  for(const key of ['sharedBytes','sharedSha256'])assert.equal(new Set(rows.map(row=>row[key])).size,1);
  return {medianInitializationMs:median(rows.map(row=>row.initializationMs)),medianOfEditMediansMs:median(rows.map(row=>row.p50Ms)),maximumTimedEditMs:Math.max(...rows.map(row=>row.p95Ms)),sharedBytes:rows[0].sharedBytes,sharedSha256:rows[0].sharedSha256,trials:rows};
 });
 return {blocks,documentsMatch:true,encodedBytesIdentical:summaries[0].sharedSha256===summaries[1].sharedSha256,before:summaries[0],after:summaries[1]};
});
const profileBefore=await read('retained-seed-before'),profileAfter=await read('retained-seed-after');
for(const row of [profileBefore,profileAfter]){assert.equal(row.blocks,1000);assert.equal(row.exactDocument,true);assert.equal(row.domRequired,false)}
assert(profileAfter.arrayEntries<profileBefore.arrayEntries);assert(profileAfter.mapSizeEntries<profileBefore.mapSizeEntries);
const interop=await read('retained-seed-interop');assert.equal(interop.passed,28);assert(interop.cases.every(row=>row.exactConvergence&&row.authorHistoryPreserved&&row.rootAndImagePreserved));
const sessions=await read('retained-seed-session');assert.equal(sessions.trials,3);assert.equal(sessions.cases.length,3);
for(const row of sessions.cases){assert.equal(row.edits,1024);assert.equal(row.exactConvergence,true);assert.equal(row.authorOnlyFullUndoRedo,true);assert.equal(row.reopenMatches,true);assert.deepEqual(row.released,{left:true,right:true,leftDoc:true,rightDoc:true});assert.equal(row.documentSha256,sessions.cases[0].documentSha256);assert.equal(row.sharedSha256,sessions.cases[0].sharedSha256)}
const report={baselineCommit:'77eb75a5',runtime:costs[0].runtime,summary,initializationProfiles:{before:profileBefore,after:profileAfter},compatibility:{journeys:28,seedDirections:2,exchangeOrders:2,kinds:['quote','bullet','ordered','task','mark','split','move'],legacyPublicAdapterMigrated:false},session:{trials:3,editsPerTrial:1024,allEditorsAndDocumentsReleased:true,stages:sessions.cases[0].rows.map(({stage,sharedBytes,sharedV2Bytes,textDeltaOperations})=>({stage,sharedBytes,sharedV2Bytes,textDeltaOperations}))},interpretation:'Fresh bulk node seeding avoids repeated validation of growing child/pool state. Ordinary edits retain fresh validation. New seed write order changes encoded bytes; both candidate build directions interoperate. This is not a representation version change or migration of the public legacy adapter. Text-pool initialization, full projection, history growth, compaction and adoption remain open. Timings are diagnostics, not new acceptance gates.'};
await writeFile('artifacts/retained-seed-comparison-20261106.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(summary.map(({blocks,before,after})=>({blocks,beforeInitializationMs:before.medianInitializationMs,afterInitializationMs:after.medianInitializationMs,beforeEditMs:before.medianOfEditMediansMs,afterEditMs:after.medianOfEditMediansMs,beforeSharedBytes:before.sharedBytes,afterSharedBytes:after.sharedBytes}))));
