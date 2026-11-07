// Test-only loopback HTTP transport; not production authentication or a service.
import {createServer} from 'vite';
import * as Y from 'yjs';
import {createEditor} from './yjs-authority-admission-build-20261107/engine.js';
import {createRetainedYjsCollaborationExtension} from './yjs-authority-admission-build-20261107/adapter.js';
import {restoreRetainedCheckpoint} from './yjs-authority-admission-build-20261107/checkpoint.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {CoreExtension,MathExtension,Schema,composeExtensions} from './yjs-authority-admission-build-20261107/engine.js';
import {SQLiteRetainedRoomRepository} from './yjs-authority-admission-build-20261107/sqlite.js';
import {CoordinatedDocumentRoom} from './yjs-authority-admission-build-20261107/authority.js';
import {CoordinatedRetainedRoom} from './yjs-authority-admission-build-20261107/coordinator.js';
import {createRetainedPresenceRegistry} from '../examples/backends/retained-http-presence.ts';
import {retainedHttpReceipt} from '../examples/backends/retained-http-delta.ts';
const presence=createRetainedPresenceRegistry();
const origin='http://127.0.0.1:4195',temporary=await mkdtemp(join(tmpdir(),'fountain-authority-browser-')),repository=new SQLiteRetainedRoomRepository(join(temporary,'rooms.sqlite')),schema=new Schema(composeExtensions([CoreExtension,MathExtension]).schema),sessions=new Map();
const encode=value=>JSON.stringify(value,(_key,value)=>value instanceof Uint8Array?{__wire:Buffer.from(value).toString('base64')}:value),decode=text=>JSON.parse(text,(_key,value)=>value&&typeof value==='object'&&Object.keys(value).length===1&&typeof value.__wire==='string'?new Uint8Array(Buffer.from(value.__wire,'base64')):value);
const server=await createServer({configFile:false,root:resolve('.'),cacheDir:'node_modules/.vite-yjs-authority-admission-20261107',optimizeDeps:{entries:['artifacts/yjs-authority-admission-fixture-20261107.html'],include:['yjs']},server:{watch:null,open:false,host:'127.0.0.1',port:4195,strictPort:true},plugins:[{name:'admission-test',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(!req.url?.startsWith('/__admission/'))return next();res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 try{
  if(req.method!=='POST'||req.headers.origin!==origin||req.headers.host!=='127.0.0.1:4195')throw new Error('Loopback test origin required');
  const buffers=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>4*1024*1024)throw new Error('Test request too large');buffers.push(chunk)}const body=decode(Buffer.concat(buffers).toString('utf8')),action=req.url.slice('/__admission/'.length);let value;
  if(action==='open'){const token=crypto.randomUUID(),key='admission:'+crypto.randomUUID();sessions.set(token,new CoordinatedDocumentRoom(repository,key,schema,'admission-browser-1'));value={token};}
  else{const room=sessions.get(req.headers['x-admission-session']);if(!room)throw new Error('Unknown test session');
   if(action==='initialize')value=await room.initialize(body.checkpoint);
   else if(action==='snapshot')value=await room.snapshot();
   else if(action==='write')value=retainedHttpReceipt(await room.write(body),body.basis);
   else if(action==='bind')value=await room.admit(body);
   else if(action==='poll-retained'){const snapshot=await room.pollRetained(body.lease??body);value=snapshot&&retainedHttpReceipt(snapshot,body.basis);}
   else if(action==='bind-live'){const snapshot=await room.admit(body.lease);value={snapshot,token:presence.bind(room.key,snapshot.epoch)};}
   else if(action==='presence'){await room.pollRetained(body.lease);value=presence.exchange(room.key,body.lease.epoch,body.token,body.state);}
   else if(action==='leave-live'){presence.leave(room.key,body.epoch,body.token);value=null;}
   else if(action==='bind-advance'){const snapshot=await room.snapshot(),opened=await restoreRetainedCheckpoint(snapshot.checkpoint,schema,'admission-browser-1'),kit=composeExtensions([CoreExtension,MathExtension,createRetainedYjsCollaborationExtension({document:opened.document,user:{id:'server',name:'Server',color:'#7048e8'}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:opened.baseDocument.toJSON()});try{editor.dispatch(editor.createTransaction().insertText([1,0],editor.state.doc.child(1).textContent.length,' ACCEPTED during bind'));await room.write({epoch:snapshot.epoch,protocol:'retained',update:Y.encodeStateAsUpdate(opened.document)});}finally{editor.destroy();opened.document.destroy();}value=await room.admit(body);}
   else if(action==='freeze')value=await room.freeze(await room.snapshot());
   else if(action==='abort'){const frozen=await room.snapshot();value=await room.abort(await room.recoverFrozen(frozen));}
   else if(action==='bind-freeze'){await room.freeze(await room.snapshot());value=await room.admit(body);}
   else if(action==='rotate'){const coordinator=new CoordinatedRetainedRoom(repository,room.key,schema,'admission-browser-1'),snapshot=await coordinator.snapshot(),ticket=await coordinator.freeze(snapshot),prepared=await coordinator.prepareResume(ticket);value=await coordinator.commitResume(ticket,prepared);}
   else if(action==='close'){presence.close(room.key);sessions.delete(req.headers['x-admission-session']);value={closed:true};}
   else throw new Error('Unknown fixed test action');
  }res.end(encode({ok:true,value}));
 }catch(error){res.statusCode=400;res.end(encode({ok:false,error:error.message,code:error.code}));}
 })}}]});
await server.listen();let closing=false;async function close(){if(closing)return;closing=true;await server.close();repository.close();if(dirname(resolve(temporary))!==resolve(tmpdir())||!basename(temporary).startsWith('fountain-authority-browser-'))throw new Error('Unsafe cleanup target');await rm(temporary,{recursive:true,force:true});}
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
