import {expect,test} from '@playwright/test';
const errors=new WeakMap<object,string[]>(),state=(page:any)=>page.evaluate(()=>(window as any).audit.snapshot());
async function capture(page:any,info:any,name:string){await page.evaluate(()=>window.scrollTo(0,0));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const size=await page.evaluate(()=>({height:document.documentElement.scrollHeight,viewport:innerHeight,width:document.documentElement.scrollWidth,viewportWidth:innerWidth}));expect(size.height).toBeLessThanOrEqual(size.viewport);expect(size.width).toBeLessThanOrEqual(size.viewportWidth);await page.screenshot({path:info.outputPath(name),fullPage:false,scale:'css'})}
async function type(page:any,name:string,text:string){await page.getByRole('textbox',{name,exact:true}).click();await page.keyboard.press('Control+Home');await page.keyboard.press('End');await page.keyboard.type(text)}
test.beforeEach(async({page})=>{const list:string[]=[];errors.set(page,list);page.on('pageerror',error=>list.push(error.message));await page.goto('/artifacts/retained-handoff-fixture-20261106.html');await expect(page.getByRole('status')).toContainText('Ready');await page.evaluate(()=>{const summary={frames:0,minViewport:innerWidth,minPane:Infinity,maxOverflow:0,invalid:[] as unknown[]};(window as any).auditLayout=summary;function sample(){const widths=[...document.querySelectorAll('.panes>section')].map(element=>element.getBoundingClientRect().width),overflow=document.documentElement.scrollWidth-innerWidth;summary.frames++;summary.minViewport=Math.min(summary.minViewport,innerWidth);summary.minPane=Math.min(summary.minPane,...widths);summary.maxOverflow=Math.max(summary.maxOverflow,overflow);if((widths.some(width=>width<200)||overflow>2)&&summary.invalid.length<20)summary.invalid.push({widths,viewport:innerWidth,overflow});requestAnimationFrame(sample)}sample()})});
test.afterEach(async({page},info)=>{const result=await state(page),layout=await page.evaluate(()=>(window as any).auditLayout);expect(errors.get(page)).toEqual([]);expect(layout.invalid).toEqual([]);expect(layout.frames).toBeGreaterThan(0);await info.attach('handoff-result',{body:JSON.stringify(result),contentType:'application/json'});await info.attach('layout-samples',{body:JSON.stringify(layout),contentType:'application/json'});await info.attach('runtime-modules',{body:JSON.stringify(await page.evaluate(()=>performance.getEntriesByType('resource').map((entry:any)=>new URL(entry.name).pathname).filter((path:string)=>path.endsWith('.js')||path.startsWith('/src/')))),contentType:'application/json'});await page.evaluate(()=>(window as any).audit.close())});

test('retains offline edits, installs a fresh room, then restores the old branch while archiving new edits',async({page},info)=>{
 const original=(await state(page)).active;await type(page,'Offline editor',' OLD pending');const offline=(await state(page)).offline;
 await page.getByRole('button',{name:'Switch to fresh room',exact:true}).click();await expect(page.getByRole('status')).toContainText('Fresh room installed');let current=await state(page);expect(current.active).toEqual(original);expect(current.server).toEqual(original);expect(current.offline).toEqual(offline);expect(current.roomId).not.toBe(current.originalRoomId);
 await page.getByRole('button',{name:'Try old writer',exact:true}).click();await expect(page.getByRole('status')).toContainText('Old writer rejected');
 await page.getByRole('button',{name:'Retain old edits',exact:true}).click();await expect(page.getByRole('status')).toContainText('Old edits retained separately');expect((await state(page)).archive).toEqual(offline);
 await type(page,'Active editor',' NEW accepted');await page.getByRole('button',{name:'Save active edits',exact:true}).click();await expect(page.getByRole('status')).toContainText('durably saved');current=await state(page);const fresh=current.active;expect(current.server).toEqual(fresh);expect(current.archive).toEqual(offline);await capture(page,info,'branches.png');
 await page.getByRole('button',{name:'Rollback with archive',exact:true}).click();await expect(page.getByRole('status')).toContainText('Rollback committed');current=await state(page);expect(current.active).toEqual(offline);expect(current.server).toEqual(offline);expect(current.archive).toEqual(fresh);expect(current.rollbackArchiveId).toBeTruthy();await capture(page,info,'rollback.png');
 await page.getByRole('button',{name:'Retry last switch',exact:true}).click();await expect(page.getByRole('status')).toContainText('Historical receipt');current=await state(page);expect(current.lastReplay).toEqual({replayed:true,current:false});expect(current.active).toEqual(offline);expect(current.archive).toEqual(fresh);expect(await page.locator('#active img').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);
 const reader=page.getByRole('textbox',{name:'Archive reader',exact:true});await expect(reader).toHaveAttribute('contenteditable','false');await reader.click();await page.keyboard.type('MUST NOT EDIT');current=await state(page);expect(current.archive).toEqual(fresh);expect(current.active).toEqual(offline);expect(current.server).toEqual(offline);await capture(page,info,'final.png');
});

