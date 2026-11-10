import { expect, test, type Page } from '@playwright/test';
import {auditCompiledRuntime} from './compiled-runtime-audit';
const installedPreview = process.env.FOUNTAIN_RETAINED_PACKAGE_AUDIT === '1';
const defaultAdapter = process.env.FOUNTAIN_DEFAULT_YJS_AUDIT === '1';
auditCompiledRuntime(...(defaultAdapter ? ['/dist/index.js', '/dist/yjs.js', '/dist/yjs-legacy.js'] : installedPreview ? [
 '/node_modules/.vite/deps/fountainjs-editor.js',
 '/node_modules/.vite/deps/fountainjs-editor_experimental_yjs-retained.js',
] : []));
const url = defaultAdapter ? '/artifacts/yjs-default-fixture.html' : installedPreview ? '/index.html' : '/artifacts/retained-adapter-fixture-compiled-20261106.html';
async function snapshot(page:Page){return page.evaluate(()=> (window as any).audit.snapshot());}
async function caret(page:Page,name:string,offset:number){const editor=page.getByRole('textbox',{name:`${name} editor`});await editor.click();await page.keyboard.press('Control+Home');for(let i=0;i<offset;i++)await page.keyboard.press('ArrowRight');return editor;}
for(const operation of ['Quote','Bullet','Ordered','Task','Bold','Enter'])test(`native offline typing survives ${operation}, author undo and redo`,async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(url);await expect(page.getByRole('textbox',{name:'Ada editor'})).toBeVisible();
 await page.getByRole('button',{name:'Pause sync',exact:true}).click();await caret(page,'Ada',2);await page.keyboard.type('X');await caret(page,'Grace',operation==='Bold'?1:3);
 if(operation==='Enter')await expect.poll(async()=> (await snapshot(page))[1].selection.from).toBe(3);
 if(operation==='Bold'){for(let i=0;i<3;i++)await page.keyboard.press('Shift+ArrowRight');}
 await testInfo.attach('before-operation',{body:JSON.stringify({peers:await snapshot(page),native:await page.evaluate(()=>{const s=document.getSelection();return {anchor:s?.anchorNode?.textContent,offset:s?.anchorOffset,focus:s?.focusNode?.textContent,focusOffset:s?.focusOffset}})},null,2),contentType:'application/json'});
 if(operation==='Enter')await page.keyboard.press('Enter');else await page.locator('#grace').getByRole('button',{name:operation,exact:true}).click();
 await testInfo.attach('after-operation',{body:JSON.stringify(await snapshot(page),null,2),contentType:'application/json'});
 await page.getByRole('button',{name:'Synchronize',exact:true}).click();
 const expected=operation==='Enter'?['AlXp','ha']:['AlXpha'];
 await expect.poll(async()=>{const peers=await snapshot(page);return peers.map((p:any)=>p.json.content.filter((n:any)=>n.type!=='image_super').map((n:any)=>text(n)));}).toEqual([expected,expected]);
 let peers=await snapshot(page);expect(peers[0].json).toEqual(peers[1].json);expect(peers[0].status).toBe('connected');expect(peers[0].json.attrs).toEqual({audit:'root'});expect(peers[0].json.content.at(-1).type).toBe('image_super');
 await expect(page.locator('#ada img')).toBeVisible();expect(await page.locator('#ada img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
 await page.screenshot({path:testInfo.outputPath('converged.png'),fullPage:true});
 await page.locator('#grace').getByRole('button',{name:'Undo',exact:true}).click();await expect.poll(async()=> (await snapshot(page))[0].json.content[0]).toMatchObject({type:'paragraph',content:[{text:'AlXpha'}]});
 await page.locator('#grace').getByRole('button',{name:'Redo',exact:true}).click();await expect.poll(async()=> (await snapshot(page))[0].json).toEqual(peers[0].json);
 await testInfo.attach('converged-json',{body:JSON.stringify(peers,null,2),contentType:'application/json'});expect(errors).toEqual([]);
});
function text(node:any):string{return node.text??(node.content??[]).map(text).join('');}

test('native offline Enter survives a deleted ancestor and returns with its author undo', async ({page}, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  const source = {type:'doc', attrs:{audit:'deleted-ancestor'}, content:[
    {type:'blockquote', content:[{type:'paragraph', content:[{type:'text', text:'Alpha'}]}]},
    {type:'paragraph', content:[{type:'text', text:'Survivor'}]},
  ]};
  await page.locator('#open').setInputFiles({name:'deleted-ancestor.json', mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(source))});
  await expect(page.locator('#message')).toHaveText('Reopened portable document');
  const initial = (await snapshot(page))[0].json;
  const hidden = {...initial, content:[initial.content[1]]};
  const ada = page.getByRole('textbox', {name:'Ada editor'});
  const grace = page.getByRole('textbox', {name:'Grace editor'});

  await page.getByRole('button', {name:'Pause sync', exact:true}).click();
  await caret(page, 'Ada', 1);
  await page.locator('#ada').getByRole('button', {name:'Delete block', exact:true}).click();
  await expect(ada.locator('p')).toHaveText(['Survivor']);
  await expect(ada.locator('blockquote')).toHaveCount(0);
  await expect(grace.locator('blockquote p')).toHaveText(['Alpha']);
  await caret(page, 'Grace', 2);
  await expect.poll(async () => (await snapshot(page))[1].selection).toMatchObject({path:[0,0,0], from:2, to:2});
  await page.keyboard.press('Enter');
  await page.keyboard.type('X');
  await expect(grace.locator('blockquote p')).toHaveText(['Al','Xpha']);

  await page.getByRole('button', {name:'Synchronize', exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).map((peer:any) => ({json:peer.json,status:peer.status}))).toEqual([
    {json:hidden,status:'connected'}, {json:hidden,status:'connected'},
  ]);
  for (const editor of [ada, grace]) {
    await expect(editor.locator('blockquote')).toHaveCount(0);
    await expect(editor.locator('p')).toHaveText(['Survivor']);
  }
  await page.screenshot({path:info.outputPath('ancestor-deleted-converged.png'),fullPage:true});

  await page.locator('#ada').getByRole('button', {name:'Undo', exact:true}).click();
  await expect.poll(async () => (await snapshot(page)).map((peer:any) => ({status:peer.status,
    paragraphs:peer.json.content[0].content.map(text), survivor:peer.json.content[1], attrs:peer.json.attrs}))).toEqual([
    {status:'connected',paragraphs:['Al','Xpha'],survivor:initial.content[1],attrs:initial.attrs},
    {status:'connected',paragraphs:['Al','Xpha'],survivor:initial.content[1],attrs:initial.attrs},
  ]);
  let peers = await snapshot(page);
  expect(peers[0].json).toEqual(peers[1].json);
  for (const editor of [ada, grace]) await expect(editor.locator('blockquote p')).toHaveText(['Al','Xpha']);

  await grace.locator('blockquote p').nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect.poll(async () => (await snapshot(page)).map((peer:any) => ({status:peer.status,
    paragraphs:peer.json.content[0].content.map(text)}))).toEqual([
    {status:'connected',paragraphs:['Al','Xpha!']}, {status:'connected',paragraphs:['Al','Xpha!']},
  ]);
  for (const editor of [ada, grace]) await expect(editor.locator('p')).toHaveText(['Al','Xpha!','Survivor']);
  peers = await snapshot(page);
  expect(peers[0].json).toEqual(peers[1].json);
  expect(peers[0].json.content[1]).toEqual(initial.content[1]);
  await page.screenshot({path:info.outputPath('ancestor-restored-with-offline-split.png'),fullPage:true});
  await info.attach('deleted-ancestor-result', {body:JSON.stringify(peers,null,2),contentType:'application/json'});
  expect(errors).toEqual([]);
});

