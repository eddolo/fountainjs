import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const errors=new WeakMap<object,string[]>(),state=(page:any)=>page.evaluate(()=>(window as any).audit.snapshot());
async function capture(page:any,info:any,name:string){await page.evaluate(()=>window.scrollTo(0,0));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const size=await page.evaluate(()=>({height:document.documentElement.scrollHeight,viewport:innerHeight,width:document.documentElement.scrollWidth,viewportWidth:innerWidth}));expect(size.height).toBeLessThanOrEqual(size.viewport);expect(size.width).toBeLessThanOrEqual(size.viewportWidth);await page.screenshot({path:info.outputPath(name),fullPage:false,scale:'css'})}
async function type(page:any,name:string,text:string){await page.getByRole('textbox',{name,exact:true}).click();await page.keyboard.press('Control+Home');await page.keyboard.press('End');await page.keyboard.type(text)}
async function sampleLayout(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const summary = { frames: 0, minViewport: innerWidth, minPane: Infinity, maxOverflow: 0, invalid: [] as unknown[] };
    (window as any).auditLayout = summary;
    function sample() {
      const widths = [...document.querySelectorAll('.panes>section')].map(element => element.getBoundingClientRect().width);
      const overflow = document.documentElement.scrollWidth - innerWidth;
      summary.frames++;
      summary.minViewport = Math.min(summary.minViewport, innerWidth);
      summary.minPane = Math.min(summary.minPane, ...widths);
      summary.maxOverflow = Math.max(summary.maxOverflow, overflow);
      if ((widths.some(width => width < 200) || overflow > 2) && summary.invalid.length < 20) {
        summary.invalid.push({ widths, viewport: innerWidth, overflow });
      }
      requestAnimationFrame(sample);
    }
    sample();
  });
}
async function reloadDraft(page: import('@playwright/test').Page) {
  await expect(page.locator('#draft-status')).toHaveText('Recovery copy saved on this device');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Local recovery copy reopened');
  await sampleLayout(page);
}
async function dropCommittedReply(page: import('@playwright/test').Page, action: string) {
  await page.route('**/__handoff/' + action, async route => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort();
  }, { times: 1 });
}
test.beforeEach(async({page},info)=>{const list:string[]=[];errors.set(page,list);page.on('pageerror',error=>list.push(error.message));await page.goto('/artifacts/yjs-namespace-fixture-20261107.html'+(info.tags.includes('@nested')?'?nested':''));await expect(page.getByRole('status')).toContainText('Ready');expect((await state(page)).protocol).toBe('legacy');await sampleLayout(page)});
test.afterEach(async({page},info)=>{const result=await state(page),layout=await page.evaluate(()=>(window as any).auditLayout);expect(errors.get(page)).toEqual([]);expect(layout.invalid).toEqual([]);expect(layout.frames).toBeGreaterThan(0);expect(result.protocol).toBe((info.title.startsWith('recovers')||info.title.startsWith('maps'))?'retained':'legacy');expect(result.activeProtocol).toBe(result.protocol);expect(result.activeNamespace).toBe(result.namespace);expect(result.namespace).toBe(result.protocol==='legacy'?'Research / α 😀':info.title.startsWith('maps')?'review-copy':'mapped-paper');await info.attach('cross-format-result',{body:JSON.stringify(result),contentType:'application/json'});await info.attach('layout-samples',{body:JSON.stringify(layout),contentType:'application/json'});await info.attach('runtime-modules',{body:JSON.stringify(await page.evaluate(()=>performance.getEntriesByType('resource').map((entry:any)=>new URL(entry.name).pathname).filter((path:string)=>path.endsWith('.js')||path.startsWith('/src/')))),contentType:'application/json'});await page.evaluate(()=>(window as any).audit.close())});

test('recovers the exact embedded offline draft after a lost save reply and reload', { tag: '@nested' }, async ({ page }, info) => {
  await type(page, 'Offline editor', ' SAVED OFFLINE');
  const original = (await state(page)).offline;
  await page.getByRole('button', { name: 'Migrate legacy room' }).click();
  await expect(page.getByRole('status')).toContainText('Legacy room migrated');
  const migrated = await state(page);
  await dropCommittedReply(page, 'save-exact-draft');
  const save = page.getByRole('button', { name: 'Save exact offline draft' });
  await save.click();
  await expect(page.getByRole('status')).toContainText('Request failed');
  await expect(save).toBeEnabled();
  await type(page, 'Offline editor', ' NEWER UNSAVED');
  await reloadDraft(page);
  await expect(page.getByRole('textbox', { name: 'Offline editor' })).toContainText('SAVED OFFLINE NEWER UNSAVED');
  await save.click();
  await expect(page.getByRole('status')).toContainText('Exact offline draft saved · newer offline edits still need saving');
  await page.getByRole('button', { name: 'Open saved offline draft' }).click();
  await expect(page.getByRole('status')).toContainText('Exact offline draft reopened');
  const reader = page.getByRole('textbox', { name: 'Archive reader' });
  await expect(reader).toHaveAttribute('contenteditable', 'false');
  await expect(reader).toContainText('SAVED OFFLINE');
  await expect(reader).not.toContainText('NEWER UNSAVED');
  const result = await state(page);
  expect(result.archive).toEqual(original);
  expect(result.server).toEqual(migrated.server);
  expect(result.revision).toBe(migrated.revision);
  await capture(page, info, 'exact-offline-draft-reopened.png');
});

