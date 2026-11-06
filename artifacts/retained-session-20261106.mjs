import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as Y from 'yjs';
assert.equal(typeof globalThis.gc,'function','Run with --expose-gc.');
const edits=Number(process.argv[2]??1024),prefix=process.argv[3]??'retained-session-20261106';assert(Number.isSafeInteger(edits)&&edits>0);
const directory=process.argv[4]??'cursor-overlay-build-20261106';
const trials=Number(process.argv[5]??1);assert(Number.isSafeInteger(trials)&&trials>0);
const {CoreExtension,composeExtensions,createEditor,Selection,insertText,undoCollaboration,redoCollaboration,getCollaborationState}=await import(`./${directory}/engine.js`);
const {createRetainedYjsCollaborationExtension}=await import(`./${directory}/retained-adapter.js`);
const source={type:'doc',attrs:{audit:'long-session'},content:[{type:'paragraph',content:[{type:'text',text:'Alpha'}]},{type:'image_super',attrs:{src:'/figure.png',alt:'Retained figure'}}]};
const memory=()=>{const m=process.memoryUsage();return {heapUsed:m.heapUsed,arrayBuffers:m.arrayBuffers,total:m.heapUsed+m.arrayBuffers}};
const settle=async()=>{for(let i=0;i<4;i++){await new Promise(resolve=>setImmediate(resolve));globalThis.gc()}};
const create=(document,id)=>{const kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document,captureTimeout:0,user:{id,name:id,color:'#7048e8'}})]),descriptor=Object.getOwnPropertyDescriptor(globalThis.crypto,'randomUUID');
 Object.defineProperty(globalThis.crypto,'randomUUID',{configurable:true,writable:true,value:()=> '11111111-2222-4333-8444-'+String(document.clientID).padStart(12,'0')});
 try{return createEditor({schema:kit.schema,plugins:kit.plugins,content:source})}finally{if(descriptor)Object.defineProperty(globalThis.crypto,'randomUUID',descriptor);else delete globalThis.crypto.randomUUID}
};
const metrics=document=>({sharedBytes:Y.encodeStateAsUpdate(document).length,sharedV2Bytes:Y.encodeStateAsUpdateV2(document).length,textDeltaOperations:[...document.getMap('fountain-text:texts').values()].reduce((sum,text)=>sum+(text instanceof Y.Text?text.toDelta().length:0),0),containers:Object.fromEntries([...document.share].map(([name,value])=>[name,value instanceof Y.Map?value.size:value instanceof Y.Array||value instanceof Y.XmlFragment?value.length:null]))});
function run(trial){
 const a=new Y.Doc(),b=new Y.Doc();a.clientID=101;b.clientID=202;const left=create(a,'left');Y.applyUpdate(b,Y.encodeStateAsUpdate(a));const right=create(b,'right');
 const references={left:new WeakRef(left),right:new WeakRef(right),leftDoc:new WeakRef(a),rightDoc:new WeakRef(b)};
 const rows=[],samples=[],image=left.getJSON().content.at(-1);
 const sync=()=>{const aa=Y.encodeStateAsUpdate(a),bb=Y.encodeStateAsUpdate(b);Y.applyUpdate(a,bb);Y.applyUpdate(b,aa);assert.deepEqual(left.getJSON(),right.getJSON());for(const editor of [left,right])assert.equal(getCollaborationState(editor)?.status,'connected')};
 const checkpoint=stage=>{const row={trial,stage,...metrics(a),memory:memory(),editMedianMs:samples.length?[...samples].sort((a,b)=>a-b)[Math.floor(samples.length/2)]:null,editMaxMs:samples.length?Math.max(...samples):null};rows.push(row);console.log(JSON.stringify(row));samples.length=0};
 try{
  checkpoint('seed');left.dispatch(left.createTransaction().setSelection(Selection.cursor([0,0],5)));right.dispatch(right.createTransaction().setSelection(Selection.cursor([0,0],2)));assert.equal(insertText(right,'Q'),true);
  for(let i=1;i<=edits;i++){const start=performance.now();assert.equal(insertText(left,'x'),true);samples.push(performance.now()-start);if(i%128===0||i===edits){assert.equal(left.state.doc.child(0).textContent,'Alpha'+'x'.repeat(i));assert.deepEqual(left.getJSON().content.at(-1),image);checkpoint('edit-'+i)}}
  sync();assert.equal(left.state.doc.child(0).textContent,'AlQpha'+'x'.repeat(edits));const final=left.getJSON();checkpoint('converged');
  const undoStart=performance.now();for(let i=0;i<edits;i++)assert.equal(undoCollaboration(left),true);const undoMs=performance.now()-undoStart;sync();assert.equal(left.state.doc.child(0).textContent,'AlQpha');assert.deepEqual(left.getJSON().content.at(-1),image);checkpoint('all-undone');
  const redoStart=performance.now();for(let i=0;i<edits;i++)assert.equal(redoCollaboration(left),true);const redoMs=performance.now()-redoStart;sync();assert.deepEqual(left.getJSON(),final);checkpoint('all-redone');
  const reopenedDoc=new Y.Doc();reopenedDoc.clientID=303;let reopened;
  try{Y.applyUpdate(reopenedDoc,Y.encodeStateAsUpdate(a));reopened=create(reopenedDoc,'reopened');assert.deepEqual(reopened.getJSON(),final)}finally{reopened?.destroy();reopenedDoc.destroy()}
  return {references,rows,edits,undoMs,redoMs,documentSha256:createHash('sha256').update(JSON.stringify(final)).digest('hex'),sharedSha256:createHash('sha256').update(Y.encodeStateAsUpdate(a)).digest('hex'),exactConvergence:true,authorOnlyFullUndoRedo:true,reopenMatches:true};
 }finally{left.destroy();right.destroy();a.destroy();b.destroy()}
}
const cases=[];
for(let trial=1;trial<=trials;trial++){
 await settle();const before=memory(),result=run(trial);await settle();const after=memory(),released=Object.fromEntries(Object.entries(result.references).map(([name,reference])=>[name,reference.deref()===undefined]));delete result.references;
 const entry={trial,before,after,released,retainedDelta:after.total-before.total,...result};cases.push(entry);console.log(JSON.stringify({trial,edits,undoMs:result.undoMs,redoMs:result.redoMs,released,retainedDelta:entry.retainedDelta}));
}
const receipt={runtime:process.version,directory,trials,domRequired:false,deterministicIdentities:true,cases,note:'Exploratory sessions, not a memory/latency acceptance gate. Timed insertions exclude metrics/JSON assertions. Full author undo/redo with one offline peer edit and reopen. V2 is measured only; no transport setting is changed.'};
await writeFile(`artifacts/${prefix}.json`,JSON.stringify(receipt,null,2)+'\n');
