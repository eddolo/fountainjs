import {expect,test} from '@playwright/test';
const url='/artifacts/retained-checkpoint-fixture-compiled-20261106.html';
const pageErrors=new WeakMap<object,string[]>();
test.beforeEach(async({page})=>{const errors:string[]=[];pageErrors.set(page,errors);page.on('pageerror',error=>errors.push(error.message))});
test.afterEach(async({page},info)=>{const state=await page.evaluate(()=>(window as any).audit?.snapshot());if(state){expect(state.source.status).toBe('connected');if(state.restored)expect(state.restored.status).toBe('connected')}expect(pageErrors.get(page)).toEqual([]);await info.attach('runtime-modules',{body:JSON.stringify(await page.evaluate(()=>performance.getEntriesByType('resource').map((entry:any)=>new URL(entry.name).pathname).filter((path:string)=>path.endsWith('.js')||path.startsWith('/src/')))),contentType:'application/json'})});
test('restores an isolated snapshot with media and opaque state then merges later same-room typing',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(url);const source=page.getByRole('textbox',{name:'Source editor'});
 await expect(source).toBeVisible();await page.getByRole('button',{name:'Capture checkpoint',exact:true}).click();await expect(page.getByRole('status')).toContainText('Checkpoint captured');
 await source.click();await page.keyboard.press('Control+Home');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.type('X');await page.getByRole('button',{name:'Add host note',exact:true}).click();
 await page.getByRole('button',{name:'Restore snapshot',exact:true}).click();await expect(page.getByRole('textbox',{name:'Restored editor'})).toHaveText(/Alpha/);
 let state=await page.evaluate(()=>(window as any).audit.snapshot());expect(state.source.json.content[0].content[0].text).toBe('AlXpha');expect(state.restored.json.content[0].content[0].text).toBe('Alpha');expect(state.restored.notes).toBe(1);expect(state.source.notes).toBe(2);expect(state.restored.anchorIndex).toBe(3);
 await expect(page.locator('#restored img')).toBeVisible();expect(await page.locator('#restored img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
 await page.screenshot({path:info.outputPath('isolated.png'),fullPage:true});await page.getByRole('button',{name:'Apply current source updates',exact:true}).click();
 state=await page.evaluate(()=>(window as any).audit.snapshot());expect(state.restored.json).toEqual(state.source.json);expect(state.restored.notes).toBe(2);expect(state.restored.anchorIndex).toBe(4);expect(state.restored.status).toBe('connected');expect(state.source.status).toBe('connected');
 await source.click();await page.keyboard.press('Control+z');await page.getByRole('button',{name:'Apply current source updates',exact:true}).click();state=await page.evaluate(()=>(window as any).audit.snapshot());expect(state.source.json.content[0].content[0].text).toBe('Alpha');expect(state.restored.json).toEqual(state.source.json);expect(state.restored.notes).toBe(2);
 await page.screenshot({path:info.outputPath('final.png'),fullPage:true});await info.attach('checkpoint-result',{body:JSON.stringify(state),contentType:'application/json'});expect(errors).toEqual([]);
});
test('rejects a concurrent source write and allows a later clean capture',async({page},info)=>{
 await page.goto(url);await page.getByLabel('Simulate write during capture').check();await page.getByRole('button',{name:'Capture checkpoint',exact:true}).click();await expect(page.getByRole('status')).toContainText('changed shared state');await expect(page.getByRole('button',{name:'Restore snapshot',exact:true})).toBeDisabled();
 await page.getByLabel('Simulate write during capture').uncheck();await page.getByRole('button',{name:'Capture checkpoint',exact:true}).click();await expect(page.getByRole('status')).toContainText('Checkpoint captured');await page.getByRole('button',{name:'Restore snapshot',exact:true}).click();await expect(page.getByRole('textbox',{name:'Restored editor'})).toBeVisible();
 const state=await page.evaluate(()=>(window as any).audit.snapshot());expect(state.restored.notes).toBe(2);expect(state.restored.json).toEqual(state.source.json);await page.screenshot({path:info.outputPath('final.png'),fullPage:true});
});
test('rejects damaged bytes without replacing either live editor',async({page},info)=>{
 await page.goto(url);await page.getByRole('button',{name:'Capture checkpoint',exact:true}).click();await expect(page.getByRole('status')).toContainText('Checkpoint captured');await page.getByRole('button',{name:'Restore snapshot',exact:true}).click();await expect(page.getByRole('textbox',{name:'Restored editor'})).toBeVisible();const before=await page.evaluate(()=>(window as any).audit.snapshot());
 await page.getByRole('button',{name:'Test damaged snapshot',exact:true}).click();await expect(page.getByRole('status')).toContainText('checksum mismatch');expect(await page.evaluate(()=>(window as any).audit.snapshot())).toEqual(before);await page.screenshot({path:info.outputPath('final.png'),fullPage:true});
});
