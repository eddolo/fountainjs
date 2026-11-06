import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as Y from 'yjs';

const directory=process.argv[2]??'cursor-overlay-build-20261106';
const prefix=process.argv[3]??'retained-compaction-diagnostic-20261106';
const sizes=(process.argv[4]??'128,1024').split(',').map(Number);
assert(sizes.every(value=>Number.isSafeInteger(value)&&value>0&&value<=2048));
assert.equal(typeof globalThis.document,'undefined');
const {CoreExtension,composeExtensions,createEditor,createCollaborationExtension,getCollaborationState,Selection,insertText,undoCollaboration,redoCollaboration}=await import(`./${directory}/engine.js`);
const {RetainedYjsCollaborationAdapter}=await import(`./${directory}/retained-adapter.js`);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const source={type:'doc',attrs:{audit:'compaction-diagnostic'},content:[
 {type:'paragraph',attrs:{nodeId:'paragraph-main'},content:[{type:'text',text:'Alpha'}]},
 {type:'image_super',attrs:{nodeId:'figure-main',src:'/figure.png',alt:'Retained figure'}},
]};
function create(document,id,content=source){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis.crypto,'randomUUID');
 Object.defineProperty(globalThis.crypto,'randomUUID',{configurable:true,writable:true,value:()=> '11111111-2222-4333-8444-'+String(document.clientID).padStart(12,'0')});
 try{
  const adapter=new RetainedYjsCollaborationAdapter({document,captureTimeout:0,user:{id,name:id,color:'#7048e8'}});
  const kit=composeExtensions([CoreExtension,createCollaborationExtension({adapter:()=>adapter})]);
  const editor=createEditor({schema:kit.schema,plugins:kit.plugins,content});
  assert.equal(getCollaborationState(editor)?.status,'connected');
  // Diagnostic inspection of private implementation state, not a public API.
  assert(adapter.manager instanceof Y.UndoManager);
  return {document,editor,adapter,destroy(){editor.destroy();document.destroy()}};
 }finally{if(descriptor)Object.defineProperty(globalThis.crypto,'randomUUID',descriptor);else delete globalThis.crypto.randomUUID;}
}
function metrics(peer,stage){
 const bytes=Y.encodeStateAsUpdate(peer.document),json=peer.editor.getJSON();
 return {stage,sharedBytes:bytes.length,sharedV2Bytes:Y.encodeStateAsUpdateV2(peer.document).length,sharedSha256:digest(bytes),documentSha256:digest(JSON.stringify(json)),
  textDeltaOperations:[...peer.document.getMap('fountain-text:texts').values()].reduce((sum,text)=>sum+(text instanceof Y.Text?text.toDelta().length:0),0),
  undoItems:peer.adapter.manager.undoStack.length,redoItems:peer.adapter.manager.redoStack.length};
}
const cases=[];
for(const edits of sizes){
 const leftDoc=new Y.Doc();leftDoc.clientID=101;const left=create(leftDoc,'left');
 const rightDoc=new Y.Doc();rightDoc.clientID=202;Y.applyUpdate(rightDoc,Y.encodeStateAsUpdate(leftDoc));const right=create(rightDoc,'right');
 const owned=[left,right],rows=[];
 const sync=()=>{const a=Y.encodeStateAsUpdate(leftDoc),b=Y.encodeStateAsUpdate(rightDoc);Y.applyUpdate(leftDoc,b);Y.applyUpdate(rightDoc,a);assert.deepEqual(left.editor.getJSON(),right.editor.getJSON());for(const peer of [left,right])assert.equal(getCollaborationState(peer.editor)?.status,'connected')};
 try{
  const initial=left.editor.getJSON();assert.equal(initial.content[0].attrs.nodeId,'paragraph-main');assert.equal(initial.content.at(-1).attrs.nodeId,'figure-main');
  rows.push(metrics(left,'seed'));
  right.editor.dispatch(right.editor.createTransaction().setSelection(Selection.cursor([0,0],2)));assert.equal(insertText(right.editor,'Q'),true);
  left.editor.dispatch(left.editor.createTransaction().setSelection(Selection.cursor([0,0],5)));
  for(let index=0;index<edits;index++)assert.equal(insertText(left.editor,'x'),true);
  sync();const final=left.editor.getJSON();assert.deepEqual(final.attrs,initial.attrs);assert.deepEqual(final.content.at(-1),initial.content.at(-1));assert.deepEqual(final.content[0].attrs,initial.content[0].attrs);assert.equal(left.editor.state.doc.child(0).textContent,'AlQpha'+'x'.repeat(edits));rows.push(metrics(left,'converged'));
  for(let index=0;index<edits;index++)assert.equal(undoCollaboration(left.editor),true);
  sync();assert.equal(left.editor.state.doc.child(0).textContent,'AlQpha');rows.push(metrics(left,'all-undone'));
  for(let index=0;index<edits;index++)assert.equal(redoCollaboration(left.editor),true);
  sync();assert.deepEqual(left.editor.getJSON(),final);rows.push(metrics(left,'all-redone'));
  left.adapter.manager.clear();rows.push(metrics(left,'left-history-cleared'));
  assert.equal(undoCollaboration(left.editor),false);assert.equal(redoCollaboration(left.editor),false);
  right.adapter.manager.clear();assert.equal(undoCollaboration(right.editor),false);assert.equal(redoCollaboration(right.editor),false);sync();rows.push(metrics(left,'both-histories-cleared'));
  assert.deepEqual(left.editor.getJSON(),final);
  const reopenedDoc=new Y.Doc();reopenedDoc.clientID=303;Y.applyUpdate(reopenedDoc,Y.encodeStateAsUpdate(leftDoc));const reopened=create(reopenedDoc,'reopened');owned.push(reopened);
  assert.deepEqual(reopened.editor.getJSON(),final);rows.push(metrics(reopened,'wire-reopened'));
  const freshDoc=new Y.Doc();freshDoc.clientID=404;const fresh=create(freshDoc,'fresh',final);owned.push(fresh);
  assert.deepEqual(fresh.editor.getJSON(),final);rows.push(metrics(fresh,'fresh-room-from-json'));
  assert.equal(undoCollaboration(fresh.editor),false);assert.equal(redoCollaboration(fresh.editor),false);
  const freshBytes=Y.encodeStateAsUpdate(freshDoc);
  const mixedDoc=new Y.Doc();mixedDoc.clientID=505;Y.applyUpdate(mixedDoc,freshBytes);const mixed=create(mixedDoc,'sacrificial-mixed');owned.push(mixed);
  // A new room is not an in-place compaction. Old-room updates must be fenced.
  Y.applyUpdate(mixedDoc,Y.encodeStateAsUpdate(leftDoc));
  const rejected=getCollaborationState(mixed.editor);assert.equal(rejected?.status,'error');assert.deepEqual(mixed.editor.getJSON(),final);
  assert.deepEqual(Y.encodeStateAsUpdate(freshDoc),freshBytes);
  const result={edits,rows,exactModelPreserved:true,authorUndoRedoPreservedBeforeClear:true,clearDiscardsUndoRedo:true,
   freshRoomPreservesDocumentJSON:true,applicationNodeIdsPreserved:true,freshRoomHistoryEmpty:true,
   staleOldRoomUpdateRejected:{status:rejected.status,message:rejected.error?.message,lastEditorSnapshotPreserved:true,authoritativeFreshRoomUntouched:true},
   scope:'Reads private UndoManager state for a diagnostic. Fresh seeding changes internal room/CRDT identities and is not online compaction, history-preserving migration, or a writer fence.'};
  cases.push(result);console.log(JSON.stringify(result));
 }finally{owned.reverse().forEach(peer=>peer.destroy())}
}
await writeFile(`artifacts/${prefix}.json`,JSON.stringify({runtime:process.version,directory,domRequired:false,cases,note:'Exploratory compaction boundary evidence only. No production API, history policy, GC setting, transport or room migration is changed.'},null,2)+'\n');
