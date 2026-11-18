import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { expect, test } from '@playwright/test';

test('edits chart data in the public editor and exports the same data and plot', async ({ page }, info) => {
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: 'Bar chart', exact: true }).click();
  const chart = demo.locator('figure[data-fountain-chart="bar"]');
  const plot = chart.locator('[data-fountain-chart-plot]');
  await expect(plot).toContainText('Tuesday · -4');
  const value = chart.getByRole('row').nth(2).getByRole('cell').nth(1).locator('p');
  await value.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.insertText('-16');
  await expect(plot).toContainText('Tuesday · -16');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(plot).toContainText('Tuesday · -4');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(plot).toContainText('Tuesday · -16');
  await demo.getByRole('button', { name: 'html', exact: true }).click();
  await expect(demo.locator('pre').filter({ hasText: 'data-fountain-chart-source' })).toContainText('Tuesday · -16');
  await chart.screenshot({ path: info.outputPath('edited-bar-chart.png') });
  const exported = await demo.locator('pre').filter({ hasText: 'data-fountain-chart-source' }).innerText();
  await page.goto('conversion-lab.html');
  const input = page.getByLabel('Choose documents');
  await input.setInputFiles({ name: 'review.html', mimeType: 'text/html', buffer: Buffer.from(exported) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: review.html', exact: true });
  const imported = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(imported.locator('[data-fountain-chart-plot]')).toContainText('Tuesday · -16');
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('docx');
  await workspace.getByRole('button', { name: 'Check round trip', exact: true }).click();
  await expect(workspace.getByText(/The chart title and data are exported as editable Word content/).first()).toBeVisible();
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const file = info.outputPath('from-editor.docx');
  await (await pending).saveAs(file);
  const xml = strFromU8(unzipSync(await readFile(file))['word/document.xml']);
  expect(xml).toContain('Change in weekly orders');
  expect(xml).toContain('Tuesday');
  await input.setInputFiles({ name: 'reopened.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await readFile(file) });
  const reopened = page.getByRole('region', { name: 'Conversion workspace: reopened.docx', exact: true })
    .getByRole('textbox', { name: 'Imported document editor' });
  await expect(reopened.getByRole('row').filter({ hasText: 'Tuesday' }).getByRole('cell').last()).toHaveText('-16');
});

test('plots an existing editable table, updates a value, and returns to the table', async ({ page }, info) => {
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: '▦ Table', exact: true }).click();
  const table = demo.locator('[contenteditable=true] table').last();
  const cells = table.locator('tr').filter({ has: page.locator('td') }).locator('td p');
  for (const [index, value] of ['Apples', '12', 'Pears', '9'].entries()) {
    await cells.nth(index).click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.insertText(value);
  }
  await demo.getByRole('button', { name: 'Chart this table' }).click();
  const plot = demo.locator('[data-fountain-chart-plot]');
  await expect(plot).toContainText('Apples · 12');
  await expect(plot).toContainText('Pears · 9');
  await page.keyboard.press('End');
  await page.keyboard.insertText('0');
  await expect(plot).toContainText('Pears · 90');
  await plot.screenshot({ path: info.outputPath('plotted-table.png') });
  await demo.getByRole('button', { name: 'Keep as table' }).click();
  await expect(plot).toHaveCount(0);
  await expect(cells.last()).toHaveText('90');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(plot).toContainText('Pears · 90');
});
