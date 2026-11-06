import {test,expect,type Page} from '@playwright/test';
import {auditCompiledRuntime} from './compiled-runtime-audit';
auditCompiledRuntime();
const url='/artifacts/cursor-native-reference-compiled-20261106.html';
async function state(page:Page,index:number){return page.evaluate(i=>{const snapshot=(window as any).referenceAudit.snapshot()[i],native=document.getSelection();return {kind:snapshot.selection.kind,from:snapshot.selection.from,to:snapshot.selection.to,path:snapshot.selection.path,endPath:snapshot.selection.endPath,selected:native?.toString(),document:snapshot.json}},index)}
for(const kind of ['english','rtl','mixed','emoji','combining-inside','zwj-inside','surrogate-inside','code','empty','english-range','combining-inside-range','zwj-inside-range','surrogate-inside-range'])test(`matches native visual/grapheme navigation and editing: ${kind}`,async({page},testInfo)=>{
 await page.goto(url);await page.locator('#case').selectOption(kind.replace(/-range$/,''));if(kind.endsWith('-range'))await page.getByRole('checkbox',{name:'Peer range',exact:true}).check();const sequences:Record<string,unknown[]>={};
 for(const [index,name] of ['Reference','Presence'].entries()){
  await page.getByRole('textbox',{name:name+' editor',exact:true}).click();await page.keyboard.press('Control+Home');const steps=[];
  for(const key of ['ArrowRight','ArrowRight','ArrowRight','ArrowRight','ArrowRight','Shift+ArrowRight','Shift+ArrowRight','Shift+ArrowLeft','ArrowLeft','ArrowLeft','ArrowLeft','Shift+ArrowLeft','Shift+ArrowLeft','Shift+ArrowRight','ArrowRight','Control+End','ArrowLeft','ArrowLeft','ArrowLeft','ArrowLeft','Shift+ArrowLeft','Shift+ArrowLeft','Shift+ArrowRight']){await page.keyboard.press(key);steps.push({key,...await state(page,index)})}
  await page.keyboard.type('Q');steps.push({key:'type Q',...await state(page,index)});sequences[name]=steps;
 }
 await testInfo.attach('native-reference',{body:JSON.stringify(sequences,null,2),contentType:'application/json'});await page.screenshot({path:testInfo.outputPath('comparison.png'),fullPage:true});expect(sequences.Presence).toEqual(sequences.Reference);
});
for(const kind of ['empty','block-gap','atomic-image','table'])test(`shows a passive remote caret at a mounted ${kind} anchor`,async({page},testInfo)=>{
 await page.goto(url);await page.locator('#case').selectOption(kind);await expect(page.locator('.fountain-collaboration-caret')).toBeVisible();expect(await page.getByRole('textbox',{name:'Presence editor',exact:true}).locator('[data-fountain-widget]').count()).toBe(0);
 await page.screenshot({path:testInfo.outputPath('anchor.png'),fullPage:true});
});
test('paints remote carets through scrolling, transforms and resize without remounting text or taking focus',async({page},testInfo)=>{
 await page.goto(url);const editor=page.getByRole('textbox',{name:'Presence editor',exact:true});await editor.click();await page.keyboard.press('Control+Home');await page.keyboard.press('ArrowRight');
 await page.evaluate(()=>{(window as any).originalText=document.querySelectorAll('[data-fountain-text-path]')[1].firstChild});
 await expect(page.locator('.fountain-collaboration-caret')).toBeVisible();expect(await editor.locator('[data-fountain-widget]').count()).toBe(0);
 const aligned=async()=>page.evaluate(()=>{const host=document.querySelectorAll('[data-fountain-text-path]')[1],text=host.firstChild!,range=document.createRange();range.setStart(text,2);range.collapse(true);const expected=range.getBoundingClientRect(),overlay=document.querySelector<HTMLElement>('[data-fountain-overlay-widget]')!,actual=overlay.getBoundingClientRect();return Math.abs(actual.left-expected.left)<2&&Math.abs(actual.top-expected.top)<2});
 await expect.poll(aligned).toBe(true);
 await page.addStyleTag({content:'section{height:220px;overflow:auto;transform:translateX(8px) scale(.95);transform-origin:top left}'});await page.setViewportSize({width:1100,height:800});await expect.poll(aligned).toBe(true);
 await page.locator('section').nth(1).hover();await page.mouse.wheel(0,40);await expect.poll(aligned).toBe(true);await page.screenshot({path:testInfo.outputPath('scrolled-overlay.png'),fullPage:true});
 await page.addStyleTag({content:'section{height:90px}'});await page.mouse.wheel(0,250);await expect(page.locator('[data-fountain-overlay-widget]')).toBeHidden();
 await page.addStyleTag({content:'section{height:220px}'});await page.mouse.wheel(0,-400);await expect(page.locator('.fountain-collaboration-caret')).toBeVisible();await expect.poll(aligned).toBe(true);
 await page.getByRole('checkbox',{name:'Show peer'}).focus();await page.keyboard.press('Space');await expect(page.locator('[data-fountain-overlay-widgets]')).toHaveCount(0);await page.keyboard.press('Space');await expect(page.locator('.fountain-collaboration-caret')).toBeVisible();
 expect(await page.evaluate(()=>document.querySelectorAll('[data-fountain-text-path]')[1].firstChild===(window as any).originalText)).toBe(true);await expect(page.getByRole('checkbox',{name:'Show peer'})).toBeFocused();
 await page.screenshot({path:testInfo.outputPath('restored-overlay.png'),fullPage:true});
 await page.emulateMedia({media:'print'});await expect(page.locator('[data-fountain-overlay-widgets]')).toBeHidden();await page.emulateMedia({media:'screen'});await expect(page.locator('.fountain-collaboration-caret')).toBeVisible();
});

