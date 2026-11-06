import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as Y from 'yjs';
const directory=process.argv[2],prefix=process.argv[3],trials=Number(process.argv[4]??1),sizes=(process.argv[5]??'1000,5000,10000').split(',').map(Number);
assert(directory&&prefix&&Number.isSafeInteger(trials)&&trials>0&&sizes.every(n=>Number.isSafeInteger(n)&&n>0));assert.equal(typeof globalThis.document,'undefined');
const {CoreExtension,composeExtensions,createEditor,createCollaborationExtension,getCollaborationState,Selection,insertText}=await import(`./${directory}/engine.js`);
const {RetainedYjsCollaborationAdapter}=await import(`./${directory}/retained-adapter.js`);
const hash=value=>createHash('sha256').update(value).digest('hex'),median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
function create(document,id,content){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis.crypto,'randomUUID');Object.defineProperty(globalThis.crypto,'randomUUID',{configurable:true,writable:true,value:()=> '11111111-2222-4333-8444-'+String(document.clientID).padStart(12,'0')});
 try{const adapter=new RetainedYjsCollaborationAdapter({document,captureTimeout:0,user:{id,name:id,color:'#7048e8'}}),kit=composeExtensions([CoreExtension,createCollaborationExtension({adapter:()=>adapter})]);return {editor:createEditor({schema:kit.schema,plugins:kit.plugins,content}),adapter};}
 finally{if(descriptor)Object.defineProperty(globalThis.crypto,'randomUUID',descriptor);else delete globalThis.crypto.randomUUID;}
}
const rows=[];
for(let trial=1;trial<=trials;trial++)for(const blocks of sizes){
 const content={type:'doc',attrs:{audit:'peer-cost'},content:Array.from({length:blocks},(_,index)=>({type:'paragraph',content:[{type:'text',text:`Alpha ${index}`}]}))};
 const a=new Y.Doc(),b=new Y.Doc();a.clientID=101;b.clientID=202;const left=create(a,'left',content);Y.applyUpdate(b,Y.encodeStateAsUpdate(a));const right=create(b,'right',content);
 const middle=Math.floor(blocks/2);left.editor.dispatch(left.editor.createTransaction().setSelection(Selection.cursor([middle,0],2)));
 const packets=[];const receive=update=>packets.push(update);a.on('update',receive);
 const local=[],remote=[],sharedCounts=[],editorCounts=[];let deliveredBytes=0;
 try{
  for(let edit=0;edit<14;edit++){
   packets.length=0;const beforeStore=right.adapter.store.model,beforeEditor=right.editor.state.doc;
   let start=performance.now();assert.equal(insertText(left.editor,'x'),true);const localMs=performance.now()-start;
   start=performance.now();for(const packet of packets){Y.applyUpdate(b,packet,'peer');deliveredBytes+=packet.length;}const remoteMs=performance.now()-start;
   assert.equal(getCollaborationState(left.editor)?.status,'connected');assert.equal(getCollaborationState(right.editor)?.status,'connected');
   assert.deepEqual(left.editor.getJSON(),right.editor.getJSON());
   if(edit>=2){local.push(localMs);remote.push(remoteMs);sharedCounts.push(right.adapter.store.model.content.filter((node,index)=>index!==middle&&node===beforeStore.child(index)).length);editorCounts.push(right.editor.state.doc.content.filter((node,index)=>index!==middle&&node===beforeEditor.child(index)).length);}
  }
  const expected=structuredClone(content);expected.content[middle].content[0].text=`Al${'x'.repeat(14)}pha ${middle}`;
  const plain=composeExtensions([CoreExtension]),reference=createEditor({schema:plain.schema,plugins:plain.plugins,content:expected});try{assert.deepEqual(right.editor.getJSON(),reference.getJSON());}finally{reference.destroy();}
  const aa=Y.encodeStateAsUpdate(a),bb=Y.encodeStateAsUpdate(b);assert.deepEqual(aa,bb);
  const row={trial,blocks,warmups:2,timedEdits:12,localMedianMs:median(local),remoteMedianMs:median(remote),localMaxMs:Math.max(...local),remoteMaxMs:Math.max(...remote),sharedModelUnchangedBlocks:sharedCounts,editorUnchangedBlocks:editorCounts,deliveredBytes,documentSha256:hash(JSON.stringify(right.editor.getJSON())),sharedBytes:bb.length,sharedSha256:hash(bb),exactConvergence:true,documentMatchesPlain:true};rows.push(row);console.log(JSON.stringify(row));
 }finally{a.off('update',receive);left.editor.destroy();right.editor.destroy();a.destroy();b.destroy();}
}
await writeFile(`artifacts/${prefix}.json`,JSON.stringify({runtime:process.version,directory,trials,sizes,domRequired:false,rows,note:'Actual paired adapters and incremental update packets; two warmups, twelve timed edits. Counts inspect private store model only for diagnostics, not a public API. No DOM/render/latency certification.'},null,2)+'\n');
