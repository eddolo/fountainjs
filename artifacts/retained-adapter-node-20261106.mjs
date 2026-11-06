import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const mode=process.argv[2]??'es',require=createRequire(import.meta.url);
const directory=process.argv[3]??'retained-adapter-build-20261106',prefix=process.argv[4]??'retained-adapter-node';
const Y=mode==='cjs'?require('yjs'):await import('yjs');
const load=name=>mode==='cjs'?require(`./${directory}/${name}.cjs`):import(`./${directory}/${name}.js`);
const engine=await load('engine'),{createRetainedYjsCollaborationExtension}=await load('retained-adapter');
assert.equal(typeof globalThis.document,'undefined');assert.equal(typeof globalThis.window,'undefined');
const {CoreExtension,composeExtensions,createEditor,Selection,insertText,toggleQuote,toggleList,setMark,splitBlock,moveBlock,undoCollaboration,redoCollaboration,getCollaborationState}=engine;
const source={type:'doc',attrs:{audit:'root'},content:[{type:'paragraph',content:[{type:'text',text:'Alpha'}]},{type:'image_super',attrs:{src:'/figure.png',alt:'Figure'}}]};
let passed=0;
for(const reverse of [false,true])for(const kind of ['quote','bullet','ordered','task','mark','split']){
 const a=new Y.Doc(),b=new Y.Doc();const create=(document,id)=>{const kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document,captureTimeout:0,user:{id,name:id,color:'#7048e8'}})]);return createEditor({schema:kit.schema,plugins:kit.plugins,content:source})};
 const left=create(a,'left');Y.applyUpdate(b,Y.encodeStateAsUpdate(a));const right=create(b,'right');
 const sync=()=>{const aa=Y.encodeStateAsUpdate(a),bb=Y.encodeStateAsUpdate(b);if(reverse){Y.applyUpdate(b,aa);Y.applyUpdate(a,bb)}else{Y.applyUpdate(a,bb);Y.applyUpdate(b,aa)}assert.deepEqual(left.getJSON(),right.getJSON());for(const editor of [left,right])assert.equal(getCollaborationState(editor)?.status,'connected')};
 try{left.dispatch(left.createTransaction().setSelection(Selection.cursor([0,0],2)));assert.equal(insertText(left,'X'),true);right.dispatch(right.createTransaction().setSelection(kind==='mark'?Selection.range([0,0],1,[0,0],4):Selection.cursor([0,0],3)));
 assert.equal(kind==='quote'?toggleQuote(right):kind==='mark'?setMark(right,'strong'):kind==='split'?splitBlock(right):toggleList(right,kind),true);sync();
 if(kind==='split')assert.deepEqual(left.state.doc.content.slice(0,2).map(n=>n.textContent),['AlXp','ha']);else assert.equal(left.state.doc.child(0).textContent,'AlXpha');
 const final=left.getJSON();assert.deepEqual(final.attrs,{audit:'root'});assert.equal(final.content.at(-1).type,'image_super');assert.equal(JSON.stringify(final).includes('"$f"'),false);
 assert.equal(undoCollaboration(right),true);sync();assert.equal(left.state.doc.child(0).textContent,'AlXpha');assert.equal(left.state.doc.child(0).type.name,'paragraph');assert.equal(redoCollaboration(right),true);sync();assert.deepEqual(left.getJSON(),final);passed++;
 }finally{left.destroy();right.destroy();a.destroy();b.destroy()}
}
for(const reverse of [false,true])for(const concurrent of [false,true]){
 const a=new Y.Doc(),b=new Y.Doc();
 const content={...source,content:['Alpha','Beta','Gamma','Delta'].map(text=>({type:'paragraph',content:[{type:'text',text}]})).concat(source.content.slice(-1))};
 const create=(document,id)=>{const kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document,captureTimeout:0,user:{id,name:id,color:'#7048e8'}})]);return createEditor({schema:kit.schema,plugins:kit.plugins,content})};
 const left=create(a,'left');Y.applyUpdate(b,Y.encodeStateAsUpdate(a));const right=create(b,'right');
 const sync=()=>{const aa=Y.encodeStateAsUpdate(a),bb=Y.encodeStateAsUpdate(b);if(reverse){Y.applyUpdate(b,aa);Y.applyUpdate(a,bb)}else{Y.applyUpdate(a,bb);Y.applyUpdate(b,aa)}assert.deepEqual(left.getJSON(),right.getJSON());for(const editor of [left,right])assert.equal(getCollaborationState(editor)?.status,'connected')};
 try{const originalImage=left.getJSON().content.at(-1);assert.equal(moveBlock(left,0,3),true);if(concurrent){right.dispatch(right.createTransaction().setSelection(Selection.cursor([0,0],2)));assert.equal(insertText(right,'X'),true)}sync();
 const text=concurrent?'AlXpha':'Alpha';assert.deepEqual(left.state.doc.content.slice(0,4).map(n=>n.textContent),['Beta','Gamma','Delta',text]);
 const final=left.getJSON();assert.deepEqual(final.attrs,{audit:'root'});assert.deepEqual(final.content.at(-1),originalImage);
 assert.equal(undoCollaboration(left),true);sync();assert.deepEqual(left.state.doc.content.slice(0,4).map(n=>n.textContent),[text,'Beta','Gamma','Delta']);
 assert.equal(redoCollaboration(left),true);sync();assert.deepEqual(left.getJSON(),final);passed++;
 }finally{left.destroy();right.destroy();a.destroy();b.destroy()}
}
const receipt={format:mode,passed,domRequired:false,runtime:'Node '+process.version,note:'Engine and experimental adapter built in one shared module graph. Actual collaboration lifecycle and author history, not manual pool calls; includes sibling reordering against peer typing in both update exchange orders.'};
await writeFile(new URL(`./${prefix}-${mode}-20261106.json`,import.meta.url),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