test('restores the frozen original on explicit choice while preserving the replaced fresh room',async({page},info)=>{
 const original=(await state(page)).active;await type(page,'Offline editor',' OLD branch');await page.getByRole('button',{name:'Switch to fresh room',exact:true}).click();await expect(page.getByRole('status')).toContainText('Fresh room installed');await page.getByRole('button',{name:'Retain old edits',exact:true}).click();await expect(page.getByRole('status')).toContainText('Old edits retained');await type(page,'Active editor',' NEW branch');const fresh=(await state(page)).active;
 await page.getByLabel('Rollback source').selectOption('frozen-source');await page.getByRole('button',{name:'Rollback with archive',exact:true}).click();await expect(page.getByRole('status')).toContainText('Rollback committed');const current=await state(page);expect(current.active).toEqual(original);expect(current.server).toEqual(original);expect(current.archive).toEqual(fresh);expect(current.offline).not.toEqual(original);await capture(page,info,'final.png');
});

test('recovers a lost switch acknowledgement by replaying the durable receipt',async({page},info)=>{
 const before=await state(page);await page.getByLabel('Drop switch acknowledgement (test only)').check();await page.getByRole('button',{name:'Switch to fresh room',exact:true}).click();await expect(page.getByRole('status')).toContainText('Request failed');const ambiguous=await state(page);expect(ambiguous.epoch).not.toBe(before.epoch);expect(ambiguous.server).toEqual(before.server);expect(ambiguous.active).toEqual(before.active);await capture(page,info,'lost-ack.png');
 await page.getByRole('button',{name:'Retry last switch',exact:true}).click();await expect(page.getByRole('status')).toContainText('Durable switch receipt replayed');const after=await state(page);expect(after.epoch).toBe(ambiguous.epoch);expect(after.revision).toBe(ambiguous.revision);expect(after.lastReplay).toEqual({replayed:true,current:true});expect(after.archive).toEqual(before.active);await type(page,'Active editor',' AFTER retry');await page.getByRole('button',{name:'Save active edits',exact:true}).click();await expect(page.getByRole('status')).toContainText('durably saved');const saved=await state(page);expect(saved.server).toEqual(saved.active);expect(saved.active).not.toEqual(before.active);await capture(page,info,'final.png');
});

test('skips an unhelpful compaction and installs a smaller checkpoint after real edits', async ({page},info) => {
  const original = await state(page);
  const active = page.getByRole('textbox', {name:'Active editor', exact:true});
  await page.getByText('Compaction settings', {exact:true}).click();
  const minimum = page.getByLabel('Minimum checkpoint bytes to save');
  await minimum.fill('999999');
  await page.getByRole('button', {name:'Switch to fresh room'}).click();
  await expect(page.getByRole('status')).toContainText('Compaction skipped');
  expect(await state(page)).toMatchObject({epoch:original.epoch,phase:'active',bytes:original.bytes,roomId:original.roomId});
  await capture(page,info,'compaction-skipped.png');

  const quote = 'Keep every accepted edit recoverable.';
  await active.getByText(quote, {exact:true}).click();
  for (let index = 0; index <= 24; index += 1) {
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.insertText(index === 24 ? quote : `Temporary draft ${index}.`);
  }
  await page.getByRole('button', {name:'Save active edits'}).click();
  await expect(page.getByRole('status')).toContainText('durably saved');
  const grown = await state(page);
  expect(grown.active).toEqual(original.active);
  expect(grown.bytes).toBeGreaterThan(original.bytes + 512);
  await type(page,'Offline editor',' OFFLINE draft');
  const offline = (await state(page)).offline;
  await minimum.fill('512');
  await page.getByRole('button', {name:'Switch to fresh room'}).click();
  await expect(page.getByRole('status')).toContainText('Compacted live checkpoint');
  const compacted = await state(page);
  expect(grown.bytes - compacted.bytes).toBeGreaterThanOrEqual(512);
  await info.attach('compaction-size', {body:JSON.stringify({before:grown.bytes,after:compacted.bytes}),contentType:'application/json'});
  expect(compacted.roomId).not.toBe(original.roomId);
  expect(compacted.server).toEqual(original.active);
  await capture(page,info,'compaction-savings.png');
  const paragraph = active.getByText('Alpha technical note.', {exact:true});
  await paragraph.click();
  await page.keyboard.press('Control+z');
  await expect(paragraph).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' New session.');
  await expect(active).toContainText('New session.');
  await page.keyboard.press('Control+z');
  await expect(paragraph).toBeVisible();
  await page.getByRole('button', {name:'Try old writer'}).click();
  await expect(page.getByRole('status')).toContainText('Old writer rejected');
  await page.getByRole('button', {name:'Retain old edits'}).click();
  await expect(page.getByRole('textbox', {name:'Archive reader'})).toContainText('OFFLINE draft');
  expect((await state(page)).archive).toEqual(offline);
  await capture(page,info,'compaction-offline-recovered.png');
});

