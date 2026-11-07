import { expect, test, type Page, type Route } from '@playwright/test';
import { auditCompiledRuntime } from './compiled-runtime-audit';

const build = '/artifacts/yjs-authority-admission-build-20261107';
auditCompiledRuntime(`${build}/engine.js`, `${build}/adapter.js`, `${build}/checkpoint.js`, `${build}/admission.js`);

const fixture = '/artifacts/yjs-browser-draft-fixture-20261107.html?live';
const editor = (page: Page) => page.getByRole('textbox', { name: 'Your draft', exact: true });
const connection = (page: Page) => page.locator('#connection');
const server = (page: Page) => page.locator('#reader');
const write = '**/__admission/write';
const poll = '**/__admission/poll-retained';
const presence = '**/__admission/presence';
const peerLabel = (page: Page) => page.locator('.fountain-collaboration-caret > span');
const peerSelection = (page: Page) => page.locator('#editing .fountain-collaboration-selection');

async function join(page: Page) {
  await expect(page.getByRole('status')).toHaveText('Ready');
  await page.getByRole('button', { name: 'Join shared session' }).click();
  await expect(connection(page)).toHaveText('connected');
  await expect(page.getByRole('button', { name: 'Send editor changes' })).toHaveCount(0);
}

async function type(page: Page, suffix: string) {
  await editor(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(suffix);
  await expect(editor(page)).toContainText(suffix.trim());
}

async function secondAuthor(page: Page) {
  const token = await page.evaluate(() => sessionStorage.getItem('fountain-draft-audit-session')!);
  const peer = await page.context().newPage();
  await peer.addInitScript(token => sessionStorage.setItem('fountain-draft-audit-session', token), token);
  await peer.goto(fixture + '&peer');
  await join(peer);
  return peer;
}

const offline = (route: Route) => route.abort('internetdisconnected');

async function selectReport(page: Page) {
  await editor(page).click();
  await page.keyboard.press('End');
  for (let index = 0; index < 7; index += 1) await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe('report.');
}

const serverRevision = (page: Page) => page.evaluate(async () => {
  const response = await fetch('/__admission/snapshot', {
    method: 'POST', body: '{}', headers: {
      'Content-Type': 'application/json', 'X-Admission-Session': sessionStorage.getItem('fountain-draft-audit-session')!,
    },
  });
  return (await response.json()).value.revision as number;
});

test.beforeEach(async ({ page }) => {
  await page.goto(fixture);
  await join(page);
});

test('exchanges typing and structural changes automatically after a connection is restored', async ({ page }, info) => {
  const peer = await secondAuthor(page);
  try {
    await type(peer, ' From Grace.');
    await expect(editor(page)).toContainText('From Grace.');
    await page.route(write, offline);
    await page.route(poll, offline);
    await expect(connection(page)).toContainText('reconnecting');
    await type(page, ' Offline from Ada.');
    await editor(peer).click();
    await peer.getByRole('button', { name: 'Toggle quote' }).click();
    await expect(server(peer).locator('blockquote')).toContainText('From Grace.');
    await expect(server(peer)).not.toContainText('Offline from Ada.');
    await page.screenshot({ path: info.outputPath('offline-draft.png'), scale: 'css' });
    await page.unroute(write, offline);
    await page.unroute(poll, offline);
    await expect(connection(page)).toHaveText('connected');
    const expected = 'Shared incident report. From Grace. Offline from Ada.';
    await expect(editor(page).locator('blockquote')).toHaveText(expected);
    await expect(editor(peer).locator('blockquote')).toHaveText(expected);
    await expect(server(peer).locator('blockquote')).toHaveText(expected);
    await page.screenshot({ path: info.outputPath('offline-merged.png'), scale: 'css' });
  } finally { await peer.close(); }
});

test('retries a committed write after the reply is lost without duplicating text', async ({ page }, info) => {
  let lost = 0;
  await page.route(write, async route => {
    if (lost) return route.continue();
    const response = await route.fetch();
    expect(await response.json()).toMatchObject({ok: true});
    lost += 1;
    await route.abort('connectionreset');
  });
  await type(page, ' Keep exactly once.');
  await expect.poll(() => lost).toBe(1);
  await expect(server(page)).toHaveText('Shared incident report. Keep exactly once.');
  await expect(editor(page)).toHaveText('Shared incident report. Keep exactly once.');
  await expect(connection(page)).toHaveText('connected');
  await page.screenshot({ path: info.outputPath('lost-reply.png'), scale: 'css' });
});

test('stops a retired transport and reopens its locally saved typing after reload', async ({ page }, info) => {
  const peer = await secondAuthor(page);
  try {
    await page.route(write, offline);
    await page.route(poll, offline);
    await type(page, ' Unsent before rotation.');
    await expect(page.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
    await peer.getByRole('button', { name: 'Rotate server session' }).click();
    await expect(peer.getByRole('status')).toHaveText('Server session rotated.');
    await page.unroute(write, offline);
    await page.unroute(poll, offline);
    await expect(connection(page)).toContainText('stale');
    await type(page, ' Still local afterwards.');
    await expect(page.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
    await expect(server(peer)).toHaveText('Shared incident report.');
    await page.reload();
    await expect(page.getByRole('status')).toHaveText('Ready');
    await expect(page.getByRole('button', { name: 'Resume this session' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open local copy' }).click();
    await expect(connection(page)).toHaveText('Local only');
    await expect(editor(page)).toHaveText('Shared incident report. Unsent before rotation. Still local afterwards.');
    await expect(server(page)).toHaveText('Shared incident report.');
    await page.screenshot({ path: info.outputPath('retired-recovered.png'), scale: 'css' });
  } finally { await peer.close(); }
});

test('renders a native peer selection without writing a document revision and clears it on leave', async ({ page }, info) => {
  const peer = await secondAuthor(page);
  try {
    const before = await serverRevision(page);
    await selectReport(peer);
    await expect(peerLabel(page)).toHaveText('Grace');
    await expect(peerLabel(page)).toBeVisible();
    await expect(peerSelection(page)).toHaveText('report.');
    expect(await serverRevision(page)).toBe(before);
    await page.screenshot({ path: info.outputPath('peer-selection.png'), scale: 'css' });
    const leave = peer.waitForResponse(response => response.url().endsWith('/leave-live'));
    await peer.getByRole('button', { name: 'Leave shared session' }).click();
    expect((await leave).ok()).toBe(true);
    await expect(peerLabel(page)).toHaveCount(0);
    await expect(peerSelection(page)).toHaveCount(0);
    expect(await serverRevision(page)).toBe(before);
    await page.screenshot({ path: info.outputPath('peer-left.png'), scale: 'css' });
  } finally { await peer.close(); }
});

test('expires a silent peer and keeps old presence out of a rotated session', async ({ page }, info) => {
  const peer = await secondAuthor(page);
  try {
    await selectReport(peer);
    await expect(peerSelection(page)).toHaveText('report.');
    await peer.route(presence, offline);
    await expect(peerLabel(page)).toHaveCount(0, { timeout: 7_000 });
    await expect(peerSelection(page)).toHaveCount(0);
    await peer.unroute(presence, offline);
    await expect(peerSelection(page)).toHaveText('report.');
    await page.getByRole('button', { name: 'Rotate server session' }).click();
    await expect(page.getByRole('status')).toHaveText('Server session rotated.');
    await expect(connection(page)).toHaveText(/disconnected.*(stale|frozen)/);
    await expect(peerLabel(page)).toHaveCount(0);
    await expect(connection(peer)).toHaveText(/disconnected.*(stale|frozen)/);
    await page.getByRole('button', { name: 'Keep a copy and open shared' }).click();
    await expect(connection(page)).toHaveText('connected');
    await expect(peerLabel(page)).toHaveCount(0);
    await expect(peerSelection(page)).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('presence-rotated.png'), scale: 'css' });
  } finally { await peer.close(); }
});
