// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import * as Y from 'yjs';
import {CoreExtension,composeExtensions,createEditor,defineExtension,disconnectCollaboration,getCollaborationState,reconnectCollaboration,replaceCollaborationAdapter,undoCollaboration,type Editor,type NodeJSON} from '../src';
import {createRetainedYjsCollaborationExtension,RetainedYjsCollaborationAdapter} from '../src/yjs/retained-adapter';
import {captureRetainedCheckpoint,type RetainedCheckpoint} from '../src/yjs/retained-checkpoint';
import {createYjsCollaborationExtension,type YjsProvider} from '../src/yjs/legacy';
import {prepareRetainedAdmission} from '../src/yjs/retained-admission';
import {defineStructuredAttribute, setStructuredAttribute} from '../src/structured-attributes';

const cleanup:Array<()=>void>=[];afterEach(()=>{while(cleanup.length)cleanup.pop()!();});
const version='admission-1',content=(text:string):NodeJSON=>({type:'doc',content:[{type:'paragraph',attrs:{nodeId:'intro'},content:[{type:'text',text}]}]});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function make(document:Y.Doc,text='Local template',extra:Record<string,unknown>={}){const kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document,user:{id:'author',name:'Author',color:'#7048e8'},captureTimeout:0,...extra})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:content(text)});cleanup.push(()=>editor.destroy());return editor;}
function doc(){const document=new Y.Doc();cleanup.push(()=>document.destroy());return document;}
async function source(){const document=doc(),editor=make(document,'Authoritative paper');return {document,editor,checkpoint:await captureRetainedCheckpoint(document,editor.state.schema,version)};}
const status=(editor:Editor)=>getCollaborationState(editor)?.status;
const settled=async(editor:Editor,target='connected')=>vi.waitFor(()=>expect(status(editor)).toBe(target));
const admission=(load:(signal:AbortSignal)=>RetainedCheckpoint|Promise<RetainedCheckpoint>,schemaVersion=version)=>({admission:{schemaVersion,load}});

it.each([undefined, 'research-settings'])('validates every field of a saved structured map before binding (%s)', async mapName => {
  const settings = defineExtension({ name: 'test-settings', nodes: { settings: { group: 'block', atom: true } } });
  const config = defineStructuredAttribute({ nodeType: 'settings', attribute: 'config', root: 'object' });
  const display = defineStructuredAttribute({ nodeType: 'settings', attribute: 'display', root: 'object' });
  const data: NodeJSON = { type: 'doc', content: [{ type: 'settings', attrs: {
    nodeId: 'settings-1', config: { columns: 2 }, display: { compact: false },
  } }] };
  const open = (document: Y.Doc, initial: NodeJSON, options: Parameters<typeof createRetainedYjsCollaborationExtension>[0]['structuredAttributes'],
    extra: Partial<Parameters<typeof createRetainedYjsCollaborationExtension>[0]> = {}) => {
    const kit = composeExtensions([CoreExtension, settings, createRetainedYjsCollaborationExtension({
      document, user: { id: 'author', name: 'Author', color: '#7048e8' }, structuredAttributes: options, ...extra,
    })]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: initial });
    cleanup.push(() => editor.destroy());
    return editor;
  };
  const server = doc(), structured = { definitions: [config, display], mapName };
  const author = open(server, data, structured);
  expect(setStructuredAttribute(author, [0], display, ['compact'], true)).toBe(true);
  const checkpoint = await captureRetainedCheckpoint(server, author.state.schema, version);
  const bind = vi.fn(), provider = { connect: vi.fn() };
  const extra = { provider, admission: {
    schemaVersion: version, authority: { key: 'paper', bind },
    load: () => ({ checkpoint, key: 'paper', epoch: '00000000-0000-0000-0000-000000000001',
      revision: 1, phase: 'active' as const, protocol: 'retained' as const }),
  } };
  for (const options of [undefined, { definitions: [config], mapName }, { definitions: [config, display], mapName: 'wrong-map' }]) {
    const client = doc(), before = Y.encodeStateAsUpdate(client);
    const refused = open(client, content('Keep this draft'), options, extra);
    await settled(refused, 'error');
    expect(getCollaborationState(refused)?.error?.message).toMatch(/structured.*map/i);
    expect(refused.getText()).toBe('Keep this draft');
    expect(Y.encodeStateAsUpdate(client)).toEqual(before);
    expect(bind).not.toHaveBeenCalled();
    expect(provider.connect).not.toHaveBeenCalled();
  }
  const conflicting = doc();
  Y.applyUpdate(conflicting, checkpoint.update);
  conflicting.getMap('rogue-map').set('draft', true);
  conflicting.getMap('fountain:document').set('structuredMap', 'rogue-map');
  const before = Y.encodeStateAsUpdate(conflicting);
  const refused = open(conflicting, content('Keep this draft'), { ...structured, mapName: 'rogue-map' }, extra);
  await settled(refused, 'error');
  expect(getCollaborationState(refused)?.error?.message).toContain('changed the saved structured attribute map');
  expect(Y.encodeStateAsUpdate(conflicting)).toEqual(before);
  expect(bind).not.toHaveBeenCalled();
  expect(provider.connect).not.toHaveBeenCalled();

  const admitted = open(doc(), data, structured, extra);
  await settled(admitted);
  expect(admitted.getJSON()).toEqual(author.getJSON());
  expect(admitted.state.doc.child(0).attrs.display).toEqual({ compact: true });
  expect(bind).toHaveBeenCalledOnce();
  expect(provider.connect).toHaveBeenCalledOnce();
});