test('migrates a legacy editor, retains offline edits, then rolls back while archiving retained edits',async({page},info)=>{
 const original=(await state(page)).active;await type(page,'Offline editor',' OLD pending');const offline=(await state(page)).offline;
 await page.getByRole('button',{name:'Migrate legacy room',exact:true}).click();await expect(page.getByRole('status')).toContainText('Legacy room migrated');let current=await state(page);expect(current.protocol).toBe('retained');expect(current.activeProtocol).toBe('retained');expect(current.archiveProtocol).toBe('legacy');expect(current.active).toEqual(original);expect(current.server).toEqual(original);expect(current.offline).toEqual(offline);
 await page.getByRole('button',{name:'Try old writer',exact:true}).click();await expect(page.getByRole('status')).toContainText('Old writer rejected');await page.getByRole('button',{name:'Retain offline edits',exact:true}).click();await expect(page.getByRole('status')).toContainText('Offline edits retained separately');expect((await state(page)).archive).toEqual(offline);
 await type(page,'Active editor',' NEW accepted');await page.getByRole('button',{name:'Save active edits',exact:true}).click();await expect(page.getByRole('status')).toContainText('durably saved');current=await state(page);const fresh=current.active;expect(current.server).toEqual(fresh);expect(current.archive).toEqual(offline);await capture(page,info,'branches.png');
 await page.getByRole('button',{name:'Rollback with archive',exact:true}).click();await expect(page.getByRole('status')).toContainText('Rollback committed to legacy');current=await state(page);expect(current.protocol).toBe('legacy');expect(current.archiveProtocol).toBe('retained');expect(current.active).toEqual(offline);expect(current.server).toEqual(offline);expect(current.archive).toEqual(fresh);await capture(page,info,'rollback.png');
 // A historical receipt must not replace a live editor's newer unsaved draft.
 await type(page,'Active editor',' UNSAVED after rollback');const draft=(await state(page)).active;await page.getByRole('button',{name:'Retry last migration',exact:true}).click();await expect(page.getByRole('status')).toContainText('Historical receipt');current=await state(page);expect(current.lastReplay).toEqual({replayed:true,current:false});expect(current.active).toEqual(draft);expect(current.server).toEqual(offline);expect(current.archive).toEqual(fresh);
 await page.getByRole('button',{name:'Save active edits',exact:true}).click();await expect(page.getByRole('status')).toContainText('durably saved');expect((await state(page)).server).toEqual(draft);const reader=page.getByRole('textbox',{name:'Archive reader',exact:true});await expect(reader).toHaveAttribute('contenteditable','false');await reader.click();await page.keyboard.type('MUST NOT EDIT');expect((await state(page)).archive).toEqual(fresh);expect(await page.locator('#active img').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);await capture(page,info,'final.png');
});

test('restores the frozen legacy original on explicit choice while retaining the replaced retained room',async({page},info)=>{
 const original=(await state(page)).active;await type(page,'Offline editor',' OLD branch');await page.getByRole('button',{name:'Migrate legacy room',exact:true}).click();await expect(page.getByRole('status')).toContainText('Legacy room migrated');await page.getByRole('button',{name:'Retain offline edits',exact:true}).click();await expect(page.getByRole('status')).toContainText('Offline edits retained');await type(page,'Active editor',' NEW branch');const fresh=(await state(page)).active;
 await page.getByLabel('Rollback source').selectOption('frozen-source');await page.getByRole('button',{name:'Rollback with archive',exact:true}).click();await expect(page.getByRole('status')).toContainText('Rollback committed to legacy');const current=await state(page);expect(current.active).toEqual(original);expect(current.server).toEqual(original);expect(current.archive).toEqual(fresh);expect(current.archiveProtocol).toBe('retained');expect(current.offline).not.toEqual(original);await capture(page,info,'final.png');
});

