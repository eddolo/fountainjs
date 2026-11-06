import assert from 'node:assert/strict';
import {Session} from 'node:inspector/promises';
import {writeFile} from 'node:fs/promises';
import * as Y from 'yjs';
const directory=process.argv[2]??'cursor-overlay-build-20261106',prefix=process.argv[3]??'retained-seed-before-20261106',blocks=Number(process.argv[4]??1000);
assert(Number.isSafeInteger(blocks)&&blocks>0);assert.equal(typeof globalThis.document,'undefined');
const {CoreExtension,composeExtensions,createEditor,getCollaborationState}=await import(`./${directory}/engine.js`);
const {createRetainedYjsCollaborationExtension}=await import(`./${directory}/retained-adapter.js`);
const source={type:'doc',attrs:{audit:'seed'},content:Array.from({length:blocks},(_,i)=>({type:'paragraph',content:[{type:'text',text:`Alpha ${i}`}]}))};
const plainKit=composeExtensions([CoreExtension]),plain=createEditor({schema:plainKit.schema,plugins:plainKit.plugins,content:source}),expected=plain.getJSON();plain.destroy();
const descriptor=Object.getOwnPropertyDescriptor(globalThis.crypto,'randomUUID');
Object.defineProperty(globalThis.crypto,'randomUUID',{configurable:true,writable:true,value:()=> '11111111-2222-4333-8444-555555555555'});
const session=new Session();session.connect();
const create=()=>{const document=new Y.Doc();document.clientID=1234567890;const kit=composeExtensions([CoreExtension,createRetainedYjsCollaborationExtension({document,user:{id:'profile',name:'Profile',color:'#7048e8'}})]);let editor;try{editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:source});assert.equal(getCollaborationState(editor)?.status,'connected');assert.equal(document.getMap('fountain:document').get('seeded'),true);assert.equal(document.getMap('fountain-nodes:nodes').size,blocks*2);assert.deepEqual(editor.getJSON(),expected)}finally{editor?.destroy();document.destroy()}};
try{
 await session.post('Profiler.enable');await session.post('Profiler.start');const start=performance.now();create();const profiledMs=performance.now()-start;const {profile}=await session.post('Profiler.stop');await writeFile(`artifacts/${prefix}.cpuprofile`,JSON.stringify(profile));
 const size=Object.getOwnPropertyDescriptor(Y.Map.prototype,'size'),toArray=Y.Array.prototype.toArray;let mapSizeCalls=0,mapSizeEntries=0,arrayReads=0,arrayEntries=0;
 Object.defineProperty(Y.Map.prototype,'size',{...size,get(){const result=size.get.call(this);mapSizeCalls++;mapSizeEntries+=result;return result}});
 Y.Array.prototype.toArray=function(){const result=toArray.call(this);arrayReads++;arrayEntries+=result.length;return result};
 try{create()}finally{Object.defineProperty(Y.Map.prototype,'size',size);Y.Array.prototype.toArray=toArray}
 const report={runtime:process.version,directory,blocks,profiledMs,mapSizeCalls,mapSizeEntries,arrayReads,arrayEntries,exactDocument:true,domRequired:false,note:'Initialization-only CPU sample and a separate instrumented initialization. Counts are diagnostic, not acceptance gates.'};await writeFile(`artifacts/${prefix}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{session.disconnect();if(descriptor)Object.defineProperty(globalThis.crypto,'randomUUID',descriptor);else delete globalThis.crypto.randomUUID}