it('keeps an empty client unseeded and the provider disconnected until validated admission',async()=>{
 const server=await source(),client=doc(),pending=deferred<RetainedCheckpoint>(),before=Y.encodeStateAsUpdate(client),provider={connect:vi.fn(()=>{expect(client.getXmlFragment('fountain').length).toBe(1);}),disconnect:vi.fn()},editor=make(client,'Local template',{provider,...admission(()=>pending.promise)});
 expect(status(editor)).toBe('connecting');expect(client.getXmlFragment('fountain').length).toBe(0);expect(Y.encodeStateAsUpdate(client)).toEqual(before);expect(provider.connect).not.toHaveBeenCalled();
 pending.resolve(server.checkpoint);await settled(editor);expect(editor.getJSON()).toEqual(server.editor.getJSON());expect(client.getXmlFragment('fountain').length).toBe(1);expect(provider.connect).toHaveBeenCalledTimes(1);expect(undoCollaboration(editor)).toBe(false);
});

it('admits two independently empty clients to one room without competing initial roots',async()=>{
 const server=await source(),leftDoc=doc(),rightDoc=doc(),left=make(leftDoc,'Left template',admission(()=>server.checkpoint)),right=make(rightDoc,'Right template',admission(()=>server.checkpoint));await Promise.all([settled(left),settled(right)]);
 expect(left.getJSON()).toEqual(server.editor.getJSON());expect(right.getJSON()).toEqual(left.getJSON());expect(leftDoc.getXmlFragment('fountain').toString()).toBe(rightDoc.getXmlFragment('fountain').toString());
 left.dispatch(left.createTransaction().insertText([0,0],0,'LEFT '));right.dispatch(right.createTransaction().insertText([0,0],right.state.doc.child(0).textContent.length,' RIGHT'));const a=Y.encodeStateAsUpdate(leftDoc),b=Y.encodeStateAsUpdate(rightDoc);Y.applyUpdate(leftDoc,b);Y.applyUpdate(rightDoc,a);
 expect(left.getJSON()).toEqual(right.getJSON());expect(left.getText()).toBe('LEFT Authoritative paper RIGHT');expect(status(left)).toBe('connected');expect(status(right)).toBe('connected');expect(leftDoc.getXmlFragment('fountain').length).toBe(1);expect(rightDoc.getXmlFragment('fountain').length).toBe(1);
});

