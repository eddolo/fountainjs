// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import * as Y from 'yjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {CoreExtension,composeExtensions,createEditor,disconnectCollaboration,getCollaborationState,reconnectCollaboration,undoCollaboration,redoCollaboration,type Editor} from '../src';
import {createRetainedYjsCollaborationExtension} from '../src/yjs/retained-adapter';
import {captureRetainedCheckpoint} from '../src/yjs/retained-checkpoint';
import {CoordinatedDocumentRoom,type DocumentRoomSnapshot,type DocumentRoomRepository} from '../src/yjs/document-room';
import {CoordinatedRetainedRoom} from '../src/yjs/retained-room-coordinator';
import {SQLiteRetainedRoomRepository} from '../examples/backends/retained-sqlite';
import {createYjsCollaborationExtension} from '../src/yjs';
import {captureLegacyCheckpoint} from '../src/yjs/legacy-checkpoint';

const cleanup:Array<()=>void>=[];afterEach(()=>{while(cleanup.length)cleanup.pop()!();});
const key='authority:paper',version='authority-1',content=(text:string)=>({type:'doc',content:[{type:'paragraph',attrs:{nodeId:'intro'},content:[{type:'text',text}]}]});
function make(text='Template',extra:Record<string,unknown>={}){const document=new Y.Doc(),kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document,captureTimeout:0,user:{id:'author',name:'Author',color:'#7048e8'},...extra})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:content(text)});cleanup.push(()=>{editor.destroy();document.destroy();});return {document,editor,schema:editor.state.schema};}
async function fixture(){const folder=mkdtempSync(join(tmpdir(),'fountain-authority-admission-'));cleanup.push(()=>{if(dirname(resolve(folder))!==resolve(tmpdir())||!basename(folder).startsWith('fountain-authority-admission-'))throw new Error('Unsafe cleanup');rmSync(folder,{recursive:true,force:true});});const path=join(folder,'rooms.sqlite'),a=new SQLiteRetainedRoomRepository(path),b=new SQLiteRetainedRoomRepository(path);cleanup.push(()=>b.close());cleanup.push(()=>a.close());const server=make('Shared paper'),checkpoint=await captureRetainedCheckpoint(server.document,server.schema,version),room=new CoordinatedDocumentRoom(a,key,server.schema,version),other=new CoordinatedDocumentRoom(b,key,server.schema,version),coordinator=new CoordinatedRetainedRoom(b,key,server.schema,version),initial=await room.initialize(checkpoint);return {...server,a,b,room,other,coordinator,checkpoint,initial};}
const state=(editor:Editor)=>getCollaborationState(editor),settled=(editor:Editor,status='connected')=>vi.waitFor(()=>expect(state(editor)?.status).toBe(status));
function contract(pair:Awaited<ReturnType<typeof fixture>>,load=()=>pair.room.snapshot(),bind=async(lease:any,_signal:AbortSignal)=>{await (pair.room as any).admit(lease);}){return {schemaVersion:version,authority:{key,bind},load};}
async function rotate(pair:Awaited<ReturnType<typeof fixture>>){const snapshot=await pair.coordinator.snapshot(),ticket=await pair.coordinator.freeze(snapshot),prepared=await pair.coordinator.prepareResume(ticket);return pair.coordinator.commitResume(ticket,prepared);}
function unreadable(snapshot:DocumentRoomSnapshot){const bytes=vi.fn(()=>{throw new Error('Checkpoint bytes must not be read');}),checkpoint={manifest:snapshot.checkpoint.manifest,get update(){return bytes();}} as DocumentRoomSnapshot['checkpoint'];return {snapshot:{...snapshot,checkpoint},bytes};}

