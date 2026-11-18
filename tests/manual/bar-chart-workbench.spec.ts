import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';

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
  await expect(workspace.getByText(/Word stores the chart data in an embedded Excel workbook/).first()).toBeVisible();
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const file = info.outputPath('from-editor.docx');
  await (await pending).saveAs(file);
  const xml = strFromU8(unzipSync(await readFile(file))['word/document.xml']);
  expect(xml).toContain('Change in weekly orders');
  expect(xml).toContain('Tuesday');
  const parts = unzipSync(await readFile(file));
  expect(strFromU8(parts['word/charts/chart1.xml'])).toContain('<c:barChart>');
  const workbook = unzipSync(parts['word/embeddings/chart1.xlsx']);
  expect(strFromU8(workbook['xl/worksheets/sheet1.xml'])).toContain('<c r="B3"><v>-16</v></c>');
  await input.setInputFiles({ name: 'reopened.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await readFile(file) });
  const reopened = page.getByRole('region', { name: 'Conversion workspace: reopened.docx', exact: true })
    .getByRole('textbox', { name: 'Imported document editor' });
  await expect(reopened.locator('[data-fountain-chart-plot]')).toContainText('Tuesday · -16');
  await expect(reopened.locator('table')).toHaveCount(1);
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
    await controls.getByRole('combobox', { name: 'Chart image format' }).selectOption(format);
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

test('changes a signed line chart to a pie, fixes the data, and reopens the saved chart', async ({ page }, info) => {
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: 'Bar chart', exact: true }).click();
  const kind = demo.getByRole('combobox', { name: 'Chart type' });
  const figure = demo.locator('figure[data-fountain-chart]');
  const plot = figure.locator('[data-fountain-chart-plot]');
  await kind.selectOption('line');
  await expect(figure).toHaveAttribute('data-fountain-chart', 'line');
  await expect(plot).toContainText('Tuesday · -4');
  await plot.screenshot({ path: info.outputPath('weekly-line.png') });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(kind).toHaveValue('bar');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(kind).toHaveValue('line');
  await kind.selectOption('pie');
  await expect(plot).toContainText('Pie charts need nonnegative values');
  const cell = figure.locator('tr').nth(2).locator('td p').last();
  await cell.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.insertText('4');
  await expect(plot).toContainText('Tuesday · 4');
  const preview = plot.getByRole('img').locator('div').first();
  await expect(preview).toHaveCSS('background-image', /conic-gradient/);
  await plot.screenshot({ path: info.outputPath('weekly-pie.png') });
  await demo.getByRole('combobox', { name: 'Chart image format' }).selectOption('svg');
  const pending = page.waitForEvent('download');
  await demo.getByRole('button', { name: 'Download chart' }).click();
  const file = info.outputPath('weekly-share.svg');
  await (await pending).saveAs(file);
  expect(await readFile(file, 'utf8')).toContain('A96 96');
  await demo.getByRole('button', { name: 'html', exact: true }).click();
  const html = await demo.locator('pre').filter({ hasText: 'data-fountain-chart-source' }).innerText();
  await page.goto('conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'share.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  const reopened = page.getByRole('textbox', { name: 'Imported document editor' });
  await expect(reopened.locator('figure[data-fountain-chart="pie"] [data-fountain-chart-plot]')).toContainText('Tuesday · 4');
});


test('reopens the chart edited in LibreOffice and preserves its independently edited Word table', async ({ page }, info) => {
  // The browser export started at -16. LibreOffice saved +24 in the plotted series,
  // while the visible Word table and embedded worksheet both retained -16.
  const name = 'weekly-orders-libreoffice.docx';
  await page.goto('conversion-lab.html');
  const input = page.getByLabel('Choose documents');
  await input.setInputFiles('tests/fixtures/native-docx/' + name);
  const workspace = page.getByRole('region', { name: 'Conversion workspace: ' + name, exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const chart = editor.locator('figure[data-fountain-chart="bar"]');
  const plot = chart.locator('[data-fountain-chart-plot]');
  const tableValue = (table: ReturnType<typeof page.locator>) =>
    table.getByRole('row').filter({ hasText: 'Tuesday' }).getByRole('cell').last();
  await expect(plot).toContainText('Tuesday · 24');
  await expect(editor.locator('table')).toHaveCount(2);
  await expect(tableValue(editor.locator('table').first())).toHaveText('-16');
  await chart.screenshot({ path: info.outputPath('reopened-native-chart.png') });
  await tableValue(chart).locator('p').click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.insertText('32');
  await expect(plot).toContainText('Tuesday · 32');
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('docx');
  await workspace.getByRole('button', { name: 'Check round trip', exact: true }).click();
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const path = info.outputPath('fountain-edited.docx');
  await (await pending).saveAs(path);
  await input.setInputFiles(path);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: fountain-edited.docx', exact: true })
    .getByRole('textbox', { name: 'Imported document editor' });
  await expect(reopened.locator('table')).toHaveCount(2);
  await expect(tableValue(reopened.locator('table').first())).toHaveText('-16');
  await expect(reopened.locator('[data-fountain-chart-plot]')).toContainText('Tuesday · 32');
});


async function pasteSpreadsheetAtChartCaret(page: Page) {
  const source = await page.context().newPage();
  await source.setContent('<textarea aria-label="Spreadsheet values"></textarea>');
  await source.getByRole('textbox').fill('"North"\t30\nSouth\t-12');
  await source.keyboard.press('ControlOrMeta+a');
  await source.keyboard.press('ControlOrMeta+c');
  await page.bringToFront();
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: 'Bar chart', exact: true }).click();
  const chart = demo.locator('figure[data-fountain-chart="bar"]');
  const plot = chart.locator('[data-fountain-chart-plot]');
  await chart.getByRole('row').nth(1).getByRole('cell').first().locator('p').click();
  await page.keyboard.press('ControlOrMeta+v');
  await expect(plot).toContainText('North · 30');
  await expect(plot).toContainText('South · -12');
  await expect(plot).toContainText('Wednesday · 8');
  return { chart, plot, source };
}

test('pastes spreadsheet text at the chart caret and undoes the entire grid edit', async ({ page }, info) => {
  const { chart, plot, source } = await pasteSpreadsheetAtChartCaret(page);
  await chart.screenshot({ path: info.outputPath('pasted-spreadsheet-data.png') });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(plot).toContainText('Monday · 12');
  await expect(plot).toContainText('Tuesday · -4');
  await source.close();
});

test('copies the selected chart grid to an independent text editor', async ({ page }) => {
  const { source } = await pasteSpreadsheetAtChartCaret(page);
  await page.keyboard.press('ControlOrMeta+c');
  await source.bringToFront();
  const external = source.getByRole('textbox');
  await external.fill('');
  await external.focus();
  await source.keyboard.press('ControlOrMeta+v');
  // The input quoted North. Plain North proves the new copy crossed the system clipboard.
  await expect(external).toHaveValue('North\t30\nSouth\t-12');
  await source.close();
});