it('preserves typing during admission and refuses silent draft replacement even on retry',async()=>{
 const server=await source(),client=doc(),pending=deferred<RetainedCheckpoint>(),editor=make(client,'Local template',admission(()=>pending.promise)),before=Y.encodeStateAsUpdate(client);
 editor.dispatch(editor.createTransaction().insertText([0,0],0,'DRAFT '));const draft=editor.getJSON();expect(undoCollaboration(editor)).toBe(false);pending.resolve(server.checkpoint);await settled(editor,'error');
 expect(getCollaborationState(editor)?.error?.message).toContain('local draft');expect(editor.getJSON()).toEqual(draft);expect(Y.encodeStateAsUpdate(client)).toEqual(before);expect(reconnectCollaboration(editor)).toBe(true);await settled(editor,'error');expect(editor.getJSON()).toEqual(draft);expect(Y.encodeStateAsUpdate(client)).toEqual(before);
 // Choosing the shared document is an explicit host transaction, never automatic cleaning.
 editor.dispatch(editor.createTransaction().replaceDocument(editor.state.schema.nodeFromJSON(server.editor.getJSON())));expect(reconnectCollaboration(editor)).toBe(true);await settled(editor);expect(editor.getJSON()).toEqual(server.editor.getJSON());
});

it('allows a draft that was explicitly undone back to its pre-join state',async()=>{
 const server=await source(),client=doc(),pending=deferred<RetainedCheckpoint>(),editor=make(client,'Local template',admission(()=>pending.promise)),original=editor.state.doc;
 editor.dispatch(editor.createTransaction().insertText([0,0],0,'TEMP '));editor.dispatch(editor.createTransaction().replaceDocument(original));pending.resolve(server.checkpoint);await settled(editor);expect(editor.getJSON()).toEqual(server.editor.getJSON());
});

it.each(['throw','reject'] as const)('contains a %s from admission without starting transport or mutating source',async kind=>{
 const client=doc(),before=Y.encodeStateAsUpdate(client),provider={connect:vi.fn(),disconnect:vi.fn()},load=()=>{if(kind==='throw')throw new Error('Admission unavailable');return Promise.reject(new Error('Admission unavailable'));},editor=make(client,'Local template',{provider,...admission(load)});await settled(editor,'error');expect(editor.getText()).toBe('Local template');expect(Y.encodeStateAsUpdate(client)).toEqual(before);expect(provider.connect).not.toHaveBeenCalled();expect(provider.disconnect).not.toHaveBeenCalled();
});

it('aborts a pending admission on disconnect and ignores a late successful response',async()=>{
 const server=await source(),client=doc(),before=Y.encodeStateAsUpdate(client),pending=deferred<RetainedCheckpoint>();let signal!:AbortSignal;const provider={connect:vi.fn(),disconnect:vi.fn()},editor=make(client,'Local template',{provider,...admission(value=>{signal=value;return pending.promise;})});
 expect(disconnectCollaboration(editor)).toBe(true);expect(signal.aborted).toBe(true);pending.resolve(server.checkpoint);await new Promise(done=>setTimeout(done,20));expect(status(editor)).toBe('disconnected');expect(Y.encodeStateAsUpdate(client)).toEqual(before);expect(provider.connect).not.toHaveBeenCalled();expect(provider.disconnect).not.toHaveBeenCalled();
});

it('keeps a newer reconnect intact when the retired admission subsequently fails',async()=>{
 const server=await source(),client=doc(),first=deferred<RetainedCheckpoint>(),second=deferred<RetainedCheckpoint>(),load=vi.fn().mockImplementationOnce(()=>first.promise).mockImplementationOnce(()=>second.promise),provider={connect:vi.fn(),disconnect:vi.fn()},editor=make(client,'Local template',{provider,...admission(load)});
 expect(reconnectCollaboration(editor)).toBe(true);second.resolve(server.checkpoint);await settled(editor);first.reject(new Error('Retired admission failure'));await new Promise(done=>setTimeout(done,20));expect(status(editor)).toBe('connected');expect(provider.connect).toHaveBeenCalledTimes(1);expect(provider.disconnect).not.toHaveBeenCalled();expect(editor.getJSON()).toEqual(server.editor.getJSON());
});

it('does not seed or reconnect after destruction during admission',async()=>{
 const server=await source(),client=doc(),before=Y.encodeStateAsUpdate(client),pending=deferred<RetainedCheckpoint>();let signal!:AbortSignal;const provider={connect:vi.fn()},editor=make(client,'Local template',{provider,...admission(value=>{signal=value;return pending.promise;})});editor.destroy();expect(signal.aborted).toBe(true);pending.resolve(server.checkpoint);await new Promise(done=>setTimeout(done,20));expect(Y.encodeStateAsUpdate(client)).toEqual(before);expect(provider.connect).not.toHaveBeenCalled();
});

