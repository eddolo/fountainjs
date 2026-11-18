import assert from 'node:assert/strict';
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';

const out = resolve(process.argv[2]);
const sizes = process.argv.slice(3).map(Number);
assert.ok(sizes.length && sizes.every(n => Number.isSafeInteger(n) && n > 0));
await mkdir(out);
const variant=process.env.FOUNTAIN_BENCH_VARIANT || 'release';
const packages={release:'fountainjs-editor',repair:'fountain-path-fix',remote:'fountain-remote-candidate'};
assert.ok(Object.hasOwn(packages,variant));
const alias=variant==='release' ? {} : {'fountainjs-editor':packages[variant]};
const captureCpu=process.env.FOUNTAIN_BENCH_CPU==='1';
await build({configFile:false,resolve:{alias},logLevel:'warn',build:{target:'esnext',...(captureCpu?{minify:false,sourcemap:true}:{})}});
if(captureCpu){
  await mkdir(resolve(out,'maps'));
  for(const name of await readdir('dist/assets')) if(name.endsWith('.js.map')){
    await copyFile(resolve('dist/assets',name),resolve(out,'maps',name));
  }
}
const server = await preview({configFile:false,preview:{host:'127.0.0.1',port:43193,strictPort:true}});
const endpoint='http://127.0.0.1:43193';
const ws=new WebSocketServer({server:server.httpServer,path:'/sync',verifyClient:({origin})=>origin===endpoint});
const rooms=new Map();
ws.on('connection',(socket,req)=>{
  const key=new URL(req.url,endpoint).searchParams.get('room');
  const room=rooms.get(key);
  if (!room) {socket.close(1008);return;}
  room.peers.add(socket);
  socket.on('close',()=>room.peers.delete(socket));
  socket.send(Y.encodeStateAsUpdate(room.doc));
  socket.on('message',raw=>{
    const bytes=new Uint8Array(raw);
    Y.applyUpdate(room.doc,bytes);
    room.updates.push(bytes.length);
    for(const peer of room.peers) if(peer!==socket && peer.readyState===WebSocket.OPEN) peer.send(bytes);
  });
});
const results=[];
let browser;
const errors=[];
try {
  browser=await chromium.launch({headless:true});
  for(const size of sizes) for(const [index,engine] of (captureCpu?['fountain','tiptap']:['fountain','tiptap','tiptap','fountain']).entries()){
    const roomKey=engine+'-'+size+'-'+index;
    const room={doc:new Y.Doc(),peers:new Set(),updates:[]};
    rooms.set(roomKey,room);
    const contexts=[];
    const open=async role=>{
      const ctx=await browser.newContext({viewport:{width:1280,height:800}});
      contexts.push(ctx);
      const page=await ctx.newPage();
      page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(endpoint+'/?'+new URLSearchParams({size:String(size),role,engine,room:roomKey}));
      await page.waitForFunction(() => !!window.peer);
      return page;
    };
    const visible=(page)=>page.locator('[contenteditable=true] > p').last();
    const texts=page=>page.evaluate(()=>window.peer.texts());
    try {
      const original=Array.from({length:size},(_,i)=>'Paragraph '+i);
      const writer=await open('writer');
      assert.deepEqual(await texts(writer),original);
      await writer.waitForFunction(()=>window.peer.received>0);
      const seeded=Buffer.from(await writer.evaluate(()=>window.peer.version()));
      const deadline=performance.now()+15000;
      while(!Buffer.from(Y.encodeStateVector(room.doc)).equals(seeded)){
        assert.ok(performance.now()<deadline,'server did not receive complete seed');
        await delay(10);
      }
      assert.ok(room.updates.length>0,'writer has sent initial document');
      const reader=await open('reader');
      await reader.waitForFunction(n=>window.peer.texts().length===n,size);
      assert.deepEqual(await texts(reader),original);
      await visible(reader).scrollIntoViewIfNeeded();
      await visible(writer).click();
      await writer.keyboard.press('End');
      if(captureCpu) {
        const sessions=await Promise.all([writer,reader].map(page=>page.context().newCDPSession(page)));
        for(const s of sessions){
          await s.send('Profiler.enable');
          await s.send('Profiler.setSamplingInterval',{interval:500});
          await s.send('Profiler.start');
        }
        const burst='abcdefghijklmnopqrstuvwxyz'.repeat(2);
        await writer.keyboard.type(burst);
        const wanted=original.at(-1)+burst;
        await reader.waitForFunction(s=>document.querySelector('[contenteditable=true]').lastElementChild.textContent===s,wanted);
        for(const [at,s] of sessions.entries()){
          const {profile}=await s.send('Profiler.stop');
          await writeFile(resolve(out,roomKey+'-'+['writer','reader'][at]+'.cpuprofile'),JSON.stringify(profile));
        }
        original[size-1]=wanted;
        assert.deepEqual(await texts(writer),original);
        assert.deepEqual(await texts(reader),original);
        results.push({engine,size,index,burst,converged:true});
        console.log(roomKey,'burst converged');
        continue;
      }
      const measuredFrom=room.updates.length;
      const firstReceived=await reader.evaluate(()=>window.peer.received);
      const samples=[];
      const word='abcdefghijk';
      for(const [i,key] of Array.from(word).entries()){
        const expected=original.at(-1)+word.slice(0,i+1);
        await writer.keyboard.press(key);
        await Promise.all([
          writer.waitForFunction(i=>!!window.peer.samples[i]?.frameTaskAt,i),
          reader.waitForFunction(text=>window.peer.changes.some(c=>c.text===text&&c.frameTaskAt),expected)
        ]);
        const local=await writer.evaluate(i=>window.peer.samples[i],i);
        const remote=await reader.evaluate(text=>window.peer.changes.find(c=>c.text===text),expected);
        assert.equal(local.key,key);
        assert.equal(remote.update.seq,firstReceived+i+1);
        assert.equal(await visible(writer).textContent(),expected);
        samples.push({key,localFrameTaskMs:local.frameTaskAt-local.at,
          peerDomMs:remote.domAt-local.at,peerFrameTaskMs:remote.frameTaskAt-local.at,peerApplyMs:remote.update.applyMs});
      }
      original[size-1]+=word;
      assert.deepEqual(await texts(writer),original);
      assert.deepEqual(await texts(reader),original);
      const measuredUpdates=room.updates.slice(measuredFrom);
      await visible(reader).click();
      await reader.keyboard.press('End');
      await reader.keyboard.type(' peer');
      original[size-1]+=' peer';
      await writer.waitForFunction(text=>window.peer.texts().at(-1)===text,original.at(-1));
      const reopened=await open('reopened');
      for(const page of [writer,reader,reopened]) assert.deepEqual(await texts(page),original);
      const vectors=await Promise.all([writer,reader,reopened].map(p=>p.evaluate(()=>window.peer.version())));
      assert.deepEqual(vectors[0],vectors[1]);
      assert.deepEqual(vectors[1],vectors[2]);
      await visible(reopened).scrollIntoViewIfNeeded();
      await reopened.screenshot({path:resolve(out,roomKey+'.png'),caret:'initial'});
      results.push({engine,size,index,samples,measuredUpdates,peersReopened:3,
        visibility:await Promise.all([writer,reader].map(p=>p.evaluate(()=>document.visibilityState)))});
      console.log(roomKey,'passed',measuredUpdates.length,'Yjs updates');
    } finally {
      for(const ctx of contexts.reverse()) await ctx.close();
      room.doc.destroy();rooms.delete(roomKey);
    }
  }
  assert.deepEqual(errors,[]);
} finally {
  await writeFile(resolve(out,'report.json'), JSON.stringify({variant,date:new Date().toISOString(),browser:browser?.version(),sizes,results,errors},null,2));
  await browser?.close();
  await new Promise(done=>ws.close(done));
  await server.close();
}