it('suppresses unchanged retained checkpoints and fences reads across freeze and rotation', async () => {
  const pair = await fixture();
  const lease = { key, epoch: pair.initial.epoch, revision: 0, protocol: 'retained' as const, room: 'fountain', identity: pair.checkpoint.manifest.roomId };
  expect(await pair.room.pollRetained(lease)).toBeNull();
  await expect(pair.room.pollRetained({ ...lease, identity: 'wrong' })).rejects.toMatchObject({ code: 'invalid-ticket' });
  await expect(pair.room.pollRetained({ ...lease, revision: 1 })).rejects.toMatchObject({ code: 'invalid-ticket' });
  pair.editor.dispatch(pair.editor.createTransaction().insertText([0, 0], 0, 'New '));
  const latest = await pair.other.write({ epoch: lease.epoch, protocol: lease.protocol, update: Y.encodeStateAsUpdate(pair.document) });
  expect(await pair.room.pollRetained(lease)).toEqual(latest);
  expect(await pair.room.pollRetained({ ...lease, revision: latest.revision })).toBeNull();
  const frozen = await pair.other.freeze(latest);
  await expect(pair.room.pollRetained(lease)).rejects.toMatchObject({ code: 'frozen' });
  await pair.other.abort(await pair.other.recoverFrozen(frozen));
  await rotate(pair);
  await expect(pair.room.pollRetained(lease)).rejects.toMatchObject({ code: 'stale-epoch' });
});

it('checks idle polls and behind presence without loading checkpoint bytes from SQLite', async () => {
  const pair = await fixture();
  const lease = { key, epoch: pair.initial.epoch, revision: 0, protocol: 'retained' as const, room: 'fountain', identity: pair.checkpoint.manifest.roomId };
  const full = vi.spyOn(pair.a, 'readDocument');
  const headers = vi.spyOn(pair.a, 'readDocumentHeader');
  const header = await pair.a.readDocumentHeader(key);
  expect(header?.checkpoint).toEqual({ manifest: pair.checkpoint.manifest });
  headers.mockClear();
  const results = await Promise.all(Array.from({ length: 64 }, () => pair.room.pollRetained(lease)));
  expect(results.every(result => result === null)).toBe(true);
  expect(headers).toHaveBeenCalledTimes(64);
  expect(full).not.toHaveBeenCalled();

  pair.editor.dispatch(pair.editor.createTransaction().insertText([0, 0], 0, 'New '));
  const latest = await pair.other.write({ epoch: lease.epoch, protocol: lease.protocol, update: Y.encodeStateAsUpdate(pair.document) });
  await Promise.all(Array.from({ length: 64 }, () => pair.room.fenceRetainedPresence(lease)));
  expect(headers).toHaveBeenCalledTimes(128);
  expect(full).not.toHaveBeenCalled();
  await expect(pair.room.pollRetained(lease)).resolves.toEqual(latest);
  expect(full).toHaveBeenCalledOnce();

  const frozen = await pair.other.freeze(latest);
  await expect(pair.room.fenceRetainedPresence(lease)).rejects.toMatchObject({ code: 'frozen' });
  await pair.other.abort(await pair.other.recoverFrozen(frozen));
  await rotate(pair);
  await expect(pair.room.fenceRetainedPresence(lease)).rejects.toMatchObject({ code: 'stale-epoch' });
  expect(full).toHaveBeenCalledOnce();
});

it('rejects a freeze committed on another connection between the full read and its header fence', async () => {
  const pair = await fixture();
  const lease = { key, epoch: pair.initial.epoch, revision: 0, protocol: 'retained' as const, room: 'fountain', identity: pair.checkpoint.manifest.roomId };
  const readHeader = pair.a.readDocumentHeader.bind(pair.a);
  vi.spyOn(pair.a, 'readDocumentHeader').mockImplementationOnce(async requested => {
    await pair.other.freeze(await pair.other.snapshot());
    return readHeader(requested);
  });
  await expect(pair.room.admit(lease)).rejects.toMatchObject({ code: 'revision-conflict' });
});

