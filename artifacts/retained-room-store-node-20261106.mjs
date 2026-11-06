import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const mode=process.argv[2]??'es',require=createRequire(import.meta.url),directory='retained-room-store-build-20261106';
assert(['es','cjs'].includes(mode));assert.equal(typeof globalThis.document,'undefined');assert.equal(typeof globalThis.window,'undefined');
const Y=mode==='cjs'?require('yjs'):await import('yjs'),load=name=>mode==='cjs'?require(`./${directory}/${name}.cjs`):import(`./${directory}/${name}.js`);
const {CoreExtension,composeExtensions,createEditor,Selection,insertText}=await load('engine'),{createRetainedYjsCollaborationExtension}=await load('retained-adapter'),{captureRetainedCheckpoint,restoreRetainedCheckpoint}=await load('checkpoint'),{FencedRetainedRoom}=await load('room-store');
const document=new Y.Doc(),kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document,captureTimeout:0,user:{id:'Ada',name:'Ada',color:'#7048e8'}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:{type:'doc',content:[{type:'paragraph',attrs:{nodeId:'intro'},content:[{type:'text',text:'Alpha'}]}]}});
let authority,reopened;const cases=[];
try{
 document.getMap('host-records').set('bytes',new Uint8Array([0,128,255]));
 const checkpoint=await captureRetainedCheckpoint(document,editor.state.schema,'node-schema-1');authority=await FencedRetainedRoom.open(checkpoint,editor.state.schema,'node-schema-1');
 const initial=authority.snapshot();assert.equal(initial.phase,'active');assert.equal(initial.revision,0);cases.push('pure Node opening with owned checkpoint');
 editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0,0],2)));assert(insertText(editor,'X'));
 const pending=Y.encodeStateAsUpdate(document),ticket=authority.freeze(initial);let reads=0;
 await assert.rejects(authority.write({epoch:initial.epoch,get update(){reads++;return pending}}),{code:'frozen'});assert.equal(reads,0);cases.push('frozen writer rejected before reading bytes');
 const prepared=await authority.prepareResume(ticket),current=authority.commitResume(ticket,prepared);assert.notEqual(current.epoch,initial.epoch);assert.equal(current.checkpoint.manifest.checkpointSha256,initial.checkpoint.manifest.checkpointSha256);
 await assert.rejects(authority.write({epoch:initial.epoch,get update(){reads++;return pending}}),{code:'stale-epoch'});assert.equal(reads,0);cases.push('same-room epoch handoff rejects stale writer before reading bytes');
 const accepted=await authority.write({epoch:current.epoch,update:pending}),restored=await restoreRetainedCheckpoint(accepted.checkpoint,editor.state.schema,'node-schema-1');
 try{assert.deepEqual(restored.baseDocument.toJSON(),editor.getJSON());assert.deepEqual(restored.document.getMap('host-records').get('bytes'),new Uint8Array([0,128,255]))}finally{restored.document.destroy()}cases.push('explicit reconnect retry retains editor text and opaque state');
 await assert.rejects(authority.write({epoch:current.epoch,update:new Uint8Array([255])}),{code:'invalid-update'});assert.equal(authority.snapshot().checkpoint,accepted.checkpoint);cases.push('malformed wire leaves authority intact');
 const frozen=authority.freeze(accepted),aborted=authority.abort(frozen);assert.equal(aborted.epoch,accepted.epoch);assert.equal(aborted.revision,accepted.revision);assert.equal(aborted.checkpoint,accepted.checkpoint);cases.push('abort preserves source epoch revision and checkpoint');
 authority.close();reopened=await FencedRetainedRoom.open(accepted.checkpoint,editor.state.schema,'node-schema-1');assert.notEqual(reopened.snapshot().epoch,accepted.epoch);await assert.rejects(reopened.write({epoch:accepted.epoch,update:pending}),{code:'stale-epoch'});cases.push('reopen preserves data and rotates writer epoch');
 const s=reopened.snapshot(),racing=reopened.write({epoch:s.epoch,update:pending}),freeze=reopened.freeze(s);reopened.abort(freeze);await assert.rejects(racing,{code:'revision-conflict'});cases.push('freeze and abort invalidate already-running write CAS');
 await writeFile(`artifacts/retained-room-store-node-${mode}-20261106.json`,JSON.stringify({mode,passed:cases.length,cases,node:process.version,dom:false,sourceCheckpoint:checkpoint.manifest.checkpointSha256,finalCheckpoint:accepted.checkpoint.manifest.checkpointSha256},null,2)+'\n');
 console.log(JSON.stringify({mode,passed:cases.length}));
}finally{reopened?.close();authority?.close();editor.destroy();document.destroy()}
