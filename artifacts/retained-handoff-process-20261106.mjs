import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fork} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
const require=createRequire(import.meta.url),mode=process.argv[2]??'es';assert(['es','cjs'].includes(mode));
const Y=mode==='cjs'?require('yjs'):await import('yjs'),load=name=>mode==='cjs'?require(`./retained-handoff-build-20261106/${name}.cjs`):import(`./retained-handoff-build-20261106/${name}.js`);
const {CoreExtension,Schema,composeExtensions,createEditor,Selection,insertText}=await load('engine'),{createRetainedYjsCollaborationExtension}=await load('retained-adapter'),{captureRetainedCheckpoint,restoreRetainedCheckpoint}=await load('checkpoint'),{CoordinatedRetainedRoom}=await load('coordinator'),{SQLiteRetainedRoomRepository}=await load('sqlite'),{RetainedRoomHandoff}=await load('handoff');
const key='project:handoff',version='schema-1',schema=new Schema(composeExtensions([CoreExtension]).schema),options=()=>({history:'reset-with-source-checkpoint',offline:'reconcile-before-activation',externalState:'host-coordinated',migrators:[]}),policy=()=>({history:'reset-with-source-archive',offline:'retain-retired-room-branches',externalReceipt:'process-host-receipt'});
assert.equal(typeof globalThis.document,'undefined');assert.equal(typeof globalThis.window,'undefined');
if(process.argv[3]==='--worker'){
 const path=process.argv[4],kind=process.argv[5],inbox=[],waiters=[];process.on('message',message=>waiters.length?waiters.shift()(message):inbox.push(message));const receive=()=>inbox.length?Promise.resolve(inbox.shift()):new Promise(resolve=>waiters.push(resolve));
 let repository;
 try{
  if(kind==='uncommitted'){
   const db=new DatabaseSync(path);db.exec('BEGIN IMMEDIATE');db.prepare('UPDATE fountain_retained_rooms_v1 SET wire = ? WHERE room_key = ?').run(new Uint8Array([255]),key);process.send({kind:'uncommitted-live-update'});await receive();db.exec('ROLLBACK');db.close();
  }else{
   repository=new SQLiteRetainedRoomRepository(path);const request=await receive();
   if(kind==='write'){
    const base=repository,gated={read:base.read.bind(base),create:base.create.bind(base),compareAndSwap:async(...args)=>{process.send({kind:'validated',generation:args[1]});await receive();return base.compareAndSwap(...args)}},room=new CoordinatedRetainedRoom(gated,key,schema,version);
    try{await room.write({epoch:request.epoch,update:new Uint8Array(Buffer.from(request.update,'base64'))});process.send({kind:'result',accepted:true})}catch(error){process.send({kind:'result',accepted:false,code:error.code})}
   }else{
    const handoff=new RetainedRoomHandoff(repository,key,schema,version),result=kind==='migrate'?await handoff.migrate(request.ticket,request.operation,options(),policy()):await handoff.rollback(request.ticket,request.operation,request.archive,'retained-branch',policy());
    process.send({kind:'committed',epoch:result.snapshot.epoch,revision:result.snapshot.revision,archive:result.archive.id});await receive();
   }
   repository.close();repository=undefined;
  }
  process.disconnect();
 }catch(error){process.send?.({kind:'error',message:error.stack});repository?.close();process.exitCode=1;process.disconnect?.()}
}else{
 const sandbox=await mkdtemp(join(tmpdir(),'fountain-handoff-process-')),path=join(sandbox,'rooms.sqlite'),processes=[],clients=[],cases=[];let repository;
 function client(document=new Y.Doc(),name='Ada'){const kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document,captureTimeout:0,user:{id:name,name,color:'#7048e8'}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:{type:'doc',attrs:{metadata:{title:'Process paper'}},content:[{type:'paragraph',attrs:{nodeId:'intro'},content:[{type:'text',text:'Alpha α 😀'}]},{type:'image_super',attrs:{nodeId:'figure',src:'/figure.png',alt:'Preserved figure'}}]}});const value={document,editor};clients.push(value);return value}
 function type(value,text){value.editor.dispatch(value.editor.createTransaction().setSelection(Selection.cursor([0,0],2)));assert(insertText(value.editor,text));return Y.encodeStateAsUpdate(value.document)}
 async function model(checkpoint){const read=await restoreRetainedCheckpoint(checkpoint,schema,version);try{return read.baseDocument.toJSON()}finally{read.document.destroy()}}
 function child(kind){
  const process=fork(new URL(import.meta.url),[mode,'--worker',path,kind],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});processes.push(process);let stderr='';process.stderr.on('data',data=>stderr+=data);const messages=[],waiters=[];process.on('message',message=>{if(waiters.length)waiters.shift().resolve(message);else messages.push(message)});
  const exited=new Promise((resolve,reject)=>{process.once('error',reject);process.once('exit',(code,signal)=>{for(const waiter of waiters.splice(0))waiter.reject(new Error(`worker exited ${code}/${signal}: ${stderr}`));resolve({code,signal})})});
  const next=()=>messages.length?Promise.resolve(messages.shift()):new Promise((resolve,reject)=>{const waiter={resolve:message=>{clearTimeout(timer);resolve(message)},reject:error=>{clearTimeout(timer);reject(error)}};const timer=setTimeout(()=>{const index=waiters.indexOf(waiter);if(index>=0)waiters.splice(index,1);reject(new Error('Worker observation timeout; '+stderr))},30000);waiters.push(waiter)});
  return {process,next,exited};
 }
 const stop=async worker=>{worker.process.kill('SIGKILL');await worker.exited};
 try{
  const source=client(),checkpoint=await captureRetainedCheckpoint(source.document,schema,version),original=source.editor.getJSON();repository=new SQLiteRetainedRoomRepository(path);const room=new CoordinatedRetainedRoom(repository,key,schema,version),handoff=new RetainedRoomHandoff(repository,key,schema,version),initial=await room.initialize(checkpoint);
  const interrupted=child('uncommitted');assert.equal((await interrupted.next()).kind,'uncommitted-live-update');await stop(interrupted);assert.deepEqual((await room.snapshot()).checkpoint,checkpoint);cases.push('kill between live-row write and archive insertion rolls back the SQLite transaction (storage oracle)');
  const oldUpdate=type(source,' OLD '),writer=child('write');writer.process.send({epoch:initial.epoch,update:Buffer.from(oldUpdate).toString('base64')});assert.equal((await writer.next()).kind,'validated');
  const ticket=await room.freeze(initial),operation=crypto.randomUUID(),installer=child('migrate');installer.process.send({ticket,operation});const committed=await installer.next();assert.equal(committed.kind,'committed',JSON.stringify(committed));await stop(installer);
  const installed=await room.snapshot();assert.equal(installed.epoch,committed.epoch);assert.deepEqual(await model(installed.checkpoint),original);assert.deepEqual((await repository.readArchive(key,operation)).source.checkpoint,checkpoint);cases.push('kill after migration commit leaves the fresh room and complete original archive durable');
  writer.process.send({continue:true});assert.deepEqual(await writer.next(),{kind:'result',accepted:false,code:'revision-conflict'});await writer.exited;cases.push('writer validated in another process before freeze cannot overwrite the migrated room');
  repository.close();repository=new SQLiteRetainedRoomRepository(path);const reopened=new CoordinatedRetainedRoom(repository,key,schema,version),recovery=new RetainedRoomHandoff(repository,key,schema,version),replay=await recovery.migrate(ticket,operation,options(),policy());assert(replay.replayed&&replay.current);assert.equal(replay.snapshot.epoch,installed.epoch);cases.push('reopen and retry a lost migration acknowledgement does not install or rotate twice');
  let reads=0;await assert.rejects(reopened.write({epoch:initial.epoch,get update(){reads++;throw new Error('old bytes read')}}),{code:'stale-epoch'});assert.equal(reads,0);const branch=await recovery.retainLateUpdate({archiveId:operation,roomId:checkpoint.manifest.roomId,update:oldUpdate});assert.deepEqual(await model(branch.branch),source.editor.getJSON());assert.deepEqual((await reopened.snapshot()).checkpoint,installed.checkpoint);cases.push('old writer is fenced before byte access and its batch is retained only in a retired branch');
  const read=await restoreRetainedCheckpoint(installed.checkpoint,schema,version),fresh=client(read.document,'Grace'),accepted=await reopened.write({epoch:installed.epoch,update:type(fresh,' NEW ')}),rollbackTicket=await reopened.freeze(accepted),rollbackOperation=crypto.randomUUID(),rollback=child('rollback');rollback.process.send({ticket:rollbackTicket,operation:rollbackOperation,archive:operation});const rolled=await rollback.next();assert.equal(rolled.kind,'committed',JSON.stringify(rolled));await stop(rollback);
  const after=await reopened.snapshot(),rollbackArchive=await repository.readArchive(key,rollbackOperation);assert.deepEqual(await model(after.checkpoint),source.editor.getJSON());assert.deepEqual(await model(rollbackArchive.source.checkpoint),fresh.editor.getJSON());assert.deepEqual(rollbackArchive.source.checkpoint,accepted.checkpoint);cases.push('kill after rollback commit preserves the old pending branch and archives all accepted fresh-room edits');
  const retried=await recovery.rollback(rollbackTicket,rollbackOperation,operation,'retained-branch',policy());assert(retried.replayed&&retried.current);assert.equal(retried.snapshot.epoch,rolled.epoch);for(const epoch of [initial.epoch,installed.epoch])await assert.rejects(reopened.write({epoch,update:oldUpdate}),{code:'stale-epoch'});cases.push('rollback acknowledgement retry is idempotent and both prior writer epochs stay fenced');
  const historical=await recovery.migrate(ticket,operation,options(),policy());assert(historical.replayed&&!historical.current);assert.deepEqual(historical.snapshot,after);assert.deepEqual((await repository.readArchive(key,operation)).source.checkpoint,checkpoint);cases.push('superseded migration receipt cannot reinstall its destination or rewrite the immutable original');
  await writeFile(`artifacts/retained-handoff-process-${mode}-20261106.json`,JSON.stringify({mode,passed:cases.length,cases,node:process.version,dom:false,workers:processes.length,finalRevision:after.revision,checkpointSha256:after.checkpoint.manifest.checkpointSha256},null,2)+'\n');console.log(JSON.stringify({mode,passed:cases.length,workers:processes.length}));
 }finally{
  for(const worker of processes)if(worker.exitCode===null&&worker.signalCode===null){worker.kill('SIGKILL');await new Promise(resolve=>worker.once('exit',resolve))}
  repository?.close();for(const value of clients){value.editor.destroy();value.document.destroy()}
  if(dirname(resolve(sandbox))!==resolve(tmpdir())||!basename(sandbox).startsWith('fountain-handoff-process-'))throw new Error('Unsafe process-test cleanup target');await rm(sandbox,{recursive:true,force:true});
 }
}
