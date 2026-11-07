// @vitest-environment node
import {afterEach,expect,it} from 'vitest';
import * as Y from 'yjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {CoreExtension,MathExtension,composeExtensions,createEditor,defineExtension,getCollaborationState,type NodeJSON} from '../src';
import {createYjsCollaborationExtension} from '../src/yjs';
import {createRetainedYjsCollaborationExtension} from '../src/yjs/retained-adapter';
import {captureLegacyCheckpoint,restoreLegacyCheckpoint,type LegacyProjectionOptions,type LegacyCheckpoint} from '../src/yjs/legacy-checkpoint';
import {buildLegacyMigrationCandidate,type LegacyMigrationOptions} from '../src/yjs/legacy-migration';
import {retainedStructuredRootMigrator,type RetainedRootMigrator} from '../src/yjs/retained-migration';
import {restoreRetainedCheckpoint,type RetainedCheckpoint} from '../src/yjs/retained-checkpoint';
import {RetainedDocumentStore} from '../src/yjs/retained-document';
import {applyDocumentRoomUpdate,CoordinatedDocumentRoom} from '../src/yjs/document-room';
import {CrossFormatRoomHandoff} from '../src/yjs/cross-format-handoff';
import {SQLiteRetainedRoomRepository} from '../examples/backends/retained-sqlite';
import {defineStructuredAttribute,setStructuredAttribute} from '../src/structured-attributes';