it('shares one full read for concurrent changed polls and rechecks every reader', async () => {
  const pair = await fixture();
  const lease = { key, epoch: pair.initial.epoch, revision: 0, protocol: 'retained' as const, room: 'fountain', identity: pair.checkpoint.manifest.roomId };
  pair.editor.dispatch(pair.editor.createTransaction().insertText([0, 0], 0, 'New '));
  const latest = await pair.other.write({ epoch: lease.epoch, protocol: lease.protocol, update: Y.encodeStateAsUpdate(pair.document) });
  const full = vi.spyOn(pair.a, 'readDocument');
  const headers = vi.spyOn(pair.a, 'readDocumentHeader');
  const polls = Array.from({ length: 8 }, () => pair.room.pollRetained(lease));
  const invalid = expect(pair.room.pollRetained({ ...lease, identity: 'wrong' })).rejects.toMatchObject({ code: 'invalid-ticket' });
  const snapshots = await Promise.all(polls);
  await invalid;
  expect(snapshots).toEqual(Array(8).fill(latest));
  expect(full).toHaveBeenCalledOnce();
  expect(headers).toHaveBeenCalledTimes(17);
  snapshots[0]!.checkpoint.update.fill(0);
  expect(snapshots[1]!.checkpoint.update).toEqual(latest.checkpoint.update);

  await expect(pair.room.pollRetained(lease)).resolves.toEqual(latest);
  expect(full).toHaveBeenCalledTimes(2);
});

it.each(['write', 'freeze'] as const)('refuses all shared poll results after a concurrent %s', async action => {
  const pair = await fixture();
  const lease = { key, epoch: pair.initial.epoch, revision: 0, protocol: 'retained' as const, room: 'fountain', identity: pair.checkpoint.manifest.roomId };
  const save = async (text: string) => {
    pair.editor.dispatch(pair.editor.createTransaction().insertText([0, 0], 0, text));
    return pair.other.write({ epoch: lease.epoch, protocol: lease.protocol, update: Y.encodeStateAsUpdate(pair.document) });
  };
  const latest = await save('First ');
  let entered!: () => void, release!: () => void;
  const atFence = new Promise<void>(resolve => { entered = resolve; });
  const proceed = new Promise<void>(resolve => { release = resolve; });
  const read = pair.a.readDocument.bind(pair.a);
  vi.spyOn(pair.a, 'readDocument').mockImplementationOnce(async roomKey => {
    const row = await read(roomKey);
    entered();
    await proceed;
    return row;
  });
  const polls = Promise.allSettled(Array.from({ length: 4 }, () => pair.room.pollRetained(lease)));
  try {
    await atFence;
    if (action === 'write') {
      const newer = await save('Later ');
      await expect(pair.room.pollRetained(lease)).resolves.toEqual(newer);
    } else await pair.other.freeze(latest);
  } finally { release(); }
  expect(await polls).toEqual(Array(4).fill({ status: 'rejected', reason: expect.objectContaining({ code: 'revision-conflict' }) }));
  if (action === 'write') expect((await pair.room.pollRetained(lease))?.revision).toBe(latest.revision + 1);
  else await expect(pair.room.pollRetained(lease)).rejects.toMatchObject({ code: 'frozen' });
});

it('binds an immutable validated session before starting the provider',async()=>{
 const pair=await fixture(),leases:any[]=[],provider={connect:vi.fn(),disconnect:vi.fn()},admission=contract(pair,undefined,async lease=>{expect(provider.connect).not.toHaveBeenCalled();expect(Object.isFrozen(lease)).toBe(true);leases.push(lease);await (pair.room as any).admit(lease);}),client=make('Template',{provider,admission});await settled(client.editor);expect(leases).toEqual([{key,epoch:pair.initial.epoch,revision:0,protocol:'retained',room:'fountain',identity:pair.checkpoint.manifest.roomId}]);expect(provider.connect).toHaveBeenCalledTimes(1);expect(client.editor.getJSON()).toEqual(pair.editor.getJSON());
});