test('recovers a lost migration acknowledgement and archives typing made before reconnection',async({page},info)=>{
 const before=await state(page);await page.getByLabel('Drop migration acknowledgement (test only)').check();await page.getByRole('button',{name:'Migrate legacy room',exact:true}).click();await expect(page.getByRole('status')).toContainText('Request failed');const ambiguous=await state(page);expect(ambiguous.protocol).toBe('retained');expect(ambiguous.activeProtocol).toBe('legacy');expect(ambiguous.epoch).not.toBe(before.epoch);expect(ambiguous.server).toEqual(before.server);
 await type(page,'Active editor',' PENDING after lost ack');const pending=(await state(page)).active;expect(pending).not.toEqual(before.active);await capture(page,info,'lost-ack.png');
 const retry=page.getByRole('button',{name:'Retry last migration',exact:true});
 await dropCommittedReply(page,'save-exact-draft');
 await retry.click();
 await expect(page.getByRole('status')).toContainText('Request failed');
 await expect(retry).toBeEnabled();
 await expect(page.getByRole('textbox',{name:'Active editor'})).toContainText('PENDING after lost ack');
 await reloadDraft(page);
 await retry.click();await expect(page.getByRole('status')).toContainText('Durable migration receipt replayed');const after=await state(page);expect(after.epoch).toBe(ambiguous.epoch);expect(after.revision).toBe(ambiguous.revision);expect(after.lastReplay).toEqual({replayed:true,current:true});expect(after.archive).toEqual(pending);expect(after.archiveProtocol).toBe('legacy');expect(after.active).toEqual(before.active);
 await page.getByRole('button',{name:'Open outgoing editor draft'}).click();
 await expect(page.getByRole('status')).toContainText('Outgoing editor draft reopened');
 expect((await state(page)).archive).toEqual(pending);
 await type(page,'Active editor',' AFTER retry');await page.getByRole('button',{name:'Save active edits',exact:true}).click();await expect(page.getByRole('status')).toContainText('durably saved');const saved=await state(page);expect(saved.server).toEqual(saved.active);expect(saved.archive).toEqual(pending);const raw=await page.evaluate(async(id:string)=>{const batch=await (window as any).audit.batch(id,1);return {revision:batch.revision,sha256:batch.sha256,bytes:batch.update.length}},saved.archiveId);expect(raw.revision).toBe(1);expect(raw.sha256).toMatch(/^[a-f0-9]{64}$/);expect(raw.bytes).toBeGreaterThan(0);await info.attach('retired-raw-batch',{body:JSON.stringify(raw),contentType:'application/json'});await capture(page,info,'final.png');
});

