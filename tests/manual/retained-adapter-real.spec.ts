import { expect, test, type Page } from '@playwright/test';
const url='/artifacts/retained-adapter-fixture-20261106.html';
async function snapshot(page:Page){return page.evaluate(()=> (window as any).audit.snapshot());}
async function caret(page:Page,name:string,offset:number){const editor=page.getByRole('textbox',{name:`${name} editor`});await editor.click();await page.keyboard.press('Control+Home');for(let i=0;i<offset;i++)await page.keyboard.press('ArrowRight');return editor;}
for(const operation of ['Quote','Bullet','Ordered','Task','Bold','Enter'])test(`native offline typing survives ${operation}, author undo and redo`,async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(url);await expect(page.getByRole('textbox',{name:'Ada editor'})).toBeVisible();
 await page.getByRole('button',{name:'Pause sync',exact:true}).click();await caret(page,'Ada',2);await page.keyboard.type('X');await caret(page,'Grace',operation==='Bold'?1:3);
 // A separate required regression below covers arrow stops at a remote caret.
 // Reach the split from the other side so this case tests a known source cut.
 if(operation==='Enter'){await page.keyboard.press('End');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');await expect.poll(async()=> (await snapshot(page))[1].selection.from).toBe(3);}
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
