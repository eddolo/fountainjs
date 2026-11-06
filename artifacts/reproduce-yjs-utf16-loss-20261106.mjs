import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import * as Y from 'yjs';
const rows=[];
for(const [name,source] of [['unpaired-high','a\ud800b'],['unpaired-low','a\udc00b'],['valid-pair','a\ud83d\ude00b']]){
 const original=new Y.Doc(),copy=new Y.Doc();
 try{original.getText('text').insert(0,source);Y.applyUpdate(copy,Y.encodeStateAsUpdate(original));const restored=copy.getText('text').toString();rows.push({name,source,restored,equal:source===restored})}
 finally{original.destroy();copy.destroy()}
}
assert.deepEqual(rows.map(row=>row.equal),[false,false,true]);
await writeFile('artifacts/retained-checkpoint-yjs-utf16-oracle-20261106.json',JSON.stringify({runtime:process.version,rows,scope:'Underlying Yjs wire behavior; current Fountain guards reject the unrepresentable inputs.'},null,2)+'\n');console.log(JSON.stringify(rows));