it('retires pending admission before an adapter replacement can change the visible document',async()=>{
 const server=await source(),oldDoc=doc(),newDoc=doc(),pending=deferred<RetainedCheckpoint>(),editor=make(oldDoc,'Local template',admission(()=>pending.promise));expect(replaceCollaborationAdapter(editor,new RetainedYjsCollaborationAdapter({document:newDoc,user:{id:'new',name:'New',color:'#7048e8'}}))).toBe(true);const replacement=editor.getJSON(),oldBytes=Y.encodeStateAsUpdate(oldDoc);pending.resolve(server.checkpoint);await new Promise(done=>setTimeout(done,20));expect(status(editor)).toBe('connected');expect(editor.getJSON()).toEqual(replacement);expect(Y.encodeStateAsUpdate(oldDoc)).toEqual(oldBytes);
});

it.each(['checksum','schema','namespace','legacy'] as const)('refuses an invalid %s admission before changing the client',async kind=>{
 const server=await source(),client=doc(),before=Y.encodeStateAsUpdate(client);let checkpoint:RetainedCheckpoint=server.checkpoint;
 if(kind==='checksum'){const update=checkpoint.update;update[update.length-1]^=1;checkpoint={manifest:checkpoint.manifest,update};}
 if(kind==='namespace'){const other=doc(),editor=make(other,'Other',{fragmentName:'other'});checkpoint=await captureRetainedCheckpoint(other,editor.state.schema,version,'other');}
 if(kind==='legacy')checkpoint={manifest:{...checkpoint.manifest,format:'fountain-legacy-checkpoint/1'} as any,update:checkpoint.update};
 const editor=make(client,'Local template',admission(()=>checkpoint,kind==='schema'?'wrong-schema':version));await settled(editor,'error');expect(editor.getText()).toBe('Local template');expect(Y.encodeStateAsUpdate(client)).toEqual(before);
});

it('refuses an independently initialized local room instead of merging or dropping either source',async()=>{
 const server=await source(),client=doc(),original=make(client,'Offline draft');original.destroy();const before=Y.encodeStateAsUpdate(client),editor=make(client,'Offline draft',admission(()=>server.checkpoint));await settled(editor,'error');expect(editor.getText()).toBe('Offline draft');expect(Y.encodeStateAsUpdate(client)).toEqual(before);expect(server.editor.getText()).toBe('Authoritative paper');
});

it('merges same-room offline operations with the admitted snapshot before exposing the document',async()=>{
 const server=await source(),client=doc();Y.applyUpdate(client,server.checkpoint.update);const offline=make(client,'Ignored');offline.dispatch(offline.createTransaction().insertText([0,0],0,'OFFLINE '));offline.destroy();server.editor.dispatch(server.editor.createTransaction().insertText([0,0],server.editor.state.doc.child(0).textContent.length,' SERVER'));const checkpoint=await captureRetainedCheckpoint(server.document,server.editor.state.schema,version),editor=make(client,'OFFLINE Authoritative paper',admission(()=>checkpoint));await settled(editor);expect(editor.getText()).toBe('OFFLINE Authoritative paper SERVER');Y.applyUpdate(server.document,Y.encodeStateAsUpdate(client));expect(server.editor.getJSON()).toEqual(editor.getJSON());
});

it('does not publish presence or call provider status listeners while admission is pending',async()=>{
 const server=await source(),client=doc(),pending=deferred<RetainedCheckpoint>(),listeners=new Set<Function>(),write=vi.fn(),awareness={getLocalState:()=>null,getStates:()=>new Map(),setLocalStateField:write,on:vi.fn(),off:vi.fn()},provider:YjsProvider={awareness,connect:vi.fn(),on:vi.fn((_event,listener)=>{listeners.add(listener);}),off:vi.fn((_event,listener)=>{listeners.delete(listener);})},editor=make(client,'Local template',{provider,...admission(()=>pending.promise)});
 expect(write).not.toHaveBeenCalled();expect(listeners.size).toBe(0);pending.resolve(server.checkpoint);await settled(editor);expect(write).toHaveBeenCalled();expect(listeners.size).toBe(1);editor.destroy();expect(listeners.size).toBe(0);
});

