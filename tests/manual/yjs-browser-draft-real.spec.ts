import { expect, test, type Page } from '@playwright/test';
import type { SavedBrowserDraft } from '../../examples/backends/retained-browser-drafts';
import { auditCompiledRuntime } from './compiled-runtime-audit';

const build = '/artifacts/yjs-authority-admission-build-20261107';
auditCompiledRuntime(`${build}/engine.js`, `${build}/adapter.js`, `${build}/checkpoint.js`, `${build}/admission.js`);

const snapshot = (page: Page) => page.evaluate(() => (window as unknown as {
  audit: { snapshot(): Promise<{ starts: number; copies: SavedBrowserDraft[]; model: unknown; server: unknown }> };
}).audit.snapshot());
const editor = (page: Page) => page.getByRole('textbox', { name: 'Your draft', exact: true });
const click = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
const status = (page: Page) => page.getByRole('status');

async function type(page: Page, suffix: string) {
  await editor(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(suffix);
  await expect(editor(page)).toContainText(suffix.trim());
}

const fixture = '/artifacts/yjs-browser-draft-fixture-20261107.html';

test.beforeEach(async ({ page }, info) => {
  await page.goto(fixture + (info.tags.includes('@autosave') ? '' : '?manual'));
  await expect(status(page)).toHaveText('Ready');
});

test('resumes an unsent same-epoch edit after reload and saves it to the authority', async ({ page }, info) => {
  await click(page, 'Join shared session');
  await expect(page.locator('#connection')).toHaveText('connected');
  await type(page, ' Local outage note.');
  await click(page, 'Save recovery copy');
  await expect(status(page)).toContainText('Recovery copy saved');
  const saved = await snapshot(page);
  expect(saved.copies).toHaveLength(1);
  expect(saved.copies[0].source?.checkpoint.update.length).toBeGreaterThan(0);
  expect(saved.server).not.toEqual(saved.model);
  await page.reload();
  await expect(status(page)).toHaveText('Ready');
  const reloaded = await snapshot(page);
  expect(reloaded.starts).toBe(0);
  expect(reloaded.copies).toEqual(saved.copies);
  await click(page, 'Resume this session');
  await expect(page.locator('#connection')).toHaveText('connected');
  await expect(editor(page)).toContainText('Local outage note.');
  expect((await snapshot(page)).model).toEqual(saved.model);
  await click(page, 'Send editor changes');
  await expect(status(page)).toContainText('Changes saved on the server');
  expect((await snapshot(page)).server).toEqual(saved.model);
  await page.screenshot({ path: info.outputPath('resumed.png') });
});

test('merges recovered typing into a quote saved by another author before resume', async ({ page }, info) => {
  await click(page, 'Join shared session');
  await expect(page.locator('#connection')).toHaveText('connected');
  await type(page, ' Typed while away.');
  await click(page, 'Save recovery copy');
  await expect(status(page)).toContainText('Recovery copy saved');
  const token = await page.evaluate(() => sessionStorage.getItem('fountain-draft-audit-session')!);
  await page.reload();
  await expect(status(page)).toHaveText('Ready');
  const peer = await page.context().newPage();
  try {
    await peer.addInitScript(token => sessionStorage.setItem('fountain-draft-audit-session', token), token);
    await peer.goto(fixture + '?manual&peer');
    await expect(status(peer)).toHaveText('Ready');
    await expect(peer.getByText('No recovery copies yet.')).toBeVisible();
    await click(peer, 'Join shared session');
    await expect(peer.locator('#connection')).toHaveText('connected');
    await editor(peer).click();
    await click(peer, 'Toggle quote');
    await expect(editor(peer).locator('blockquote')).toContainText('Shared incident report.');
    await click(peer, 'Send editor changes');
    await expect(status(peer)).toContainText('Changes saved on the server');
  } finally { await peer.close(); }
  await click(page, 'Resume this session');
  await expect(page.locator('#connection')).toHaveText('connected');
  await expect(editor(page).locator('blockquote')).toHaveText('Shared incident report. Typed while away.');
  await click(page, 'Send editor changes');
  await expect(page.locator('#reader blockquote')).toHaveText('Shared incident report. Typed while away.');
  const state = await snapshot(page);
  expect(state.server).toEqual(state.model);
  await page.screenshot({ path: info.outputPath('merged-quote.png') });
});

test('keeps a fenced draft available separately after choosing shared and reloading', async ({ page }, info) => {
  await click(page, 'Join shared session');
  await expect(page.locator('#connection')).toHaveText('connected');
  await type(page, ' Retired incident notes.');
  const edited = await snapshot(page);
  await click(page, 'Rotate server session');
  await click(page, 'Send editor changes');
  await expect(status(page)).toContainText('stale');
  await click(page, 'Keep a copy and open shared');
  await expect(page.locator('#connection')).toHaveText('connected');
  await expect(editor(page)).not.toContainText('Retired incident notes.');
  await page.reload();
  await expect(status(page)).toHaveText('Ready');
  await expect(page.getByText('Draft from a previous session')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume this session' })).toHaveCount(0);
  await click(page, 'Open local copy');
  await expect(page.locator('#connection')).toHaveText('Local only');
  await expect(editor(page)).toContainText('Retired incident notes.');
  await click(page, 'Send editor changes');
  await expect(status(page)).toContainText('Join an active session');
  const recovered = await snapshot(page);
  expect(recovered.starts).toBe(0);
  expect(recovered.copies[0].model).toEqual(edited.model);
  expect(recovered.server).toEqual(edited.server);
  await page.screenshot({ path: info.outputPath('detached.png') });
});

test('keeps pre-admission typing as a separate draft without native room bytes', async ({ page }, info) => {
  await type(page, ' Before joining.');
  const before = await snapshot(page);
  await click(page, 'Keep a copy and open shared');
  await expect(page.locator('#connection')).toHaveText('connected');
  await page.reload();
  await expect(status(page)).toHaveText('Ready');
  await expect(page.getByText('Local-only draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume this session' })).toHaveCount(0);
  await click(page, 'Open local copy');
  await expect(editor(page)).toContainText('Before joining.');
  const recovered = await snapshot(page);
  expect(recovered.copies[0].source).toBeNull();
  expect(recovered.model).toEqual(before.model);
  expect(recovered.server).toEqual(before.server);
  await page.screenshot({ path: info.outputPath('pre-admission.png') });
});

test('does not replace the visible draft if its storage transaction aborts', async ({ page }, info) => {
  await type(page, ' Keep this visible.');
  const before = await snapshot(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof original>) {
      const request = original.apply(this, args);
      this.transaction.abort();
      IDBObjectStore.prototype.add = original;
      return request;
    };
  });
  await click(page, 'Keep a copy and open shared');
  await expect(status(page)).toContainText('Local draft storage aborted');
  await expect(editor(page)).toContainText('Keep this visible.');
  expect(await snapshot(page)).toEqual(before);
  await page.screenshot({ path: info.outputPath('storage-aborted.png') });
  await click(page, 'Keep a copy and open shared');
  await expect(page.locator('#connection')).toHaveText('connected');
  expect((await snapshot(page)).copies[0].model).toEqual(before.model);
});

