import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { auditCompiledRuntime } from './compiled-runtime-audit';

auditCompiledRuntime('/artifacts/yjs-retained-provision-build-20261107/engine.js', '/artifacts/yjs-retained-provision-build-20261107/adapter.js');
const errors = new WeakMap<Page, string[]>();
type RoomState = {
  revision: number;
  roomId: string;
  epoch: string;
  phase: 'active' | 'frozen';
  server: unknown;
  provisioning: { loads: number; attempts: string[] };
  peers: Record<'left' | 'right', { starts: number; model: unknown; lease: { identity: string; epoch: string } }>;
};
const state = (page: Page): Promise<RoomState> => page.evaluate(() => (window as unknown as { audit: { snapshot(): Promise<RoomState> } }).audit.snapshot());
const click = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
const status = (page: Page, side: 'left' | 'right') => page.locator('#' + side + ' pre').first();
const capture = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: info.outputPath(name) });

test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', error => list.push(error.message));
  await page.goto('/artifacts/yjs-retained-provision-fixture-20261107.html');
  await expect(page.getByRole('status')).toContainText('Ready');
  await expect(page.locator('#server pre')).toHaveText('Room awaiting first join');
});

test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed') {
    expect(errors.get(page)).toEqual([]);
    const current = await state(page);
    await info.attach('saved-room', { body: JSON.stringify(current, null, 2), contentType: 'application/json' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
    await page.evaluate(() => (window as unknown as { audit: { close(): Promise<void> } }).audit.close());
  }
});

async function joinBoth(page: Page) {
  await click(page, 'Join both authors');
  await expect(status(page, 'left')).toContainText('Status: connected');
  await expect(status(page, 'right')).toContainText('Status: connected');
  await expect(page.getByRole('status')).toHaveText('Both authors connected to the saved room');
  const opened = await state(page);
  expect(opened.revision).toBe(0);
  expect(opened.provisioning.loads).toBe(2);
  expect(new Set(opened.provisioning.attempts).size).toBe(2);
  expect(opened.provisioning.attempts).toContain(opened.roomId);
  for (const peer of Object.values(opened.peers)) {
    expect(peer.lease).toMatchObject({ identity: opened.roomId, epoch: opened.epoch });
    expect(peer.model).toEqual(opened.server);
    expect(peer.starts).toBe(1);
  }
  return opened;
}

async function append(page: Page, side: 'left' | 'right', text: string, suffix: string) {
  await page.locator('#' + side).getByText(text, { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(suffix);
}

test('two first joins share one room and reopen both authors’ saved work', async ({ page }, info) => {
  const opened = await joinBoth(page);
  await capture(page, info, 'joined.png');
  await append(page, 'left', 'Created from the server template.', ' Ada added a summary.');
  await append(page, 'right', 'Shared research brief', ' — reviewed by Grace');
  await click(page, 'Save left edits');
  await expect(page.locator('#server')).toContainText('Ada added a summary.');
  await click(page, 'Save right edits');
  await expect(page.locator('#server')).toContainText('reviewed by Grace');
  await click(page, 'Refresh left');
  await expect(page.locator('#left')).toContainText('reviewed by Grace');
  await click(page, 'Retry right join');
  await expect(status(page, 'right')).toContainText('Status: reconnecting');
  await click(page, 'Complete right join');
  await expect(status(page, 'right')).toContainText('Status: connected');
  await expect(page.locator('#right')).toContainText('Ada added a summary.');
  const saved = await state(page);
  expect(saved.revision).toBe(2);
  expect(saved.roomId).toBe(opened.roomId);
  expect(saved.epoch).toBe(opened.epoch);
  expect(saved.provisioning).toEqual(opened.provisioning);
  expect(saved.peers.right.starts).toBe(2);
  expect(saved.peers.left.model).toEqual(saved.server);
  expect(saved.peers.right.model).toEqual(saved.server);
  await expect(page.locator('#server img')).toBeVisible();
  expect(await page.locator('#server img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await capture(page, info, 'saved.png');
});

test('retrying a frozen room preserves the first room and resumes after unfreeze', async ({ page }, info) => {
  const opened = await joinBoth(page);
  await click(page, 'Freeze server');
  await expect(page.getByRole('status')).toContainText('freeze completed');
  await click(page, 'Retry right join');
  await click(page, 'Complete right join');
  await expect(status(page, 'right')).toContainText('Existing room is frozen');
  const frozen = await state(page);
  expect(frozen.phase).toBe('frozen');
  expect(frozen.revision).toBe(opened.revision);
  expect(frozen.roomId).toBe(opened.roomId);
  expect(frozen.provisioning).toEqual(opened.provisioning);
  expect(frozen.peers.right.starts).toBe(1);
  expect(frozen.peers.right.model).toEqual(opened.server);
  await capture(page, info, 'frozen.png');
  await click(page, 'Unfreeze server');
  await expect(page.getByRole('status')).toContainText('abort completed');
  await click(page, 'Retry right join');
  await click(page, 'Complete right join');
  await expect(status(page, 'right')).toContainText('Status: connected');
  const resumed = await state(page);
  await expect(page.getByRole('status')).toHaveText('Both authors connected to the saved room');
  expect(resumed.phase).toBe('active');
  expect(resumed.provisioning).toEqual(opened.provisioning);
  expect(resumed.epoch).toBe(opened.epoch);
  expect(resumed.roomId).toBe(opened.roomId);
  expect(resumed.peers.right.starts).toBe(2);
  expect(resumed.peers.right.model).toEqual(opened.server);
  await capture(page, info, 'resumed.png');
});