test('recovers a lost offline archive acknowledgement after reloading without appending twice', async ({ page }, info) => {
  await page.getByRole('button', {name:'Migrate legacy room', exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Legacy room migrated');
  await type(page, 'Offline editor', ' SAVED OFFLINE');
  const before = await state(page);
  await expect(page.locator('#draft-status')).toHaveText('Recovery copy saved on this device');
  await dropCommittedReply(page, 'retain');
  const retain = page.getByRole('button', {name:'Retain offline edits', exact:true});
  await retain.click();
  await expect(page.getByRole('status')).toContainText('Request failed');
  const readBatch = (revision: number) => page.evaluate(({id, revision}) => (window as any).audit.batch(id, revision), {id:before.archiveId, revision});
  const migration = await readBatch(1);
  const first = await readBatch(migration.revision + 1);
  expect(first.sha256).not.toBe(migration.sha256);

  await reloadDraft(page);
  expect((await state(page)).offline).toEqual(before.offline);
  await type(page, 'Offline editor', ' NEWER DRAFT');
  const newer = (await state(page)).offline;
  await retain.click();
  await expect(page.getByRole('status')).toContainText('newer offline edits still need saving');
  await expect(page.locator('#report')).toContainText('Retired branch revision: ' + first.revision);
  const after = await state(page);
  expect(after.archive).toEqual(before.offline);
  expect(after.offline).toEqual(newer);
  expect(after.server).toEqual(before.server);
  expect(after.active).toEqual(before.active);
  expect(await readBatch(first.revision)).toEqual(first);
  const missing = await page.evaluate(async ({id, revision}) => {
    try { await (window as any).audit.batch(id, revision); return null; }
    catch (error) { return (error as Error).message; }
  }, {id:before.archiveId, revision:first.revision + 1});
  expect(missing).toContain('Missing or incompatible retired batch');
  await capture(page, info, 'retired-batch-recovered-once.png');

  await retain.click();
  await expect(page.locator('#report')).toContainText('Retired branch revision: ' + (first.revision + 1));
  expect((await state(page)).archive).toEqual(newer);
  expect((await state(page)).server).toEqual(before.server);
  expect((await readBatch(first.revision + 1)).sha256).not.toBe(first.sha256);
  await capture(page, info, 'newer-offline-draft-saved.png');
});

async function holdAdmission(page: import('@playwright/test').Page) {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/__handoff/admit', async route => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  }, { times: 1 });
  return { release, request: page.waitForRequest('**/__handoff/admit') };
}

test('recovers edits made while the replacement room admission reply is in flight', async ({ page }, info) => {
  const before = await state(page);
  const admission = await holdAdmission(page);

  try {
    await page.getByRole('button', { name: 'Migrate legacy room', exact: true }).click();
    await admission.request;
    await type(page, 'Active editor', ' TYPED during admission');
    const pending = (await state(page)).active;
    expect(pending).not.toEqual(before.active);
    admission.release();

    await expect(page.getByRole('status')).toContainText('Source editor changed during reconnection');
    const waiting = await state(page);
    expect(waiting.activeProtocol).toBe('legacy');
    expect(waiting.active).toEqual(pending);
    expect(waiting.protocol).toBe('retained');
    expect(waiting.server).toEqual(before.server);
    await capture(page, info, 'source-still-editable.png');

    await page.getByRole('button', { name: 'Retry last migration', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Durable migration receipt replayed');
    const reopened = await state(page);
    expect(reopened.active).toEqual(before.server);
    expect(reopened.server).toEqual(before.server);
    expect(reopened.archive).toEqual(pending);
    expect(reopened.archiveProtocol).toBe('legacy');
    expect(reopened.epoch).toBe(waiting.epoch);
    await capture(page, info, 'archive-after-retry.png');
  } finally { admission.release(); }
});

test('recovers from an admission reply for a different epoch without swapping editors', async ({ page }, info) => {
  const before = await state(page);
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const status = page.getByRole('status');
  await page.route('**/__handoff/admit', async route => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const reply = await response.json();
    reply.value.epoch = before.epoch;
    await route.fulfill({ response, json: reply });
  }, { times: 1 });

  await button('Migrate legacy room').click();
  await expect(status).toContainText('Room admission reply does not match');
  const waiting = await state(page);
  expect(waiting.protocol).toBe('retained');
  expect(waiting.activeProtocol).toBe('legacy');
  expect(waiting.active).toEqual(before.active);
  await type(page, 'Active editor', ' Preserved after refusal');
  const pending = (await state(page)).active;
  await capture(page, info, 'foreign-epoch-refused.png');

  await button('Retry last migration').click();
  await expect(status).toContainText('Durable migration receipt replayed');
  const restored = await state(page);
  expect(restored.epoch).toBe(waiting.epoch);
  expect(restored.active).toEqual(before.server);
  expect(restored.archive).toEqual(pending);
  await capture(page, info, 'verified-room-reopened.png');
});

test('keeps a deletion made during rollback admission and archives it on retry', async ({ page }, info) => {
  const before = await state(page);
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const status = page.getByRole('status');
  await button('Migrate legacy room').click();
  await expect(status).toContainText('Legacy room migrated');
  await type(page, 'Active editor', ' Retained draft!');
  const admission = await holdAdmission(page);

  try {
    await button('Rollback with archive').click();
    await admission.request;
    await page.getByRole('textbox', { name: 'Active editor', exact: true }).click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    const pending = (await state(page)).active;
    expect(pending.content[0].content[0].text).toBe('Alpha technical note. Retained draft');
    admission.release();

    await expect(status).toContainText('Source editor changed during reconnection');
    const waiting = await state(page);
    expect(waiting.activeProtocol).toBe('retained');
    expect(waiting.active).toEqual(pending);
    expect(waiting.protocol).toBe('legacy');
    expect(waiting.server).toEqual(before.server);

    await button('Retry last rollback').click();
    await expect(status).toContainText('Rollback committed to legacy');
    const reopened = await state(page);
    expect(reopened.active).toEqual(before.server);
    expect(reopened.server).toEqual(before.server);
    expect(reopened.archive).toEqual(pending);
    expect(reopened.archiveProtocol).toBe('retained');
    expect(reopened.epoch).toBe(waiting.epoch);
    await capture(page, info, 'rollback-archive-after-retry.png');
  } finally { admission.release(); }
});

test('recovers an embedded legacy draft and a committed migration after reload', { tag: '@nested' }, async ({ page }, info) => {
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const status = page.getByRole('status');
  const original = await state(page);
  await page.getByLabel('Drop migration acknowledgement (test only)').check();
  await button('Migrate legacy room').click();
  await expect(status).toContainText('Request failed');
  await type(page, 'Active editor', ' Draft after migration');
  await type(page, 'Offline editor', ' Offline author note');
  const pending = await state(page);
  expect(pending.protocol).toBe('retained');
  expect(pending.activeProtocol).toBe('legacy');

  await page.route('**/__handoff/snapshot', route => route.abort(), { times: 1 });
  await reloadDraft(page);
  await expect(status).toContainText('room unavailable');
  const recovered = await state(page);
  expect(recovered.active).toEqual(pending.active);
  expect(recovered.activeNested).toBe(true);
  expect(recovered.offline).toEqual(pending.offline);
  expect(recovered.archiveId).toBe(pending.archiveId);
  expect(recovered.epoch).toBe(pending.epoch);
  expect(recovered.server).toEqual(original.server);
  await capture(page, info, 'restored-draft.png');

  await button('Retry last migration').click();
  await expect(status).toContainText('Durable migration receipt replayed');
  const connected = await state(page);
  expect(connected.active).toEqual(original.server);
  expect(connected.archive).toEqual(pending.active);
  expect(connected.epoch).toBe(pending.epoch);
  expect(connected.revision).toBe(pending.revision);
  await capture(page, info, 'migrated-after-reload.png');
});

test('recovers the same frozen source after reload when the freeze reply was lost', async ({ page }) => {
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const status = page.getByRole('status');
  const original = await state(page);
  await dropCommittedReply(page, 'freeze');
  await button('Migrate legacy room').click();
  await expect(status).toContainText('Request failed');
  await type(page, 'Active editor', ' Draft while frozen');
  const frozen = await state(page);
  expect(frozen.phase).toBe('frozen');
  expect(frozen.epoch).toBe(original.epoch);

  await reloadDraft(page);
  expect((await state(page)).active).toEqual(frozen.active);
  await button('Retry last migration').click();
  await expect(status).toContainText('Legacy room migrated');
  const connected = await state(page);
  expect(connected.archive).toEqual(frozen.active);
  expect(connected.archiveId).toBe(frozen.archiveId);
  expect(connected.server).toEqual(original.server);
  expect(connected.revision).toBe(frozen.revision + 1);
});

test('recovers from local storage failure before letting migration freeze a room', async ({ page }) => {
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const status = page.getByRole('status');
  const draftStatus = page.locator('#draft-status');
  let freezes = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/__handoff/freeze') freezes++;
  });
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = () => { throw new DOMException('Test storage unavailable', 'QuotaExceededError'); };
    (window as any).restoreDraftStorage = () => { IDBObjectStore.prototype.put = put; };
  });

  await button('Migrate legacy room').click();
  await expect(status).toContainText('Request failed');
  await expect(draftStatus).toContainText('Test storage unavailable');
  const pending = await state(page);
  expect(pending.phase).toBe('active');
  await button('Retry last migration').click();
  await expect(button('Retry last migration')).toBeEnabled();
  await expect(status).toContainText('Request failed');
  expect(freezes).toBe(0);

  await page.evaluate(() => (window as any).restoreDraftStorage());
  await button('Retry last migration').click();
  await expect(status).toContainText('Legacy room migrated');
  expect(freezes).toBe(1);
  const connected = await state(page);
  expect(connected.archiveId).toBe(pending.archiveId);
  expect(connected.server).toEqual(pending.server);
});