it.each([
 ['frozen',{phase:'frozen'}],['wrong key',{key:'other:paper'}],['wrong protocol',{protocol:'legacy'}],['invalid epoch',{epoch:'bad'}],['negative revision',{revision:-1}],['fractional revision',{revision:0.5}],['unsafe revision',{revision:Number.MAX_SAFE_INTEGER+1}],
] as const)('refuses %s metadata before reading checkpoint bytes or changing the client',async(_label,patch)=>{
 const pair=await fixture(),input=unreadable({...pair.initial,...patch} as DocumentRoomSnapshot),bind=vi.fn(),client=make('Template',{admission:contract(pair,async()=>input.snapshot,bind)});await settled(client.editor,'error');expect(state(client.editor)?.error?.message).toMatch(/admission|frozen/i);expect(input.bytes).not.toHaveBeenCalled();expect(bind).not.toHaveBeenCalled();expect(client.document.getXmlFragment('fountain').length).toBe(0);expect(client.editor.getText()).toBe('Template');
});

it('retains typing made while asynchronous authority binding is pending',async()=>{
 const pair=await fixture();let release!:()=>void;const ready=new Promise<void>(done=>{release=done;}),bind=vi.fn(async lease=>{await (pair.room as any).admit(lease);await ready;}),provider={connect:vi.fn()},client=make('Template',{provider,admission:contract(pair,undefined,bind)});await vi.waitFor(()=>expect(bind).toHaveBeenCalledOnce());client.editor.dispatch(client.editor.createTransaction().insertText([0,0],0,'DRAFT '));release();await settled(client.editor,'error');expect(state(client.editor)?.error?.message).toContain('local draft');expect(client.editor.getText()).toBe('DRAFT Template');expect(client.document.getXmlFragment('fountain').length).toBe(0);expect(provider.connect).not.toHaveBeenCalled();
});

it('cancels asynchronous binding without a late success reviving the session',async()=>{
 const pair=await fixture();let release!:()=>void,signal!:AbortSignal;const ready=new Promise<void>(done=>{release=done;}),bind=vi.fn(async(_lease,value)=>{signal=value;await ready;}),provider={connect:vi.fn()},client=make('Template',{provider,admission:contract(pair,undefined,bind)});await vi.waitFor(()=>expect(bind).toHaveBeenCalledOnce());expect(disconnectCollaboration(client.editor)).toBe(true);expect(signal.aborted).toBe(true);release();await new Promise(done=>setTimeout(done,20));expect(state(client.editor)?.status).toBe('disconnected');expect(client.document.getXmlFragment('fountain').length).toBe(0);expect(provider.connect).not.toHaveBeenCalled();
});

it('refuses a room frozen between snapshot load and authority binding',async()=>{
 const pair=await fixture(),provider={connect:vi.fn()},client=make('Template',{provider,admission:contract(pair,undefined,async lease=>{await pair.other.freeze(await pair.other.snapshot());await (pair.room as any).admit(lease);})});await settled(client.editor,'error');expect(state(client.editor)?.error?.message).toContain('frozen');expect(client.document.getXmlFragment('fountain').length).toBe(0);expect(provider.connect).not.toHaveBeenCalled();expect((await pair.room.snapshot()).phase).toBe('frozen');
});

it('refuses an epoch rotated between snapshot load and binding without importing the old checkpoint',async()=>{
 const pair=await fixture(),provider={connect:vi.fn()},client=make('Template',{provider,admission:contract(pair,undefined,async lease=>{await rotate(pair);await (pair.room as any).admit(lease);})});await settled(client.editor,'error');expect(state(client.editor)?.error?.message).toContain('epoch');expect(client.document.getXmlFragment('fountain').length).toBe(0);expect(provider.connect).not.toHaveBeenCalled();
});