test('rechecks the authority if a displayed resume option becomes stale', async ({ page }, info) => {
  await click(page, 'Join shared session');
  await expect(page.locator('#connection')).toHaveText('connected');
  await type(page, ' Saved before rotation.');
  await click(page, 'Save recovery copy');
  const saved = await snapshot(page);
  await page.reload();
  await expect(status(page)).toHaveText('Ready');
  await expect(page.getByRole('button', { name: 'Resume this session' })).toBeVisible();
  // Another authority client changes the epoch before this page refreshes its choices.
  expect(await page.evaluate(async () => (await fetch('/__admission/rotate', {
    method: 'POST', body: '{}', headers: {
      'Content-Type': 'application/json', 'X-Admission-Session': sessionStorage.getItem('fountain-draft-audit-session')!,
    },
  })).ok)).toBe(true);
  await click(page, 'Resume this session');
  await expect(status(page)).toContainText('Saved draft belongs to another session');
  expect((await snapshot(page)).starts).toBe(0);
  await click(page, 'Open local copy');
  await expect(page.locator('#connection')).toHaveText('Local only');
  expect((await snapshot(page)).model).toEqual(saved.model);
  expect((await snapshot(page)).server).toEqual(saved.server);
  await page.screenshot({ path: info.outputPath('stale-offer.png') });
});