test('keeps a retained draft across reload after a committed rollback loses its reply', async ({ page }, info) => {
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const status = page.getByRole('status');
  const original = await state(page);
  await button('Migrate legacy room').click();
  await expect(status).toContainText('Legacy room migrated');
  await dropCommittedReply(page, 'rollback');
  await button('Rollback with archive').click();
  await expect(status).toContainText('Request failed');
  await type(page, 'Active editor', ' Draft after rollback');
  const pending = await state(page);
  expect(pending.protocol).toBe('legacy');
  expect(pending.activeProtocol).toBe('retained');

  await reloadDraft(page);
  const recovered = await state(page);
  expect(recovered.active).toEqual(pending.active);
  expect(recovered.activeProtocol).toBe('retained');
  expect(recovered.server).toEqual(original.server);
  await button('Retry last rollback').click();
  await expect(status).toContainText('Rollback committed to legacy');
  const connected = await state(page);
  expect(connected.active).toEqual(original.server);
  expect(connected.archive).toEqual(pending.active);
  expect(connected.epoch).toBe(pending.epoch);
  expect(connected.revision).toBe(pending.revision);
  await capture(page, info, 'rolled-back-after-reload.png');
});

test('recovers a saved legacy paragraph into the migrated room after explicit review', async ({ page }, info) => {
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const status = page.getByRole('status');
  await type(page, 'Offline editor', ' Offline note.');
  await button('Migrate legacy room').click();
  await expect(status).toContainText('Legacy room migrated');
  await button('Save exact offline draft').click();
  await expect(status).toContainText('Exact offline draft saved');
  await button('Review saved paragraph').click();
  await expect(page.locator('#review-live')).toHaveText('Alpha technical note.');
  await expect(page.locator('#review-saved')).toHaveText('Alpha technical note. Offline note.');
  const replacement = page.getByLabel('Text to apply');
  await replacement.fill('Alpha technical note. Recovered offline note.');
  await type(page, 'Active editor', ' Peer note.');
  await button('Apply reviewed paragraph').click();
  await expect(status).toContainText('Save active edits before applying');
  await button('Save active edits').click();
  await expect(status).toContainText('durably saved');
  await button('Apply reviewed paragraph').click();
  await expect(status).toContainText('The review is stale');
  await button('Review saved paragraph').click();
  await expect(page.locator('#review-live')).toHaveText('Alpha technical note. Peer note.');
  await expect(replacement).toHaveValue('Alpha technical note. Recovered offline note.');
  await replacement.fill('Alpha technical note. Peer note. Recovered offline note.');
  await page.locator('#draft-review').screenshot({ path: info.outputPath('reviewed-paragraph.png') });
  const before = await state(page);
  await button('Apply reviewed paragraph').click();
  await expect(status).toContainText('Reviewed paragraph saved');
  await expect(page.getByRole('textbox', { name: 'Active editor' })).toContainText('Alpha technical note. Peer note. Recovered offline note.');
  const after = await state(page);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.active).toEqual(after.server);
  expect(after.server.content.slice(1)).toEqual(before.server.content.slice(1));
  await button('Open saved offline draft').click();
  await expect(page.getByRole('textbox', { name: 'Archive reader' })).toContainText('Alpha technical note. Offline note.');
  await capture(page, info, 'recovered-paragraph-and-archive.png');
});

