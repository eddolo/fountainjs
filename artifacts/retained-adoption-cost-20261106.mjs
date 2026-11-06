import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as Y from 'yjs';
import {CoreExtension,composeExtensions,createEditor,Selection,insertText} from './cursor-overlay-build-20261106/engine.js';
import {createRetainedYjsCollaborationExtension} from './cursor-overlay-build-20261106/retained-adapter.js';
const sizes=(process.argv[2]??'100').split(',').map(Number),prefix=process.argv[3]??'retained-adoption-cost-20261106',edits=12,rows=[];
assert(sizes.every(size=>Number.isSafeInteger(size)&&size>0),'Supply positive integer paragraph counts. Larger runs are deliberate diagnostics.');
for(const blocks of sizes){let reference;
 for(const retained of [false,true]){
  const shared=new Y.Doc(),content={type:'doc',attrs:{audit:'cost'},content:Array.from({length:blocks},(_,i)=>({type:'paragraph',content:[{type:'text',text:`Alpha ${i}`}]}))};
  const kit=composeExtensions([CoreExtension,...retained?[createRetainedYjsCollaborationExtension({document:shared,captureTimeout:0,user:{id:'bench',name:'Bench',color:'#7048e8'}})]:[]]);
  const start=performance.now(),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content}),initializationMs=performance.now()-start;
  try{
   editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([Math.floor(blocks/2),0],2)));const samples=[];
   for(let i=0;i<edits;i++){const at=performance.now();assert.equal(insertText(editor,'x'),true);samples.push(performance.now()-at)}
   const size=Object.getOwnPropertyDescriptor(Y.Map.prototype,'size');let calls=0,reportedEntries=0;const names=new Map(),counts=new Map();for(const [name,map] of shared.share)names.set(map,name);
   Object.defineProperty(Y.Map.prototype,'size',{...size,get(){const value=size.get.call(this);calls++;reportedEntries+=value;const name=names.get(this)??'nested map';const row=counts.get(name)??{calls:0,reportedEntries:0};row.calls++;row.reportedEntries+=value;counts.set(name,row);return value}});
   try{assert.equal(insertText(editor,'z'),true)}finally{Object.defineProperty(Y.Map.prototype,'size',size)}
   const json=editor.getJSON();if(!retained)reference=json;else assert.deepEqual(json,reference);
   samples.sort((a,b)=>a-b);const row={blocks,retained,initializationMs,p50Ms:samples[Math.floor(samples.length/2)],p95Ms:samples.at(-1),edits,documentMatchesPlain:true,documentSha256:createHash('sha256').update(JSON.stringify(json)).digest('hex'),sharedBytes:retained?Y.encodeStateAsUpdate(shared).length:0,diagnosticExtraEdit:{sizeGetterCalls:calls,sumReportedMapEntries:reportedEntries,byContainer:Object.fromEntries(counts)}};rows.push(row);console.log(JSON.stringify({...row,diagnosticExtraEdit:{sizeGetterCalls:calls,sumReportedMapEntries:reportedEntries}}));
  }finally{editor.destroy();shared.destroy()}
 }
}
await writeFile(`artifacts/${prefix}.json`,JSON.stringify({runtime:process.version,domRequired:false,trials:1,note:'Diagnostic, not a budget or competitive benchmark. Timed edits exclude getter instrumentation; one additional edit counts public Y.Map.size calls.',rows},null,2)+'\n');
