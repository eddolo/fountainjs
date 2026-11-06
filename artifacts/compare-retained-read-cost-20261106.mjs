import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const read=async name=>JSON.parse(await readFile(`artifacts/${name}.json`,'utf8'));
const before=await read('retained-read-controlled-baseline-fixed-20261106'),after=await read('retained-read-controlled-candidate-fixed-20261106');
assert.equal(before.trials,3);assert.equal(after.trials,3);assert.deepEqual(before.identity,after.identity);
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const summary=[];
for(const blocks of [100,500]){
 const old=before.rows.filter(row=>row.blocks===blocks&&row.retained),next=after.rows.filter(row=>row.blocks===blocks&&row.retained);
 assert.equal(old.length,3);assert.equal(next.length,3);
 const all=[...old,...next];assert(all.every(row=>row.documentMatchesPlain));
 assert.equal(new Set(all.map(row=>row.documentSha256)).size,1);assert.equal(new Set(all.map(row=>row.sharedSha256)).size,1);assert.equal(new Set(all.map(row=>row.sharedBytes)).size,1);
 const metrics=rows=>({medianOfEditMediansMs:median(rows.map(row=>row.p50Ms)),editMediansMs:rows.map(row=>row.p50Ms),maximumSampleMs:Math.max(...rows.map(row=>row.p95Ms)),medianInitializationMs:median(rows.map(row=>row.initializationMs)),getterCalls:rows[0].diagnosticExtraEdit.sizeGetterCalls,sumReportedCardinalities:rows[0].diagnosticExtraEdit.sumReportedMapEntries});
 const previous=metrics(old),candidate=metrics(next);summary.push({blocks,before:previous,after:candidate,medianEditSpeedup:previous.medianOfEditMediansMs/candidate.medianOfEditMediansMs,sharedBytes:old[0].sharedBytes,sharedSha256:old[0].sharedSha256,documentSha256:old[0].documentSha256,identicalSharedBytesAcrossAllTrials:true});
}
await writeFile('artifacts/retained-read-controlled-comparison-20261106.json',JSON.stringify({baselineCommit:'10170139',trials:3,scope:'Actual compiled adapter; fixed isolated identities. Instrumentation is excluded from edit samples. This is not a competitive benchmark or full adoption certification.',summary},null,2)+'\n');
console.log(JSON.stringify(summary));