test('recovers a saved legacy paragraph selected from multiple changes', async ({ page }, info) => {
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const status = page.getByRole('status');
  await type(page, 'Offline editor', ' First offline edit.');
  const second = page.getByRole('textbox', { name: 'Offline editor' }).locator('blockquote p');
  await second.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Second offline edit.');
  await expect(second).toHaveText('Keep every accepted edit recoverable. Second offline edit.');
  await button('Migrate legacy room').click();
  await expect(status).toContainText('Legacy room migrated');
  await button('Save exact offline draft').click();
  await expect(status).toContainText('Exact offline draft saved');
  await button('Review saved paragraph').click();
  const paragraphs = page.getByLabel('Changed paragraph');
  await expect(paragraphs.locator('option')).toHaveCount(2);
  await paragraphs.selectOption({ label: 'Keep every accepted edit recoverable. Second offline edit.' });
  await expect(page.locator('#review-live')).toHaveText('Keep every accepted edit recoverable.');
  await expect(page.locator('#review-saved')).toHaveText('Keep every accepted edit recoverable. Second offline edit.');
  await page.locator('#draft-review').screenshot({ path: info.outputPath('select-changed-paragraph.png') });
  const before = await state(page);
  await button('Apply reviewed paragraph').click();
  await expect(status).toContainText('Reviewed paragraph saved');
  const active = page.getByRole('textbox', { name: 'Active editor' });
  await expect(active.locator('blockquote p')).toHaveText('Keep every accepted edit recoverable. Second offline edit.');
  await expect(active.locator('p').first()).toHaveText('Alpha technical note.');
  const after = await state(page);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.active).toEqual(after.server);
  await capture(page, info, 'second-paragraph-recovered.png');
});

test('recovers a saved legacy paragraph after the apply reply is lost and the tab reloads', async ({ page }, info) => {
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const status = page.getByRole('status');
  const active = page.locator('#active .fountain-editor');
  await type(page, 'Offline editor', ' Offline note.');
  await button('Migrate legacy room').click();
  await expect(status).toContainText('Legacy room migrated');
  await type(page, 'Active editor', ' Active note.');
  await button('Save active edits').click();
  await expect(status).toContainText('durably saved');
  await button('Save exact offline draft').click();
  await expect(status).toContainText('Exact offline draft saved');
  await button('Review saved paragraph').click();
  await page.getByLabel('Text to apply').fill('Alpha technical note. Active note. Recovered after lost reply.');
  const before = await state(page);
  await dropCommittedReply(page, 'apply-recovered-text');
  await button('Apply reviewed paragraph').click();
  await expect(status).toContainText('review still awaiting confirmation');
  await expect(active).toHaveAttribute('contenteditable', 'false');
  const lost = await state(page);
  expect(lost.server.content[0].content[0].text).toBe('Alpha technical note. Active note. Recovered after lost reply.');
  expect(lost.revision).toBe(before.revision + 1);
  const surface = await page.locator('#active .fountain-editor').boundingBox();
  await page.mouse.click(surface!.x + 50, surface!.y + 35);
  await page.keyboard.press('Control+z');
  expect((await state(page)).active).toEqual(lost.active);
  await reloadDraft(page);
  await expect(status).toContainText('retry the saved paragraph review');
  await expect(active).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('#pending-review-text')).toBeVisible();
  await expect(page.locator('#pending-review-text')).toHaveText('Alpha technical note. Active note. Recovered after lost reply.');
  await capture(page, info, 'review-awaiting-confirmation.png');
  await button('Retry saved paragraph review').click();
  await expect(status).toContainText('Reviewed paragraph saved');
  await expect(active).toHaveAttribute('contenteditable', 'true');
  await expect(active).toContainText('Alpha technical note. Active note. Recovered after lost reply.');
  const recovered = await state(page);
  expect(recovered.revision).toBe(lost.revision);
  expect(recovered.active).toEqual(lost.server);
  expect(recovered.server).toEqual(lost.server);
  await expect(button('Retry saved paragraph review')).toBeHidden();
  await capture(page, info, 'review-confirmed-after-reload.png');
});

test('recovers a saved legacy paragraph proposal after a rejected reply and repeated reloads', async ({ page }, info) => {
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const status = page.getByRole('status');
  await type(page, 'Offline editor', ' Offline note.');
  await button('Migrate legacy room').click();
  await expect(status).toContainText('Legacy room migrated');
  await button('Save exact offline draft').click();
  await expect(status).toContainText('Exact offline draft saved');
  await button('Review saved paragraph').click();
  const proposal = 'An author-composed recovery proposal.';
  await page.getByLabel('Text to apply').fill(proposal);
  await type(page, 'Active editor', ' Peer note.');
  await button('Save active edits').click();
  await expect(status).toContainText('durably saved');
  const before = await state(page);
  await page.route('**/__handoff/apply-recovered-text', async route => {
    const response = await route.fetch();
    expect((await response.json()).code).toBe('revision-conflict');
    await route.abort();
  }, { times: 1 });
  await button('Apply reviewed paragraph').click();
  await expect(status).toContainText('review still awaiting confirmation');
  await reloadDraft(page);
  await button('Retry saved paragraph review').click();
  await expect(status).toContainText('The review is stale');
  await expect(page.locator('#pending-review-text')).toHaveText(proposal);
  await expect(page.getByRole('textbox', { name: 'Active editor' })).toHaveAttribute('contenteditable', 'true');
  await expect(button('Retry saved paragraph review')).toBeHidden();
  await reloadDraft(page);
  await expect(page.locator('#pending-review-text')).toHaveText(proposal);
  await expect(page.locator('#pending-review-title')).toHaveText('Saved paragraph proposal');
  await button('Review saved paragraph').click();
  await expect(page.locator('#review-live')).toHaveText('Alpha technical note. Peer note.');
  await expect(page.getByLabel('Text to apply')).toHaveValue(proposal);
  await capture(page, info, 'stale-proposal-preserved.png');
  await page.getByLabel('Text to apply').fill('Alpha technical note. Peer note. Recovered offline note.');
  await button('Apply reviewed paragraph').click();
  await expect(status).toContainText('Reviewed paragraph saved');
  await expect(page.locator('#pending-review')).toBeHidden();
  const after = await state(page);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.active).toEqual(after.server);
  expect(after.server.content[0].content[0].text).toBe('Alpha technical note. Peer note. Recovered offline note.');
});

