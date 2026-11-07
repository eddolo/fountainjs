import { expect, test, type Page, type Route } from '@playwright/test';
import { auditCompiledRuntime } from './compiled-runtime-audit';
import type { NodeJSON } from '../../src';

const build = '/artifacts/yjs-authority-admission-build-20261107';
const migrateBeforeEditing = process.env.FOUNTAIN_LIVE_MIGRATED === '1';
auditCompiledRuntime(`${build}/engine.js`, `${build}/adapter.js`, `${build}/checkpoint.js`, `${build}/admission.js`,
  ...(migrateBeforeEditing ? [`${build}/legacy-adapter.js`, `${build}/legacy-checkpoint.js`] : []));

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
  const session = await page.evaluate(() => {
    const token = sessionStorage.getItem('fountain-draft-audit-session')!;
    return { token, migration: sessionStorage.getItem('fountain-draft-audit-migration:' + token) };
  });
  const peer = await page.context().newPage();
  await peer.addInitScript(({ token, migration }) => {
    sessionStorage.setItem('fountain-draft-audit-session', token);
    if (migration) sessionStorage.setItem('fountain-draft-audit-migration:' + token, migration);
  }, session);
  const profile = new URL(page.url()).searchParams;
  await peer.goto(fixture + '&peer' + ['large', 'structural', 'migrated'].filter(name => profile.has(name)).map(name => '&' + name).join(''));
  await join(peer);
  return peer;
}

const offline = (route: Route) => route.abort('internetdisconnected');

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function selectReport(page: Page) {
  await editor(page).click();
  await page.keyboard.press('End');
  for (let index = 0; index < 7; index += 1) await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe('report.');
}

async function expectCaretEdge(page: Page, edge: 'left' | 'right') {
  await expect.poll(() => page.evaluate(edge => {
    const highlight = document.querySelector('.fountain-collaboration-selection')?.getBoundingClientRect();
    const caret = document.querySelector('.fountain-collaboration-caret')?.getBoundingClientRect();
    return Boolean(highlight && caret && Math.abs(highlight[edge] - caret.left) < 4);
  }, edge)).toBe(true);
}

const serverRevision = (page: Page) => page.evaluate(async () => {
  const response = await fetch('/__admission/snapshot', {
    method: 'POST', body: '{}', headers: {
      'Content-Type': 'application/json', 'X-Admission-Session': sessionStorage.getItem('fountain-draft-audit-session')!,
    },
  });
  return (await response.json()).value.revision as number;
});

