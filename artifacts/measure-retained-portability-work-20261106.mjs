import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as Y from 'yjs';

const directory=process.argv[2],prefix=process.argv[3],blocks=Number(process.argv[4]??5000);
assert(directory&&prefix&&Number.isSafeInteger(blocks)&&blocks>0);
assert.equal(typeof globalThis.document,'undefined');
const {CoreExtension,composeExtensions,createEditor,createCollaborationExtension,getCollaborationState,Selection,insertText}=await import(`./${directory}/engine.js`);
const {RetainedYjsCollaborationAdapter}=await import(`./${directory}/retained-adapter.js`);
const doc=new Y.Doc();doc.clientID=1234567890;
const descriptor=Object.getOwnPropertyDescriptor(globalThis.crypto,'randomUUID');
Object.defineProperty(globalThis.crypto,'randomUUID',{configurable:true,writable:true,value:()=> '11111111-2222-4333-8444-555555555555'});
let editor;
const content={type:'doc',attrs:{audit:'portable-work'},content:Array.from({length:blocks},(_,index)=>({type:'paragraph',content:[{type:'text',text:`Alpha ${index}`}]}))};
try{
 const adapter=new RetainedYjsCollaborationAdapter({document:doc,captureTimeout:0,user:{id:'Ada',name:'Ada',color:'#7048e8'}});
 const kit=composeExtensions([CoreExtension,createCollaborationExtension({adapter:()=>adapter})]);
 editor=createEditor({schema:kit.schema,plugins:kit.plugins,content});
}finally{if(descriptor)Object.defineProperty(globalThis.crypto,'randomUUID',descriptor);else delete globalThis.crypto.randomUUID;}
const middle=Math.floor(blocks/2),original=JSON.stringify;
let calls=0;
try{
 editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([middle,0],2)));
 assert.equal(insertText(editor,'x'),true);assert.equal(insertText(editor,'x'),true);
 JSON.stringify=function(...args){calls++;return original.apply(this,args);};
 try{assert.equal(insertText(editor,'x'),true);}finally{JSON.stringify=original;}
 assert.equal(getCollaborationState(editor)?.status,'connected');
 const expected=structuredClone(content);expected.content[middle].content[0].text=`Alxxxpha ${middle}`;
 const plain=composeExtensions([CoreExtension]),reference=createEditor({schema:plain.schema,plugins:plain.plugins,content:expected});
 try{assert.deepEqual(editor.getJSON(),reference.getJSON());}finally{reference.destroy();}
 const state=Y.encodeStateAsUpdate(doc),result={runtime:process.version,directory,blocks,warmups:2,instrumentedEdits:1,jsonStringifyCallsDuringEdit:calls,documentMatchesPlain:true,documentSha256:createHash('sha256').update(JSON.stringify(editor.getJSON())).digest('hex'),sharedBytes:state.length,sharedSha256:createHash('sha256').update(state).digest('hex'),domRequired:false,note:'Counts actual JSON.stringify invocations during one real adapter edit. Restores JSON.stringify before correctness checks. Instrumented counts are separate from uninstrumented latency measurements.'};
 await writeFile(`artifacts/${prefix}.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{JSON.stringify=original;editor.destroy();doc.destroy();}
