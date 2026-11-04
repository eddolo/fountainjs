import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import * as before from './table-column-tarball-consumer-20261104/node_modules/fountainjs-editor/dist/index.js';
import * as after from '../dist/index.js';
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
function measure(action) {
 action();
 const samples=[];
 for(let index=0;index<3;index++){ const start=performance.now();action();samples.push(performance.now()-start); }
 return {medianMs:median(samples),samplesMs:samples};
}
const records=[];
for(const [kind,count] of [['paragraphs',100],['paragraphs',1000],['fences',50],['fences',250]]) {
 const source='# Keep ###\n\n' + Array.from({length:count},(_,index)=>kind==='paragraphs'
  ? `Paragraph ${index} with __source__ formatting.`
  : `~~~~text\nBlock ${index}\n\nlast line\n~~~~`).join('\n\n') + '\n';
 const result={kind,count,inputCodeUnits:source.length};
 for(const [label,api] of [['before',before],['after',after]]) {
  const schema=new api.Schema(api.CoreSchemaSpec);
  const imported=api.MarkdownImporter.parseWithSource(source,schema);
  const changed=schema.node('doc',{},[imported.document.child(0),schema.node('paragraph',{},[schema.text('Changed.')]),...imported.document.content.slice(2)]);
  const moved=schema.node('doc',{},[...imported.document.content.slice(1),imported.document.child(0)]);
  const exportDoc=doc=>api.MarkdownExporter.exportWithSource(doc,imported.source);
  result[label]={capture:measure(()=>api.MarkdownImporter.parseWithSource(source,schema)),alignedEdit:measure(()=>exportDoc(changed)),structuralMove:measure(()=>exportDoc(moved))};
  for(const doc of [changed,moved]) assert.deepEqual(api.MarkdownImporter.parse(exportDoc(doc).markdown,schema).toJSON(),doc.toJSON());
 }
 result.structuralRatio=result.after.structuralMove.medianMs/result.before.structuralMove.medianMs;
 records.push(result);
}
await writeFile('artifacts/markdown-source-boundaries-performance-review-20261104.json',JSON.stringify({baseline:'actual table-column checkpoint packed consumer',samples:3,hardLimitsChanged:false,records},null,2)+'\n');
console.log(JSON.stringify(records.map(({kind,count,before,after,structuralRatio})=>({kind,count,beforeMoveMs:before.structuralMove.medianMs,afterMoveMs:after.structuralMove.medianMs,structuralRatio})),null,2));
