import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const mode=process.argv[2];assert(['es','cjs'].includes(mode));
const require=createRequire(import.meta.url),extension=mode==='es'?'js':'cjs';
const load=path=>mode==='es'?import(path):require(path);
const Y=await load('yjs'),engine=await load(`./retained-repair-build-20261107/engine.${extension}`),ids=await load(`./retained-repair-build-20261107/node-ids.${extension}`),retained=await load(`./retained-repair-build-20261107/retained-adapter.${extension}`);
for(const name of ['window','document','DOMParser','MutationObserver','HTMLElement'])assert.equal(typeof globalThis[name],'undefined');
const initial={type:'doc',content:[{type:'paragraph',attrs:{nodeId:'intro'},content:[{type:'text',text:'Shared'}]},{type:'paragraph',attrs:{nodeId:'tail'},content:[{type:'text',text:'Tail'}]}]};
function fixture(trailing=false){
 const a=new Y.Doc(),b=new Y.Doc();
 const make=(document,stable)=>{const kit=engine.composeExtensions([engine.CoreExtension,...(stable?[ids.createStableNodeIdsExtension(),...(trailing?[engine.createTrailingEditableBlockExtension()]:[])]:[]),retained.createRetainedYjsCollaborationExtension({document,captureTimeout:0,user:{id:stable?'stable':'plain',name:'Author',color:'#7048e8'}})]);return engine.createEditor({schema:kit.schema,plugins:kit.plugins,content:initial});};
 const plain=make(a,false);Y.applyUpdate(b,Y.encodeStateAsUpdate(a));const stable=make(b,true);
 return {plain,stable,sync(){for(let i=0;i<2;i++){Y.applyUpdate(b,Y.encodeStateAsUpdate(a));Y.applyUpdate(a,Y.encodeStateAsUpdate(b));}assert.deepEqual(plain.getJSON(),stable.getJSON());for(const editor of [plain,stable]){assert.equal(engine.getCollaborationState(editor).status,'connected');assert.deepEqual(ids.inspectStableNodeIds(editor.state.doc),[]);}},destroy(){plain.destroy();stable.destroy();a.destroy();b.destroy();}};
}
const cases=[];
const pair=fixture();try{
 pair.plain.dispatch(pair.plain.createTransaction().replace(1,1,[pair.plain.state.doc.child(0)]));pair.sync();assert.match(pair.stable.state.doc.child(1).attrs.nodeId,/^fjs-/);assert.equal(engine.undoCollaboration(pair.stable),false);cases.push('remote duplicate IDs are repaired and replicated without reviewer undo');
 const baseline=pair.plain.getJSON();pair.stable.dispatch(pair.stable.createTransaction().insertText([0,0],0,'Review '));pair.sync();assert.equal(engine.undoCollaboration(pair.stable),true);pair.sync();assert.deepEqual(pair.plain.getJSON(),baseline);cases.push('reviewer undo removes authored typing while preserving the remote duplicate and ID repair');
 assert.equal(engine.undoCollaboration(pair.plain),true);pair.sync();assert.equal(pair.stable.state.doc.childCount,2);assert.equal(engine.redoCollaboration(pair.plain),true);pair.sync();assert.deepEqual(pair.plain.getJSON(),baseline);cases.push('author undo/redo preserves peer repair identities and exact content');
}finally{pair.destroy();}
const history=fixture();try{
 history.plain.dispatch(history.plain.createTransaction().insertText([0,0],0,'Local '));history.plain.dispatch(history.plain.createTransaction().setNodeAttrs([0],{review:'retained'}).setMeta('addToHistory',false));history.sync();assert.equal(engine.undoCollaboration(history.plain),true);history.sync();assert.equal(history.stable.state.doc.child(0).textContent,'Shared');assert.equal(history.stable.state.doc.child(0).attrs.review,'retained');cases.push('explicit history-neutral shared metadata survives author undo');
}finally{history.destroy();}
const trailing=fixture(true);try{
 const figure=trailing.plain.state.schema.nodeFromJSON({type:'horizontal_rule',attrs:{nodeId:'divider'}});trailing.plain.dispatch(trailing.plain.createTransaction().replace(2,2,[figure]));trailing.sync();assert.equal(trailing.stable.state.doc.content.at(-1).type.name,'paragraph');assert.equal(trailing.stable.state.doc.content.at(-2).type.name,'horizontal_rule');assert.equal(engine.undoCollaboration(trailing.stable),false);cases.push('remote atomic divider receives a replicated trailing editable paragraph without reviewer undo');
}finally{trailing.destroy();}
for(const kind of ['duplicate','divider']){
 const document=new Y.Doc(),kit=engine.composeExtensions([engine.CoreExtension,ids.createStableNodeIdsExtension(),engine.createTrailingEditableBlockExtension(),retained.createRetainedYjsCollaborationExtension({document,captureTimeout:0,user:{id:'local',name:'Local',color:'#7048e8'}})]),editor=engine.createEditor({schema:kit.schema,plugins:kit.plugins,content:initial});
 try{const before=editor.getJSON(),node=kind==='duplicate'?editor.state.doc.child(0):editor.state.schema.node('horizontal_rule');editor.dispatch(editor.createTransaction().replace(editor.state.doc.childCount,editor.state.doc.childCount,[node]));const authored=editor.getJSON();assert.equal(engine.undoCollaboration(editor),true);assert.deepEqual(editor.getJSON(),before);assert.equal(engine.redoCollaboration(editor),true);assert.deepEqual(editor.getJSON(),authored);cases.push(`authored ${kind} stays undoable when history-neutral repairs are appended locally`);}finally{editor.destroy();document.destroy();}
}
const result={mode,passed:cases.length,cases,node:process.version,dom:false};await writeFile(`artifacts/retained-repair-node-${mode}-20261107.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
