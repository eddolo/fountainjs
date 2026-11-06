import {DatabaseSync} from 'node:sqlite';
const inbox=[],waiting=[];process.on('message',message=>{if(waiting.length)waiting.shift()(message);else inbox.push(message)});
const receive=()=>inbox.length?Promise.resolve(inbox.shift()):new Promise(resolve=>waiting.push(resolve));
const directory='./retained-coordinator-build-20261106';
const {CoreExtension,composeExtensions,Schema}=await import(`${directory}/engine.js`),{CoordinatedRetainedRoom}=await import(`${directory}/coordinator.js`),{SQLiteRetainedRoomRepository}=await import(`${directory}/sqlite.js`);
const [mode,path]=process.argv.slice(2),schema=new Schema(composeExtensions([CoreExtension]).schema);
let repository;
try{
 if(mode==='uncommitted'){
  const db=new DatabaseSync(path);db.exec('BEGIN IMMEDIATE');db.prepare('DELETE FROM fountain_retained_rooms_v1 WHERE room_key = ?').run('project:launch');process.send({kind:'uncommitted'});await receive();db.exec('ROLLBACK');db.close();
 }else{
  repository=new SQLiteRetainedRoomRepository(path);
  if(mode==='write'){
   const request=await receive(),base=repository;
   const gated={read:key=>base.read(key),create:row=>base.create(row),compareAndSwap:async(key,expected,next)=>{process.send({kind:'validated',generation:expected});await receive();return base.compareAndSwap(key,expected,next)}};
   const room=new CoordinatedRetainedRoom(gated,'project:launch',schema,'node-schema-1');
   try{const result=await room.write({epoch:request.epoch,update:new Uint8Array(Buffer.from(request.updateBase64,'base64'))});process.send({kind:'result',accepted:true,epoch:result.epoch,revision:result.revision})}
   catch(error){process.send({kind:'result',accepted:false,code:error.code,message:error.message})}
  }else{
   const room=new CoordinatedRetainedRoom(repository,'project:launch',schema,'node-schema-1'),snapshot=await room.snapshot();
   let result;
   if(mode==='freeze')result={ticket:await room.freeze(snapshot)};
   else{const recovered=await room.recoverFrozen(snapshot);if(mode==='prepare')result={...recovered,prepared:await room.prepareResume(recovered.ticket)};else if(mode==='commit'){const next=await room.commitResume(recovered.ticket,recovered.prepared);result={...recovered,epoch:next.epoch,revision:next.revision}}else throw new Error('Unknown worker mode')}
   process.send({kind:'persisted',...result});await receive();
  }
  repository.close();repository=undefined;
 }
 process.disconnect();
}catch(error){process.send?.({kind:'error',message:error.stack});repository?.close();process.exitCode=1;process.disconnect?.()}