test.beforeEach(async ({ page }, info) => {
  const profile = ['large', 'deadline', 'structural'].filter(name => info.tags.includes('@' + name));
  if (migrateBeforeEditing) profile.push('migrated');
  await page.goto(fixture + profile.map(name => '&' + name).join(''));
  if (migrateBeforeEditing) {
    await expect(page.getByRole('status')).toContainText('Legacy room saved');
    const preflight = page.waitForResponse('**/__admission/preflight-legacy');
    const freeze = page.waitForRequest('**/__admission/freeze');
    await page.getByRole('button', { name: 'Upgrade saved legacy room' }).click();
    await expect(page.locator('#migration-summary')).toContainText('Opened the upgraded room');
    const checked = await preflight;
    expect(checked.ok()).toBe(true);
    const { epoch, revision } = (await checked.json()).value;
    expect((await freeze).postDataJSON()).toEqual({ epoch, revision });
  }
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
    await expect(connection(page)).toHaveText('connected', { timeout: 12_000 });
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

test('times out a stalled committed write and ignores its late reply', { tag: '@deadline' }, async ({ page }, info) => {
  let writes = 0;
  let committed = false;
  const release = gate();
  const lateReply = gate();
  const allowRetry = gate();
  await page.route(write, async route => {
    if (++writes !== 1) {
      await allowRetry.promise;
      return route.continue();
    }
    try {
      const response = await route.fetch();
      expect(await response.json()).toMatchObject({ ok: true });
      committed = true;
      await release.promise;
      // The browser already aborted this request. Playwright may refuse to
      // deliver the held response when the route is eventually released.
      await route.fulfill({ response }).catch(() => undefined);
    } finally { lateReply.release(); }
  });
  try {
    await editor(page).click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' First note.');
    await expect.poll(() => committed).toBe(true);
    await page.keyboard.insertText(' Second note.');
    await expect(connection(page)).toContainText('request timed out');
    await expect(editor(page)).toHaveText('Shared incident report. First note. Second note.');
    await page.screenshot({ path: info.outputPath('write-timed-out.png'), scale: 'css' });
    allowRetry.release();
    await expect(server(page)).toHaveText('Shared incident report. First note. Second note.');
    await expect(connection(page)).toHaveText('connected');
    expect(writes).toBeGreaterThanOrEqual(2);
    release.release();
    await lateReply.promise;
    await expect(server(page)).toHaveText('Shared incident report. First note. Second note.');
    await expect(connection(page)).toHaveText('connected');
    await page.screenshot({ path: info.outputPath('write-timeout-recovered.png'), scale: 'css' });
  } finally { release.release(); allowRetry.release(); }
});

test('retries concurrent writers against the durable authority until both edits are shared', { tag: '@deadline' }, async ({ page }, info) => {
  const peer = await secondAuthor(page);
  const arrived = new Set<Page>();
  const race = gate();
  let conflicts = 0;
  try {
    for (const author of [page, peer]) {
      await author.route(write, async route => {
        if (arrived.has(author)) return route.continue();
        arrived.add(author);
        if (arrived.size === 2) race.release();
        await race.promise;
        const response = await route.fetch();
        if ((await response.json()).code === 'revision-conflict') conflicts += 1;
        await route.fulfill({ response });
      });
      await editor(author).click();
      await author.keyboard.press('End');
    }
    await Promise.all([page.keyboard.insertText(' [ADA]'), peer.keyboard.insertText(' [GRACE]')]);
    await expect.poll(() => conflicts).toBeGreaterThan(0);
    const combined = /^Shared incident report\.(?: \[ADA\] \[GRACE\]| \[GRACE\] \[ADA\])$/;
    await expect(editor(page)).toHaveText(combined);
    await expect(editor(peer)).toHaveText(combined);
    await expect(server(page)).toHaveText(combined);
    await expect(server(peer)).toHaveText(combined);
    expect(await editor(page).textContent()).toBe(await editor(peer).textContent());
    await page.screenshot({ path: info.outputPath('concurrent-writes-merged.png'), scale: 'css' });
  } finally { race.release(); await peer.close(); }
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
    await expect(connection(page)).toContainText('stale', { timeout: 12_000 });
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
    const primary = page.waitForResponse(response => response.url().endsWith('/presence') && response.ok());
    const secondary = peer.waitForResponse(response => response.url().endsWith('/presence') && response.ok());
    await selectReport(peer);
    await expect(peerLabel(page)).toHaveText('Grace');
    await expect(peerLabel(page)).toBeVisible();
    await expect(peerSelection(page)).toHaveText('report.');
    await expectCaretEdge(page, 'left');
    expect((await primary).headers()['x-presence-worker']).toBe('primary');
    expect((await secondary).headers()['x-presence-worker']).toBe('peer');
    expect(await serverRevision(page)).toBe(before);
    await page.screenshot({ path: info.outputPath('peer-selection-backward.png'), scale: 'css' });
    // Reverse the native endpoints in one operation. The normalized model range
    // is identical and the transport still has to publish its new focus.
    await peer.evaluate(() => {
      const native = document.getSelection()!;
      native.setBaseAndExtent(native.focusNode!, native.focusOffset, native.anchorNode!, native.anchorOffset);
    });
    await expect(peerSelection(page)).toHaveText('report.');
    await expectCaretEdge(page, 'right');
    expect(await serverRevision(page)).toBe(before);
    await page.screenshot({ path: info.outputPath('peer-selection-forward.png'), scale: 'css' });
    await selectReport(peer);
    await expectCaretEdge(page, 'left');
    await editor(page).click();
    await page.keyboard.press('Home');
    await page.keyboard.type('Updated: ');
    await expect(editor(peer)).toContainText('Updated: Shared incident report.');
    await expect(peerSelection(page)).toHaveText('report.');
    await expectCaretEdge(page, 'left');
    const afterEdit = await serverRevision(page);
    expect(afterEdit).toBeGreaterThan(before);
    const leave = peer.waitForResponse(response => response.url().endsWith('/leave-live'));
    await peer.getByRole('button', { name: 'Leave shared session' }).click();
    expect((await leave).ok()).toBe(true);
    await expect(peerLabel(page)).toHaveCount(0);
    await expect(peerSelection(page)).toHaveCount(0);
    expect(await serverRevision(page)).toBe(afterEdit);
    await page.screenshot({ path: info.outputPath('peer-left.png'), scale: 'css' });
  } finally { await peer.close(); }
});

