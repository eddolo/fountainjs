import {expect,test} from '@playwright/test';
const url='/artifacts/retained-room-store-fixture-compiled-20261106.html';
const errors=new WeakMap<object,string[]>();
const state=(page:any)=>page.evaluate(()=>(window as any).audit.snapshot());
async function click(page:any,name:string,message:string){await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('status')).toContainText(message)}
async function type(page:any,text:string){await page.getByRole('textbox',{name:'Writer editor',exact:true}).click();await page.keyboard.press('Control+Home');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.type(text)}
test.beforeEach(async({page})=>{const list:string[]=[];errors.set(page,list);page.on('pageerror',e=>list.push(e.message));await page.goto(url);await expect(page.getByRole('status')).toContainText('Ready')});
test.afterEach(async({page},info)=>{const result=await state(page);expect(result.writerStatus).toBe('connected');expect(result.peerStatus).toBe('connected');expect(errors.get(page)).toEqual([]);await info.attach('room-result',{body:JSON.stringify(result),contentType:'application/json'});await info.attach('runtime-modules',{body:JSON.stringify(await page.evaluate(()=>performance.getEntriesByType('resource').map((e:any)=>new URL(e.name).pathname).filter((p:string)=>p.endsWith('.js')||p.startsWith('/src/')))),contentType:'application/json'})});

test('retains real offline typing across a frozen revision and stale epoch then reconciles after reconnect',async({page},info)=>{
 await type(page,'X');await click(page,'Send writer edits','accepted');const before=await state(page);expect(before.writer).toEqual(before.peer);expect(before.stored).toEqual(before.writer);
 await click(page,'Freeze revision','Revision frozen');await type(page,'PENDING');await click(page,'Send writer edits','Rejected: frozen');const frozen=await state(page);expect(frozen.byteReads).toBe(before.byteReads);expect(frozen.stored).toEqual(before.stored);expect(frozen.writer).not.toEqual(frozen.peer);await page.screenshot({path:info.outputPath('frozen.png'),fullPage:true});
 await click(page,'Prepare recovery','Recovery prepared');await click(page,'Commit new epoch','New epoch committed');await click(page,'Send writer edits','Rejected: stale-epoch');const stale=await state(page);expect(stale.byteReads).toBe(before.byteReads);expect(stale.checkpointSha256).toBe(before.checkpointSha256);expect(stale.roomId).toBe(before.roomId);expect(stale.epoch).not.toBe(before.epoch);await page.screenshot({path:info.outputPath('stale.png'),fullPage:true});
 await click(page,'Reconnect writer','Writer reconnected');await click(page,'Send writer edits','accepted');let final=await state(page);expect(final.writer).toEqual(final.peer);expect(final.stored).toEqual(final.writer);expect(final.stored.content[0].content[0].text).toContain('PENDING');expect(final.owner).toBe('Grace');expect(final.bytes).toEqual([0,128,255]);
 expect(await page.locator('#peer img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
 await page.getByRole('textbox',{name:'Writer editor',exact:true}).click();for(let index=0;index<'PENDING'.length;index++)await page.keyboard.press('Control+z');await click(page,'Send writer edits','accepted');final=await state(page);expect(final.writer).toEqual(final.peer);expect(final.stored).toEqual(before.stored);await page.screenshot({path:info.outputPath('final.png'),fullPage:true});
});

test('aborts a prepared freeze and sends retained human edits on the original epoch',async({page},info)=>{
 const before=await state(page);await click(page,'Freeze revision','Revision frozen');await click(page,'Prepare recovery','Recovery prepared');await type(page,'ABORT');await click(page,'Send writer edits','Rejected: frozen');await click(page,'Abort freeze','Freeze aborted');const aborted=await state(page);expect(aborted.epoch).toBe(before.epoch);expect(aborted.revision).toBe(before.revision);expect(aborted.stored).toEqual(before.stored);
 await click(page,'Send writer edits','accepted');const final=await state(page);expect(final.stored).toEqual(final.writer);expect(final.peer).toEqual(final.writer);expect(final.stored.content[0].content[0].text).toContain('ABORT');await page.screenshot({path:info.outputPath('final.png'),fullPage:true});
});

test('rejects malformed wire data then accepts subsequent real typing without replacing the editors',async({page},info)=>{
 const before=await state(page);await click(page,'Send malformed update','Rejected: invalid-update');const rejected=await state(page);expect(rejected.checkpointSha256).toBe(before.checkpointSha256);expect(rejected.revision).toBe(before.revision);expect(rejected.writer).toEqual(before.writer);expect(rejected.peer).toEqual(before.peer);
 await type(page,'SAFE');await click(page,'Send writer edits','accepted');const final=await state(page);expect(final.stored).toEqual(final.writer);expect(final.peer).toEqual(final.writer);expect(final.stored.content[0].content[0].text).toContain('SAFE');await page.screenshot({path:info.outputPath('final.png'),fullPage:true});
});