it('does not add admission to the public legacy adapter or change its synchronous behavior',()=>{
 const document=doc(),kit=composeExtensions([CoreExtension,createYjsCollaborationExtension({document,user:{id:'legacy',name:'Legacy',color:'#7048e8'}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:content('Legacy source')});cleanup.push(()=>editor.destroy());expect(status(editor)).toBe('connected');expect(document.getXmlFragment('fountain').get(0)?.toString()).toContain('Legacy source');
});

it.each([{schemaVersion:version,load:null},{schemaVersion:'',load:()=>{}},{schemaVersion:'bad\nversion',load:()=>{}}])('rejects invalid admission options before constructing a session (%j)',contract=>{
 const document=doc(),before=Y.encodeStateAsUpdate(document);expect(()=>new RetainedYjsCollaborationAdapter({document,user:{id:'author',name:'Author',color:'#7048e8'},admission:contract as any})).toThrow('admission contract');expect(Y.encodeStateAsUpdate(document)).toEqual(before);
});

it('cleans up an asynchronous transport failure after admission and can retry the valid room',async()=>{
 const server=await source(),client=doc(),provider={connect:vi.fn().mockRejectedValueOnce(new Error('Transport refused')).mockResolvedValue(undefined),disconnect:vi.fn()},editor=make(client,'Local template',{provider,...admission(()=>server.checkpoint)});await settled(editor,'error');expect(provider.disconnect).toHaveBeenCalledTimes(1);expect(editor.getJSON()).toEqual(server.editor.getJSON());expect(reconnectCollaboration(editor)).toBe(true);await settled(editor);expect(provider.connect).toHaveBeenCalledTimes(2);expect(client.getXmlFragment('fountain').length).toBe(1);
});

it('refuses a staged admission if the client wire changes before installation',async()=>{
 const server=await source(),client=doc(),candidate=await prepareRetainedAdmission(client,server.checkpoint,server.editor.state.schema,version,'fountain');client.getMap('external').set('draft','KEEP');const before=Y.encodeStateAsUpdate(client);expect(()=>candidate.install('admission')).toThrow('changed shared state');expect(Y.encodeStateAsUpdate(client)).toEqual(before);expect(client.getXmlFragment('fountain').length).toBe(0);
});

it('refuses conflicting auxiliary root types before importing any authoritative bytes',async()=>{
 const server=await source(),client=doc();client.getText('fountain:document').insert(0,'KEEP');const before=Y.encodeStateAsUpdate(client);await expect(prepareRetainedAdmission(client,server.checkpoint,server.editor.state.schema,version,'fountain')).rejects.toThrow('root types conflict');expect(Y.encodeStateAsUpdate(client)).toEqual(before);
});

it('owns the admission schema version and loader before an asynchronous response',async()=>{
 const server=await source(),client=doc(),pending=deferred<RetainedCheckpoint>(),contract={schemaVersion:version,load:()=>pending.promise},editor=make(client,'Local template',{admission:contract});contract.schemaVersion='replaced';contract.load=()=>Promise.reject(new Error('Replaced loader'));pending.resolve(server.checkpoint);await settled(editor);expect(editor.getJSON()).toEqual(server.editor.getJSON());
});

it('preserves an actual legacy client document instead of overwriting it during admission',async()=>{
 const server=await source(),client=doc(),kit=composeExtensions([CoreExtension,createYjsCollaborationExtension({document:client,user:{id:'old',name:'Old',color:'#7048e8'}})]),old=createEditor({schema:kit.schema,plugins:kit.plugins,content:content('Legacy draft')});old.destroy();const before=Y.encodeStateAsUpdate(client),editor=make(client,'Legacy draft',admission(()=>server.checkpoint));await settled(editor,'error');expect(Y.encodeStateAsUpdate(client)).toEqual(before);expect(editor.getText()).toBe('Legacy draft');
});
