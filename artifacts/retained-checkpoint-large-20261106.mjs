import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as Y from 'yjs';
const directory='retained-checkpoint-build-20261106',blocks=1000;
const {CoreExtension,composeExtensions,createEditor}=await import(`./${directory}/engine.js`),{createRetainedYjsCollaborationExtension}=await import(`./${directory}/retained-adapter.js`),{captureRetainedCheckpoint,restoreRetainedCheckpoint}=await import(`./${directory}/checkpoint.js`);
const memory=()=>{const m=process.memoryUsage();return {heap:m.heapUsed,buffers:m.arrayBuffers,total:m.heapUsed+m.arrayBuffers}};
assert.equal(typeof globalThis.document,'undefined');assert.equal(typeof globalThis.gc,'function');
const settle=async()=>{for(let i=0;i<4;i++){await new Promise(resolve=>setImmediate(resolve));globalThis.gc()}};
const document=new Y.Doc(),kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document,user:{id:'Ada',name:'Ada',color:'#7048e8'}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:{type:'doc',attrs:{title:'Large checkpoint'},content:Array.from({length:blocks},(_,i)=>({type:'paragraph',attrs:{nodeId:`paragraph-${i}`},content:[{type:'text',text:`Paragraph ${i}: e\u0301 \u200B exact technical source.`}]}))}});
let restored;
try{
 await settle();const before=memory(),start=performance.now(),checkpoint=await captureRetainedCheckpoint(document,editor.state.schema,'large-schema-1'),captureMs=performance.now()-start;
 await settle();const captured=memory(),restoreStart=performance.now();restored=await restoreRetainedCheckpoint(checkpoint,editor.state.schema,'large-schema-1');const restoreMs=performance.now()-restoreStart;
 assert.deepEqual(restored.baseDocument.toJSON(),editor.getJSON());assert.deepEqual(Y.encodeStateAsUpdate(restored.document),Y.encodeStateAsUpdate(document));
 await settle();const reopened=memory();
 const report={runtime:process.version,blocks,trials:1,captureMs,restoreMs,wireBytes:checkpoint.manifest.bytes,documentSha256:checkpoint.manifest.documentSha256,updateSha256:checkpoint.manifest.updateSha256,exactDocument:true,exactWire:true,domRequired:false,memory:{before,captured,reopened},sourceSha256:createHash('sha256').update(JSON.stringify(editor.getJSON())).digest('hex'),note:'One reduced-priority two-logical-processor diagnostic with explicit GC between stages. Not peak memory, a latency gate, hostile-input certification, or a bounded-memory guarantee.'};
 await writeFile('artifacts/retained-checkpoint-large-20261106.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{restored?.document.destroy();editor.destroy();document.destroy()}