test('clears the old cursor on reload and renders the new cursor after rejoining', async ({ page }, info) => {
  const peer = await secondAuthor(page);
  try {
    const before = await serverRevision(page);
    const heartbeat = peer.waitForRequest(request => request.url().endsWith('/presence') && Boolean(request.postDataJSON().state));
    await selectReport(peer);
    await expect(peerSelection(page)).toHaveText('report.');
    await page.screenshot({ path: info.outputPath('before-peer-reload.png'), scale: 'css' });
    const oldPresence = await heartbeat;
    const origin = new URL(peer.url()).origin;
    await peer.reload();
    await expect.poll(async () => {
      const response = await page.request.post(oldPresence.url(), {
        headers: { Origin: origin, 'X-Admission-Session': (await oldPresence.allHeaders())['x-admission-session'] },
        data: oldPresence.postDataJSON(),
      });
      return (await response.json()).error;
    }, { timeout: 3_000 }).toBe('Presence session is no longer active.');
    await expect(peerLabel(page)).toHaveCount(0);
    await expect(peerSelection(page)).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('after-peer-reload.png'), scale: 'css' });
    await join(peer);
    await selectReport(peer);
    await expect(peerLabel(page)).toHaveText('Grace');
    await expect(peerSelection(page)).toHaveText('report.');
    expect(await serverRevision(page)).toBe(before);
    await page.screenshot({ path: info.outputPath('peer-rejoined.png'), scale: 'css' });
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

test('sends small receipts for a long document and falls back when a delta is corrupted', { tag: '@large' }, async ({ page }, info) => {
  const peer = await secondAuthor(page);
  try {
    const fullSize = await page.evaluate(async () => {
      const response = await fetch('/__admission/snapshot', {
        method: 'POST', body: '{}', headers: {
          'Content-Type': 'application/json', 'X-Admission-Session': sessionStorage.getItem('fountain-draft-audit-session')!,
        },
      });
      return (await response.arrayBuffer()).byteLength;
    });
    expect(fullSize).toBeGreaterThan(25_000);
    const outbound = page.waitForResponse(async response => response.url().endsWith('/write') && Boolean((await response.json()).value?.delta));
    const inbound = peer.waitForResponse(async response => response.url().endsWith('/poll-retained') && Boolean((await response.json()).value?.delta));
    await editor(page).getByText('Shared incident report.', { exact: true }).click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' New field note.');
    const outgoingSize = (await (await outbound).body()).byteLength;
    const incomingSize = (await (await inbound).body()).byteLength;
    expect(outgoingSize).toBeLessThan(fullSize / 10);
    expect(incomingSize).toBeLessThan(fullSize / 10);
    await expect(editor(peer)).toContainText('New field note.');

    let corrupted = 0;
    let fallback = 0;
    await peer.route(poll, async route => {
      const body = route.request().postDataJSON();
      if (corrupted && !body.basis) fallback += 1;
      if (corrupted || !body.basis) return route.continue();
      const response = await route.fetch();
      const reply = await response.json();
      if (!reply.value?.delta) return route.fulfill({ response });
      corrupted += 1;
      reply.value.baseUpdateSha256 = '0'.repeat(64);
      await route.fulfill({ response, json: reply });
    });
    await page.keyboard.insertText(' Recovery checked.');
    await expect(editor(peer)).toContainText('New field note. Recovery checked.');
    await expect(server(peer)).toContainText('New field note. Recovery checked.');
    await expect(connection(peer)).toHaveText('connected');
    expect(corrupted).toBe(1);
    expect(fallback).toBe(1);
    await info.attach('receipt-bytes', { body: JSON.stringify({ fullSize, outgoingSize, incomingSize }), contentType: 'application/json' });
    await peer.screenshot({ path: info.outputPath('delta-recovered.png'), scale: 'css' });
  } finally { await peer.close(); }
});