if (!installedPreview) test('keeps both drafts after incompatible room data is removed', async ({page},info) => {
  await page.goto(url);
  await page.getByText('Protocol conflict test', {exact:true}).click();
  await page.getByRole('button', {name:'Open separate legacy and retained rooms'}).click();
  const ada = page.getByRole('textbox', {name:'Ada editor'});
  const grace = page.getByRole('textbox', {name:'Grace editor'});
  await caret(page,'Ada',0);
  await page.keyboard.type('Retained ');
  await caret(page,'Grace',0);
  await page.keyboard.type('Legacy ');
  await page.getByRole('button', {name:'Synchronize', exact:true}).click();
  await expect(page.locator('#ada output')).toContainText('error');
  await expect(page.locator('#grace output')).toContainText('error');
  await expect(page.locator('#message')).toContainText('Preserve the local draft');
  for (const author of ['Ada','Grace']) {
    await caret(page,author,0);
    await page.keyboard.press('Control+z');
    await page.keyboard.type('Draft ');
  }
  await expect(ada).toContainText('Draft Retained Alpha');
  await expect(grace).toContainText('Draft Legacy Alpha');
  await page.getByRole('button', {name:'Remove incompatible roots'}).click();
  await expect(page.locator('#ada output')).toContainText('error');
  await expect(page.locator('#grace output')).toContainText('error');
  await expect(ada).toContainText('Draft Retained Alpha');
  await expect(grace).toContainText('Draft Legacy Alpha');
  await page.screenshot({path:info.outputPath('drafts-after-conflict.png'),fullPage:true});
});

