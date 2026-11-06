import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as Y from 'yjs';
assert.equal(typeof globalThis.gc,'function','Run with --expose-gc.');
const directory=process.argv[2],prefix=process.argv[3],blocks=Number(process.argv[4]??1000),edits=Number(process.argv[5]??64);
assert(directory&&prefix&&[blocks,edits].every(n=>Number.isSafeInteger(n)&&n>0));assert.equal(typeof globalThis.document,'undefined');
const {CoreExtension,composeExtensions,createEditor,createCollaborationExtension,getCollaborationState,Selection,insertText}=await import(`./${directory}/engine.js`);
const {RetainedYjsCollaborationAdapter}=await import(`./${directory}/retained-adapter.js`);
const memory=()=>{const value=process.memoryUsage();return {heap:value.heapUsed,buffers:value.arrayBuffers,total:value.heapUsed+value.arrayBuffers};};
const settle=async()=>{for(let index=0;index<4;index++){await new Promise(resolve=>setImmediate(resolve));globalThis.gc();}};
const content={type:'doc',attrs:{audit:'snapshot-cost'},content:Array.from({length:blocks},(_,index)=>({type:'paragraph',content:[{type:'text',text:`Alpha ${index}`}]}))};
function create(document,id){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis.crypto,'randomUUID');Object.defineProperty(globalThis.crypto,'randomUUID',{configurable:true,writable:true,value:()=> '11111111-2222-4333-8444-'+String(document.clientID).padStart(12,'0')});
 try{const adapter=new RetainedYjsCollaborationAdapter({document,captureTimeout:0,user:{id,name:id,color:'#7048e8'}}),kit=composeExtensions([CoreExtension,createCollaborationExtension({adapter:()=>adapter})]);return createEditor({schema:kit.schema,plugins:kit.plugins,content});}
 finally{if(descriptor)Object.defineProperty(globalThis.crypto,'randomUUID',descriptor);else delete globalThis.crypto.randomUUID;}
}
function countNodes(snapshots){const seen=new Set();for(const doc of snapshots)doc.descendants(node=>{seen.add(node);});return seen.size;}
const a=new Y.Doc(),b=new Y.Doc();a.clientID=101;b.clientID=202;const left=create(a,'left');Y.applyUpdate(b,Y.encodeStateAsUpdate(a));const right=create(b,'right');
let packets=[];const receive=update=>packets.push(update);a.on('update',receive);const middle=Math.floor(blocks/2),snapshots=[];
try{
 left.dispatch(left.createTransaction().setSelection(Selection.cursor([middle,0],2)));
 const edit=()=>{packets.length=0;assert.equal(insertText(left,'x'),true);for(const packet of packets)Y.applyUpdate(b,packet,'peer');assert.equal(getCollaborationState(left)?.status,'connected');assert.equal(getCollaborationState(right)?.status,'connected');assert.deepEqual(left.getJSON(),right.getJSON());};
 edit();edit();await settle();const before=memory();snapshots.push(right.state.doc);
 for(let index=0;index<edits;index++){edit();snapshots.push(right.state.doc);}
 packets=[];const uniqueModelNodes=countNodes(snapshots);
 for(let index=0;index<snapshots.length;index++)assert.equal(snapshots[index].child(middle).textContent,`Al${'x'.repeat(index+2)}pha ${middle}`);
 const expected=structuredClone(content);expected.content[middle].content[0].text=`Al${'x'.repeat(edits+2)}pha ${middle}`;
 const plain=composeExtensions([CoreExtension]),reference=createEditor({schema:plain.schema,plugins:plain.plugins,content:expected});try{assert.deepEqual(right.getJSON(),reference.getJSON());}finally{reference.destroy();}
 await settle();const held=memory(),snapshotCount=snapshots.length;snapshots.length=0;await settle();const cleared=memory();
 const aa=Y.encodeStateAsUpdate(a),bb=Y.encodeStateAsUpdate(b);assert.deepEqual(aa,bb);
 const report={runtime:process.version,directory,blocks,edits,warmups:2,snapshotCount,uniqueModelNodes,before,held,cleared,snapshotOverheadBytes:held.total-cleared.total,allSnapshotsRemainExact:true,exactConvergence:true,documentSha256:createHash('sha256').update(JSON.stringify(right.getJSON())).digest('hex'),sharedBytes:bb.length,sharedSha256:createHash('sha256').update(bb).digest('hex'),note:'Explicitly retain receiving-editor document snapshots, then clear them while keeping both editors/Ydocs alive. GC diagnostics, not general steady-state memory or CRDT compaction certification.'};
 await writeFile(`artifacts/${prefix}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{a.off('update',receive);snapshots.length=0;left.destroy();right.destroy();a.destroy();b.destroy();}
