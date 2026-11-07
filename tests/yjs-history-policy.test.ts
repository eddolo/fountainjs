// @vitest-environment node
import {describe,expect,it} from 'vitest';
import * as Y from 'yjs';
import {CoreExtension,Selection,canUndoCollaboration,composeExtensions,createEditor,createTrailingEditableBlockExtension,
  getCollaborationState,insertText,redoCollaboration,undoCollaboration,type NodeJSON} from '../src';
import {createYjsCollaborationExtension} from '../src/yjs';
import {createRetainedYjsCollaborationExtension} from '../src/yjs/retained-adapter';
import {createStableNodeIdsExtension,inspectStableNodeIds} from '../src/node-ids';

const initial:NodeJSON={type:'doc',content:[{type:'paragraph',attrs:{nodeId:'intro'},content:[{type:'text',text:'Shared'}]}]};
for(const [protocol,factory] of [['legacy',createYjsCollaborationExtension],['retained',createRetainedYjsCollaborationExtension]] as const)describe(`${protocol} shared history policy`,()=>{
  function peers(options:{repairAuthor?:boolean;repairPeer?:boolean;captureTimeout?:number}={}){
    const a=new Y.Doc(),b=new Y.Doc();
    const make=(document:Y.Doc,repair:boolean)=>{const kit=composeExtensions([CoreExtension,...(repair?[createStableNodeIdsExtension(),createTrailingEditableBlockExtension()]:[]),factory({document,captureTimeout:options.captureTimeout??0,user:{id:repair?'repair':'plain',name:'Author',color:'#7048e8'}})]);return createEditor({schema:kit.schema,plugins:kit.plugins,content:initial});};
    const author=make(a,options.repairAuthor??false);Y.applyUpdate(b,Y.encodeStateAsUpdate(a));const peer=make(b,options.repairPeer??false);
    return {author,peer,sync(reverse=false){for(let i=0;i<2;i++){const left=Y.encodeStateAsUpdate(a),right=Y.encodeStateAsUpdate(b);if(reverse){Y.applyUpdate(a,right,'peer');Y.applyUpdate(b,left,'peer');}else{Y.applyUpdate(b,left,'peer');Y.applyUpdate(a,right,'peer');}}expect(author.getJSON()).toEqual(peer.getJSON());for(const editor of [author,peer])expect(getCollaborationState(editor)?.status,getCollaborationState(editor)?.error?.message).toBe('connected');},destroy(){author.destroy();peer.destroy();a.destroy();b.destroy();}};
  }
  for(const reverse of [false,true]){
    it(`keeps neutral metadata through authored undo/redo (reverse: ${reverse})`,()=>{
      const pair=peers();try{
        pair.author.dispatch(pair.author.createTransaction().setNodeAttrs([0],{review:'initial'}).setMeta('addToHistory',false));pair.sync(reverse);expect(canUndoCollaboration(pair.author)).toBe(false);
        pair.author.dispatch(pair.author.createTransaction().setSelection(Selection.cursor([0,0],2)));expect(insertText(pair.author,'X')).toBe(true);
        pair.author.dispatch(pair.author.createTransaction().setNodeAttrs([0],{review:'updated'}).setMeta('addToHistory',false));pair.sync(reverse);
        expect(undoCollaboration(pair.author)).toBe(true);pair.sync(reverse);expect(pair.author.state.doc.child(0).textContent).toBe('Shared');expect(pair.author.state.doc.child(0).attrs.review).toBe('updated');
        expect(redoCollaboration(pair.author)).toBe(true);pair.sync(reverse);expect(pair.author.state.doc.child(0).textContent).toBe('ShXared');expect(pair.author.state.doc.child(0).attrs.review).toBe('updated');
      }finally{pair.destroy();}
    });
    it(`does not undo neutral source text when later authored typing is undone (reverse: ${reverse})`,()=>{
      const pair=peers();try{
        pair.author.dispatch(pair.author.createTransaction().insertText([0,0],0,'Imported ').setMeta('addToHistory',false));pair.sync(reverse);expect(undoCollaboration(pair.author)).toBe(false);
        pair.peer.dispatch(pair.peer.createTransaction().insertText([0,0],0,'Peer '));pair.sync(reverse);
        pair.author.dispatch(pair.author.createTransaction().insertText([0,0],0,'Local '));pair.sync(reverse);expect(undoCollaboration(pair.author)).toBe(true);pair.sync(reverse);
        expect(pair.author.state.doc.child(0).textContent).toBe('Peer Imported Shared');expect(redoCollaboration(pair.author)).toBe(true);pair.sync(reverse);expect(pair.author.state.doc.child(0).textContent).toBe('Local Peer Imported Shared');
      }finally{pair.destroy();}
    });
    it(`replicates remote ID maintenance without creating reviewer undo (reverse: ${reverse})`,()=>{
      const pair=peers({repairPeer:true});try{
        pair.author.dispatch(pair.author.createTransaction().replace(1,1,[pair.author.state.doc.child(0)]));pair.sync(reverse);
        expect(inspectStableNodeIds(pair.author.state.doc)).toEqual([]);expect(canUndoCollaboration(pair.peer)).toBe(false);expect(undoCollaboration(pair.peer)).toBe(false);
        expect(undoCollaboration(pair.author)).toBe(true);pair.sync(reverse);expect(pair.peer.state.doc.childCount).toBe(1);expect(redoCollaboration(pair.author)).toBe(true);pair.sync(reverse);expect(inspectStableNodeIds(pair.peer.state.doc)).toEqual([]);
      }finally{pair.destroy();}
    });
    it(`keeps grouped typing together across neutral metadata (reverse: ${reverse})`,()=>{
      const pair=peers({captureTimeout:10_000});try{
        pair.author.dispatch(pair.author.createTransaction().insertText([0,0],0,'A'));
        pair.author.dispatch(pair.author.createTransaction().setNodeAttrs([0],{review:'retained'}).setMeta('addToHistory',false));
        pair.author.dispatch(pair.author.createTransaction().insertText([0,0],1,'B'));pair.sync(reverse);
        expect(undoCollaboration(pair.author)).toBe(true);pair.sync(reverse);expect(pair.author.state.doc.child(0).textContent).toBe('Shared');expect(pair.author.state.doc.child(0).attrs.review).toBe('retained');expect(canUndoCollaboration(pair.author)).toBe(false);
        expect(redoCollaboration(pair.author)).toBe(true);pair.sync(reverse);expect(pair.author.state.doc.child(0).textContent).toBe('ABShared');expect(pair.author.state.doc.child(0).attrs.review).toBe('retained');
      }finally{pair.destroy();}
    });
  }
  for(const kind of ['duplicate','divider'] as const)it(`keeps authored ${kind} undoable with local appended maintenance`,()=>{
    const pair=peers({repairAuthor:true});try{
      const before=pair.author.getJSON(),node=kind==='duplicate'?pair.author.state.doc.child(0):pair.author.state.schema.node('horizontal_rule');
      pair.author.dispatch(pair.author.createTransaction().replace(1,1,[node]));pair.sync();const authored=pair.author.getJSON();expect(inspectStableNodeIds(pair.author.state.doc)).toEqual([]);
      expect(undoCollaboration(pair.author)).toBe(true);pair.sync();expect(pair.author.getJSON()).toEqual(before);expect(redoCollaboration(pair.author)).toBe(true);pair.sync();expect(pair.author.getJSON()).toEqual(authored);
    }finally{pair.destroy();}
  });
});
