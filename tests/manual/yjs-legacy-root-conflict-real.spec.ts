import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { auditCompiledRuntime } from './compiled-runtime-audit';

const build = '/artifacts/cross-format-build-20261107';
auditCompiledRuntime(`${build}/engine.js`, `${build}/legacy-adapter.js`);

async function append(page: Page, author: string, text: string) {
  const editor = page.getByRole('textbox', { name: author + ' editor', exact: true });
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(text);
  await expect(editor).toContainText(text.trim());
}

interface ConflictAudit {
  wire(): number[][];
  inspect(bytes: number[]): string[];
}

const wire = (page: Page) => page.evaluate(() => (window as unknown as { audit: ConflictAudit }).audit.wire());

test('keeps both independent drafts and exports their exact shared roots after conflict', async ({ page }, info) => {
  await page.goto('/artifacts/yjs-legacy-root-conflict-20261107.html');
  await append(page, 'Ada', ' Notes from Ada.');
  await append(page, 'Grace', ' Notes from Grace.');
  await page.getByRole('button', { name: 'Exchange offline edits' }).click();
  await expect(page.getByRole('status')).toContainText('2 shared roots preserved');
  await expect(page.locator('#ada-status')).toContainText('conflicting initial roots');
  await expect(page.locator('#grace-status')).toContainText('conflicting initial roots');
  const [left, right] = await wire(page);
  expect(left).toEqual(right);
  await append(page, 'Grace', ' Still in my local draft.');
  await expect(page.getByRole('textbox', { name: 'Ada editor', exact: true })).toHaveText('Common template. Notes from Ada.');
  expect(await wire(page)).toEqual([left, right]);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download shared roots' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('conflicting-room.yjs');
  const path = await download.path();
  if (!path) throw new Error('Missing browser download.');
  const bytes = [...await readFile(path)];
  expect(bytes).toEqual(left);
  const roots = await page.evaluate(bytes => (window as unknown as { audit: ConflictAudit }).audit.inspect(bytes), bytes);
  expect(roots).toHaveLength(2);
  expect(roots).toEqual(expect.arrayContaining([expect.stringContaining('Notes from Ada.'), expect.stringContaining('Notes from Grace.')]));
  expect(roots.join('')).not.toContain('Still in my local draft.');
  await page.screenshot({ path: info.outputPath('conflicting-drafts.png'), scale: 'css' });
});
