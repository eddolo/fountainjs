import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

export async function docxControlsJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/browser-tests.html');
  const result = await page.evaluate(() => (globalThis as any).fountainBrowserTest.docxVisual.controls());
  const fixture = info.outputPath('word-controls.docx');
  await writeFile(fixture, Buffer.from(result.bytes));
  const root = page.locator('#docx-controls-audit');
  const word = root.locator('[data-word]');
  const editor = root.getByRole('textbox', { name: 'Imported control content', exact: true });
  for (const text of ['Operational handover', 'Owner Ada', 'Build the release', 'Verify the output', 'API gateway', 'Ready for review', 'Record the outcome after review.']) {
    await expect(editor).toContainText(text);
    if (!['API gateway', 'Ready for review'].includes(text)) await expect(word).toContainText(text);
  }
  // docx-preview 0.4.0 drops SDTs in table cells. Keep the original bytes and
  // record that limitation; do not normalize its input to hide the discrepancy.
  await expect(word).not.toContainText('API gateway');
  await expect(root.locator('[data-viewer-issues]')).toContainText('omitted table-cell control content: API gateway; Ready for review');
  await expect(editor.locator('ol')).toHaveAttribute('start', '4');
  await expect(editor.locator('li')).toHaveCount(2);
  await expect(editor.locator('table')).toHaveCount(1);
  expect(result.issues).toHaveLength(5);
  expect(result.issues.every((issue: {code: string}) => issue.code === 'content-control-unwrapped')).toBe(true);
  await root.screenshot({ path: info.outputPath('original-word-and-fountain.png') });
  await editor.getByText('Ready for review', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' today');
  await expect(editor).toContainText('Ready for review today');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('Ready for review today');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(editor).toContainText('Ready for review today');
  await editor.screenshot({ path: info.outputPath('edited-control-content.png') });
  const download = page.waitForEvent('download');
  await root.getByRole('button', { name: 'Download edited DOCX' }).click();
  const edited = info.outputPath('edited-handover.docx');
  await (await download).saveAs(edited);
  await page.goto('/demos/node-markdown.html');
  await page.getByRole('button', { name: 'Word DOCX', exact: true }).click();
  await page.getByLabel('Import Word DOCX', { exact: true }).setInputFiles(fixture);
  const output = page.locator('.demo-output');
  await expect(output).toContainText('API gateway');
  const details = page.getByRole('list', { name: 'Word DOCX conversion details' });
  await expect(details).toContainText('without its control identity, form behavior, locks or data bindings');
  await page.screenshot({ path: info.outputPath('word-conversion-warning.png'), fullPage: true });
  await page.getByLabel('Import Word DOCX', { exact: true }).setInputFiles(edited);
  await expect(output).toContainText('Ready for review today');
  await expect(details).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('reopened-word-content.png'), fullPage: true });
  expect(errors).toEqual([]);
}
