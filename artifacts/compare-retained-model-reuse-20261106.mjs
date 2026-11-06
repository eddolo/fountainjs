import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const read=async name=>JSON.parse(await readFile(`artifacts/${name}-20261106.json`,'utf8'));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const costs=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-model-reuse-cost-${kind}`)));
assert.deepEqual(costs[0].identity,costs[1].identity);
for(const report of costs){assert.equal(report.trials,3);assert.equal(report.rows.length,18);assert(report.rows.every(row=>row.documentMatchesPlain));}
const summary=[1000,5000,10000].map(blocks=>{
 const sets=costs.map(report=>report.rows.filter(row=>row.retained&&row.blocks===blocks));assert(sets.every(rows=>rows.length===3));
 for(const key of ['documentSha256','sharedSha256','sharedBytes'])assert.equal(new Set(sets.flat().map(row=>row[key])).size,1,key);
 const summaries=sets.map(rows=>({medianInitializationMs:median(rows.map(row=>row.initializationMs)),medianOfEditMediansMs:median(rows.map(row=>row.p50Ms)),maximumTimedEditMs:Math.max(...rows.map(row=>row.p95Ms)),sharedBytes:rows[0].sharedBytes,sharedSha256:rows[0].sharedSha256,trials:rows}));
 return {blocks,documentsAndEncodedBytesIdentical:true,before:summaries[0],after:summaries[1]};
});
const sessions=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-model-reuse-session-${kind}`)));
const stages=row=>row.rows.map(({stage,sharedBytes,sharedV2Bytes,textDeltaOperations,containers})=>({stage,sharedBytes,sharedV2Bytes,textDeltaOperations,containers}));
for(const report of sessions){assert.equal(report.trials,3);assert.equal(report.cases.length,3);assert.equal(report.domRequired,false);}
const reference=sessions[0].cases[0];
for(const row of sessions.flatMap(report=>report.cases)){
 assert.equal(row.edits,1024);assert.equal(row.exactConvergence,true);assert.equal(row.authorOnlyFullUndoRedo,true);assert.equal(row.reopenMatches,true);
 assert.deepEqual(row.released,{left:true,right:true,leftDoc:true,rightDoc:true});
 assert.equal(row.documentSha256,reference.documentSha256);assert.equal(row.sharedSha256,reference.sharedSha256);assert.deepEqual(stages(row),stages(reference));
}
const interop=await read('retained-model-reuse-interop');assert.equal(interop.passed,28);assert(interop.cases.every(row=>row.exactConvergence&&row.authorHistoryPreserved&&row.rootAndImagePreserved));
const reads=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-model-reuse-counts-${kind}`)));
for(const row of reads){assert.equal(row.blocks,5000);assert.equal(row.documentMatchesPlain,true);}
for(const key of ['documentSha256','sharedSha256','sharedBytes'])assert.equal(reads[0][key],reads[1][key]);
assert.deepEqual(reads[1].counts,reads[0].counts);
const snapshotTrials=await Promise.all(['baseline','candidate'].map(kind=>Promise.all(['','-trial2','-trial3'].map(trial=>read(`retained-model-reuse-snapshots-${kind}${trial}`)))));
const snapshotReference=snapshotTrials[0][0];
for(const row of snapshotTrials.flat()){
 for(const [key,value] of Object.entries({blocks:1000,edits:64,warmups:2,snapshotCount:65,allSnapshotsRemainExact:true,exactConvergence:true}))assert.equal(row[key],value,key);
 for(const key of ['documentSha256','sharedSha256','sharedBytes'])assert.equal(row[key],snapshotReference[key],key);
 assert(row.snapshotOverheadBytes>0);
}
assert(snapshotTrials[0].every(row=>row.uniqueModelNodes===130065));
assert(snapshotTrials[1].every(row=>row.uniqueModelNodes===2193));
const snapshots={blocks:1000,incrementalRemoteEdits:64,snapshots:65,trialsPerBuild:3,documentsAndEncodedBytesIdentical:true,before:{uniqueModelNodes:130065,medianExtraMiB:median(snapshotTrials[0].map(row=>row.snapshotOverheadBytes/2**20)),trials:snapshotTrials[0]},after:{uniqueModelNodes:2193,medianExtraMiB:median(snapshotTrials[1].map(row=>row.snapshotOverheadBytes/2**20)),trials:snapshotTrials[1]},scope:'Explicitly held immutable receiving-editor snapshots, then cleared while both editors/Ydocs remain alive. Not general live-editor memory, bounded CRDT growth or compaction certification.'};
assert(snapshots.after.medianExtraMiB<snapshots.before.medianExtraMiB);
const peers=await Promise.all(['baseline','candidate'].map(kind=>read(`retained-model-reuse-peer-${kind}`)));
for(const report of peers){assert.equal(report.trials,1);assert.equal(report.domRequired,false);assert.equal(report.rows.length,3);assert(report.rows.every(row=>row.exactConvergence&&row.documentMatchesPlain));}
for(let index=0;index<3;index++){
 const before=peers[0].rows[index],after=peers[1].rows[index];assert.equal(before.blocks,after.blocks);
 for(const key of ['documentSha256','sharedSha256','sharedBytes','deliveredBytes'])assert.equal(before[key],after[key],key);
 for(const key of ['sharedModelUnchangedBlocks','editorUnchangedBlocks']){assert(before[key].every(count=>count===0));assert(after[key].every(count=>count===after.blocks-1));}
}
const publicBefore=await read('retained-model-reuse-public-before'),publicAfter=[];
async function walk(folder){for(const item of await readdir(folder,{withFileTypes:true})){const path=folder+'/'+item.name;if(item.isDirectory())await walk(path);else if(/\.(?:js|cjs|css)$/.test(path)){const data=await readFile(path);publicAfter.push({path,bytes:data.length,gzipBytes:gzipSync(data).length,sha256:createHash('sha256').update(data).digest('hex')});}}}
await walk('dist');publicAfter.sort((a,b)=>a.path.localeCompare(b.path));
const beforeMap=new Map(publicBefore.map(row=>[row.path,row])),afterMap=new Map(publicAfter.map(row=>[row.path,row]));
const total=rows=>({files:rows.length,bytes:rows.reduce((n,row)=>n+row.bytes,0),gzipBytes:rows.reduce((n,row)=>n+row.gzipBytes,0)});
const publicRuntime={before:total(publicBefore),after:total(publicAfter),changed:publicAfter.filter(row=>beforeMap.has(row.path)&&row.sha256!==beforeMap.get(row.path).sha256).map(row=>({path:row.path,before:beforeMap.get(row.path),after:row})),added:publicAfter.filter(row=>!beforeMap.has(row.path)),removed:publicBefore.filter(row=>!afterMap.has(row.path)),unchanged:publicAfter.filter(row=>row.sha256===beforeMap.get(row.path)?.sha256).length};
assert.equal(afterMap.get('dist/styles.css')?.sha256,beforeMap.get('dist/styles.css')?.sha256);
await writeFile('artifacts/retained-model-reuse-public-after-20261106.json',JSON.stringify(publicAfter,null,2)+'\n');
const report={baselineCommit:'bd28559c',runtime:costs[0].runtime,summary,readCounts:{before:reads[0],after:reads[1]},snapshots,peerDiagnostic:{trialsPerBuild:1,before:peers[0],after:peers[1],scope:'Exploratory paired local/receiver timing, not a general latency or competitive claim.'},publicRuntime,sessions:{trialsPerBuild:3,editsPerTrial:1024,documentsAndEncodedBytesIdentical:true,allEditorsAndDocumentsReleased:true,stages:stages(reference)},interopJourneys:28,interpretation:'Reuse already-owned deeply immutable model nodes only after freshly decoding and validating their current shared contents and checking exact child identity, normalized attributes, marks and bindings. Per-read ownership prevents identity aliasing; mutable host defaults and custom text validators retain fresh factory behavior. Primary measured benefit is memory for explicitly retained immutable snapshots. No general typing-speed claim, default switch, compaction, migration, version/limit increase or publication.'};
await writeFile('artifacts/retained-model-reuse-comparison-20261106.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary.map(({blocks,before,after})=>({blocks,beforeInitializationMs:before.medianInitializationMs,afterInitializationMs:after.medianInitializationMs,beforeEditMs:before.medianOfEditMediansMs,afterEditMs:after.medianOfEditMediansMs,sharedBytes:after.sharedBytes}))));
