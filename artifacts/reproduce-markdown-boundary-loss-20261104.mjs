import assert from 'node:assert/strict';
import * as before from './table-column-tarball-consumer-20261104/node_modules/fountainjs-editor/dist/index.js';
import {writeFile} from 'node:fs/promises';
const schema=new before.Schema(before.CoreSchemaSpec);
const records=[];
for(const [name,source,indices] of [
 ['open fence','# Keep ###\n\n~~~~js\nfirst\n',[1,0]],
 ['adjacent lists','* First\n\n# Keep ###\n\n* Second\n',[1,0,2]],
 ['adjacent indented code','    first\n\n# Keep ###\n\n    second\n',[1,0,2]],
]){
 const imported=before.MarkdownImporter.parseWithSource(source,schema);
 const changed=schema.node('doc',{},indices.map(index=>imported.document.child(index)));
 const result=before.MarkdownExporter.exportWithSource(changed,imported.source);
 const reopened=before.MarkdownImporter.parse(result.markdown,schema);
 assert.notDeepEqual(reopened.toJSON(),changed.toJSON(),`${name}: prior semantic defect did not reproduce`);
 records.push({name,source,exported:result.markdown,preservation:result.preservation,
  expectedBlocks:changed.childCount,reopenedBlocks:reopened.childCount,semanticLossReproduced:true});
}
await writeFile('artifacts/markdown-source-boundaries-counterfactual-20261104.json',JSON.stringify({baseline:'actual table-column checkpoint packed consumer',records},null,2)+'\n');
console.log(JSON.stringify(records.map(({name,expectedBlocks,reopenedBlocks})=>({name,expectedBlocks,reopenedBlocks}))));
