import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { auditCompiledRuntime } from './compiled-runtime-audit';

auditCompiledRuntime('/dist/index.js', '/dist/yjs.js');

test('keeps and downloads detached edits before deliberately rejoining a changed room', async ({ page }, info) => {
  await page.goto('/tests/fixtures/yjs-detached-draft.html');
  const ada = page.getByRole('textbox', { name: 'Ada’s editor' });
  const grace = page.getByRole('textbox', { name: 'Grace’s editor' });
  const status = page.getByRole('status');
  await expect(status).toHaveText('Both editors are sharing changes.');
  await page.getByRole('button', { name: 'Disconnect Ada' }).click();
  await expect(status).toHaveText('Ada is editing a private draft.');

  await ada.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Private finding.');
  await grace.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Confirmed by Grace.');
  await expect(ada).toHaveText('Shared incident notes. Private finding.');
  await expect(grace).toHaveText('Shared incident notes. Confirmed by Grace.');

  const rejoin = page.getByRole('button', { name: 'Rejoin room' });
  await rejoin.click();
  await expect(status).toContainText('Unresolved local draft');
  await expect(ada).toHaveText('Shared incident notes. Private finding.');
  await expect(page.getByText('Ada’s transport starts: 1')).toBeVisible();
  const downloadPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Ada’s draft' }).click();
  const download = await downloadPending;
  const savedPath = info.outputPath(download.suggestedFilename());
  await download.saveAs(savedPath);
  const saved = JSON.parse(await readFile(savedPath, 'utf8'));
  expect(saved.content[0].content[0].text).toBe('Shared incident notes. Private finding.');
  await page.screenshot({ path: info.outputPath('detached-draft.png'), fullPage: true });

  await page.getByRole('button', { name: 'Use Grace’s shared version' }).click();
  await expect(status).toHaveText('Both editors are sharing changes.');
  await expect(page.getByText('Ada’s transport starts: 2')).toBeVisible();
  await expect(ada).toHaveText('Shared incident notes. Confirmed by Grace.');
  await ada.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Ready to publish.');
  await expect(grace).toHaveText('Shared incident notes. Confirmed by Grace. Ready to publish.');
  await page.screenshot({ path: info.outputPath('rejoined-room.png'), fullPage: true });
});
