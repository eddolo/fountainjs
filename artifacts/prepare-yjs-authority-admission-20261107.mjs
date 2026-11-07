import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const once=(text,before,after)=>{assert.equal(text.split(before).length-1,1,before);return text.replace(before,after);};
let build=(await readFile('artifacts/build-yjs-admission-20261107.mjs','utf8')).replaceAll('yjs-admission-build-20261107','yjs-authority-admission-build-20261107');build=once(build,"sqlite:resolve('examples/backends/retained-sqlite.ts')","sqlite:resolve('examples/backends/retained-sqlite.ts'),coordinator:resolve('src/yjs/retained-room-coordinator.ts'),'legacy-adapter':resolve('src/yjs/index.ts'),'legacy-checkpoint':resolve('src/yjs/legacy-checkpoint.ts'),handoff:resolve('src/yjs/cross-format-handoff.ts')");await writeFile('artifacts/build-yjs-authority-admission-20261107.mjs',build);
let server=(await readFile('artifacts/yjs-admission-server-20261107.mjs','utf8')).replaceAll('yjs-admission-build-20261107','yjs-authority-admission-build-20261107').replaceAll('yjs-admission-fixture-20261107','yjs-authority-admission-fixture-20261107').replaceAll('fountain-admission-browser-','fountain-authority-browser-').replaceAll('.vite-yjs-admission-20261107','.vite-yjs-authority-admission-20261107');
server=once(server,"const origin=","import {CoordinatedRetainedRoom} from './yjs-authority-admission-build-20261107/coordinator.js';\nimport {CrossFormatRoomHandoff} from './yjs-authority-admission-build-20261107/handoff.js';\nimport {retainedHttpReceipt} from '../examples/backends/retained-http-delta.ts';\nconst origin=");
server=once(server,'sessions=new Map();',"sessions=new Map();\nconst peerPresenceRepository=new SQLiteRetainedRoomRepository(join(temporary,'rooms.sqlite'));");
server=once(server,"import {createServer} from 'vite';","import {createServer} from 'vite';\nimport * as Y from 'yjs';\nimport {createEditor} from './yjs-authority-admission-build-20261107/engine.js';\nimport {createRetainedYjsCollaborationExtension} from './yjs-authority-admission-build-20261107/adapter.js';\nimport {restoreRetainedCheckpoint} from './yjs-authority-admission-build-20261107/checkpoint.js';");
server=once(server,"else if(action==='write')value=await room.write(body);",`else if(action==='write')value=retainedHttpReceipt(await room.write(body),body.basis);
   else if(action==='bind')value=await room.admit(body);
   else if(action==='poll-retained'){const snapshot=await room.pollRetained(body.lease??body);value=snapshot&&retainedHttpReceipt(snapshot,body.basis);}
   else if(action==='bind-live'||action==='presence'||action==='leave-live'){
    const worker=body.presenceWorker==='peer'?'peer':'primary';
    const presence=worker==='peer'?peerPresenceRepository:repository;
    res.setHeader('X-Presence-Worker',worker);
    if(action==='bind-live'){
     const snapshot=await room.admit(body.lease);
     value={snapshot,token:presence.bindPresence(body.lease)};
    }else if(action==='presence'){
     if(body.lease?.key!==room.key) throw new Error('Presence room does not match the session');
     value=presence.exchangePresence(body.lease,body.token,body.state);
    }else{presence.leavePresence(room.key,body.epoch,body.token);value=null;}
   }
   else if(action==='bind-advance'){const snapshot=await room.snapshot(),opened=await restoreRetainedCheckpoint(snapshot.checkpoint,schema,'admission-browser-1'),kit=composeExtensions([CoreExtension,MathExtension,createRetainedYjsCollaborationExtension({document:opened.document,user:{id:'server',name:'Server',color:'#7048e8'}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:opened.baseDocument.toJSON()});try{editor.dispatch(editor.createTransaction().insertText([1,0],editor.state.doc.child(1).textContent.length,' ACCEPTED during bind'));await room.write({epoch:snapshot.epoch,protocol:'retained',update:Y.encodeStateAsUpdate(opened.document)});}finally{editor.destroy();opened.document.destroy();}value=await room.admit(body);}
   else if(action==='freeze')value=await room.freeze(await room.snapshot());
   else if(action==='recover-freeze')value=await room.recoverFrozen(body);
   else if(action==='migrate-legacy'||action==='migration-record'){
    const handoff=new CrossFormatRoomHandoff(repository,room.key,schema,'admission-browser-1');
    if(action==='migrate-legacy'){
     value=(await handoff.migrateLegacy(body.ticket,body.operation,
      {history:'reset-with-source-checkpoint',offline:'reconcile-before-activation',externalState:'host-coordinated',migrators:[]},
      {history:'reset-with-source-archive',offline:'retain-retired-room-branches',externalReceipt:'live-test-handoff'})).snapshot;
    }else{
     const archive=await handoff.retiredEpoch(body.epoch);
     if(!archive)throw new Error('No archived source for this epoch');
     const {source,destination,branchRevision}=archive;
     value={id:archive.id,kind:archive.kind,branchRevision,
      source:{epoch:source.epoch,format:source.checkpoint.manifest.format,modelHash:source.checkpoint.manifest.documentSha256},
      destination:{epoch:destination.epoch,format:destination.checkpoint.manifest.format,modelHash:destination.checkpoint.manifest.documentSha256,roomId:destination.checkpoint.manifest.roomId}};
    }
   }
   else if(action==='abort'){const frozen=await room.snapshot();value=await room.abort(await room.recoverFrozen(frozen));}
   else if(action==='bind-freeze'){await room.freeze(await room.snapshot());value=await room.admit(body);}
   else if(action==='rotate'){const coordinator=new CoordinatedRetainedRoom(repository,room.key,schema,'admission-browser-1'),snapshot=await coordinator.snapshot(),ticket=await coordinator.freeze(snapshot),prepared=await coordinator.prepareResume(ticket);value=await coordinator.commitResume(ticket,prepared);}`);
server=once(server,'error:error.message','error:error.message,code:error.code');
server=once(server,"sessions.delete(req.headers['x-admission-session']);", "repository.clearRoomPresence(room.key);sessions.delete(req.headers['x-admission-session']);");
server=once(server,'repository.close();','repository.close();peerPresenceRepository.close();');
await writeFile('artifacts/yjs-authority-admission-server-20261107.mjs',server);
