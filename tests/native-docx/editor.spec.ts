import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('edits the independent scientific Word source and downloads the native audit export', async ({ page }) => {
  const root = resolve('artifacts/docx-native-audit');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles(resolve(root, 'source.docx'));
  const workspace = page.getByRole('region', { name: 'Conversion workspace: source.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(editor).toContainText('Cooling experiment report');
  await expect(editor.locator('img')).toHaveCount(3);
  await expect(editor.locator('[data-fountain-math]')).toHaveCount(2);
  await expect.poll(() => editor.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await editor.screenshot({ path: resolve(root, 'editor-top.png') });
  for (let index = 0; index < 3; index++) {
    await editor.locator('img').nth(index).scrollIntoViewIfNeeded();
    await editor.screenshot({ path: resolve(root, `editor-image-${index + 1}.png`) });
  }
  for (let index = 0; index < 2; index++) {
    await editor.locator('[data-fountain-math]').nth(index).scrollIntoViewIfNeeded();
    await editor.screenshot({ path: resolve(root, `editor-equation-${index + 1}.png`) });
  }
  await editor.locator('table').scrollIntoViewIfNeeded();
  await editor.screenshot({ path: resolve(root, 'editor-table.png') });
  const ending = editor.locator('p').filter({ hasText: 'END OF REPORT' });
  await ending.click(); await page.keyboard.press('End'); await page.keyboard.type(' Checked in Fountain.');
  await expect(ending).toHaveText('END OF REPORT Checked in Fountain.');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(ending).toHaveText('END OF REPORT');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(ending).toHaveText('END OF REPORT Checked in Fountain.');
  await editor.screenshot({ path: resolve(root, 'editor-edited-ending.png') });
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('docx');
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  await (await pending).saveAs(resolve(root, 'exported.docx'));
  const reportPending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download diagnostic report', exact: true }).click();
  await (await reportPending).saveAs(resolve(root, 'conversion-report.json'));
  await page.getByLabel('Choose documents').setInputFiles(resolve(root, 'exported.docx'));
  const reopened = page.getByRole('region', { name: 'Conversion workspace: exported.docx', exact: true })
    .getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(reopened).toContainText('END OF REPORT Checked in Fountain.');
  await expect(reopened.locator('img')).toHaveCount(3);
  await expect(reopened.locator('[data-fountain-math]')).toHaveCount(2);
  await reopened.screenshot({ path: resolve(root, 'editor-reopened.png') });
  expect(errors).toEqual([]);
  const diagnostic = JSON.parse(await readFile(resolve(root, 'conversion-report.json'), 'utf8'));
  await writeFile(resolve(root, 'browser-observations.json'), JSON.stringify({
    actualDownload: true, typingUndoRedo: true, actualReopen: true, images: 3, math: 2,
    roundTripEqual: diagnostic.roundTrip.exactFountainJSONEquality,
    conversionIssues: diagnostic.roundTrip.issues, errors,
    nativeRenderingVerified: false,
  }, null, 2) + '\n');
});
