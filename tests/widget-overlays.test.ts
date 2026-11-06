// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {CoreSchemaSpec,Decoration,DecorationSet,EditorView,Plugin,createEditor,HTMLExporter} from '../src';

it('maps overlay identity and distinguishes an in-flow widget with the same factory',()=>{
 const editor=createEditor({schema:CoreSchemaSpec,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Alpha'}]}]}}),factory=()=>document.createElement('span');
 try{const overlay=Decoration.widget(3,factory,{key:'peer',overlay:true,side:-1}),transaction=editor.createTransaction().insertText([0,0],0,'Z');
  const mapped=overlay.map(transaction.mapping)!;expect(mapped.from).toBe(4);expect(mapped.spec).toEqual({key:'peer',overlay:true,side:-1});expect(overlay.eq(Decoration.widget(3,factory,{key:'peer',side:-1}))).toBe(false);
 }finally{editor.destroy()}
});

it('keeps overlay labels out of native selection/export and preserves text DOM across presence movement and removal',async()=>{
 let position=3,shown=true;const factory=()=>{const node=document.createElement('span');node.textContent='Grace';node.className='test-peer';return node};
 const plugin=new Plugin({props:{decorations:state=>DecorationSet.create(state.doc,shown?[Decoration.widget(position,factory,{key:'peer',overlay:true})]:[])}});
 const editor=createEditor({schema:CoreSchemaSpec,plugins:[plugin],content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Alpha'}]}]}}),mount=document.createElement('div');document.body.append(mount);const view=new EditorView(mount,editor),native=document.getSelection()!;
 try{const text=view.dom.querySelector('[data-fountain-text-path]')!.firstChild!;native.setBaseAndExtent(text,1,text,4);view.dom.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',shiftKey:true,bubbles:true}));await Promise.resolve();expect(native.toString()).toBe('lph');expect(view.dom.querySelector('.test-peer')).toBeNull();
  expect(document.querySelector('[data-fountain-overlay-widgets] .test-peer')?.textContent).toBe('Grace');expect(HTMLExporter.export(editor.state)).not.toContain('Grace');
  position=4;editor.dispatch(editor.createTransaction().setMeta('force',true));await Promise.resolve();expect(view.dom.querySelector('[data-fountain-text-path]')!.firstChild).toBe(text);expect(native.toString()).toBe('lph');
  shown=false;editor.dispatch(editor.createTransaction().setMeta('force',true));expect(document.querySelector('[data-fountain-overlay-widgets]')).toBeNull();expect(view.dom.querySelector('[data-fountain-text-path]')!.firstChild).toBe(text);
  shown=true;editor.dispatch(editor.createTransaction().setMeta('force',true));expect(document.querySelector('[data-fountain-overlay-widgets]')).not.toBeNull();
 }finally{view.destroy();editor.destroy();mount.remove();native.removeAllRanges()}
 expect(document.querySelector('[data-fountain-overlay-widgets]')).toBeNull();
});

it('cleans up the global overlay when a product widget factory throws',()=>{
 let enabled=false;const plugin=new Plugin({props:{decorations:state=>DecorationSet.create(state.doc,enabled?[Decoration.widget(1,()=>{throw new Error('Product widget failed')},{key:'bad',overlay:true})]:[])}});
 const editor=createEditor({schema:CoreSchemaSpec,plugins:[plugin]}),mount=document.createElement('div');document.body.append(mount);const view=new EditorView(mount,editor);
 try{enabled=true;expect(()=>editor.dispatch(editor.createTransaction().setMeta('force',true))).toThrow('Product widget failed');expect(document.querySelector('[data-fountain-overlay-widgets]')).toBeNull();}
 finally{view.destroy();editor.destroy();mount.remove()}
});