const cleanup:Array<()=>void>=[];afterEach(()=>{while(cleanup.length)cleanup.pop()!();});
const version='schema-1',target='mapped-paper',key='namespace:paper';
const options=(destinationRoom?:string,migrators:readonly RetainedRootMigrator[]=[]):LegacyMigrationOptions=>({history:'reset-with-source-checkpoint',offline:'reconcile-before-activation',externalState:'host-coordinated',migrators,...(destinationRoom===undefined?{}:{destinationRoom})});
const policy=()=>({history:'reset-with-source-archive' as const,offline:'retain-retired-room-branches' as const,externalReceipt:'coordinated-namespace-change'});
const panel=defineExtension({name:'namespace-panel',nodes:{structured_panel:{group:'block',atom:true}}}),definition=defineStructuredAttribute({nodeType:'structured_panel',attribute:'config',root:'object'});
const content:NodeJSON={type:'doc',attrs:{metadata:{title:'Named paper'}},content:[{type:'paragraph',attrs:{nodeId:'intro'},content:[{type:'text',text:'Alpha α 😀'}]},{type:'math_block',attrs:{latex:'x^2+y^2',label:'eq:one'}},{type:'code_block',attrs:{language:'lean'},content:[{type:'text',text:'example : 1 + 1 = 2 := by decide'}]}]};
function source(name:string,structured=false){
 const document=new Y.Doc(),projection:LegacyProjectionOptions=structured?{structuredAttributes:{definitions:[definition],mapName:'widgets'}}:{};
 const kit=composeExtensions([CoreExtension,MathExtension,panel,createYjsCollaborationExtension({document,fragment:document.getXmlFragment(name),...projection,captureTimeout:0,user:{id:'old',name:'Old author',color:'#7048e8'}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:structured?{...content,content:[...content.content!,{type:'structured_panel',attrs:{nodeId:'widget',config:{columns:2}}}]}:content});
 cleanup.push(()=>{editor.destroy();document.destroy();});expect(getCollaborationState(editor)?.status).toBe('connected');
 return {document,editor,schema:editor.state.schema,projection,name,capture:()=>captureLegacyCheckpoint(document,editor.state.schema,version,projection,name)};
}
async function retained(checkpoint:RetainedCheckpoint,pair:ReturnType<typeof source>){const restored=await restoreRetainedCheckpoint(checkpoint,pair.schema,version);cleanup.push(()=>restored.document.destroy());return restored;}
async function authority(name='Research / draft α'){
 const directory=mkdtempSync(join(tmpdir(),'fountain-namespace-'));cleanup.push(()=>{if(dirname(resolve(directory))!==resolve(tmpdir())||!basename(directory).startsWith('fountain-namespace-'))throw new Error('Unsafe cleanup target.');rmSync(directory,{recursive:true,force:true});});
 const pair=source(name),path=join(directory,'rooms.sqlite'),a=new SQLiteRetainedRoomRepository(path),b=new SQLiteRetainedRoomRepository(path);cleanup.push(()=>b.close());cleanup.push(()=>a.close());
 const room=new CoordinatedDocumentRoom(a,key,pair.schema,version),handoff=new CrossFormatRoomHandoff(a,key,pair.schema,version),second=new CrossFormatRoomHandoff(b,key,pair.schema,version),checkpoint=await pair.capture(),initial=await room.initialize(checkpoint);return {...pair,path,a,b,room,handoff,second,checkpoint,initial};
}
const names=[['spaces','Research notes'],['Unicode','研究 / α 😀'],['punctuation','notes/../../draft?'],['prototype-like','__proto__'],['empty named root',''],['maximum length','x'.repeat(1000)]] as const;
it.each(names)('preserves and explicitly maps a %s source namespace',async(_label,name)=>{
 const pair=source(name),before=Y.encodeStateAsUpdate(pair.document),checkpoint=await pair.capture(),candidate=await buildLegacyMigrationCandidate(checkpoint,pair.schema,version,options(target),pair.projection),opened=await retained(candidate.destination,pair),old=await restoreLegacyCheckpoint(candidate.source,pair.schema,version,pair.projection);cleanup.push(()=>old.document.destroy());
 expect(candidate.source.manifest.room).toBe(name);expect(candidate.destination.manifest.room).toBe(target);expect(candidate.report).toMatchObject({sourceRoom:name,destinationRoom:target});expect(opened.baseDocument.toJSON()).toEqual(pair.editor.getJSON());expect(old.baseDocument.toJSON()).toEqual(pair.editor.getJSON());expect(Y.encodeStateAsUpdate(pair.document)).toEqual(before);expect(candidate.source.update).toEqual(before);
});
it('requires an explicit target for an incompatible name without altering the source',async()=>{
 const pair=source('Research / α'),checkpoint=await pair.capture();await expect(buildLegacyMigrationCandidate(checkpoint,pair.schema,version,options())).rejects.toThrow('explicit retained destinationRoom');expect(Y.encodeStateAsUpdate(pair.document)).toEqual(checkpoint.update);
});
it('preserves the default compatible namespace and supports an explicit alias',async()=>{
 const pair=source('fountain'),checkpoint=await pair.capture(),same=await buildLegacyMigrationCandidate(checkpoint,pair.schema,version,options()),mapped=await buildLegacyMigrationCandidate(checkpoint,pair.schema,version,options(target));expect(same.destination.manifest.room).toBe('fountain');expect(mapped.destination.manifest.room).toBe(target);expect((await retained(mapped.destination,pair)).baseDocument.toJSON()).toEqual(pair.editor.getJSON());
});
it.each(['','bad space','../paper','x'.repeat(195),7])('rejects invalid explicit target %j before installation',async destinationRoom=>{
 const pair=source('fountain'),checkpoint=await pair.capture();await expect(buildLegacyMigrationCandidate(checkpoint,pair.schema,version,{...options(),destinationRoom:destinationRoom as string})).rejects.toThrow('destination namespace');expect(Y.encodeStateAsUpdate(pair.document)).toEqual(checkpoint.update);
});
it('owns the destination namespace before asynchronous validation',async()=>{
 const pair=source('fountain'),checkpoint=await pair.capture(),settings={...options(target)},pending=buildLegacyMigrationCandidate(checkpoint,pair.schema,version,settings);settings.destinationRoom='changed-later';expect((await pending).destination.manifest.room).toBe(target);
});
it('preserves native text/node references through an explicit namespace change',async()=>{
 const pair=source('Paper / source'),root=pair.document.getXmlFragment(pair.name).get(0) as Y.XmlElement,paragraph=root.get(0) as Y.XmlElement,text=(paragraph.get(0) as Y.XmlElement).get(0) as Y.XmlText,ref=Y.createRelativePositionFromTypeIndex(paragraph,0).type!;
 const point=Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text,2,-1)),identity=`yjs-${ref.client}-${ref.clock}`,map=pair.document.getMap('anchors');map.set('point',point);map.set('node',identity);
 const owner:RetainedRootMigrator={name:'anchors',roots:['anchors'],migrate(context){const input=context.source.getMap('anchors'),out=context.target.getMap('anchors');out.set('point',context.textAnchor(input.get('point')));out.set('node',context.nodeIdentity(input.get('node') as string));},verify(context){expect(context.target.getMap('anchors').size).toBe(2);}};
 const checkpoint=await pair.capture(),candidate=await buildLegacyMigrationCandidate(checkpoint,pair.schema,version,options(target,[owner])),opened=await retained(candidate.destination,pair),reader=new RetainedDocumentStore(opened.document,target,pair.schema,()=>{throw new Error('Read only');});cleanup.push(()=>reader.destroy());reader.read();expect(reader.resolveTextAnchor(opened.document.getMap('anchors').get('point'))).toEqual({path:[0,0],offset:2});expect(reader.path(opened.document.getMap('anchors').get('node') as string)).toEqual([0]);expect(candidate.report.translated).toMatchObject({textAnchors:1,nodeIdentities:1});
});
it('preserves explicit structured-map ownership and edits after namespace migration',async()=>{
 const pair=source('Paper / source',true),structured=pair.projection.structuredAttributes!,checkpoint=await pair.capture(),candidate=await buildLegacyMigrationCandidate(checkpoint,pair.schema,version,options(target,[retainedStructuredRootMigrator(structured)]),pair.projection),opened=await retained(candidate.destination,pair);
 const kit=composeExtensions([CoreExtension,MathExtension,panel,createRetainedYjsCollaborationExtension({document:opened.document,fragmentName:target,structuredAttributes:structured,user:{id:'new',name:'New author',color:'#7048e8'}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:pair.editor.getJSON()});cleanup.push(()=>editor.destroy());expect(getCollaborationState(editor)?.status).toBe('connected');expect(editor.getJSON()).toEqual(pair.editor.getJSON());expect(setStructuredAttribute(editor,[3],definition,['columns'],4)).toBe(true);expect((editor.state.doc.child(3).attrs.config as any).columns).toBe(4);expect((pair.editor.state.doc.child(3).attrs.config as any).columns).toBe(2);
});
it('refuses target-core collisions and preserves unclaimed auxiliary roots',async()=>{
 const pair=source('fountain');pair.document.getMap(`${target}:document`).set('important','keep');const checkpoint=await pair.capture();await expect(buildLegacyMigrationCandidate(checkpoint,pair.schema,version,options(target))).rejects.toThrow('Unclaimed');const owner:RetainedRootMigrator={name:'collision',roots:[`${target}:document`],migrate(){},verify(){}};await expect(buildLegacyMigrationCandidate(checkpoint,pair.schema,version,options(target,[owner]))).rejects.toThrow('reserved');expect(Y.encodeStateAsUpdate(pair.document)).toEqual(checkpoint.update);
});
it('reads the selected source without falling back to another default fragment',async()=>{
 const pair=source('Selected / paper'),other=pair.document.getXmlFragment('fountain');other.insert(0,[new Y.XmlElement('unrelated')]);const checkpoint=await pair.capture(),opened=await restoreLegacyCheckpoint(checkpoint,pair.schema,version);cleanup.push(()=>opened.document.destroy());expect(opened.baseDocument.toJSON()).toEqual(pair.editor.getJSON());await expect(buildLegacyMigrationCandidate(checkpoint,pair.schema,version,options(target))).rejects.toThrow('Unclaimed');
});
it('rejects oversized and unpaired source names without normalizing them',async()=>{
 const pair=source('x'.repeat(1001));await expect(pair.capture()).rejects.toThrow();const broken=source('raw-\uD800');await expect(broken.capture()).rejects.toThrow('unpaired UTF-16');
});
for(const choice of ['frozen-source','source-branch'] as const)it(`persists named migration and reversible ${choice} rollback with late source bytes`,async()=>{
 const pair=await authority(),ticket=await pair.room.freeze(pair.initial),operation=crypto.randomUUID(),moved=await pair.handoff.migrateLegacy(ticket,operation,options(target),policy());expect(moved.snapshot.checkpoint.manifest.room).toBe(target);
 pair.editor.dispatch(pair.editor.createTransaction().insertText([0,0],0,'OLD '));const oldBytes=Y.encodeStateAsUpdate(pair.document),branch=await pair.second.retainLateUpdate({archiveId:operation,sourceEpoch:pair.initial.epoch,update:oldBytes});expect((await pair.handoff.retiredBatch(operation,branch.branchRevision)).update).toEqual(oldBytes);
 const fresh=await retained(moved.snapshot.checkpoint as RetainedCheckpoint,pair),kit=composeExtensions([CoreExtension,MathExtension,panel,createRetainedYjsCollaborationExtension({document:fresh.document,fragmentName:target,user:{id:'new',name:'New author',color:'#7048e8'}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:content});cleanup.push(()=>editor.destroy());editor.dispatch(editor.createTransaction().insertText([0,0],0,'NEW '));const accepted=await pair.room.write({epoch:moved.snapshot.epoch,protocol:'retained',update:Y.encodeStateAsUpdate(fresh.document)}),back=await pair.second.rollback(await pair.room.freeze(accepted),crypto.randomUUID(),operation,choice,policy());expect(back.snapshot.checkpoint.manifest.room).toBe(pair.name);expect(back.archive.source.checkpoint.manifest.room).toBe(target);
 const old=await restoreLegacyCheckpoint(back.snapshot.checkpoint as LegacyCheckpoint,pair.schema,version);cleanup.push(()=>old.document.destroy());expect(old.baseDocument.child(0).textContent).toBe(choice==='source-branch'?'OLD Alpha α 😀':'Alpha α 😀');
 const again=await pair.handoff.rollback(await pair.room.freeze(back.snapshot),crypto.randomUUID(),back.archive.id,'frozen-source',policy());expect(again.snapshot.checkpoint.manifest.room).toBe(target);expect((await retained(again.snapshot.checkpoint as RetainedCheckpoint,pair)).baseDocument.toJSON()).toEqual(editor.getJSON());
});
it('binds operation replay to the explicit destination namespace',async()=>{
 const pair=await authority(),ticket=await pair.room.freeze(pair.initial),id=crypto.randomUUID(),moved=await pair.handoff.migrateLegacy(ticket,id,options(target),policy());expect((await pair.second.migrateLegacy(ticket,id,options(target),policy())).replayed).toBe(true);await expect(pair.second.migrateLegacy(ticket,id,options('different-target'),policy())).rejects.toThrow('another destination');await expect(pair.second.migrateLegacy(ticket,id,options(),policy())).rejects.toThrow('another destination');expect(await pair.room.snapshot()).toEqual(moved.snapshot);
});
it('can replay older same-namespace archives that predate mapping report fields',async()=>{
 const pair=await authority('fountain'),ticket=await pair.room.freeze(pair.initial),id=crypto.randomUUID();await pair.handoff.migrateLegacy(ticket,id,options(),policy());const db=new DatabaseSync(pair.path);cleanup.push(()=>db.close());const row=db.prepare('SELECT metadata FROM fountain_cross_format_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key,id)!,metadata=JSON.parse(row.metadata as string);delete metadata.candidateReport.sourceRoom;delete metadata.candidateReport.destinationRoom;db.prepare('UPDATE fountain_cross_format_archives_v1 SET metadata = ? WHERE room_key = ? AND archive_id = ?').run(JSON.stringify(metadata),key,id);expect((await pair.second.migrateLegacy(ticket,id,options(),policy())).replayed).toBe(true);
});
it.each(['different-target','missing-both','partial'] as const)('rejects corrupted mapping metadata (%s) without changing the live room',async kind=>{
 const pair=await authority(),ticket=await pair.room.freeze(pair.initial),id=crypto.randomUUID(),moved=await pair.handoff.migrateLegacy(ticket,id,options(target),policy()),db=new DatabaseSync(pair.path);cleanup.push(()=>db.close());const row=db.prepare('SELECT metadata FROM fountain_cross_format_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key,id)!,metadata=JSON.parse(row.metadata as string);
 if(kind==='different-target')metadata.candidateReport.destinationRoom='different';else{delete metadata.candidateReport.sourceRoom;if(kind==='missing-both')delete metadata.candidateReport.destinationRoom;}
 db.prepare('UPDATE fountain_cross_format_archives_v1 SET metadata = ? WHERE room_key = ? AND archive_id = ?').run(JSON.stringify(metadata),key,id);await expect(pair.second.migrateLegacy(ticket,id,options(target),policy())).rejects.toThrow('Invalid legacy migration archive');expect(await pair.room.snapshot()).toEqual(moved.snapshot);
});
it('owns the authoritative destination setting before awaiting repository reads',async()=>{
 const pair=await authority(),ticket=await pair.room.freeze(pair.initial),settings={...options(target)},pending=pair.handoff.migrateLegacy(ticket,crypto.randomUUID(),settings,policy());settings.destinationRoom='changed-after-call';expect((await pending).snapshot.checkpoint.manifest.room).toBe(target);
});
it('refuses a nested fragment instead of selecting an unrelated top-level default',async()=>{
 const document=new Y.Doc(),fragment=new Y.XmlFragment();document.getMap('container').set('body',fragment);document.getXmlFragment('fountain');const kit=composeExtensions([CoreExtension,createYjsCollaborationExtension({document,fragment,user:{id:'nested',name:'Nested',color:'#7048e8'}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Nested source'}]}]}});cleanup.push(()=>{editor.destroy();document.destroy();});expect(getCollaborationState(editor)?.status).toBe('connected');const before=Y.encodeStateAsUpdate(document);await expect(captureLegacyCheckpoint(document,editor.state.schema,version,{},'container')).rejects.toThrow('declared XML document root');expect(Y.encodeStateAsUpdate(document)).toEqual(before);
});

function nestedSource() {
  const document = new Y.Doc({gc:false}), siblings = document.getArray('container'), fragment = new Y.XmlFragment();
  siblings.insert(0, ['host setting', fragment]);
  const decoy = document.getXmlFragment('fountain');
  const kit = composeExtensions([CoreExtension, MathExtension, createYjsCollaborationExtension({document, fragment, user:{id:'nested',name:'Nested',color:'#7048e8'}})]);
  const editor = createEditor({schema:kit.schema, plugins:kit.plugins, content});
  const decoyKit = composeExtensions([CoreExtension, MathExtension, createYjsCollaborationExtension({document, fragment:decoy, user:{id:'decoy',name:'Decoy',color:'#7048e8'}})]);
  const decoyEditor = createEditor({schema:decoyKit.schema, plugins:decoyKit.plugins, content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Different document'}]}]}});
  cleanup.push(() => { decoyEditor.destroy(); editor.destroy(); document.destroy(); });
  const capture = () => captureLegacyCheckpoint(document, editor.state.schema, version, {}, 'fountain', fragment);
  return {document, editor, schema:editor.state.schema, siblings, fragment, decoy, capture};
}

it('reopens the exact nested fragment across array shifts with an unrelated default document present', async () => {
  const pair = nestedSource(), checkpoint = await pair.capture();
  expect(checkpoint.manifest.fragment).toBeDefined();
  expect(checkpoint.update).toEqual(Y.encodeStateAsUpdate(pair.document));
  const restored = await restoreLegacyCheckpoint(checkpoint, pair.schema, version);
  cleanup.push(() => restored.document.destroy());
  expect(restored.reader.fragment).toBe(restored.document.getArray('container').get(1));
  expect(restored.baseDocument.toJSON()).toEqual(pair.editor.getJSON());
  expect(restored.document.getXmlFragment('fountain').toString()).toContain('Different document');
  restored.document.getArray('container').insert(0, ['another setting']);
  const shifted = await captureLegacyCheckpoint(restored.document, pair.schema, version, {}, 'fountain', restored.reader.fragment);
  expect(shifted.manifest.fragment).toEqual(checkpoint.manifest.fragment);
  expect(shifted.manifest.documentSha256).toBe(checkpoint.manifest.documentSha256);
  const changed = {manifest:{...checkpoint.manifest,fragment:{...checkpoint.manifest.fragment!,clock:0}},update:checkpoint.update};
  await expect(restoreLegacyCheckpoint(changed, pair.schema, version)).rejects.toThrow('checksum mismatch');
});

it('refuses foreign, detached, and mismatched top-level handles without altering the source', async () => {
  const pair = nestedSource(), other = new Y.Doc();
  cleanup.push(() => other.destroy());
  const before = Y.encodeStateAsUpdate(pair.document);
  for (const fragment of [other.getXmlFragment('fountain'), new Y.XmlFragment(), pair.decoy]) {
    await expect(captureLegacyCheckpoint(pair.document, pair.schema, version, {}, 'other', fragment)).rejects.toThrow('integrated nested XML fragment');
  }
  expect(Y.encodeStateAsUpdate(pair.document)).toEqual(before);
  pair.siblings.delete(1);
  await expect(pair.capture()).rejects.toThrow('detached');
});

it('requires explicit migration of the host roots around a nested source', async () => {
  const pair = nestedSource(), checkpoint = await pair.capture();
  await expect(buildLegacyMigrationCandidate(checkpoint, pair.schema, version, options(target))).rejects.toThrow(/Unclaimed legacy migration roots.*container.*fountain/);
  expect(Y.encodeStateAsUpdate(pair.document)).toEqual(checkpoint.update);
});

it('preserves the nested identity during writes and refuses replacement even with garbage collection disabled', async () => {
  const pair = nestedSource(), checkpoint = await pair.capture();
  pair.siblings.insert(0, ['new host setting']);
  pair.editor.dispatch(pair.editor.createTransaction().insertText([0,0], 0, 'Offline '));
  const update = await applyDocumentRoomUpdate(checkpoint, pair.schema, version, {}, Y.encodeStateAsUpdate(pair.document)) as LegacyCheckpoint;
  expect(update.manifest.fragment).toEqual(checkpoint.manifest.fragment);
  const reopened = await restoreLegacyCheckpoint(update, pair.schema, version);
  cleanup.push(() => reopened.document.destroy());
  expect(reopened.baseDocument.child(0).textContent).toBe('Offline Alpha α 😀');
  const replacement = pair.fragment.clone();
  pair.siblings.delete(2);
  pair.siblings.insert(2, [replacement]);
  await expect(applyDocumentRoomUpdate(update, pair.schema, version, {}, Y.encodeStateAsUpdate(pair.document))).rejects.toMatchObject({code:'invalid-update'});
  expect(update.manifest.fragment).toEqual(checkpoint.manifest.fragment);
});
