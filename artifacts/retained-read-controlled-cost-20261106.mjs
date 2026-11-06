import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as Y from 'yjs';
const directory=process.argv[2]??'cursor-overlay-build-20261106',prefix=process.argv[3]??'retained-read-controlled-candidate-20261106',trials=Number(process.argv[4]??3),sizes=(process.argv[5]??'100,500').split(',').map(Number);
assert(Number.isSafeInteger(trials)&&trials>0&&sizes.every(size=>Number.isSafeInteger(size)&&size>0));
const {CoreExtension,composeExtensions,createEditor,Selection,insertText}=await import(`./${directory}/engine.js`);
const {createRetainedYjsCollaborationExtension}=await import(`./${directory}/retained-adapter.js`);
const rows=[],edits=12,digest=value=>createHash('sha256').update(value).digest('hex');
for(let trial=1;trial<=trials;trial++)for(const blocks of sizes){let reference;
 for(const retained of [false,true]){
  const shared=new Y.Doc();shared.clientID=1234567890;
  const content={type:'doc',attrs:{audit:'cost'},content:Array.from({length:blocks},(_,i)=>({type:'paragraph',content:[{type:'text',text:`Alpha ${i}`}]}))};
  // Deterministic identity is confined to this offline diagnostic process.
  // Each case has one isolated controller and is never merged or networked.
  const kit=composeExtensions([CoreExtension,...retained?[createRetainedYjsCollaborationExtension({document:shared,captureTimeout:0,user:{id:'bench',name:'Bench',color:'#7048e8'}})]:[]]);
  const descriptor=Object.getOwnPropertyDescriptor(globalThis.crypto,'randomUUID');let editor;
  Object.defineProperty(globalThis.crypto,'randomUUID',{configurable:true,writable:true,value:()=> '11111111-2222-4333-8444-555555555555'});
  const start=performance.now();
  try{editor=createEditor({schema:kit.schema,plugins:kit.plugins,content})}
  finally{if(descriptor)Object.defineProperty(globalThis.crypto,'randomUUID',descriptor);else delete globalThis.crypto.randomUUID}
  const initializationMs=performance.now()-start;
  try{
   editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([Math.floor(blocks/2),0],2)));const samples=[];
   for(let i=0;i<edits;i++){const at=performance.now();assert.equal(insertText(editor,'x'),true);samples.push(performance.now()-at)}
   const size=Object.getOwnPropertyDescriptor(Y.Map.prototype,'size');let calls=0,reportedEntries=0;const names=new Map(),counts=new Map();for(const [name,map] of shared.share)names.set(map,name);
   Object.defineProperty(Y.Map.prototype,'size',{...size,get(){const value=size.get.call(this);calls++;reportedEntries+=value;const name=names.get(this)??'nested map',row=counts.get(name)??{calls:0,reportedEntries:0};row.calls++;row.reportedEntries+=value;counts.set(name,row);return value}});
   try{assert.equal(insertText(editor,'z'),true)}finally{Object.defineProperty(Y.Map.prototype,'size',size)}
   const json=editor.getJSON();if(!retained)reference=json;else assert.deepEqual(json,reference);
   const state=Y.encodeStateAsUpdate(shared);samples.sort((a,b)=>a-b);
   if(retained)assert.equal(shared.getXmlFragment('fountain').get(0).getAttribute('room'),'r-11111111-2222-4333-8444-555555555555');
   const row={trial,blocks,retained,initializationMs,p50Ms:samples[Math.floor(samples.length/2)],p95Ms:samples.at(-1),edits,documentMatchesPlain:true,documentSha256:digest(JSON.stringify(json)),sharedBytes:retained?state.length:0,sharedSha256:retained?digest(state):null,diagnosticExtraEdit:{sizeGetterCalls:calls,sumReportedMapEntries:reportedEntries,byContainer:Object.fromEntries(counts)}};rows.push(row);console.log(JSON.stringify({...row,diagnosticExtraEdit:{sizeGetterCalls:calls,sumReportedMapEntries:reportedEntries}}));
  }finally{editor.destroy();shared.destroy()}
 }
}
await writeFile(`artifacts/${prefix}.json`,JSON.stringify({runtime:process.version,directory,domRequired:false,trials,identity:{clientID:1234567890,controllerUUID:'11111111-2222-4333-8444-555555555555',scope:'Diagnostic process only, one isolated document per case.'},note:'Twelve timed edits; one extra edit counts public Y.Map.size calls. No acceptance limit changed. Not a competitive benchmark.',rows},null,2)+'\n');