test('maps an explicit author-selected destination and refuses invalid input before freezing',async({page},info)=>{
 const before=await state(page);await page.getByLabel('Retained destination namespace',{exact:true}).fill('bad space');await page.getByRole('button',{name:'Migrate legacy room',exact:true}).click();await expect(page.getByRole('status')).toContainText('Invalid explicit destination');const refused=await state(page);expect(refused.epoch).toBe(before.epoch);expect(refused.revision).toBe(before.revision);expect(refused.phase).toBe('active');expect(refused.server).toEqual(before.server);
 await page.getByLabel('Retained destination namespace',{exact:true}).fill('review-copy');await page.getByRole('button',{name:'Migrate legacy room',exact:true}).click();await expect(page.getByRole('status')).toContainText('Legacy room migrated');const moved=await state(page);expect(moved.namespace).toBe('review-copy');expect(moved.activeNamespace).toBe('review-copy');expect(moved.archiveNamespace).toBe('Research / α 😀');expect(moved.active).toEqual(before.active);
 await type(page,'Active editor',' MAPPED edit');await page.getByRole('button',{name:'Save active edits',exact:true}).click();await expect(page.getByRole('status')).toContainText('durably saved');const saved=await state(page);expect(saved.active).toEqual(saved.server);await capture(page,info,'final.png');
});

test('maps an embedded room after rehearsing it and refuses a conflicting destination without freezing', { tag: '@nested' }, async ({ page }, info) => {
  const initial = await state(page);
  const destination = page.getByLabel('Retained destination namespace', { exact: true });
  const status = page.getByRole('status');
  const preflight = page.getByRole('button', { name: 'Check saved migration' });
  const migrate = page.getByRole('button', { name: 'Migrate legacy room', exact: true });
  let freezes = 0;
  await page.route('**/__handoff/freeze', route => { freezes++; return route.continue(); });

  await destination.fill('research-folder');
  await preflight.click();
  await expect(status).toContainText('reserved or duplicate legacy migration root: research-folder');
  expect(await state(page)).toEqual(initial);
  await migrate.click();
  await expect(status).toContainText('reserved or duplicate legacy migration root: research-folder');
  expect(freezes).toBe(0);
  expect(await state(page)).toMatchObject({ phase: 'active', epoch: initial.epoch, protocol: 'legacy', archive: initial.archive });

  await type(page, 'Active editor', ' Rehearsed before migration.');
  await page.getByRole('button', { name: 'Save active edits' }).click();
  await expect(status).toContainText('Active edits durably saved');
  const saved = await state(page);
  await destination.fill('review-copy');
  await preflight.click();
  await expect(status).toContainText('legacy room stays open for editing');
  await expect(page.locator('#report')).toContainText('auxiliary roots: research-folder');
  await expect(page.locator('#report')).toContainText('Research / α 😀 → review-copy');
  expect(await state(page)).toEqual(saved);
  expect(freezes).toBe(0);
  await capture(page, info, 'migration-check.png');

  await migrate.click();
  await expect(status).toContainText('Legacy room migrated');
  expect(freezes).toBe(1);
  expect(await state(page)).toMatchObject({ phase: 'active', protocol: 'retained', namespace: 'review-copy', server: saved.server, active: saved.active });
  await capture(page, info, 'migrated-after-check.png');
});