for(const direction of ['ltr','rtl'])test(`keeps remote name labels inside clipped editors without moving their anchor (${direction})`,async({page},testInfo)=>{
 await page.goto(url);await page.evaluate(dir=>{document.documentElement.dir=dir},direction);await page.locator('#case').selectOption('atomic-image');
 const editor=page.getByRole('textbox',{name:'Presence editor',exact:true}),label=page.locator('.fountain-collaboration-caret > span'),caret=page.locator('.fountain-collaboration-caret');
 await expect.poll(()=>editor.locator('img').evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
 await expect.poll(async()=>{const figure=await editor.locator('figure').boundingBox(),cursor=await caret.boundingBox();return Boolean(figure&&cursor&&Math.abs(cursor.y+cursor.height-figure.y-figure.height)<1)}).toBe(true);
 const documentBefore=await page.evaluate(()=> (window as any).referenceAudit.snapshot()[1].json);
 const bounds=()=>page.evaluate(()=>{const host=document.querySelectorAll<HTMLElement>('[role=textbox]')[1],panel=document.querySelectorAll('section')[1],label=document.querySelector('.fountain-collaboration-caret > span')!,box=host.getBoundingClientRect(),clip=panel.getBoundingClientRect(),name=label.getBoundingClientRect();return {inside:name.left>=Math.max(0,box.left,clip.left)-.5&&name.right<=Math.min(innerWidth,box.right,clip.right)+.5&&name.top>=Math.max(0,box.top,clip.top)-.5&&name.bottom<=Math.min(innerHeight,box.bottom,clip.bottom)+.5,label:{x:name.x,y:name.y,width:name.width,height:name.height}}});
 for(const name of ['Grace','Grace researcher '.repeat(10),'باحثة '.repeat(25)]){const before=await caret.boundingBox();await page.getByRole('textbox',{name:'Peer name',exact:true}).fill(name);await expect(label).toHaveText(name.trim());await expect.poll(async()=> (await bounds()).inside).toBe(true);const after=await caret.boundingBox();expect(after?.x).toBeCloseTo(before!.x,1);expect(after?.y).toBeCloseTo(before!.y,1);await expect(page.getByRole('textbox',{name:'Peer name',exact:true})).toBeFocused();}
 expect(await page.evaluate(()=> (window as any).referenceAudit.snapshot()[1].json)).toEqual(documentBefore);
 await page.setViewportSize({width:360,height:800});await expect.poll(async()=> (await bounds()).inside).toBe(true);await page.screenshot({path:testInfo.outputPath('narrow-label.png'),fullPage:true});
 await page.setViewportSize({width:1100,height:800});await page.locator('#case').selectOption('english');const paragraphBefore=await page.evaluate(()=> (window as any).referenceAudit.snapshot()[1].json);await page.addStyleTag({content:'section{height:180px;overflow:auto}'});await page.locator('section').nth(1).hover();await page.mouse.wheel(0,140);await expect(label).toBeVisible();await expect.poll(async()=> (await bounds()).inside).toBe(true);
 expect(await page.evaluate(()=> (window as any).referenceAudit.snapshot()[1].json)).toEqual(paragraphBefore);
 await page.screenshot({path:testInfo.outputPath('top-edge-label.png'),fullPage:true});await testInfo.attach('label-bounds',{body:JSON.stringify(await bounds(),null,2),contentType:'application/json'});expect(await editor.locator('[data-fountain-widget]').count()).toBe(0);
});
