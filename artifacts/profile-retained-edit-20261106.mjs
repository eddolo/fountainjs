import assert from 'node:assert/strict';
import {Session} from 'node:inspector/promises';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as Y from 'yjs';
const directory=process.argv[2]??'cursor-overlay-build-20261106',prefix=process.argv[3]??'retained-edit-before-20261106',blocks=Number(process.argv[4]??5000);
assert(Number.isSafeInteger(blocks)&&blocks>0);assert.equal(typeof globalThis.document,'undefined');
const engine=await import(`./${directory}/engine.js`),{createRetainedYjsCollaborationExtension}=await import(`./${directory}/retained-adapter.js`);
const {CoreExtension,composeExtensions,createEditor,getCollaborationState,Selection,insertText}=engine;
const content={type:'doc',attrs:{audit:'edit-profile'},content:Array.from({length:blocks},(_,index)=>({type:'paragraph',content:[{type:'text',text:`Alpha ${index}`}]}))};
const shared=new Y.Doc();shared.clientID=1234567890;const kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document:shared,captureTimeout:0,user:{id:'profile',name:'Profile',color:'#7048e8'}})]);
const descriptor=Object.getOwnPropertyDescriptor(globalThis.crypto,'randomUUID');Object.defineProperty(globalThis.crypto,'randomUUID',{configurable:true,writable:true,value:()=> '11111111-2222-4333-8444-555555555555'});
let editor;try{editor=createEditor({schema:kit.schema,plugins:kit.plugins,content})}finally{if(descriptor)Object.defineProperty(globalThis.crypto,'randomUUID',descriptor);else delete globalThis.crypto.randomUUID}
const session=new Session();session.connect();
try{
 assert.equal(getCollaborationState(editor)?.status,'connected');const middle=Math.floor(blocks/2);editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([middle,0],2)));
 for(let index=0;index<8;index++)assert.equal(insertText(editor,'x'),true);
 await session.post('Profiler.enable');await session.post('Profiler.start');const samples=[];
 for(let index=0;index<12;index++){const start=performance.now();assert.equal(insertText(editor,'x'),true);samples.push(performance.now()-start)}
 const {profile}=await session.post('Profiler.stop');await writeFile(`artifacts/${prefix}.cpuprofile`,JSON.stringify(profile));
 assert.equal(getCollaborationState(editor)?.status,'connected');const expected=structuredClone(content);expected.content[middle].content[0].text=`Al${'x'.repeat(20)}pha ${middle}`;
 const plain=composeExtensions([CoreExtension]),reference=createEditor({schema:plain.schema,plugins:plain.plugins,content:expected});try{assert.deepEqual(editor.getJSON(),reference.getJSON())}finally{reference.destroy()}
 const state=Y.encodeStateAsUpdate(shared),report={runtime:process.version,directory,blocks,warmupEdits:8,profiledEdits:12,samples,documentMatchesPlain:true,sharedBytes:state.length,sharedSha256:createHash('sha256').update(state).digest('hex'),note:'Initialization excluded; twelve actual candidate edits after eight warmups. CPU sampling affects timing. No acceptance limit changed.'};
 await writeFile(`artifacts/${prefix}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{session.disconnect();editor?.destroy();shared.destroy()}