test('moves a nested research document and rolls back to the same embedded fragment', {tag:'@nested'}, async ({page},info) => {
  const original = await state(page);
  expect(original.activeNested).toBe(true);
  await page.getByRole('button',{name:'Try retained-only join'}).click();
  await expect(page.getByRole('status')).toContainText('does not support the existing room format');
  expect((await state(page)).server).toEqual(original.server);
  await capture(page,info,'legacy-format-refusal.png');
  let admissionRequests = 0;
  const countAdmission = (request: import('@playwright/test').Request) => {
    if (new URL(request.url()).pathname === '/__handoff/admit') admissionRequests++;
  };
  page.on('request', countAdmission);
  await page.route('**/__handoff/join', async route => {
    expect(route.request().postDataJSON()).toEqual({ protocols: ['retained'] });
    const response = await route.fetch({ postData: { protocols: ['legacy', 'retained'] } });
    expect(response.ok()).toBe(true);
    await route.fulfill({ response });
  }, { times: 1 });
  await page.getByRole('button',{name:'Try retained-only join'}).click();
  await expect(page.getByRole('status')).toContainText('Room opening offer does not match');
  expect(admissionRequests).toBe(0);
  expect((await state(page)).active).toEqual(original.active);
  page.off('request', countAdmission);
  await capture(page,info,'unsupported-room-offer.png');
  expect(original.folderTitle).toBe('Physics review');
  expect(original.nestedFragment).toMatchObject({client:expect.any(Number),clock:expect.any(Number)});
  await type(page,'Offline editor',' OFFLINE draft');
  const offline = (await state(page)).offline;
  await page.getByRole('button',{name:'Migrate legacy room'}).click();
  await expect(page.getByRole('status')).toContainText('Legacy room migrated');
  const moved = await state(page);
  expect(moved.active).toEqual(original.active);
  expect(moved.activeNested).toBe(false);
  expect(moved.folderTitle).toBe(original.folderTitle);
  expect(moved.folderRoom).toBe('mapped-paper');
  const admission = page.waitForResponse(response => new URL(response.url()).pathname === '/__handoff/admit');
  await page.getByRole('button',{name:'Try retained-only join'}).click();
  await expect(page.getByRole('status')).toContainText('Retained-only client can join this room');
  expect((await admission).ok()).toBe(true);
  await page.getByRole('button',{name:'Retain offline edits'}).click();
  await expect(page.getByRole('status')).toContainText('Offline edits retained separately');
  await expect(page.getByRole('textbox',{name:'Archive reader'})).toContainText('OFFLINE draft');
  await capture(page,info,'nested-moved.png');
  await type(page,'Active editor',' RETAINED edit');
  await page.getByRole('button',{name:'Save active edits'}).click();
  await expect(page.getByRole('status')).toContainText('durably saved');
  await page.getByRole('button',{name:'Rollback with archive'}).click();
  await expect(page.getByRole('status')).toContainText('Rollback committed to legacy');
  const restored = await state(page);
  expect(restored.activeNested).toBe(true);
  expect(restored.nestedFragment).toEqual(original.nestedFragment);
  expect(restored.folderTitle).toBe(original.folderTitle);
  expect(restored.server).toEqual(offline);
  await expect(page.getByRole('textbox',{name:'Archive reader'})).toContainText('RETAINED edit');
  await type(page,'Active editor',' AFTER rollback');
  await page.getByRole('button',{name:'Save active edits'}).click();
  await expect(page.getByRole('status')).toContainText('durably saved');
  expect((await state(page)).nestedFragment).toEqual(original.nestedFragment);
  await capture(page,info,'nested-rollback.png');
});

for (const [protocol, failure, title] of [
  ['legacy', 'root', 'keeps the draft when the admitted embedded legacy fragment is detached'],
  ['retained', 'root', 'recovers a local draft when the admitted retained root disappears'],
  ['legacy', 'update', 'keeps the local legacy draft after an invalid update and peer repair'],
  ['retained', 'update', 'recovers the local retained draft after an invalid update and peer repair'],
] as const) {
  test(title, {tag:'@nested'}, async ({page}, info) => {
    const status = page.getByRole('status');
    if (protocol === 'retained') {
      await page.getByRole('button', {name:'Migrate legacy room'}).click();
      await expect(status).toContainText('Legacy room migrated');
    }
    const before = await state(page);
    const editor = page.getByRole('textbox', {name:'Active editor', exact:true});
    await type(page, 'Active editor', ' LOCAL draft');
    await expect(editor).toContainText('LOCAL draft');
    const rejected = await page.evaluate(kind => {
      const audit = (window as any).audit;
      return kind === 'root' ? audit.dropAdmittedRoot() : audit.receiveMalformedUpdate();
    }, failure);
    expect(rejected).toBe('error');
    await expect(status).toContainText('Preserve the local draft');
    const receivedWire = await page.evaluate(() => (window as any).audit.localRoomWire());
    await type(page, 'Active editor', ' STILL local');
    await expect(editor).toContainText('LOCAL draft STILL local');
    expect(await page.evaluate(() => (window as any).audit.localRoomWire())).toBe(receivedWire);
    if (failure === 'update') {
      expect(await page.evaluate(() => (window as any).audit.receiveRepairedUpdate())).toBe('error');
      expect(await page.evaluate(() => (window as any).audit.localRoomWire())).not.toBe(receivedWire);
      await expect(editor).toContainText('LOCAL draft STILL local');
    }
    const after = await state(page);
    expect(after.revision).toBe(before.revision);
    expect(after.server).toEqual(before.server);
    await expect(page.getByRole('button', {name:'Save active edits'})).toBeDisabled();
    const pendingDownload = page.waitForEvent('download');
    await page.getByRole('button', {name:'Download local draft'}).click();
    const download = await pendingDownload;
    expect(download.suggestedFilename()).toBe('recovered-draft.fountain.json');
    const destination = info.outputPath(download.suggestedFilename());
    await download.saveAs(destination);
    expect(JSON.parse(await readFile(destination, 'utf8'))).toEqual(after.active);
    await capture(page, info, failure === 'root' ? 'admitted-root-draft.png' : 'malformed-update-draft.png');
  });
}
