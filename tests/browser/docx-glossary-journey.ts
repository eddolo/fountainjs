import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

export async function docxGlossaryJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/browser-tests.html');
  const result = await page.evaluate(() => (globalThis as any).fountainBrowserTest.docxVisual.glossary());
  await writeFile(info.outputPath('service-glossary.docx'), Buffer.from(result.bytes));
  const root = page.locator('#docx-glossary-audit');
  const editor = root.getByRole('textbox', { name: 'Glossary export source', exact: true });
  const word = root.locator('[data-word]');
  for (const text of ['Service glossary', 'Latency', 'Response time', 'Measured in milliseconds.', 'Sample requests', 'Record results', 'Throughput', 'Peak throughput', 'Highest sustained rate.']) {
    await expect(editor).toContainText(text);
    await expect(word).toContainText(text);
  }
  await expect(editor.locator('dl')).toHaveCount(2);
  await expect(editor.locator('dt')).toHaveCount(4);
  await expect(editor.locator('ol')).toHaveAttribute('start', '4');
  const term = word.getByText('Latency', { exact: true });
  const description = word.getByText('Time to respond.', { exact: true });
  const positions = await Promise.all([term.boundingBox(), description.boundingBox()]);
  expect(positions[1]!.x).toBeGreaterThan(positions[0]!.x + 15);
  const bold = await term.evaluate(element => getComputedStyle(element).fontWeight);
  expect(Number(bold)).toBeGreaterThanOrEqual(600);
  await root.screenshot({ path: info.outputPath('editor-and-word-glossary.png') });
  await editor.getByText('Time to respond.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Report the median.');
  await expect(editor).toContainText('Time to respond. Report the median.');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('Report the median.');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(editor).toContainText('Report the median.');
  const download = page.waitForEvent('download');
  await root.getByRole('button', { name: 'Download edited glossary' }).click();
  const file = info.outputPath('edited-glossary.docx');
  await (await download).saveAs(file);
  await page.goto('/demos/node-markdown.html');
  await page.getByRole('button', { name: 'Word DOCX', exact: true }).click();
  await page.getByLabel('Import Word DOCX', { exact: true }).setInputFiles(file);
  const output = page.locator('.demo-output');
  await expect(output).toContainText('Report the median.');
  await expect(output).toContainText('definition_list');
  await expect(output).toContainText('definition_term');
  await expect(output).toContainText('definition_description');
  await expect(page.getByRole('list', { name: 'Word DOCX conversion details' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('reopened-glossary-roles.png'), fullPage: true });
  const publicDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download as Word DOCX', exact: true }).click();
  await (await publicDownload).saveAs(info.outputPath('public-glossary.docx'));
  await expect(page.getByRole('status')).toContainText('Native Word layout and retention after third-party saves are not yet certified.');
  await page.screenshot({ path: info.outputPath('public-export-warning.png'), fullPage: true });
  expect(errors).toEqual([]);
}