test('replaces marked text and deletes natively while preserving peer edits through keyboard history',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(url);
 const content={type:'doc',attrs:{audit:'native-replacement'},content:[
  {type:'paragraph',content:[{type:'text',text:'Alpha',marks:[{type:'strong'}]}]},
  {type:'paragraph',content:[{type:'text',text:'Beta'}]},
  {type:'image_super',attrs:{src:'/tests/fixtures/cross-container-figure.png',alt:'Retained figure'}},
 ]};
 await page.locator('#open').setInputFiles({name:'marked-review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(content))});
 await expect(page.locator('#message')).toHaveText('Reopened portable document');const initial=(await snapshot(page))[0].json;
 const expected=(first:string,second:string)=>{const value=structuredClone(initial);value.content[0].content[0].text=first;value.content[1].content[0].text=second;return value;};
 await page.getByRole('button',{name:'Pause sync',exact:true}).click();await caret(page,'Ada',1);
 await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Shift+ArrowRight');
 await expect.poll(()=>page.evaluate(()=>document.getSelection()?.toString())).toBe('lp');await page.keyboard.type('X');
 await expect.poll(async()=> (await snapshot(page))[0].json).toEqual(expected('AXha','Beta'));
 await page.keyboard.press('Backspace');await expect.poll(async()=> (await snapshot(page))[0].json).toEqual(expected('Aha','Beta'));
 await page.locator('#grace').getByText('Beta',{exact:true}).click();await page.keyboard.press('End');await page.keyboard.type('Z');
 await page.getByRole('button',{name:'Synchronize',exact:true}).click();
 await expect.poll(async()=> (await snapshot(page)).map((peer:any)=>peer.json)).toEqual([expected('Aha','BetaZ'),expected('Aha','BetaZ')]);
 await page.locator('#ada').getByText('Aha',{exact:true}).click();await page.keyboard.press('End');
 await page.keyboard.press('Control+z');await expect.poll(async()=> (await snapshot(page))[1].json).toEqual(expected('AXha','BetaZ'));
 await page.keyboard.press('Control+z');await expect.poll(async()=> (await snapshot(page))[1].json).toEqual(expected('Alpha','BetaZ'));
 await page.keyboard.press('Control+Shift+z');await page.keyboard.press('Control+Shift+z');
 await expect.poll(async()=> (await snapshot(page))[1].json).toEqual(expected('Aha','BetaZ'));
 await page.locator('#grace').getByText('BetaZ',{exact:true}).click();await page.keyboard.press('End');await page.keyboard.press('Control+z');
 await expect.poll(async()=> (await snapshot(page))[0].json).toEqual(expected('Aha','Beta'));
 await page.keyboard.press('Control+Shift+z');
 await expect.poll(async()=> (await snapshot(page)).map((peer:any)=>({json:peer.json,status:peer.status}))).toEqual([
  {json:expected('Aha','BetaZ'),status:'connected'},{json:expected('Aha','BetaZ'),status:'connected'},
 ]);
 await expect(page.locator('#ada strong')).toHaveText('Aha');await expect(page.locator('#grace strong')).toHaveText('Aha');
 await page.screenshot({path:testInfo.outputPath('native-replacement-history.png'),fullPage:true});
 await testInfo.attach('native-replacement-result',{body:JSON.stringify(await snapshot(page)),contentType:'application/json'});expect(errors).toEqual([]);
});

test('edits a thousand-paragraph shared document with native input and independent author history',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(url);
 const content={type:'doc',attrs:{audit:{source:'bulk-seed',paragraphs:1000}},content:[
  ...Array.from({length:1000},(_,index)=>({type:'paragraph',content:[{type:'text',text:`Paragraph ${String(index).padStart(4,'0')}`,...index%10===0?{marks:[{type:'strong'}]}:{}}]})),
  {type:'image_super',attrs:{src:'/tests/fixtures/cross-container-figure.png',alt:'Retained figure'}},
 ]};
 await page.locator('#open').setInputFiles({name:'large-shared-document.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(content))});
 await expect.poll(async()=> (await snapshot(page))[0].json.content.length).toBe(1001);
 const initial=(await snapshot(page))[0].json;await page.getByRole('button',{name:'Pause sync',exact:true}).click();
 await page.locator('#ada').getByText('Paragraph 0500',{exact:true}).click();await page.keyboard.press('End');await page.keyboard.type(' left');
 await expect.poll(async()=>text((await snapshot(page))[0].json.content[500])).toBe('Paragraph 0500 left');
 await page.locator('#grace').getByText('Paragraph 0600',{exact:true}).click();await page.keyboard.press('End');await page.keyboard.type(' right');
 await expect.poll(async()=>text((await snapshot(page))[1].json.content[600])).toBe('Paragraph 0600 right');
 await page.getByRole('button',{name:'Synchronize',exact:true}).click();
 await expect.poll(async()=>{const peers=await snapshot(page);return peers.map((p:any)=>[p.status,text(p.json.content[500]),text(p.json.content[600])])}).toEqual([
  ['connected','Paragraph 0500 left','Paragraph 0600 right'],['connected','Paragraph 0500 left','Paragraph 0600 right'],
 ]);
 const peers=await snapshot(page),final=peers[0].json;expect(final).toEqual(peers[1].json);expect(final.attrs).toEqual(initial.attrs);
 for(let index=0;index<initial.content.length;index++)if(index!==500&&index!==600)expect(final.content[index]).toEqual(initial.content[index]);
 await page.locator('#ada').getByText('Paragraph 0500 left',{exact:true}).click();await page.keyboard.press('End');
 // Native typing has one history item per character with this audit's zero capture timeout.
 for(let index=0;index<' left'.length;index++)await page.keyboard.press('Control+z');
 await expect.poll(async()=> (await snapshot(page))[0].json.content[500]).toEqual(initial.content[500]);
 expect(text((await snapshot(page))[0].json.content[600])).toBe('Paragraph 0600 right');
 for(let index=0;index<' left'.length;index++)await page.keyboard.press('Control+Shift+z');
 await expect.poll(async()=> (await snapshot(page))[0].json).toEqual(final);
 await page.locator('#grace').getByText('Paragraph 0600 right',{exact:true}).click();await page.keyboard.press('End');
 for(let index=0;index<' right'.length;index++)await page.keyboard.press('Control+z');
 await expect.poll(async()=> (await snapshot(page))[1].json.content[600]).toEqual(initial.content[600]);
 expect(text((await snapshot(page))[1].json.content[500])).toBe('Paragraph 0500 left');
 for(let index=0;index<' right'.length;index++)await page.keyboard.press('Control+Shift+z');
 await expect.poll(async()=> (await snapshot(page))[1].json).toEqual(final);
 await page.locator('#ada').getByText('Paragraph 0500 left',{exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:testInfo.outputPath('bulk-document-middle.png')});
 await testInfo.attach('bulk-document-result',{body:JSON.stringify({paragraphs:1000,peers:await snapshot(page)},null,2),contentType:'application/json'});expect(errors).toEqual([]);
});

test('native edits in separate paragraphs preserve untouched rich content and author-only history',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(url);
 const content={type:'doc',attrs:{audit:'root'},content:[
  {type:'paragraph',content:[{type:'text',text:'Alpha'}]},
  {type:'paragraph',content:[{type:'text',text:'Beta'}]},
  {type:'paragraph',content:[{type:'text',text:'Gam',marks:[{type:'strong'}]},{type:'text',text:'ma'}]},
  {type:'paragraph',content:[{type:'text',text:'Delta'}]},
  {type:'image_super',attrs:{src:'/tests/fixtures/cross-container-figure.png',alt:'Retained figure'}},
 ]};
 await page.locator('#open').setInputFiles({name:'research-notes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(content))});
 await expect(page.locator('#message')).toHaveText('Reopened portable document');
 const initial=(await snapshot(page))[0].json;
 await page.getByRole('button',{name:'Pause sync',exact:true}).click();
 const edit=async(name:string,paragraph:number,offset:number,value:string)=>{await page.getByRole('textbox',{name:name+' editor',exact:true}).locator('p').nth(paragraph).click();await page.keyboard.press('Home');for(let i=0;i<offset;i++)await page.keyboard.press('ArrowRight');await page.keyboard.type(value)};
 await edit('Ada',1,2,'X');await edit('Grace',0,2,'Z');await edit('Grace',3,3,'Y');
 await page.getByRole('button',{name:'Synchronize',exact:true}).click();
 await expect.poll(async()=> (await snapshot(page)).map((p:any)=>p.json.content.slice(0,4).map(text))).toEqual([
  ['AlZpha','BeXta','Gamma','DelYta'],['AlZpha','BeXta','Gamma','DelYta'],
 ]);
 const peers=await snapshot(page),final=peers[0].json;expect(final).toEqual(peers[1].json);expect(final.content[2]).toEqual(initial.content[2]);expect(final.content[4]).toEqual(initial.content[4]);expect(final.attrs).toEqual(initial.attrs);
 await expect.poll(()=>page.locator('#ada img').evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('multi-paragraph-converged.png'),fullPage:true});
 await page.locator('#ada').getByRole('button',{name:'Undo',exact:true}).click();
 await expect.poll(async()=> (await snapshot(page))[1].json.content.slice(0,4).map(text)).toEqual(['AlZpha','Beta','Gamma','DelYta']);
 await page.locator('#ada').getByRole('button',{name:'Redo',exact:true}).click();await expect.poll(async()=> (await snapshot(page))[1].json).toEqual(final);
 await testInfo.attach('multi-paragraph-final',{body:JSON.stringify(await snapshot(page),null,2),contentType:'application/json'});expect(errors).toEqual([]);
});
test('native typing retains host observer annotations through synchronization and author undo',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(url);
 await page.getByRole('checkbox',{name:'Annotate edits from host',exact:true}).check();
 await caret(page,'Ada',2);await page.keyboard.type('X');
 await expect.poll(async()=> (await snapshot(page)).map((p:any)=>({text:text(p.json.content[0]),annotation:p.json.attrs.hostAnnotation,status:p.status}))).toEqual([
  {text:'AlXpha',annotation:true,status:'connected'},{text:'AlXpha',annotation:true,status:'connected'},
 ]);
 await expect(page.locator('#ada output')).toContainText('host annotation retained');await expect(page.locator('#grace output')).toContainText('host annotation retained');
 await page.screenshot({path:testInfo.outputPath('observer-annotation.png'),fullPage:true});
 await page.locator('#ada').getByRole('button',{name:'Undo',exact:true}).click();
 await expect.poll(async()=> (await snapshot(page)).map((p:any)=>({text:text(p.json.content[0]),annotation:p.json.attrs.hostAnnotation}))).toEqual([
  {text:'Alpha',annotation:true},{text:'Alpha',annotation:true},
 ]);
 await page.locator('#ada').getByRole('button',{name:'Redo',exact:true}).click();await expect.poll(async()=>text((await snapshot(page))[1].json.content[0])).toBe('AlXpha');
 expect((await snapshot(page))[1].json.attrs.hostAnnotation).toBe(true);await testInfo.attach('host-annotation-json',{body:JSON.stringify(await snapshot(page),null,2),contentType:'application/json'});expect(errors).toEqual([]);
});

test('continues native typing and Enter after an observer update without moving the caret',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(url);await page.getByRole('checkbox',{name:'Annotate edits from host',exact:true}).check();
 const editor=await caret(page,'Ada',2);await page.keyboard.type('XY');
 await expect.poll(async()=> (await snapshot(page)).map((p:any)=>text(p.json.content[0]))).toEqual(['AlXYpha','AlXYpha']);await expect(editor).toBeFocused();
 await page.keyboard.press('Enter');
 await expect.poll(async()=> (await snapshot(page)).map((p:any)=>p.json.content.filter((n:any)=>n.type==='paragraph').map(text))).toEqual([['AlXY','pha'],['AlXY','pha']]);
 const final=(await snapshot(page))[0].json;expect(final.attrs.hostAnnotation).toBe(true);await page.screenshot({path:testInfo.outputPath('observer-continued-typing.png'),fullPage:true});
 for(const expected of ['AlXYpha','AlXpha','Alpha']){await page.locator('#ada').getByRole('button',{name:'Undo',exact:true}).click();await expect.poll(async()=>text((await snapshot(page))[1].json.content[0])).toBe(expected);expect((await snapshot(page))[1].json.attrs.hostAnnotation).toBe(true)}
 for(let i=0;i<3;i++)await page.locator('#ada').getByRole('button',{name:'Redo',exact:true}).click();await expect.poll(async()=> (await snapshot(page))[1].json).toEqual(final);
 await testInfo.attach('observer-continued-json',{body:JSON.stringify(await snapshot(page),null,2),contentType:'application/json'});expect(errors).toEqual([]);
});