it('pins an admitted epoch across reconnect even when the native room identity is unchanged',async()=>{
 const pair=await fixture();let snapshot=pair.initial;const bind=vi.fn(async lease=>{await (pair.room as any).admit(lease);}),provider={connect:vi.fn(),disconnect:vi.fn()},client=make('Template',{provider,admission:contract(pair,async()=>snapshot,bind)});await settled(client.editor);client.editor.dispatch(client.editor.createTransaction().insertText([0,0],0,'PENDING '));const draft=client.editor.getJSON(),before=Y.encodeStateAsUpdate(client.document),rotated=await rotate(pair);expect(rotated.checkpoint.manifest.roomId).toBe(pair.checkpoint.manifest.roomId);const input=unreadable({...rotated,protocol:'retained'});snapshot=input.snapshot;expect(reconnectCollaboration(client.editor)).toBe(true);await settled(client.editor,'error');expect(state(client.editor)?.error?.message).toContain('epoch');expect(client.editor.getJSON()).toEqual(draft);expect(Y.encodeStateAsUpdate(client.document)).toEqual(before);expect(input.bytes).not.toHaveBeenCalled();expect(bind).toHaveBeenCalledTimes(1);expect(provider.connect).toHaveBeenCalledTimes(1);
});

it('accepts newer revisions of the same epoch and rejects a cached lower revision before bytes',async()=>{
 const pair=await fixture();let snapshot=pair.initial;const provider={connect:vi.fn()},client=make('Template',{provider,admission:contract(pair,async()=>snapshot)});await settled(client.editor);pair.editor.dispatch(pair.editor.createTransaction().insertText([0,0],0,'SERVER '));snapshot=await pair.room.write({epoch:snapshot.epoch,protocol:'retained',update:Y.encodeStateAsUpdate(pair.document)});expect(reconnectCollaboration(client.editor)).toBe(true);await settled(client.editor);expect(client.editor.getText()).toBe('SERVER Shared paper');const input=unreadable(pair.initial);snapshot=input.snapshot;expect(reconnectCollaboration(client.editor)).toBe(true);await settled(client.editor,'error');expect(state(client.editor)?.error?.message).toContain('revision');expect(input.bytes).not.toHaveBeenCalled();expect(client.editor.getText()).toBe('SERVER Shared paper');
});

it('owns authority key and binding callback before asynchronous loading',async()=>{
 const pair=await fixture();let release!:(value:DocumentRoomSnapshot)=>void;const pending=new Promise<DocumentRoomSnapshot>(done=>{release=done;}),bind=vi.fn(async lease=>{await (pair.room as any).admit(lease);}),admission=contract(pair,()=>pending,bind),client=make('Template',{admission});admission.authority.key='wrong:key';admission.authority.bind=()=>{throw new Error('Replaced binding');};release(pair.initial);await settled(client.editor);expect(bind).toHaveBeenCalledTimes(1);expect(client.editor.getText()).toBe('Shared paper');
});

it('checks provider admission without changing the persisted generation, revision or wire',async()=>{
 const pair=await fixture(),before=await pair.a.readDocument(key),lease={key,epoch:pair.initial.epoch,revision:0,protocol:'retained',room:'fountain',identity:pair.checkpoint.manifest.roomId},accepted=await (pair.room as any).admit(lease);expect(accepted).toEqual(pair.initial);expect(await pair.a.readDocument(key)).toEqual(before);
});

it.each(['epoch','identity','room','revision'] as const)('refuses an incorrect server admission %s without modifying storage',async field=>{
 const pair=await fixture(),before=await pair.a.readDocument(key),lease:any={key,epoch:pair.initial.epoch,revision:0,protocol:'retained',room:'fountain',identity:pair.checkpoint.manifest.roomId};lease[field]=field==='revision'?1:field==='epoch'?crypto.randomUUID():'different';await expect((pair.room as any).admit(lease)).rejects.toThrow();expect(await pair.a.readDocument(key)).toEqual(before);
});

it('owns server admission metadata before repository awaits',async()=>{
 const pair=await fixture(),request={key,epoch:pair.initial.epoch,revision:0,protocol:'retained',room:'fountain',identity:pair.checkpoint.manifest.roomId},pending=(pair.room as any).admit(request);request.epoch=crypto.randomUUID();request.room='changed';expect(await pending).toEqual(pair.initial);
});

