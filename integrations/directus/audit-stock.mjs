import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';

import { auditQuote } from './audit-quote.mjs';
import { auditStructure } from './audit-structure.mjs';
import { auditToolbar } from './audit-toolbar.mjs';

const pin = {
  version: '12.7.0',
  revision: '3e3bdddd20bc5f80200452d2b1aad4e3029c95e4',
  image: 'directus/directus@sha256:f197911d949a37d882f781b0381955b851c86625435014cd67bdaf3eabcff2a7',
};
const source = '<h2>Publication brief</h2><p>Owner: <strong>Research</strong>.</p><p>Ready for review.</p>';
const expected = source.replace('Ready for review.', 'Ready for review. Approved.');
const id = randomUUID();
const structureOnly = process.argv.includes('--structure');
const quoteOnly = process.argv.includes('--quote');
const paired = quoteOnly || structureOnly || process.argv.includes('--paired');
const extension = fileURLToPath(new URL('../../artifacts/directus-extension/', import.meta.url));
const candidate = paired ? JSON.parse(await readFile(join(extension,'identity.json'),'utf8')) : null;
const out = fileURLToPath(new URL('../../artifacts/directus-'+(paired?'handover':'stock')+'/' + id + '/', import.meta.url));
const credentials = { email: 'fountain-audit@example.org', password: randomBytes(30).toString('base64url') };
const env = { ...process.env, ADMIN_EMAIL: credentials.email, ADMIN_PASSWORD: credentials.password, SECRET: randomBytes(48).toString('hex') };
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', env, timeout: 120000 }).trim();
const report = { passed: false, ...pin, source, expected };
await mkdir(out, { recursive: true });
let container, browser, activePage;
try {
  container = docker('run', '--detach', '--rm', '--name', 'fountain-directus-' + id,
    '--publish', '127.0.0.1::8055', '-e', 'SECRET', '-e', 'ADMIN_EMAIL', '-e', 'ADMIN_PASSWORD',
    '-e', 'TELEMETRY=false', '-e', 'DB_CLIENT=sqlite3', '-e', 'DB_FILENAME=/directus/database/audit.sqlite',
    ...(paired ? ['--mount','type=bind,src='+extension+',dst=/directus/extensions/directus-extension-fountain-html,readonly'] : []), pin.image);
  function publishedOrigin() {
    const port = docker('port', container, '8055/tcp').match(/^127\.0\.0\.1:(\d+)$/u);
    assert.ok(port);
    return 'http://127.0.0.1:' + port[1];
  }
  let origin = publishedOrigin();
  const ready = async () => {
    for (let i = 0; i < 120; i++) {
      if (await fetch(origin + '/server/ping').then(async r => r.ok && await r.text() === 'pong').catch(() => false)) return;
      await delay(1000);
    }
    throw new Error('The local Directus API did not become ready.');
  };
  await ready();
  const metadata = JSON.parse(docker('inspect', container))[0];
  assert.equal(metadata.Config.Image, pin.image);
  report.imageId = metadata.Image;
  const login = async () => {
    const res = await fetch(origin + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) });
    assert.equal(res.status, 200);
    return (await res.json()).data.access_token;
  };
  let token = await login();
  const api = async (path, options = {}) => {
    const res = await fetch(origin + path, { ...options, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' } });
    assert.ok(res.ok, path + ' returned ' + res.status);
    return (await res.json()).data;
  };
  const collection = 'publication_briefs';
  await api('/collections', { method: 'POST', body: JSON.stringify({ collection, schema: {}, meta: {},
    fields: [{field:'body',type:'text',schema:{},meta:{interface:'input-rich-text-html'}}] }) });
  const item = await api('/items/' + collection, { method: 'POST', body: JSON.stringify({body: source}) });
  const itemPath = '/items/' + collection + '/' + item.id;
  const itemRoute = '/admin/content/' + collection + '/' + item.id;
  const field = await api('/fields/' + collection + '/body');
  assert.equal(field.meta.interface, 'input-rich-text-html');
  assert.equal(field.type, 'text');
  report.fieldInterface = field.meta.interface;
  browser = await chromium.launch({headless:true});
  report.browser = browser.version();
  async function openItem(side = 'stock', route = itemRoute) {
    const context = await browser.newContext({viewport:{width:1280,height:900}});
    const page = await context.newPage();
    activePage = page;
    report.stage = 'sign in to Data Studio';
    await page.goto(origin + '/admin/login');
    await page.locator('input[type=email]').fill(credentials.email);
    await page.locator('input[type=password]').fill(credentials.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL(u => !u.pathname.includes('login'));
    for (const name of ['Remind Later','Skip']) {
      const action = page.getByRole('button',{name,exact:true});
      await page.addLocatorHandler(action,()=>action.click());
    }
    report.stage = 'open item form';
    await page.goto(origin + route);
    const editor = page.locator(side==='stock' ? '.tiptap.ProseMirror[contenteditable=true]' : '.fountain-editor[contenteditable=true]');
    if (side==='fountain') {
      await expect(editor).toHaveAttribute('data-fountain-directus-build',candidate.buildId,{timeout:30000});
      return {context,page,editor};
    }
    await expect(editor).toBeVisible({timeout:30000});
    report.stage = 'identify loaded editor';
    const asset = await page.evaluate(() => performance.getEntriesByType('resource').map(e=>e.name)
      .find(name=>new URL(name).pathname.match(/\/input-rich-text-html[-.][^/]*\.js$/)));
    assert.ok(asset, 'Expected a loaded Directus rich HTML field chunk');
    assert.equal(new URL(asset).origin, origin);
    const chunk = await page.request.get(asset);
    assert.equal(chunk.status(),200);
    const identity = { path:new URL(asset).pathname, sha256:createHash('sha256').update(await chunk.body()).digest('hex') };
    if(report.editorChunk) assert.deepEqual(identity,report.editorChunk);
    report.editorChunk = identity;
    return {context,page,editor};
  }
  async function measureContent(editor) {
    return editor.evaluate(root => {
      const heading = root.querySelector('h2');
      const [first, second] = root.querySelectorAll('p');
      const bounds = element => element.getBoundingClientRect();
      const style = element => getComputedStyle(element);
      return {
        headingSize: style(heading).fontSize,
        headingWeight: style(heading).fontWeight,
        bodySize: style(first).fontSize,
        bodyWeight: style(first).fontWeight,
        strongWeight: style(first.querySelector('strong')).fontWeight,
        headingInset: bounds(heading).top - bounds(root).top,
        textInset: bounds(first).left - bounds(root).left,
        afterHeading: bounds(first).top - bounds(heading).bottom,
        betweenParagraphs: bounds(second).top - bounds(first).bottom,
      };
    });
  }
  async function checkOptionalField(side) {
    report.stage = side + ' optional HTML field';
    const record = await api('/items/' + collection, { method: 'POST', body: JSON.stringify({ body: null }) });
    const resource = '/items/' + collection + '/' + record.id;
    const route = '/admin/content/' + collection + '/' + record.id;
    const draft = await openItem(side, route);
    report.stage = side + ' optional field: enter two paragraphs';
    await draft.editor.click();
    await draft.page.keyboard.insertText('First paragraph.');
    await draft.page.keyboard.press('Enter');
    await draft.page.keyboard.press('Enter');
    await draft.page.keyboard.insertText('After a blank line.');
    const html = '<p>First paragraph.</p><p></p><p>After a blank line.</p>';
    await expect(draft.editor.locator('p')).toHaveCount(3);
    await draft.page.keyboard.press('Control+s');
    await expect.poll(async () => (await api(resource)).body).toBe(html);
    await draft.context.close();

    const saved = await openItem(side, route);
    await expect(saved.editor.locator('p')).toHaveCount(3);
    report.stage = side + ' optional field: clear the saved record';
    await saved.editor.locator('p').last().click();
    await saved.page.keyboard.press('Control+a');
    await saved.page.keyboard.press('Backspace');
    await saved.page.keyboard.press('Control+s');
    await expect.poll(async () => (await api(resource)).body).toBe(null);
    await saved.context.close();
    const empty = await openItem(side, route);
    report.stage = side + ' optional field: preserve a zero-width character';
    await empty.editor.click();
    await empty.page.keyboard.insertText('\u200b');
    await empty.page.keyboard.press('Control+s');
    const invisibleHTML = '<p>\u200b</p>';
    await expect.poll(async () => (await api(resource)).body).toBe(invisibleHTML);
    await empty.context.close();
    return { itemId: record.id, savedHTML: html, clearedValue: null, invisibleHTML };

  }
  if (paired) {
    const installedHash = docker('exec',container,'sha256sum','/directus/extensions/directus-extension-fountain-html/index.js').split(' ')[0];
    assert.equal(installedHash,candidate.bundleSHA256);
    report.fountain = candidate;
  }
  async function selectInterface(name, options = null) {
    const updated = await api('/fields/'+collection+'/body',{
      method:'PATCH',body:JSON.stringify({meta:{interface:name, options}}),
    });
    assert.equal(updated.meta.interface,name);
  }
  async function checkQuotes() {
    report.quotes = {};
    for (const side of ['stock', 'fountain']) {
      report.quotes[side] = await auditQuote({ side, api, collection, selectInterface, openItem, out, report });
    }
    const { item: id, geometry, revised } = report.quotes.fountain;
    assert.deepEqual(geometry, report.quotes.stock.geometry);
    await selectInterface('input-rich-text-html');
    const stock = await openItem('stock', '/admin/content/' + collection + '/' + id);
    report.stage = 'continue editing split Fountain quote in stock Directus';
    await expect(stock.editor.locator('blockquote')).toHaveCount(2);
    await stock.editor.getByText('After the review.').click();
    await stock.page.keyboard.press('End');
    await stock.page.keyboard.insertText(' Approved.');
    await stock.page.keyboard.press('Control+s');
    const continued = revised.replace('After the review.', 'After the review. Approved.');
    await expect.poll(async () => (await api('/items/' + collection + '/' + id)).body).toBe(continued);
    report.quotes.rollback = { item: id, saved: continued };
    await stock.context.close();
  }
  async function checkStructure() {
    report.structure = {};
    for (const side of ['stock', 'fountain']) {
      report.structure[side] = await auditStructure({ side, api, collection, selectInterface, openItem, out, report });
    }
    const { item: id, marker, switchedHTML } = report.structure.fountain;
    assert.deepEqual(marker, report.structure.stock.marker);
    await selectInterface('input-rich-text-html');
    const stock = await openItem('stock', '/admin/content/' + collection + '/' + id);
    report.stage = 'continue editing the Fountain list in stock Directus';
    await expect(stock.editor.locator('ul > li')).toHaveText(['Pack assets.', 'Ship build. Ready.']);
    await stock.editor.getByText('Ship build. Ready.', { exact: true }).click();
    await stock.page.keyboard.press('End');
    await stock.page.keyboard.insertText(' Checked.');
    await stock.page.keyboard.press('Control+s');
    const continued = switchedHTML.replace('Ready.', 'Ready. Checked.');
    await expect.poll(async () => (await api('/items/' + collection + '/' + id)).body).toBe(continued);
    report.structure.rollback = { item: id, saved: continued };
    await stock.context.close();
  }
  async function checkSavedItem() {
    const {context,page,editor} = await openItem();
    await expect(editor.locator('h2')).toHaveText('Publication brief');
    await expect(editor.locator('strong')).toHaveText('Research');
    const paragraph = editor.locator('p').last();
    await paragraph.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' Approved.');
    await expect(paragraph).toHaveText('Ready for review. Approved.');
    await page.keyboard.press('Control+z');
    await expect(paragraph).toHaveText('Ready for review.');
    await page.keyboard.press('Control+Shift+z');
    await expect(paragraph).toHaveText('Ready for review. Approved.');
    assert.equal((await api(itemPath)).body, source);
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await api(itemPath)).body,{timeout:15000}).toBe(expected);
    report.saved = (await api(itemPath)).body;
    await context.close();
    report.stage = 'restart and reopen';
    docker('restart', container);
    origin = publishedOrigin();
    await ready();
    token = await login();
    assert.equal((await api(itemPath)).body, expected);
    const reopened = await openItem();
    await expect(reopened.editor.locator('p').last()).toHaveText('Ready for review. Approved.');
    await expect(reopened.editor.locator('strong')).toHaveText('Research');
    await reopened.page.screenshot({path:join(out,'reopened.png')});
    report.restoredAfterRestart = true;
    if (paired) {
      report.layout = { stock: await measureContent(reopened.editor) };
      await reopened.context.close();
      await checkStructure();
      await checkQuotes();
      report.toolbar = {};
      for (const side of ['stock', 'fountain']) {
        report.toolbar[side] = await auditToolbar({ side, api, collection, selectInterface, openItem, out, report });
      }
      await selectInterface('input-rich-text-html');
      report.optionalField = { stock: await checkOptionalField('stock') };
      await selectInterface('fountain-rich-text-html');
      report.optionalField.fountain = await checkOptionalField('fountain');
      const replacement = await openItem('fountain');
      report.stage = 'Fountain edit and save';
      const last = replacement.editor.locator('p').last();
      await expect(last).toHaveText('Ready for review. Approved.');
      await expect(replacement.editor.locator('strong')).toHaveText('Research');
      await last.click();
      await replacement.page.keyboard.press('End');
      await replacement.page.keyboard.insertText(' Scheduled.');
      await expect(last).toHaveText('Ready for review. Approved. Scheduled.');
      await replacement.page.keyboard.press('Control+z');
      await expect(last).toHaveText('Ready for review. Approved.');
      await replacement.page.keyboard.press('Control+Shift+z');
      await expect(last).toHaveText('Ready for review. Approved. Scheduled.');
      assert.equal((await api(itemPath)).body,expected);
      const finalHTML = expected.replace(' Approved.', ' Approved. Scheduled.');
      await replacement.page.keyboard.press('Control+s');
      await expect.poll(async ()=>(await api(itemPath)).body,{timeout:15000}).toBe(finalHTML);
      await replacement.context.close();
      docker('restart',container);
      origin = publishedOrigin();
      await ready();
      token = await login();
      assert.equal((await api(itemPath)).body,finalHTML);
      const fresh = await openItem('fountain');
      await expect(fresh.editor.locator('p').last()).toHaveText('Ready for review. Approved. Scheduled.');
      await expect(fresh.editor.locator('h2')).toBeVisible();
      await fresh.editor.screenshot({path:join(out,'fountain.png')});
      report.layout.fountain = await measureContent(fresh.editor);
      assert.deepEqual(report.layout.fountain, report.layout.stock, 'Reopened rich field typography and spacing');
      await fresh.context.close();
      await selectInterface('input-rich-text-html');
      const rollback = await openItem();
      const restored = rollback.editor.locator('p').last();
      await expect(restored).toHaveText('Ready for review. Approved. Scheduled.');
      await restored.click();
      await rollback.page.keyboard.press('End');
      await rollback.page.keyboard.insertText(' Published.');
      await rollback.page.keyboard.press('Control+s');
      const rollbackHTML=finalHTML.replace(' Scheduled.', ' Scheduled. Published.');
      await expect.poll(async ()=>(await api(itemPath)).body,{timeout:15000}).toBe(rollbackHTML);
      const stockReopened = await openItem();
      await expect(stockReopened.editor.locator('p').last()).toHaveText('Ready for review. Approved. Scheduled. Published.');
      await stockReopened.editor.screenshot({path:join(out,'stock-rollback.png')});
      report.handover={itemId:item.id,saved:finalHTML,rollbackSaved:rollbackHTML};
    }
  }
  if (quoteOnly) await checkQuotes();
  else if (structureOnly) await checkStructure();
  else await checkSavedItem();
  report.stage = 'complete';
  report.passed = true;
} catch(error) {
  report.error = String(error);
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({path:join(out,'interrupted.png'),mask:[activePage.locator('input[type=password]')]}).catch(()=>{});
  }
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } finally {
    if (container) docker('stop', container);
    await writeFile(join(out,'report.json'), JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({out,passed:report.passed,error:report.error}));
  }
}
