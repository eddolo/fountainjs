import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import * as Y from 'yjs';
const directories=[process.argv[2]??'retained-seed-baseline-20261106-build',process.argv[3]??'cursor-overlay-build-20261106'];
const prefix=process.argv[4]??'retained-seed-interop-20261106';
const builds=await Promise.all(directories.map(async directory=>({engine:await import(`./${directory}/engine.js`),adapter:await import(`./${directory}/retained-adapter.js`)})));
const source={type:'doc',attrs:{audit:{retained:true}},content:[{type:'paragraph',content:[{type:'text',text:'Alpha'}]},{type:'paragraph',content:[{type:'text',text:'Beta'}]},{type:'image_super',attrs:{src:'/figure.png',alt:'Retained figure'}}]};
const text=node=>node.text??(node.content??[]).map(text).join('');
const cases=[];
for(const seeder of [0,1])for(const reverse of [false,true])for(const kind of ['quote','bullet','ordered','task','mark','split','move']){
 const a=new Y.Doc(),b=new Y.Doc(),leftBuild=builds[seeder],rightBuild=builds[1-seeder];
 const create=(build,document,id)=>{const {CoreExtension,composeExtensions,createEditor}=build.engine;const kit=composeExtensions([CoreExtension,build.adapter.createRetainedYjsCollaborationExtension({document,captureTimeout:0,user:{id,name:id,color:'#7048e8'}})]);const editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:source});assert.equal(build.engine.getCollaborationState(editor)?.status,'connected');return editor};
 const left=create(leftBuild,a,'left');Y.applyUpdate(b,Y.encodeStateAsUpdate(a));const right=create(rightBuild,b,'right');
 const sync=()=>{const aa=Y.encodeStateAsUpdate(a),bb=Y.encodeStateAsUpdate(b);if(reverse){Y.applyUpdate(b,aa);Y.applyUpdate(a,bb)}else{Y.applyUpdate(a,bb);Y.applyUpdate(b,aa)}assert.deepEqual(left.getJSON(),right.getJSON());for(const [build,editor] of [[leftBuild,left],[rightBuild,right]])assert.equal(build.engine.getCollaborationState(editor)?.status,'connected')};
 try{
  const originalImage=left.getJSON().content.at(-1);left.dispatch(left.createTransaction().setSelection(leftBuild.engine.Selection.cursor([0,0],2)));assert.equal(leftBuild.engine.insertText(left,'X'),true);
  const engine=rightBuild.engine;right.dispatch(right.createTransaction().setSelection(kind==='mark'?engine.Selection.range([0,0],1,[0,0],4):engine.Selection.cursor([0,0],3)));
  assert.equal(kind==='quote'?engine.toggleQuote(right):kind==='mark'?engine.setMark(right,'strong'):kind==='split'?engine.splitBlock(right):kind==='move'?engine.moveBlock(right,0,1):engine.toggleList(right,kind),true);sync();
  if(kind==='split')assert.deepEqual(left.getJSON().content.slice(0,2).map(text),['AlXp','ha']);else if(kind==='move')assert.deepEqual(left.getJSON().content.slice(0,2).map(text),['Beta','AlXpha']);else assert.equal(text(left.getJSON().content[0]),'AlXpha');
  const final=left.getJSON();assert.deepEqual(final.attrs,source.attrs);assert.deepEqual(final.content.at(-1),originalImage);
  assert.equal(engine.undoCollaboration(right),true);sync();assert.deepEqual(left.getJSON().content.slice(0,2).map(text),['AlXpha','Beta']);assert.equal(engine.redoCollaboration(right),true);sync();assert.deepEqual(left.getJSON(),final);
  assert.equal(leftBuild.engine.undoCollaboration(left),true);sync();assert.equal(text(left.getJSON()),kind==='move'?'BetaAlpha':'AlphaBeta');assert.equal(leftBuild.engine.redoCollaboration(left),true);sync();assert.deepEqual(left.getJSON(),final);
  cases.push({seeder:directories[seeder],peer:directories[1-seeder],reverse,kind,exactConvergence:true,authorHistoryPreserved:true,rootAndImagePreserved:true});
 }finally{left.destroy();right.destroy();a.destroy();b.destroy()}
}
assert.equal(cases.length,28);const report={runtime:process.version,directories,domRequired:false,passed:cases.length,cases,note:'Both seed directions and exchange orders, separate compiled engine graphs, unchanged retained representation. This does not migrate the public legacy adapter.'};await writeFile(`artifacts/${prefix}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:cases.length,directories}));