test('lets the author compare the merged branch with the exact offline draft', async ({page},info) => {
  const active = page.getByRole('textbox', {name:'Active editor', exact:true});
  await active.getByText('Alpha technical note.', {exact:true}).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.insertText('Rewritten online.');
  await type(page,'Offline editor',' OFFLINE draft');
  const offline = (await state(page)).offline;
  await page.getByRole('button', {name:'Switch to fresh room'}).click();
  await expect(page.getByRole('status')).toContainText('Fresh room installed');
  const live = (await state(page)).server;
  await page.route('**/__handoff/retain', route => route.fulfill({
    status:400, json:{ok:false,error:'Merge unavailable'},
  }), {times:1});
  await page.getByRole('button', {name:'Retain old edits'}).click();
  await expect(page.getByRole('status')).toContainText('Merge unavailable');
  await page.getByRole('button', {name:'Show saved offline draft'}).click();
  await expect(page.getByRole('status')).toContainText('Showing the writer’s saved draft');
  expect((await state(page)).archive).toEqual(offline);
  await page.getByRole('button', {name:'Retain old edits'}).click();
  await expect(page.getByRole('status')).toContainText('Old edits retained separately');
  const merged = (await state(page)).archive;
  expect(merged).not.toEqual(offline);
  await expect(page.getByRole('textbox', {name:'Archive reader'})).toContainText('Rewritten online.');
  await expect(page.getByRole('textbox', {name:'Archive reader'})).toContainText('OFFLINE draft');
  await capture(page,info,'overlapping-merged-branch.png');
  await page.getByRole('button', {name:'Show saved offline draft'}).click();
  await expect(page.getByRole('status')).toContainText('Showing the writer’s saved draft');
  expect((await state(page)).archive).toEqual(offline);
  await expect(page.getByRole('textbox', {name:'Archive reader'})).toHaveAttribute('contenteditable','false');
  await capture(page,info,'exact-offline-draft.png');
  await page.getByRole('button', {name:'Show merged retired branch'}).click();
  await expect(page.getByRole('status')).toContainText('Showing the merged retired branch');
  expect((await state(page)).archive).toEqual(merged);
  expect((await state(page)).server).toEqual(live);

  const review = page.getByRole('button',{name:'Review opening paragraph'});
  const replacement = page.getByLabel('Reviewed replacement');
  const apply = page.getByRole('button',{name:'Apply reviewed paragraph'});
  await review.click();
  await expect(replacement).toHaveValue('Rewritten online.');
  await expect(page.locator('#review-draft')).toHaveText('Alpha technical note. OFFLINE draft');
  await replacement.fill('Rewritten online, with the offline note.');
  await capture(page,info,'paragraph-review.png');
  await type(page,'Active editor',' Peer follow-up.');
  await apply.click();
  await expect(page.getByRole('status')).toContainText('Save your active edits');
  await page.getByRole('button',{name:'Save active edits'}).click();
  await expect(page.getByRole('status')).toContainText('durably saved');
  await apply.click();
  await expect(page.getByRole('status')).toContainText('review is stale');
  await expect(active).toContainText('Peer follow-up.');
  await expect(replacement).toHaveValue('Rewritten online, with the offline note.');
  await capture(page,info,'paragraph-review-stale.png');
  await review.click();
  await expect(page.locator('#review-current')).toHaveText('Rewritten online. Peer follow-up.');
  await expect(replacement).toHaveValue('Rewritten online, with the offline note.');
  await replacement.fill('Rewritten online. Peer follow-up. OFFLINE draft.');
  await apply.click();
  await expect(page.getByRole('status')).toContainText('Reviewed paragraph saved');
  await expect(active).toContainText('Rewritten online. Peer follow-up. OFFLINE draft.');
  await page.getByRole('button',{name:'Show saved offline draft'}).click();
  await expect(page.getByRole('status')).toContainText('Showing the writer’s saved draft');
  expect((await state(page)).archive).toEqual(offline);
  await capture(page,info,'paragraph-review-applied.png');
});

