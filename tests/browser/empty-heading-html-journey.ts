import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

export async function emptyHeadingHTMLJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'empty-heading.md', mimeType: 'text/markdown',
    buffer: Buffer.from('##\n\nKeep this sibling.\n') });
  const original = page.getByRole('region', { name: 'Conversion workspace: empty-heading.md', exact: true });
  const firstEditor = original.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(firstEditor.locator('h2')).toHaveText('');
  await expect(firstEditor.locator('p').first()).toHaveText('Keep this sibling.');
  await original.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('html');
  await original.getByRole('button', { name: 'Check round trip', exact: true }).click();
  await expect(original.getByLabel('Round-trip result', { exact: true }))
    .toContainText('Exact Fountain document equality after reopening.');
  const downloadEvent = page.waitForEvent('download');
  await original.getByRole('button', { name: 'Download export', exact: true }).click();
  const download = await downloadEvent;
  const path = info.outputPath('empty-heading.html');
  await download.saveAs(path);
  const html = await readFile(path, 'utf8');
  expect(html).toContain('<h2 data-fountain-empty="text"');
  // Inspect the downloaded HTML with the browser's own renderer as well as
  // Fountain's reader. The empty source has no visible title in either view.
  const native = await page.context().newPage();
  try {
    await native.setContent(html);
    await expect(native.locator('h2')).toHaveText('');
    await expect(native.locator('p')).toHaveText('Keep this sibling.');
    await native.screenshot({ path: info.outputPath('native-empty-heading-export.png') });
  } finally { await native.close(); }
  // Reopen the actual downloaded bytes through the public file picker.
  await page.getByLabel('Choose documents').setInputFiles({ name: 'reopened.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: reopened.html', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const heading = editor.locator('h2');
  await expect(heading).toHaveText('');
  const box = await heading.boundingBox();
  expect(box!.height).toBeGreaterThan(20);
  await heading.click();
  await page.keyboard.type('Review title.');
  await expect(heading).toHaveText('Review title.');
  await expect(editor.locator('h2')).toHaveCount(1);
  await expect(editor.locator('p')).toHaveCount(1);
  await expect(editor.locator('p')).toHaveText('Keep this sibling.');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(heading).toHaveText('');
  await workspace.getByRole('button', { name: 'Check round trip', exact: true }).click();
  await expect(workspace.getByLabel('Round-trip result', { exact: true }))
    .toContainText('Exact Fountain document equality after reopening.');
  await editor.screenshot({ path: info.outputPath('empty-heading-after-undo.png') });
  await heading.click();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(heading).toHaveText('Review title.');
  await workspace.getByRole('button', { name: 'Check round trip', exact: true }).click();
  await expect(workspace.getByLabel('Round-trip result', { exact: true }))
    .toContainText('Exact Fountain document equality after reopening.');
  await expect(workspace.getByRole('textbox', { name: 'Reopened export preview' }).locator('h2')).toHaveText('Review title.');
  await editor.screenshot({ path: info.outputPath('empty-heading-filled.png') });
  expect(errors).toEqual([]);
  await writeFile(info.outputPath('empty-heading-observations.json'), JSON.stringify({
    workflow: 'Markdown file -> HTML round-trip check -> actual HTML download -> file-picker reopen -> native typing/undo/redo',
    emptyHeadingHeight: box!.height, preservedSibling: true, exactRoundTrips: 3, nativeHTMLReaderChecked: true, errors,
  }, null, 2) + '\n');
}