test('automatic recovery updates one rolling copy and survives reload without clicking save', { tag: '@autosave' }, async ({ page }, info) => {
  await click(page, 'Join shared session');
  await expect(page.locator('#connection')).toHaveText('connected');
  await expect(page.locator('#autosave')).toHaveText('Automatic recovery is on.');
  expect((await snapshot(page)).copies).toHaveLength(0);
  await type(page, ' First burst.');
  await expect(page.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
  const first = (await snapshot(page)).copies[0];
  await type(page, ' Latest burst.');
  await expect(page.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
  const edited = await snapshot(page);
  expect(edited.copies).toHaveLength(1);
  expect(edited.copies[0].id).toBe(first.id);
  expect(edited.copies[0].model).toEqual(edited.model);
  expect(edited.copies[0].source?.checkpoint.update.length).toBeGreaterThan(0);
  await page.reload();
  await expect(status(page)).toHaveText('Ready');
  await click(page, 'Resume this session');
  await expect(page.locator('#connection')).toHaveText('connected');
  await expect(editor(page)).toContainText('First burst. Latest burst.');
  expect((await snapshot(page)).server).toEqual(edited.server);
  await page.screenshot({ path: info.outputPath('autosave-resumed.png'), scale: 'css' });
});

test('automatic recovery keeps the last committed draft when the next write aborts and retries the latest edit', { tag: '@autosave' }, async ({ page }, info) => {
  await type(page, ' First local draft.');
  await expect(page.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
  const first = (await snapshot(page)).copies[0];
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      const request = original.apply(this, args);
      this.transaction.abort();
      return request;
    };
    window.addEventListener('allow-recovery-write', () => { IDBObjectStore.prototype.put = original; }, { once: true });
  });
  await type(page, ' New pending content.');
  await expect(page.locator('#autosave')).toContainText('Automatic recovery save failed');
  expect((await snapshot(page)).copies).toEqual([first]);
  await page.screenshot({ path: info.outputPath('autosave-aborted.png'), scale: 'css' });
  await page.evaluate(() => window.dispatchEvent(new Event('allow-recovery-write')));
  await click(page, 'Retry automatic save');
  await expect(page.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
  const retried = await snapshot(page);
  expect(retried.copies).toHaveLength(1);
  expect(retried.copies[0].id).toBe(first.id);
  expect(retried.copies[0].model).toEqual(retried.model);
  await page.reload();
  await expect(status(page)).toHaveText('Ready');
  await click(page, 'Open local copy');
  await expect(editor(page)).toContainText('First local draft. New pending content.');
});

test('automatic recovery gives two tabs under the same author separate slots', { tag: '@autosave' }, async ({ page }, info) => {
  const token = await page.evaluate(() => sessionStorage.getItem('fountain-draft-audit-session')!);
  const other = await page.context().newPage();
  try {
    await other.addInitScript(token => sessionStorage.setItem('fountain-draft-audit-session', token), token);
    await other.goto(fixture);
    await expect(status(other)).toHaveText('Ready');
    await type(page, ' From the first tab.');
    await type(other, ' From the second tab.');
    await expect(page.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
    await expect(other.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
    const { copies } = await snapshot(page);
    expect(copies).toHaveLength(2);
    expect(new Set(copies.map(copy => copy.id)).size).toBe(2);
    expect(copies.map(copy => copy.model)).toEqual(expect.arrayContaining([(await snapshot(page)).model, (await snapshot(other)).model]));
  } finally { await other.close(); }
  await page.reload();
  await expect(status(page)).toHaveText('Ready');
  await expect(page.getByRole('button', { name: 'Open local copy' })).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('autosave-two-tabs.png'), scale: 'css' });
});

test('automatic recovery records local Yjs undo instead of reviving the undone text after reload', { tag: '@autosave' }, async ({ page }, info) => {
  await click(page, 'Join shared session');
  await expect(page.locator('#connection')).toHaveText('connected');
  const before = (await snapshot(page)).model;
  await type(page, ' Undo this unsent typing.');
  await expect(page.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
  const old = (await snapshot(page)).copies[0];
  await click(page, 'Undo shared edit');
  await expect(editor(page)).not.toContainText('Undo this unsent typing.');
  await expect(page.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
  const after = (await snapshot(page)).copies[0];
  expect(after.id).toBe(old.id);
  expect(after.model).toEqual(before);
  expect(after.model).not.toEqual(old.model);
  await page.reload();
  await expect(status(page)).toHaveText('Ready');
  await click(page, 'Resume this session');
  await expect(page.locator('#connection')).toHaveText('connected');
  expect((await snapshot(page)).model).toEqual(before);
  await page.screenshot({ path: info.outputPath('autosave-undo.png'), scale: 'css' });
});

test('automatic recovery keeps typing made after a retired writer is disconnected', { tag: '@autosave' }, async ({ page }, info) => {
  await click(page, 'Join shared session');
  await expect(page.locator('#connection')).toHaveText('connected');
  await type(page, ' Before the refusal.');
  await expect(page.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
  const native = (await snapshot(page)).copies[0];
  await click(page, 'Rotate server session');
  await click(page, 'Send editor changes');
  await expect(status(page)).toContainText('stale');
  await type(page, ' After the refusal.');
  await expect(page.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
  const edited = await snapshot(page);
  expect(edited.copies[0].id).toBe(native.id);
  expect(edited.copies[0].source?.diverged).toBe(true);
  expect(edited.copies[0].source?.checkpoint).toEqual(native.source?.checkpoint);
  await page.reload();
  await expect(status(page)).toHaveText('Ready');
  await expect(page.getByRole('button', { name: 'Resume this session' })).toHaveCount(0);
  await click(page, 'Open local copy');
  await expect(editor(page)).toContainText('Before the refusal. After the refusal.');
  expect((await snapshot(page)).model).toEqual(edited.model);
  expect((await snapshot(page)).server).toEqual(edited.server);
  await page.screenshot({ path: info.outputPath('autosave-after-refusal.png'), scale: 'css' });
});