test('keeps local typing when the write response has no acknowledgement', async ({ page }, info) => {
  const before = await serverRevision(page);
  await page.route(write, route => route.fulfill({ json: { ok: true, value: null } }));
  await type(page, ' Unacknowledged field note.');
  await expect(connection(page)).toContainText('no write acknowledgement');
  await expect(page.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
  expect(await serverRevision(page)).toBe(before);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Ready');
  await page.getByRole('button', { name: 'Open local copy' }).click();
  await expect(editor(page)).toHaveText('Shared incident report. Unacknowledged field note.');
  await expect(server(page)).toHaveText('Shared incident report.');
  await page.screenshot({ path: info.outputPath('write-unacknowledged.png'), scale: 'css' });
});

for (const edit of ['insert', 'delete'] as const) {
  test(`retries an uncommitted ${edit} after a corrupt write receipt and a newer peer revision`, { tag: '@large' }, async ({ page }, info) => {
    const peer = await secondAuthor(page);
    const intercepted = gate();
    const peerSaved = gate();
    let writes = 0;
    let fullPolls = 0;
    let peerSnapshot: Record<string, unknown>;
    const paragraph = (author: Page) => editor(author).locator('p').first();
    const published = (author: Page) => server(author).locator('p').first();
    try {
      const before = await serverRevision(page);
      await page.route(poll, route => {
        if (!route.request().postDataJSON().basis) fullPolls++;
        return route.continue();
      });
      await page.route(write, async route => {
        if (++writes !== 1) return route.continue();
        intercepted.release();
        await peerSaved.promise;
        if (!peerSnapshot) return route.abort();
        await route.fulfill({ json: { ok: true, value: {
          baseUpdateSha256: '0'.repeat(64), snapshot: peerSnapshot, delta: { __wire: 'AA==' },
        } } });
      });

      await paragraph(page).click();
      await page.keyboard.press('End');
      if (edit === 'insert') await page.keyboard.insertText(' Ada');
      else await page.keyboard.press('Backspace');
      await intercepted.promise;
      await paragraph(peer).click();
      await peer.keyboard.press('Home');
      await peer.keyboard.insertText('Grace: ');
      await expect(published(peer)).toHaveText('Grace: Shared incident report.');
      expect(await serverRevision(peer)).toBeGreaterThan(before);
      peerSnapshot = await peer.evaluate(async () => {
        const response = await fetch('/__admission/snapshot', { method: 'POST', body: '{}', headers: {
          'Content-Type': 'application/json', 'X-Admission-Session': sessionStorage.getItem('fountain-draft-audit-session')!,
        } });
        const { checkpoint: _checkpoint, ...snapshot } = (await response.json()).value;
        return snapshot;
      });
      peerSaved.release();

      const combined = edit === 'insert' ? 'Grace: Shared incident report. Ada' : 'Grace: Shared incident report';
      await expect(paragraph(peer)).toHaveText(combined);
      await expect(paragraph(page)).toHaveText(combined);
      await expect(published(page)).toHaveText(combined);
      await expect(connection(page)).toHaveText('connected');
      expect(fullPolls).toBe(1);
      expect(writes).toBeGreaterThanOrEqual(2);
      await page.screenshot({ path: info.outputPath(`${edit}-recovered-after-peer-write.png`), scale: 'css' });
    } finally {
      peerSaved.release();
      await peer.close();
    }
  });
}

test('delivers presence while the receiving editor is behind the current document revision', async ({ page }, info) => {
  const peer = await secondAuthor(page);
  try {
    const holdCatchup = (route: Route) => route.fulfill({ json: { ok: true, value: null } });
    await peer.route(poll, holdCatchup);
    await editor(page).click();
    await page.keyboard.press('Home');
    await page.keyboard.insertText('Updated: ');
    await expect(server(page)).toHaveText('Updated: Shared incident report.');
    await expect(editor(peer)).toHaveText('Shared incident report.');
    await selectReport(page);
    await expect(peerLabel(peer)).toHaveText('Ada');
    await expect(peerSelection(peer)).toHaveText('report.');
    await expectCaretEdge(peer, 'left');
    await expect(server(peer)).toHaveText('Shared incident report.');
    await peer.screenshot({ path: info.outputPath('presence-while-behind.png'), scale: 'css' });
    await peer.unroute(poll, holdCatchup);
    await expect(editor(peer)).toHaveText('Updated: Shared incident report.');
    await expect(peerSelection(peer)).toHaveText('report.');
    await expectCaretEdge(peer, 'left');
    await peer.screenshot({ path: info.outputPath('presence-after-catchup.png'), scale: 'css' });
  } finally { await peer.close(); }
});

const structureCases = [
  { name: 'quote', button: 'Toggle quote', selector: 'blockquote', type: 'blockquote' },
  { name: 'bullet list', button: 'Toggle bullet list', selector: 'ul:not([data-type])', type: 'bullet_list' },
  { name: 'numbered list', button: 'Toggle numbered list', selector: 'ol', type: 'ordered_list' },
  { name: 'task list', button: 'Toggle task list', selector: 'ul[data-type="task-list"]', type: 'task_list' },
  { name: 'partial bold', button: 'Apply bold', selector: 'strong', type: 'paragraph' },
  { name: 'paragraph split', button: null, selector: 'p', type: 'paragraph' },
] as const;

const readModel = (page: Page) => page.evaluate(async () => {
  const { model, server } = await (window as unknown as { audit: {
    snapshot(): Promise<{ model: NodeJSON; server: NodeJSON }>;
  } }).audit.snapshot();
  return { model, server };
});

interface MigrationEvidence {
  readonly archive: {
    readonly id: string; readonly kind: string; readonly branchRevision: number;
    readonly source: { readonly epoch: string; readonly format: string; readonly modelHash: string };
    readonly destination: { readonly epoch: string; readonly format: string; readonly modelHash: string; readonly roomId: string };
  };
  readonly active: { readonly epoch: string; readonly revision: number; readonly roomId: string };
}

const readMigration = (page: Page) => page.evaluate(() =>
  (window as unknown as { audit: { migration(): Promise<MigrationEvidence> } }).audit.migration());

async function placeAlphaCaret(page: Page, offset: number) {
  await editor(page).getByText('Alpha', { exact: true }).click();
  await page.keyboard.press('Home');
  for (let index = 0; index < offset; index += 1) await page.keyboard.press('ArrowRight');
}

for (const operation of structureCases) {
  test(`recovers an offline edit through reload after ${operation.name}`, { tag: '@structural' }, async ({ page }, info) => {
    const peer = await secondAuthor(page);
    try {
      const original = (await readModel(page)).model;
      const initialMigration = migrateBeforeEditing ? await readMigration(page) : undefined;
      if (initialMigration) {
        const { archive, active } = initialMigration;
        expect(archive.kind).toBe('legacy-migration');
        expect(archive.source.format).toBe('fountain-legacy-checkpoint/1');
        expect(archive.destination.format).toBe('fountain-retained-checkpoint/1');
        expect(archive.source.modelHash).toBe(archive.destination.modelHash);
        expect(archive.source.epoch).not.toBe(active.epoch);
        expect(archive.branchRevision).toBe(0);
        expect(active).toMatchObject({ epoch: archive.destination.epoch, roomId: archive.destination.roomId });
      }
      await page.route(write, offline);
      await page.route(poll, offline);
      await placeAlphaCaret(page, 2);
      await page.keyboard.type('X');
      await expect(editor(page)).toContainText('AlXpha');
      await expect(page.locator('#autosave')).toHaveText('Recovery copy saved automatically.');
      await expect(editor(peer)).toContainText('Alpha');
      await page.reload();
      await expect(page.getByRole('status')).toHaveText('Ready');

      await placeAlphaCaret(peer, operation.name === 'partial bold' ? 1 : 3);
      if (operation.name === 'partial bold') {
        for (let index = 0; index < 3; index += 1) await peer.keyboard.press('Shift+ArrowRight');
        await expect.poll(() => peer.evaluate(() => document.getSelection()?.toString())).toBe('lph');
      }
      if (operation.button) await peer.getByRole('button', { name: operation.button, exact: true }).click();
      else await peer.keyboard.press('Enter');
      if (operation.name === 'paragraph split') await expect(server(peer).locator('p')).toHaveText(['Alp', 'ha']);
      else await expect(server(peer).locator(operation.selector)).toHaveText(operation.name === 'partial bold' ? 'lph' : 'Alpha');

      await page.unroute(write, offline);
      await page.unroute(poll, offline);
      await page.getByRole('button', { name: 'Resume this session' }).click();
      await expect(connection(page)).toHaveText('connected');
      const assertRecovered = async () => {
        for (const author of [page, peer]) {
          if (operation.name === 'paragraph split') {
            await expect(editor(author).locator('p')).toHaveText(['AlXp', 'ha']);
            await expect(server(author).locator('p')).toHaveText(['AlXp', 'ha']);
          } else {
            await expect(editor(author)).toContainText('AlXpha');
            await expect(server(author)).toContainText('AlXpha');
            if (operation.name === 'partial bold') {
              await expect.poll(async () => (await editor(author).locator('strong').allTextContents()).join('').replace('X', '')).toBe('lph');
            } else await expect(editor(author).locator(operation.selector)).toHaveText('AlXpha');
          }
        }
        const left = await readModel(page);
        const right = await readModel(peer);
        expect(left.model).toEqual(left.server);
        expect(right.model).toEqual(left.model);
        expect(right.server).toEqual(left.model);
        expect(left.model.attrs).toEqual(original.attrs);
        expect(left.model.content?.at(-1)).toEqual(original.content?.at(-1));
        expect(left.model.content?.[0].type).toBe(operation.type);
        const image = editor(page).getByRole('img', { name: 'Original figure', exact: true });
        await expect(image).toBeVisible();
        await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
      };
      await assertRecovered();
      await page.screenshot({ path: info.outputPath('recovered-structure.png'), scale: 'css' });
      await peer.getByRole('button', { name: 'Undo shared edit', exact: true }).click();
      await expect(server(page).locator('p')).toHaveText(['AlXpha']);
      await expect(editor(page).locator('blockquote, ul, ol, strong')).toHaveCount(0);
      await peer.getByRole('button', { name: 'Redo shared edit', exact: true }).click();
      await assertRecovered();
      await page.screenshot({ path: info.outputPath('redone-structure.png'), scale: 'css' });
      if (initialMigration) {
        const latest = await readMigration(page);
        expect(latest.archive).toEqual(initialMigration.archive);
        expect(latest.active).toMatchObject({ epoch: initialMigration.active.epoch, roomId: initialMigration.active.roomId });
        expect(latest.active.revision).toBeGreaterThan(initialMigration.active.revision);
        expect(await readMigration(peer)).toEqual(latest);
        await info.attach('migration-lineage', { body: JSON.stringify(latest, null, 2), contentType: 'application/json' });
      }
    } finally { await peer.close(); }
  });
}