test('previews and restores native bold and italic formatting from the saved draft', async ({page},info) => {
  const offline = page.getByRole('textbox',{name:'Offline editor',exact:true});
  const active = page.getByRole('textbox',{name:'Active editor',exact:true});
  await offline.getByText('Alpha technical note.',{exact:true}).click();
  await page.keyboard.press('Home');
  for(let index=0;index<5;index+=1) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Control+b');
  await expect(offline.locator('strong')).toHaveText('Alpha');
  await page.keyboard.press('Home');
  for(let index=0;index<6;index+=1) await page.keyboard.press('ArrowRight');
  for(let index=0;index<9;index+=1) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Control+i');
  await expect(offline.locator('em')).toHaveText('technical');
  const draft = (await state(page)).offline;

  await page.getByRole('button',{name:'Switch to fresh room'}).click();
  await expect(page.getByRole('status')).toContainText('Fresh room installed');
  await page.getByRole('button',{name:'Retain old edits'}).click();
  await expect(page.getByRole('status')).toContainText('Old edits retained separately');
  await page.getByRole('button',{name:'Review opening paragraph'}).click();
  await expect(page.locator('#review-draft strong')).toHaveText('Alpha');
  await expect(page.locator('#review-draft em')).toHaveText('technical');
  await expect(page.locator('#review-current strong')).toHaveCount(0);
  await expect(page.getByLabel('Reviewed replacement')).toBeHidden();
  await capture(page,info,'formatted-paragraph-preview.png');
  await page.getByRole('button',{name:'Use saved paragraph and formatting'}).click();
  await expect(page.getByRole('status')).toContainText('Reviewed paragraph saved');
  await expect(active.locator('strong')).toHaveText('Alpha');
  await expect(active.locator('em')).toHaveText('technical');
  expect((await state(page)).server).toEqual(draft);
  await capture(page,info,'formatted-paragraph-applied.png');
});

test('combines both versions in a local formatted paragraph and retains the composition on stale review', async ({page},info) => {
  const offline = page.getByRole('textbox',{name:'Offline editor',exact:true});
  const active = page.getByRole('textbox',{name:'Active editor',exact:true});
  await offline.getByText('Alpha technical note.',{exact:true}).click();
  await page.keyboard.press('Home');
  for(let index=0;index<5;index+=1) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Control+i');
  await expect(offline.locator('em')).toHaveText('Alpha');
  await type(page,'Active editor',' Current decision.');
  await page.getByRole('button',{name:'Switch to fresh room'}).click();
  await expect(page.getByRole('status')).toContainText('Fresh room installed');
  await page.getByRole('button',{name:'Retain old edits'}).click();
  await expect(page.getByRole('status')).toContainText('Old edits retained separately');
  const review = page.getByRole('button',{name:'Review opening paragraph'});
  await review.click();
  await page.getByRole('button',{name:'Compose from saved draft'}).click();
  const composer = page.getByRole('textbox',{name:'Combined paragraph',exact:true});
  await expect(composer.locator('em')).toHaveText('Alpha');
  await page.keyboard.insertText(' Current decision.');
  for(let index=0;index<'Current decision.'.length;index+=1) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Control+b');
  await expect(composer.locator('strong')).toHaveText('Current decision.');
  await capture(page,info,'combined-composition.png');

  await type(page,'Active editor',' New context.');
  await page.getByRole('button',{name:'Save active edits'}).click();
  await expect(page.getByRole('status')).toContainText('durably saved');
  const apply = page.getByRole('button',{name:'Apply combined paragraph'});
  await apply.click();
  await expect(page.getByRole('status')).toContainText('review is stale');
  await review.click();
  await expect(page.locator('#review-current')).toContainText('New context.');
  await expect(composer.locator('strong')).toHaveText('Current decision.');
  await composer.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' New context.');
  await apply.click();
  await expect(page.getByRole('status')).toContainText('Reviewed paragraph saved');
  await expect(active.locator('em')).toHaveText('Alpha');
  await expect(active.locator('strong')).toContainText('Current decision.');
  await expect(active).toContainText('Current decision. New context.');
  expect((await state(page)).server).toEqual((await state(page)).active);
  await capture(page,info,'combined-applied.png');
});
