import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const once=(source,before,after)=>{assert.equal(source.split(before).length-1,1,`Expected one fixture segment: ${before}`);return source.replace(before,after);};
let fixture=(await readFile('artifacts/retained-repair-fixture-20261107.html','utf8')).replaceAll('retained-repair-build-20261107','yjs-history-policy-build-20261107');
fixture=once(fixture,'Both use the experimental retained adapter.','Both use the public XML Yjs adapter.');
fixture=once(fixture,"import {RetainedYjsCollaborationAdapter} from '/artifacts/yjs-history-policy-build-20261107/retained-adapter.js';","import {YjsCollaborationAdapter} from '/artifacts/yjs-history-policy-build-20261107/legacy-adapter.js';");
fixture=once(fixture,'new RetainedYjsCollaborationAdapter(','new YjsCollaborationAdapter(');
fixture=once(fixture,'<button id="sync">Synchronize now</button>','<button id="sync">Synchronize now</button><button id="neutral">Mark reviewed (no undo)</button><button id="import">Import sample text (no undo)</button>');
fixture=once(fixture,"issues:inspectStableNodeIds(p.editor.state.doc).length","issues:inspectStableNodeIds(p.editor.state.doc).length,review:p.editor.state.doc.child(0).attrs.review??null");
fixture=once(fixture,"window.audit={snapshot:","let reviewSequence=0;document.querySelector('#neutral').onclick=()=>{const p=peers[0];p.editor.dispatch(p.editor.createTransaction().setNodeAttrs([0],{review:'Reviewed '+(++reviewSequence)}).setMeta('addToHistory',false));sync();message.textContent='Review metadata saved without author undo';};\ndocument.querySelector('#import').onclick=()=>{const p=peers[0];p.editor.dispatch(p.editor.createTransaction().insertText([0,0],0,'Imported ').setMeta('addToHistory',false));sync();message.textContent='Imported source shared without author undo';};\nwindow.audit={snapshot:");
await writeFile('artifacts/yjs-history-policy-fixture-20261107.html',fixture);
let spec=(await readFile('tests/manual/retained-repair-real.spec.ts','utf8')).replaceAll('retained-repair-fixture-20261107.html','yjs-history-policy-fixture-20261107.html');
spec+=`
test('keeps neutral review metadata through authored undo and remote typing',async({page})=>{
 await page.getByRole('button',{name:'Mark reviewed (no undo)',exact:true}).click();let peers=await consistent(page);expect(peers[0].json.content[0].attrs.review).toBe('Reviewed 1');expect(peers[0].canUndo).toBe(false);expect(peers[1].canUndo).toBe(false);
 await type(page,'Author editor',' AUTHOR');await page.getByRole('button',{name:'Mark reviewed (no undo)',exact:true}).click();await type(page,'Reviewer editor',' PEER');peers=await consistent(page);const authored=peers[0].json;
 await page.getByRole('button',{name:'Undo author',exact:true}).click();peers=await consistent(page);expect(peers[0].json.content[0].attrs.review).toBe('Reviewed 2');const text=peers[0].json.content[0].content.map((node:any)=>node.text??'').join('');expect(text).toContain('PEER');expect(text).not.toContain('AUTHOR');expect(peers[0].canUndo).toBe(false);
 await page.getByRole('button',{name:'Redo author',exact:true}).click();expect((await consistent(page))[0].json).toEqual(authored);
});
test('keeps imported source outside undo while later author and peer typing remain editable',async({page})=>{
 await page.getByRole('button',{name:'Import sample text (no undo)',exact:true}).click();let peers=await consistent(page);expect(peers[0].canUndo).toBe(false);expect(peers[1].canUndo).toBe(false);expect(peers[0].json.content[0].content.map((node:any)=>node.text??'').join('')).toContain('Imported');
 await type(page,'Reviewer editor',' REVIEW');const beforeLocal=(await consistent(page))[0].json;await type(page,'Author editor',' LOCAL');await page.getByRole('button',{name:'Undo author',exact:true}).click();peers=await consistent(page);expect(peers[0].json).toEqual(beforeLocal);expect(peers[0].canUndo).toBe(false);expect(peers[1].canUndo).toBe(true);
});
`;
await writeFile('tests/manual/yjs-history-policy-real.spec.ts',spec);
