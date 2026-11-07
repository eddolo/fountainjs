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
