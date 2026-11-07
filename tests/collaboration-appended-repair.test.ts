// @vitest-environment node
import {expect,it} from 'vitest';
import {CoreExtension,Selection,composeExtensions,createCollaborationExtension,createEditor,
  getCollaborationState,insertText,type CollaborationAdapterContext,type CollaborationLocalUpdate,type NodeJSON} from '../src';
import {createStableNodeIdsExtension,inspectStableNodeIds} from '../src/node-ids';

const paragraph=(text:string,id='shared-id'):NodeJSON=>({type:'paragraph',attrs:{nodeId:id},content:[{type:'text',text}]});
const initial:NodeJSON={type:'doc',content:[paragraph('Original')]};
const duplicate:NodeJSON={type:'doc',content:[paragraph('Remote first'),paragraph('Remote second')]};
function fixture(onUpdate?:(context:CollaborationAdapterContext,update:CollaborationLocalUpdate)=>void){
  let context!:CollaborationAdapterContext;const updates:CollaborationLocalUpdate[]=[];
  const kit=composeExtensions([CoreExtension,createStableNodeIdsExtension(),createCollaborationExtension({adapter:()=>({
    connect(value){context=value;},onLocalUpdate(update){updates.push(update);onUpdate?.(context,update);},
  })})]);
  const editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:initial});
  return {editor,updates,get context(){return context;}};
}

for(const kind of ['document','transaction'] as const)it(`rebroadcasts only appended repair steps after a remote ${kind}`,()=>{
  const pair=fixture();try{
    const incoming=pair.editor.state.schema.nodeFromJSON(duplicate);
    const remote=pair.editor.createTransaction().replaceDocument(incoming).setSelection(Selection.cursor([1,0],3));
    expect(kind==='document'?pair.context.applyRemoteDocument(incoming,{selection:remote.selection}):pair.context.applyRemoteTransaction(remote)).toBe(true);
    expect(pair.updates).toHaveLength(1);const update=pair.updates[0];
    expect(update.before).toBe(incoming);expect(update.transaction.originalDoc).toBe(incoming);
    expect(update.beforeSelection.eq(remote.selection)).toBe(true);expect(update.transaction.steps).toHaveLength(1);
    expect(update.transaction.doc).toEqual(update.document);expect(update.document.toJSON()).toEqual(pair.editor.getJSON());
    expect(inspectStableNodeIds(update.before)).toHaveLength(1);expect(inspectStableNodeIds(update.document)).toEqual([]);
    expect(update.transaction.getMeta('addToHistory')).toBe(false);
  }finally{pair.editor.destroy();}
});

it('keeps the exact inbound base separate through nested remote repairs and later local typing',()=>{
  let nested=false;const pair=fixture(context=>{
    if(!nested){nested=true;expect(context.applyRemoteDocument({type:'doc',content:[paragraph('Nested first'),paragraph('Nested second')]})).toBe(true);}
  });try{
    expect(pair.context.applyRemoteDocument(duplicate)).toBe(true);expect(pair.updates).toHaveLength(2);
    expect(pair.updates.map(update=>update.before.child(0).textContent)).toEqual(['Remote first','Nested first']);
    for(const update of pair.updates){expect(update.transaction.originalDoc).toBe(update.before);expect(update.transaction.steps).toHaveLength(1);expect(inspectStableNodeIds(update.document)).toEqual([]);}
    pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.cursor([0,0],0)));
    const before=pair.editor.state.doc;expect(insertText(pair.editor,'Local ')).toBe(true);
    expect(pair.updates).toHaveLength(3);expect(pair.updates[2].before).toBe(before);
    expect(pair.editor.state.doc.child(0).textContent).toBe('Local Nested first');expect(getCollaborationState(pair.editor)?.status).not.toBe('error');
  }finally{pair.editor.destroy();}
});

it('does not rebroadcast an ordinary remote replacement with no appended change',()=>{
  const pair=fixture();try{
    expect(pair.context.applyRemoteDocument({type:'doc',content:[paragraph('Only remote')]})).toBe(true);
    expect(pair.updates).toEqual([]);expect(pair.editor.getText()).toBe('Only remote');
  }finally{pair.editor.destroy();}
});

it('removes every step of a multi-step inbound prefix while keeping its appended repair',()=>{
  const pair=fixture();try{
    const incoming=pair.editor.createTransaction().replace(1,1,[pair.editor.state.doc.child(0)]).insertText([0,0],0,'Remote ');
    expect(incoming.steps).toHaveLength(2);expect(pair.context.applyRemoteTransaction(incoming)).toBe(true);
    expect(pair.updates).toHaveLength(1);const outgoing=pair.updates[0];
    expect(outgoing.before).toBe(incoming.doc);expect(outgoing.transaction.steps).toHaveLength(1);
    expect(outgoing.document.child(0).textContent).toBe('Remote Original');expect(inspectStableNodeIds(outgoing.document)).toEqual([]);
  }finally{pair.editor.destroy();}
});
