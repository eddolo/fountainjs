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

test('downloads chart images with the edited labels and signed bars', async ({ page }, info) => {
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: 'Bar chart', exact: true }).click();
  const value = demo.locator('[data-fountain-chart-source] tr').nth(2).locator('td p').last();
  await value.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.insertText('-24');
  const controls = demo.getByRole('group', { name: 'Chart export' });
  for (const format of ['svg', 'png', 'jpeg', 'webp']) {
    await controls.getByRole('combobox').selectOption(format);
    const supported = format !== 'webp' || await page.evaluate(() =>
      document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'));
    if (!supported) {
      await controls.getByRole('button').click();
      await expect(controls.getByRole('status')).toContainText('cannot export WEBP');
      continue;
    }
    const pending = page.waitForEvent('download');
    await controls.getByRole('button').click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('chart.' + format);
    const path = info.outputPath(download.suggestedFilename());
    await download.saveAs(path);
    const file = await readFile(path);
    if (format === 'svg') expect(file.toString()).toContain('Tuesday · -24');
    if (format === 'png') expect(file.subarray(1, 4).toString()).toBe('PNG');
    if (format === 'jpeg') expect(file.readUInt16BE(0)).toBe(0xffd8);
    if (format === 'webp') expect(file.subarray(8, 12).toString()).toBe('WEBP');
    const colors = await page.evaluate(async data => {
      const img = new Image();
      img.src = data;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return [[120, 85], [700, 85], [120, 136], [700, 136]].map(([x,y]) => ctx.getImageData(x, y, 1, 1).data[0]);
    }, 'data:image/' + (format === 'svg' ? 'svg+xml' : format) + ';base64,' + file.toString('base64'));
    // Monday's positive bar is right of zero and Tuesday's negative bar is left.
    expect(colors[0]).toBeGreaterThan(210);
    expect(colors[1]).toBeLessThan(105);
    expect(colors[2]).toBeLessThan(105);
    expect(colors[3]).toBeGreaterThan(210);
  }
});
