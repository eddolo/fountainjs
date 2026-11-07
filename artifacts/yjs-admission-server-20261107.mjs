// Test-only loopback HTTP transport; not production authentication or a service.
import {createServer} from 'vite';
import {mkdtemp,rm} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {CoreExtension,MathExtension,Schema,composeExtensions} from './yjs-admission-build-20261107/engine.js';
import {SQLiteRetainedRoomRepository} from './yjs-admission-build-20261107/sqlite.js';
import {CoordinatedDocumentRoom} from './yjs-admission-build-20261107/authority.js';
const origin='http://127.0.0.1:4195',temporary=await mkdtemp(join(tmpdir(),'fountain-admission-browser-')),repository=new SQLiteRetainedRoomRepository(join(temporary,'rooms.sqlite')),schema=new Schema(composeExtensions([CoreExtension,MathExtension]).schema),sessions=new Map();
const encode=value=>JSON.stringify(value,(_key,value)=>value instanceof Uint8Array?{__wire:Buffer.from(value).toString('base64')}:value),decode=text=>JSON.parse(text,(_key,value)=>value&&typeof value==='object'&&Object.keys(value).length===1&&typeof value.__wire==='string'?new Uint8Array(Buffer.from(value.__wire,'base64')):value);
const server=await createServer({configFile:false,root:resolve('.'),cacheDir:'node_modules/.vite-yjs-admission-20261107',optimizeDeps:{entries:['artifacts/yjs-admission-fixture-20261107.html'],include:['yjs']},server:{watch:null,open:false,host:'127.0.0.1',port:4195,strictPort:true},plugins:[{name:'admission-test',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(!req.url?.startsWith('/__admission/'))return next();res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 try{
  if(req.method!=='POST'||req.headers.origin!==origin||req.headers.host!=='127.0.0.1:4195')throw new Error('Loopback test origin required');
  const buffers=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>4*1024*1024)throw new Error('Test request too large');buffers.push(chunk)}const body=decode(Buffer.concat(buffers).toString('utf8')),action=req.url.slice('/__admission/'.length);let value;
  if(action==='open'){const token=crypto.randomUUID(),key='admission:'+crypto.randomUUID();sessions.set(token,new CoordinatedDocumentRoom(repository,key,schema,'admission-browser-1'));value={token};}
  else{const room=sessions.get(req.headers['x-admission-session']);if(!room)throw new Error('Unknown test session');
   if(action==='initialize')value=await room.initialize(body.checkpoint);
   else if(action==='snapshot')value=await room.snapshot();
   else if(action==='write')value=await room.write(body);
   else if(action==='close'){sessions.delete(req.headers['x-admission-session']);value={closed:true};}
   else throw new Error('Unknown fixed test action');
  }res.end(encode({ok:true,value}));
 }catch(error){res.statusCode=400;res.end(encode({ok:false,error:error.message}));}
 })}}]});
await server.listen();let closing=false;async function close(){if(closing)return;closing=true;await server.close();repository.close();if(dirname(resolve(temporary))!==resolve(tmpdir())||!basename(temporary).startsWith('fountain-admission-browser-'))throw new Error('Unsafe cleanup target');await rm(temporary,{recursive:true,force:true});}
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());