test('right-arrow navigation crosses a remote presence without consuming a character step',async({page},testInfo)=>{
 await page.goto(url);await page.getByRole('button',{name:'Pause sync',exact:true}).click();await caret(page,'Ada',2);await page.keyboard.type('X');await caret(page,'Grace',3);
 await testInfo.attach('native-caret',{body:JSON.stringify({peers:await snapshot(page),native:await page.evaluate(()=>{const s=document.getSelection();return {text:s?.anchorNode?.textContent,offset:s?.anchorOffset}})},null,2),contentType:'application/json'});
 await expect.poll(async()=> (await snapshot(page))[1].selection.from).toBe(3);
});
test('native blank lines, backward selection, mounted room replacement, download and reopen',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(url);await caret(page,'Ada',2);await page.keyboard.press('Enter');await page.keyboard.press('Enter');
 await expect.poll(async()=> (await snapshot(page))[1].json.content.map((n:any)=>n.type)).toEqual(['paragraph','paragraph','paragraph','image_super']);
 await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');await expect.poll(async()=>text((await snapshot(page))[1].json.content[0])).toBe('Alpha');
 await caret(page,'Ada',4);for(let i=0;i<3;i++)await page.keyboard.press('Shift+ArrowLeft');await expect.poll(()=>page.evaluate(()=>document.getSelection()?.toString())).toBe('lph');
 await page.screenshot({path:testInfo.outputPath('backward-selection.png'),fullPage:true});
 await page.evaluate(()=>{(window as any).originalViews=(window as any).audit.sameViews()});await page.getByRole('button',{name:'Switch to Planning',exact:true}).click();await expect.poll(async()=>text((await snapshot(page))[0].json.content[0])).toBe('Planning draft');
 expect(await page.evaluate(()=> (window as any).audit.sameViews().every((view:any,i:number)=>view===(window as any).originalViews[i]))).toBe(true);
 await caret(page,'Ada',0);await page.keyboard.type('New ');await expect.poll(async()=>text((await snapshot(page))[1].json.content[0])).toBe('New Planning draft');
 const saved=(await snapshot(page))[0].json;const downloadPromise=page.waitForEvent('download');await page.locator('#ada').getByRole('button',{name:'Download JSON',exact:true}).click();const download=await downloadPromise;await download.saveAs(testInfo.outputPath('document.json'));
 await page.getByRole('button',{name:'Reset Launch',exact:true}).click();await page.locator('#open').setInputFiles(testInfo.outputPath('document.json'));await expect.poll(async()=> (await snapshot(page))[0].json).toEqual(saved);expect((await snapshot(page))[1].json).toEqual(saved);
 await page.screenshot({path:testInfo.outputPath('reopened.png'),fullPage:true});expect(errors).toEqual([]);
});
