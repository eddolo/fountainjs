import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import * as Y from 'yjs';
const {CoreExtension,composeExtensions,createEditor}=await import('./retained-checkpoint-build-20261106/engine.js');
const {createRetainedYjsCollaborationExtension}=await import('./retained-checkpoint-build-20261106/retained-adapter.js');
const {captureRetainedCheckpoint,restoreRetainedCheckpoint}=await import('./retained-checkpoint-build-20261106/checkpoint.js');
assert.equal(typeof globalThis.gc,'function');assert.equal(typeof globalThis.document,'undefined');
const content={type:'doc',attrs:{title:'Owned checkpoint'},content:[{type:'paragraph',content:[{type:'text',text:'Retain the archive, release the source'}]}]};
async function create(){
 const document=new Y.Doc(),kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document,user:{id:'Ada',name:'Ada',color:'#7048e8'}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content});
 const references={document:new WeakRef(document),editor:new WeakRef(editor),schema:new WeakRef(editor.state.schema)};
 try{return {checkpoint:await captureRetainedCheckpoint(document,editor.state.schema,'release-1'),expected:JSON.parse(JSON.stringify(editor.getJSON())),references}}
 finally{editor.destroy();document.destroy()}
}
const held=await create();
for(let i=0;i<4;i++){await new Promise(resolve=>setImmediate(resolve));globalThis.gc()}
const released=Object.fromEntries(Object.entries(held.references).map(([name,ref])=>[name,ref.deref()===undefined]));assert(Object.values(released).every(Boolean));
const kit=composeExtensions([CoreExtension]),fresh=createEditor({schema:kit.schema,content});
try{const restored=await restoreRetainedCheckpoint(held.checkpoint,fresh.state.schema,'release-1');try{assert.deepEqual(restored.baseDocument.toJSON(),held.expected)}finally{restored.document.destroy()}}
finally{fresh.destroy()}
const report={runtime:process.version,domRequired:false,checkpointRemainsHeld:true,sourceReleased:released,restoreWithFreshSchema:true,note:'Explicit four-turn GC ownership diagnostic, not a general bounded-memory certificate.'};await writeFile('artifacts/retained-checkpoint-release-20261106.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
