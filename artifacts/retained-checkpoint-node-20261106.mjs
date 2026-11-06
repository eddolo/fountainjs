import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const mode=process.argv[2]??'es',incoming=process.argv[3],only=process.argv[4]==='interop-only',require=createRequire(import.meta.url),directory='retained-checkpoint-build-20261106';
assert(['es','cjs'].includes(mode));assert.equal(typeof globalThis.document,'undefined');assert.equal(typeof globalThis.window,'undefined');
const Y=mode==='cjs'?require('yjs'):await import('yjs'),load=name=>mode==='cjs'?require(`./${directory}/${name}.cjs`):import(`./${directory}/${name}.js`);
const {CoreExtension,composeExtensions,createEditor,Selection,insertText}=await load('engine'),{createRetainedYjsCollaborationExtension}=await load('retained-adapter'),{captureRetainedCheckpoint,restoreRetainedCheckpoint}=await load('checkpoint');
const content={type:'doc',attrs:{title:'Node checkpoint'},content:[{type:'paragraph',attrs:{nodeId:'intro'},content:[{type:'text',text:'Alpha'}]},{type:'image_super',attrs:{nodeId:'figure',src:'/figure.png',alt:'Figure'}}]};
const cases=[];
if(!only){
 const document=new Y.Doc(),kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document,captureTimeout:0,user:{id:'Ada',name:'Ada',color:'#7048e8'}})]),editor=createEditor({schema:kit.schema,plugins:kit.plugins,content});
 let restored;
 try{
  const notes=document.getMap('opaque notes');notes.set('bytes',new Uint8Array([0,128,255]));notes.set('author','Grace');document.getArray('empty notes');document.getText('opaque text').insert(0,'Plain auxiliary text');document.get('opaque xml text',Y.XmlText).insert(0,'<source>');document.getXmlFragment('opaque xml fragment').insert(0,[new Y.XmlElement('note')]);
  const before=Y.encodeStateAsUpdate(document),expected=editor.getJSON(),checkpoint=await captureRetainedCheckpoint(document,editor.state.schema,'node-schema-1');
  assert.deepEqual(Y.encodeStateAsUpdate(document),before);assert.equal(checkpoint.manifest.bytes,before.length);cases.push('capture preserves source and declares room/schema metadata');
  restored=await restoreRetainedCheckpoint(checkpoint,editor.state.schema,'node-schema-1');assert.deepEqual(restored.baseDocument.toJSON(),expected);assert.deepEqual(Y.encodeStateAsUpdate(restored.document),before);assert.equal(restored.document.guid,document.guid);cases.push('isolated restore retains model, exact wire state and GUID');
  assert.deepEqual(restored.document.getMap('opaque notes').get('bytes'),new Uint8Array([0,128,255]));assert.equal(restored.document.getMap('opaque notes').get('author'),'Grace');assert(restored.document.share.get('empty notes') instanceof Y.Array);assert.equal(restored.document.getText('opaque text').toString(),'Plain auxiliary text');assert.equal(restored.document.get('opaque xml text',Y.XmlText).toString(),'<source>');assert.equal(restored.document.getXmlFragment('opaque xml fragment').get(0).nodeName,'note');cases.push('auxiliary binary map and empty root survive');
  checkpoint.update.fill(0);assert.deepEqual(checkpoint.update,before);const input={manifest:checkpoint.manifest,update:checkpoint.update},pending=restoreRetainedCheckpoint(input,editor.state.schema,'node-schema-1');input.update.fill(0);const owned=await pending;owned.document.destroy();cases.push('archive and asynchronous restore inputs are owned');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0,0],2)));assert.equal(insertText(editor,'X'),true);Y.applyUpdate(restored.document,Y.encodeStateAsUpdate(document));
  const reopened=await captureRetainedCheckpoint(restored.document,editor.state.schema,'node-schema-1'),read=await restoreRetainedCheckpoint(reopened,editor.state.schema,'node-schema-1');try{assert.deepEqual(read.baseDocument.toJSON(),editor.getJSON())}finally{read.document.destroy()}cases.push('later same-room typing merges into restored snapshot');
  const state=Y.encodeStateVector(document),race=captureRetainedCheckpoint(document,editor.state.schema,'node-schema-1'),text=[...document.getMap('fountain-text:texts').values()][0];text.delete(1,1);assert.deepEqual(Y.encodeStateVector(document),state);await assert.rejects(race,/changed shared state/);
  const damaged=checkpoint.update;damaged.fill(0);await assert.rejects(restoreRetainedCheckpoint({manifest:checkpoint.manifest,update:damaged},editor.state.schema,'node-schema-1'),/checksum/);cases.push('deletion-only capture races and corrupt payloads are rejected');
  await writeFile(`artifacts/retained-checkpoint-${mode}-packet-20261106.json`,JSON.stringify({manifest:checkpoint.manifest,updateBase64:Buffer.from(checkpoint.update).toString('base64'),expected},null,2)+'\n');
 }finally{restored?.document.destroy();editor.destroy();document.destroy()}
 const {MathExtension,defineExtension}=await load('engine'),technicalDoc=new Y.Doc();
 const widget=defineExtension({name:'checkpoint-widget',nodes:{lab_widget:{group:'block',atom:true}}});
 const technicalKit=composeExtensions([CoreExtension,MathExtension,widget,createRetainedYjsCollaborationExtension({document:technicalDoc,user:{id:'researcher',name:'Researcher',color:'#7048e8'}})]);
 const technical=createEditor({schema:technicalKit.schema,plugins:technicalKit.plugins,content:{type:'doc',attrs:{metadata:{title:'Technical checkpoint',revision:7}},content:[
  {type:'paragraph',content:[{type:'text',text:'Result '},{type:'inline_math',attrs:{latex:'x^2'}}]},
  {type:'math_block',attrs:{latex:'\\int_0^1 x\\,dx=\\frac12',label:'eq-result'}},
  {type:'code_block',attrs:{language:'lean'},content:[{type:'text',text:'example : 1 + 1 = 2 := by decide'}]},
  {type:'table',content:[{type:'table_row',content:[{type:'table_cell',content:[{type:'paragraph',content:[{type:'text',text:'42',marks:[{type:'strong'}]}]}]}]}]},
  {type:'lab_widget',attrs:{nodeId:'lab-42',settings:{measured:[12,19],owner:'Ada'}}},content.content[1],
 ]}});
 try{technicalDoc.getMap('research-records').set('review',{nodeId:'lab-42',text:'Check the result'});const captured=await captureRetainedCheckpoint(technicalDoc,technical.state.schema,'technical-schema-1'),restored=await restoreRetainedCheckpoint(captured,technical.state.schema,'technical-schema-1');try{assert.deepEqual(restored.baseDocument.toJSON(),technical.getJSON());assert.deepEqual(restored.document.getMap('research-records').get('review'),{nodeId:'lab-42',text:'Check the result'});cases.push('math, Lean source, tables, custom widget metadata and auxiliary review record survive')}finally{restored.document.destroy()}}
 finally{technical.destroy();technicalDoc.destroy()}
}
if(incoming){
 const packet=JSON.parse(await readFile(incoming,'utf8')),kit=composeExtensions([CoreExtension]),editor=createEditor({schema:kit.schema,content});
 try{const result=await restoreRetainedCheckpoint({manifest:packet.manifest,update:new Uint8Array(Buffer.from(packet.updateBase64,'base64'))},editor.state.schema,'node-schema-1');try{assert.deepEqual(result.baseDocument.toJSON(),packet.expected);assert.deepEqual(result.document.getMap('opaque notes').get('bytes'),new Uint8Array([0,128,255]));cases.push('other module-format packet restores with own schema and Yjs runtime')}finally{result.document.destroy()}}
 finally{editor.destroy()}
}
const report={mode,domRequired:false,passed:cases.length,cases,onlyInterop:only,incoming:incoming??null};await writeFile(`artifacts/retained-checkpoint-node-${mode}${only?'-interop':''}-20261106.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