it('refuses a server generation changed during checkpoint verification',async()=>{
 const pair=await fixture();let reads=0;const repository:DocumentRoomRepository={...pair.a,createDocument:record=>pair.a.createDocument(record),compareDocument:(...args)=>pair.a.compareDocument(...args),readDocument:async requested=>{if(++reads===2)await pair.other.freeze(await pair.other.snapshot());return pair.a.readDocument(requested);}},room=new CoordinatedDocumentRoom(repository,key,pair.schema,version),request={key,epoch:pair.initial.epoch,revision:0,protocol:'retained',room:'fountain',identity:pair.checkpoint.manifest.roomId};await expect((room as any).admit(request)).rejects.toMatchObject({code:'revision-conflict'});expect((await pair.room.snapshot()).phase).toBe('frozen');
});

it.each(['authority','checkpoint'] as const)('keeps a refreshed remote checkpoint out of author undo while retaining the author edit (%s)',async mode=>{
 const pair=await fixture(),admission=mode==='authority'?contract(pair):{schemaVersion:version,load:async()=>(await pair.room.snapshot()).checkpoint},client=make('Template',{admission});await settled(client.editor);client.editor.dispatch(client.editor.createTransaction().insertText([0,0],0,'LOCAL '));pair.editor.dispatch(pair.editor.createTransaction().insertText([0,0],pair.editor.state.doc.child(0).textContent.length,' REMOTE'));await pair.room.write({epoch:pair.initial.epoch,protocol:'retained',update:Y.encodeStateAsUpdate(pair.document)});expect(reconnectCollaboration(client.editor)).toBe(true);await settled(client.editor);expect(client.editor.getText()).toBe('LOCAL Shared paper REMOTE');expect(undoCollaboration(client.editor)).toBe(true);expect(client.editor.getText()).toBe('Shared paper REMOTE');expect(redoCollaboration(client.editor)).toBe(true);expect(client.editor.getText()).toBe('LOCAL Shared paper REMOTE');
});

it.each([{key:'../bad',bind:()=>{}},{key,bind:null},{key:'',bind:()=>{}}])('rejects invalid authority configuration (%j)',authority=>{
 const client=make('Template'),before=Y.encodeStateAsUpdate(client.document);
 const kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document:client.document,user:{id:'author',name:'Author',color:'#7048e8'},admission:{schemaVersion:version,load:()=>({} as any),authority:authority as any}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:content('Template')});cleanup.push(()=>editor.destroy());expect(state(editor)?.status).toBe('error');expect(state(editor)?.error?.message).toContain('authority admission contract');expect(Y.encodeStateAsUpdate(client.document)).toEqual(before);
});

it.each(['fountain','Research / α 😀'])('keeps the generic server admission fence compatible with legacy XML room %s',async roomName=>{
 const pair=await fixture(),document=new Y.Doc(),kit=composeExtensions([CoreExtension,createYjsCollaborationExtension({document,fragment:document.getXmlFragment(roomName),user:{id:'legacy',name:'Legacy',color:'#7048e8'}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:content('Legacy paper')});cleanup.push(()=>{editor.destroy();document.destroy();});const checkpoint=await captureLegacyCheckpoint(document,editor.state.schema,version,{},roomName),legacyKey=key+':legacy',room=new CoordinatedDocumentRoom(pair.a,legacyKey,editor.state.schema,version),snapshot=await room.initialize(checkpoint),root=document.getXmlFragment(roomName).get(0) as Y.XmlElement,reference=Y.createRelativePositionFromTypeIndex(root,0).type!,accepted=await room.admit({key:legacyKey,epoch:snapshot.epoch,revision:0,protocol:'legacy',room:roomName,identity:`yjs-${reference.client}-${reference.clock}`});expect(accepted).toEqual(snapshot);expect(accepted.checkpoint.update).toEqual(checkpoint.update);
});
