// Test-only loopback HTTP transport for the actual compiled Node/SQLite reference.
// Not a public endpoint, hosted service or production authentication example.
import {createServer} from 'vite';
import {mkdtemp,rm} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {CoreExtension,MathExtension,Schema,composeExtensions} from './yjs-namespace-build-20261107/engine.js';
import {SQLiteRetainedRoomRepository} from './yjs-namespace-build-20261107/sqlite.js';
import {CoordinatedDocumentRoom} from './yjs-namespace-build-20261107/document-room.js';
import {CrossFormatRoomHandoff} from './yjs-namespace-build-20261107/handoff.js';
const origin='http://127.0.0.1:4195',temporary=await mkdtemp(join(tmpdir(),'fountain-cross-browser-')),repository=new SQLiteRetainedRoomRepository(join(temporary,'rooms.sqlite')),schema=new Schema(composeExtensions([CoreExtension,MathExtension]).schema),sessions=new Map();
const encode=value=>JSON.stringify(value,(_key,value)=>value instanceof Uint8Array?{__wire:Buffer.from(value).toString('base64')}:value),decode=text=>JSON.parse(text,(_key,value)=>value&&typeof value==='object'&&Object.keys(value).length===1&&typeof value.__wire==='string'?new Uint8Array(Buffer.from(value.__wire,'base64')):value);
const options={history:'reset-with-source-checkpoint',offline:'reconcile-before-activation',externalState:'host-coordinated',migrators:[]},policy={history:'reset-with-source-archive',offline:'retain-retired-room-branches',externalReceipt:'test-loopback-coordination'};
function nestedOptions(destinationRoom) {
 const name='research-folder';
 return {...options,destinationRoom,migrators:[{
  name:'research-folder-to-document-reference',roots:[name],
  migrate({source,target}) {
   const folder=source.getMap(name);
   if(folder.size!==2 || typeof folder.get('title')!=='string' || !folder.get('body')) throw new Error('Unexpected research folder shape');
   target.getMap(name).set('title',folder.get('title'));
   target.getMap(name).set('documentRoom',destinationRoom);
  },
  verify({source,target}) {
   const folder=target.getMap(name);
   if(folder.size!==2 || folder.get('title')!==source.getMap(name).get('title') || folder.get('documentRoom')!==destinationRoom) throw new Error('Research folder metadata changed');
  },
 }]};
}
const server=await createServer({configFile:false,root:resolve('.'),cacheDir:'node_modules/.vite-yjs-namespace',optimizeDeps:{entries:['artifacts/yjs-namespace-fixture-20261107.html'],include:['yjs']},server:{watch:null,open:false,host:'127.0.0.1',port:4195,strictPort:true},plugins:[{name:'test-cross-format',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(!req.url?.startsWith('/__handoff/'))return next();
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 try{
  if(req.method!=='POST'||req.headers.origin!==origin||req.headers.host!=='127.0.0.1:4195')throw new Error('Loopback test origin required');
  const buffers=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>4*1024*1024)throw new Error('Test request too large');buffers.push(chunk)}const body=decode(Buffer.concat(buffers).toString('utf8')),action=req.url.slice('/__handoff/'.length);
  let value;
  if(action==='open'){
   const token=crypto.randomUUID(),key='test:'+crypto.randomUUID();sessions.set(token,{key,nested:body.nested===true,room:new CoordinatedDocumentRoom(repository,key,schema,'browser-schema-1'),handoff:new CrossFormatRoomHandoff(repository,key,schema,'browser-schema-1')});value={token};
  }else{
   const session=sessions.get(req.headers['x-handoff-session']);if(!session)throw new Error('Unknown test session');
   const {key,room,handoff}=session;
   if(action==='initialize')value=await room.initialize(body.checkpoint);
   else if(action==='join')value=await room.openForEditing({protocols:body.protocols,loadCheckpoint(){throw new Error('This fixture initializes its legacy source explicitly');}});
   else if(action==='admit')value=await room.admit(body);
   else if(action==='snapshot')value=await room.snapshot();
   else if(action==='write')value=await room.write(body);
   else if(action==='freeze')value=await room.freeze(body);
   else if(action==='recover-frozen')value=await room.recoverFrozen(body);
   else if(action==='migrate'){value=await handoff.migrateLegacy(body.ticket,body.operation,session.nested?nestedOptions(body.destinationRoom):{...options,destinationRoom:body.destinationRoom},policy);if(body.dropAcknowledgement){res.destroy();return}}
   else if(action==='rollback')value=await handoff.rollback(body.ticket,body.operation,body.archive,body.restore,policy);
   else if(action==='retain')value=await handoff.retainLateUpdate(body);
   else if(action==='batch')value=await handoff.retiredBatch(body.id,body.revision);
   else if(action==='archive')value=await repository.readCrossArchive(key,body.id);
   else if(action==='close'){sessions.delete(req.headers['x-handoff-session']);value={closed:true}}
   else throw new Error('Unknown fixed test action');
  }
  res.end(encode({ok:true,value}));
 }catch(error){res.statusCode=400;res.end(encode({ok:false,error:error.message,code:error.code}))}
 })}}]});
await server.listen();let closing=false;async function close(){if(closing)return;closing=true;await server.close();repository.close();if(dirname(resolve(temporary))!==resolve(tmpdir())||!basename(temporary).startsWith('fountain-cross-browser-'))throw new Error('Unsafe browser-server cleanup');await rm(temporary,{recursive:true,force:true})}
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
