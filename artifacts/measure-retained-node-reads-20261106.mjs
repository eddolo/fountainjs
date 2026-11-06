import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as Y from 'yjs';
const directory=process.argv[2],prefix=process.argv[3],blocks=Number(process.argv[4]??5000);
assert(directory&&prefix&&Number.isSafeInteger(blocks)&&blocks>0);assert.equal(typeof globalThis.document,'undefined');
const {CoreExtension,composeExtensions,createEditor,getCollaborationState,Selection,insertText}=await import(`./${directory}/engine.js`);
const {createRetainedYjsCollaborationExtension}=await import(`./${directory}/retained-adapter.js`);
const content={type:'doc',attrs:{audit:'node-read-counts'},content:Array.from({length:blocks},(_,index)=>({type:'paragraph',content:[{type:'text',text:`Alpha ${index}`}]}))};
const shared=new Y.Doc();shared.clientID=1234567890;
const kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document:shared,captureTimeout:0,user:{id:'reads',name:'Read counts',color:'#7048e8'}})]);
const descriptor=Object.getOwnPropertyDescriptor(globalThis.crypto,'randomUUID');Object.defineProperty(globalThis.crypto,'randomUUID',{configurable:true,writable:true,value:()=> '11111111-2222-4333-8444-555555555555'});
let editor;try{editor=createEditor({schema:kit.schema,plugins:kit.plugins,content});}finally{if(descriptor)Object.defineProperty(globalThis.crypto,'randomUUID',descriptor);else delete globalThis.crypto.randomUUID;}
try{
 assert.equal(getCollaborationState(editor)?.status,'connected');const middle=Math.floor(blocks/2);
 editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([middle,0],2)));
 const labels=new Map([[shared.getMap('fountain-nodes:nodes'),'nodePool'],[shared.getMap('fountain-nodes:placements'),'placements']]);
 const counts={nodePool:0,placements:0},get=Y.Map.prototype.get;
 Y.Map.prototype.get=function(key){const label=labels.get(this);if(label)counts[label]++;return get.call(this,key);};
 try{assert.equal(insertText(editor,'X'),true);}finally{Y.Map.prototype.get=get;}
 assert.equal(getCollaborationState(editor)?.status,'connected');
 const expected=structuredClone(content);expected.content[middle].content[0].text=`AlXpha ${middle}`;
 const plain=composeExtensions([CoreExtension]),reference=createEditor({schema:plain.schema,plugins:plain.plugins,content:expected});try{assert.deepEqual(editor.getJSON(),reference.getJSON());}finally{reference.destroy();}
 const state=Y.encodeStateAsUpdate(shared),report={runtime:process.version,directory,blocks,counts,documentMatchesPlain:true,documentSha256:createHash('sha256').update(JSON.stringify(editor.getJSON())).digest('hex'),sharedBytes:state.length,sharedSha256:createHash('sha256').update(state).digest('hex'),note:'One actual candidate edit, instrumenting only top-level node/placement Map.get calls. Instrumentation restored before assertions. Diagnostic counts, not latency/acceptance limits.'};
 await writeFile(`artifacts/${prefix}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{editor?.destroy();shared.destroy();}
