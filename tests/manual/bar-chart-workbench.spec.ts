import { createServer } from 'node:http';
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

test('keeps positive and negative columns on opposite sides of zero through a Word export', async ({ page }, info) => {
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: 'Bar chart', exact: true }).click();
  await demo.getByRole('combobox', { name: 'Chart type' }).selectOption('column');
  const chart = demo.locator('figure[data-fountain-chart="column"]');
  const plot = chart.locator('[data-fountain-chart-plot]');
  await expect(plot).toContainText('Tuesday · -4');
  await demo.getByText('Chart axes', { exact: true }).click();
  await expect(plot.locator('[data-axis-tick="5"]')).toBeVisible();
  await demo.getByLabel('Category axis').fill('Delivery day');
  await demo.getByLabel('Value axis').fill('Net orders');
  await demo.getByLabel('Minimum', { exact: true }).fill('20');
  await demo.getByLabel('Maximum', { exact: true }).fill('10');
  await demo.getByRole('button', { name: 'Apply range' }).click();
  await expect(chart).not.toHaveAttribute('data-axis-min', '20');
  expect(await demo.getByLabel('Maximum', { exact: true }).evaluate(input => (input as HTMLInputElement).validity.customError)).toBe(true);
  await demo.getByLabel('Minimum', { exact: true }).fill('-20');
  await demo.getByLabel('Maximum', { exact: true }).fill('20');
  await demo.getByLabel('Tick interval').fill('10');
  await demo.getByRole('button', { name: 'Apply range' }).click();
  await expect(plot).toContainText('Value range: -20 to 20');
  await expect(plot.getByText('Delivery day', { exact: true })).toBeVisible();
  await expect(plot.getByText('Net orders', { exact: true })).toBeVisible();
  const graph = plot.getByRole('img').locator('div[dir="ltr"]').first();
  const ticks = graph.locator('[data-axis-tick]');
  await expect(ticks).toHaveText(['-20', '-10', '0', '10', '20']);
  const tickBoxes = await ticks.evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().top));
  expect(tickBoxes[0] - tickBoxes[1]).toBeCloseTo(tickBoxes[2] - tickBoxes[3], 0);
  const geometry = await graph.locator(':scope > span').evaluateAll(elements =>
    elements.map(element => {
      const { x, y, width, height, bottom } = element.getBoundingClientRect();
      return { x, y, width, height, bottom };
    }));
  const [axis, monday, tuesday, wednesday] = geometry;
  const box = await graph.boundingBox();
  expect((axis.y - box!.y) / box!.height).toBeCloseTo(0.5, 1);
  expect(monday.height / box!.height).toBeCloseTo(0.3, 1);
  expect(geometry).toHaveLength(4);
  expect(monday.bottom).toBeCloseTo(axis.y, 0);
  expect(tuesday.y).toBeCloseTo(axis.y, 0);
  expect(wednesday.bottom).toBeCloseTo(axis.y, 0);
  expect(tuesday.x).toBeGreaterThan(monday.x + monday.width);
  expect(monday.height / tuesday.height).toBeCloseTo(3, 1);
  await chart.screenshot({ path: info.outputPath('editor-columns.png') });
  await demo.getByLabel('Chart image format').selectOption('svg');
  const imageDownload = page.waitForEvent('download');
  await demo.getByRole('button', { name: 'Download chart' }).click();
  const svgFile = info.outputPath('axis-ticks.svg');
  await (await imageDownload).saveAs(svgFile);
  const svg = await readFile(svgFile, 'utf8');
  expect([...svg.matchAll(/text-anchor="end">(-?\d+)<\/text>/g)].map(match => match[1]))
    .toEqual(['-20', '-10', '0', '10', '20']);


  await demo.getByRole('button', { name: 'html', exact: true }).click();
  const html = await demo.locator('pre').filter({ hasText: 'data-fountain-chart-source' }).innerText();
  await demo.getByRole('button', { name: 'Use automatic scale' }).click();
  await expect(chart).not.toHaveAttribute('data-axis-min');
  await expect(chart).not.toHaveAttribute('data-axis-max');
  await expect(chart).not.toHaveAttribute('data-axis-interval');
  await expect(graph.locator('[data-axis-tick="5"]')).toBeVisible();
  const autoGeometry = await graph.locator(':scope > span').evaluateAll(markers => markers.map(marker => marker.getBoundingClientRect().height));
  const autoBox = await graph.boundingBox();
  expect(autoGeometry[1] / autoBox!.height).toBeCloseTo(12 / 16, 1);
  expect(autoGeometry[2] / autoBox!.height).toBeCloseTo(4 / 16, 1);
  await chart.screenshot({ path: info.outputPath('weekly-orders-auto.png') });

  await page.goto('conversion-lab.html');
  const input = page.getByLabel('Choose documents');
  await input.setInputFiles({ name: 'orders.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: orders.html', exact: true });
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  await workspace.getByRole('button', { name: 'Check round trip' }).click();
  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const wordFile = info.outputPath('orders.docx');
  await (await download).saveAs(wordFile);
  await input.setInputFiles(wordFile);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: orders.docx', exact: true });
  await expect(reopened.getByRole('textbox', { name: 'Imported document editor' })
    .locator('figure[data-fountain-chart="column"] [data-fountain-chart-plot]')).toContainText('Tuesday · -4');
  const restored = reopened.locator('figure[data-fountain-chart="column"]');
  await expect(restored).toHaveAttribute('data-category-axis-title', 'Delivery day');
  await expect(restored).toHaveAttribute('data-value-axis-title', 'Net orders');
  await expect(restored).toHaveAttribute('data-axis-min', '-20');
  await expect(restored).toHaveAttribute('data-axis-max', '20');
  await expect(restored).toHaveAttribute('data-axis-interval', '10');
  await expect(restored.locator('[data-axis-tick]')).toHaveText(['-20', '-10', '0', '10', '20']);
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
  const workbookDownload = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download chart1.xlsx', exact: true }).click();
  const originalWorkbook = info.outputPath('original-chart1.xlsx');
  await (await workbookDownload).saveAs(originalWorkbook);
  const recovered = await readFile(originalWorkbook);
  const original = unzipSync(await readFile('tests/fixtures/native-docx/' + name));
  expect(recovered.equals(Buffer.from(original['word/embeddings/chart1.xlsx']))).toBe(true);
  expect(strFromU8(unzipSync(recovered)['xl/worksheets/sheet1.xml'])).toContain('<v>-16</v>');
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

test('pastes planned and actual orders and edits both series through a Word round trip', async ({ page }, info) => {
  const sheet = await page.context().newPage();
  await sheet.setContent('<textarea aria-label="Order data"></textarea>');
  await sheet.getByRole('textbox').fill('Week\tPlan\tActual\nFirst\t12\t-4\nSecond\t8\t6\nThird\t15\t17');
  await sheet.keyboard.press('ControlOrMeta+a');
  await sheet.keyboard.press('ControlOrMeta+c');
  await page.bringToFront();
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: 'Bar chart', exact: true }).click();
  const chart = demo.locator('figure[data-fountain-chart]');
  await chart.getByRole('columnheader').first().locator('p').click();
  await page.keyboard.press('ControlOrMeta+v');
  await expect(chart.getByRole('columnheader')).toHaveCount(3);
  await demo.getByRole('combobox', { name: 'Chart type' }).selectOption('column');
  const plot = chart.locator('[data-fountain-chart-plot]');
  await expect(plot).toContainText('Actual');
  await expect(plot).toContainText('Plan');
  const marks = plot.locator('div[dir="ltr"]').first().locator(':scope > span');
  await expect(marks).toHaveCount(7);
  const edit = chart.getByRole('row').nth(1).getByRole('cell').last().locator('p');
  await edit.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.insertText('-9');
  await expect(edit).toHaveText('-9');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(edit).toHaveText('-4');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(edit).toHaveText('-9');
  await chart.screenshot({ path: info.outputPath('plan-and-actual.png') });
  await demo.getByRole('button', { name: 'html', exact: true }).click();
  const html = await demo.locator('pre').filter({ hasText: 'data-fountain-chart-source' }).innerText();
  await page.goto('conversion-lab.html');
  const input = page.getByLabel('Choose documents');
  await input.setInputFiles({ name: 'plan.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: plan.html', exact: true });
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  await workspace.getByRole('button', { name: 'Check round trip' }).click();
  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const file = info.outputPath('plan-versus-actual.docx');
  await (await download).saveAs(file);
  await input.setInputFiles(file);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: plan-versus-actual.docx', exact: true })
    .getByRole('textbox', { name: 'Imported document editor' }).locator('figure[data-fountain-chart="column"]');
  await expect(reopened.getByRole('columnheader')).toHaveText(['Week', 'Plan', 'Actual']);
  await expect(reopened.getByRole('row').nth(1).getByRole('cell')).toHaveText(['First', '12', '-9']);
  await expect(reopened.locator('[data-fountain-chart-plot]')).toContainText('Actual');
  await sheet.close();
});

test('imports a CSV file and refreshes a linked chart from a real HTTP feed', async ({ page }, info) => {
  let hits = 0;
  let csv = 'Region,Plan,Actual\r\n"North, Q1",0012.00,-4\r\nSouth,8,3\r\n';
  const server = createServer((_request, response) => {
    hits++;
    response.writeHead(200, { 'Content-Type': 'text/csv', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    response.end(csv);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing feed port');
    const url = 'http://127.0.0.1:' + address.port + '/orders.csv';
    await page.goto('index.html#playground');
    const demo = page.locator('#playground');
    await demo.getByText('Chart from CSV', { exact: true }).click();
    const input = demo.getByLabel('CSV file', { exact: true });
    await input.setInputFiles({ name: 'Local orders.csv', mimeType: 'text/csv', buffer: Buffer.from('\uFEFF' + csv) });
    const chart = demo.locator('figure[data-fountain-chart]');
    await expect(chart).toHaveCount(1);
    await expect(chart.getByRole('cell', { name: '0012.00' })).toBeVisible();
    await expect(chart.locator('[data-fountain-chart-plot]')).toContainText('North, Q1');
    await input.setInputFiles({ name: 'Bad.csv', mimeType: 'text/csv', buffer: Buffer.from('Region,Value\nA,broken') });
    await expect(demo.getByRole('status', { name: 'CSV import status' })).toContainText('Enter a number');
    await expect(chart).toHaveCount(1);
    expect(hits).toBe(0);
    await demo.getByLabel('CSV source URL').fill(url);
    await demo.getByRole('button', { name: 'Insert linked chart' }).click();
    const linked = demo.locator('figure[data-fountain-csv-url]');
    await expect(linked).toHaveAttribute('data-fountain-csv-url', url);
    expect(hits).toBe(1);
    await linked.locator('td p').first().click();
    csv = csv.replace(',-4', ',-16');
    await demo.getByRole('button', { name: 'Refresh data' }).click();
    await expect(linked.getByRole('cell').getByText('-16', { exact: true })).toBeVisible();
    await expect(linked.locator('[title="Actual · -16"]')).toHaveCount(1);
    await linked.screenshot({ path: info.outputPath('refreshed-csv-chart.png') });
    await linked.locator('td p').first().click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(linked.getByRole('cell').getByText('-4', { exact: true })).toBeVisible();
    await demo.getByRole('button', { name: 'html', exact: true }).click();
    const exported = await demo.locator('pre').filter({ hasText: 'data-fountain-csv-url' }).innerText();
    await page.goto('conversion-lab.html');
    await page.getByLabel('Choose documents').setInputFiles({ name: 'orders.html', mimeType: 'text/html', buffer: Buffer.from(exported) });
    const reopened = page.getByRole('textbox', { name: 'Imported document editor' }).locator('figure[data-fountain-csv-url]');
    await expect(reopened).toHaveAttribute('data-fountain-csv-url', url);
    await expect(reopened.getByRole('cell').getByText('-4', { exact: true })).toBeVisible();
    expect(hits).toBe(2);
  } finally {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  }
});

test('zooms a line chart without connecting the portions outside the visible range', async ({ page }, info) => {
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: 'Bar chart', exact: true }).click();
  await demo.getByRole('combobox', { name: 'Chart type' }).selectOption('line');
  await demo.getByText('Chart axes', { exact: true }).click();
  await demo.getByLabel('Minimum', { exact: true }).fill('0');
  await demo.getByLabel('Maximum', { exact: true }).fill('6');
  await demo.getByRole('button', { name: 'Apply range' }).click();
  const chart = demo.locator('figure[data-fountain-chart="line"]');
  await expect(chart.locator('[data-fountain-chart-plot]')).toContainText('Value range: 0 to 6');
  await expect(chart.locator('td').getByText('-4', { exact: true })).toBeVisible();
  await chart.screenshot({ path: info.outputPath('clipped-lines.png') });
  await demo.getByLabel('Chart image format').selectOption('svg');
  const downloaded = page.waitForEvent('download');
  await demo.getByRole('button', { name: 'Download chart' }).click();
  const file = info.outputPath('zoomed.svg');
  await (await downloaded).saveAs(file);
  const svg = await readFile(file, 'utf8');
  expect(svg.match(/<polyline /g)).toHaveLength(2);
  expect(svg).not.toContain('<circle');
  await demo.getByLabel('Minimum', { exact: true }).fill('');
  await demo.getByLabel('Maximum', { exact: true }).fill('');
  await demo.getByRole('button', { name: 'Apply range' }).click();
  await expect(chart.locator('[data-fountain-chart-plot]')).not.toContainText('Value range:');
  await expect(chart.locator('td').getByText('-4', { exact: true })).toBeVisible();
});

test('reads a horizontal tick ruler on a phone and clears the interval without changing its bounds', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: 'Bar chart', exact: true }).click();
  await demo.getByText('Chart axes', { exact: true }).click();
  await demo.getByLabel('Minimum', { exact: true }).fill('-20');
  await demo.getByLabel('Maximum', { exact: true }).fill('20');
  const interval = demo.getByLabel('Tick interval');
  await interval.fill('0');
  await demo.getByRole('button', { name: 'Apply range' }).click();
  expect(await interval.evaluate(input => (input as HTMLInputElement).validity.customError)).toBe(true);
  await interval.fill('10');
  await demo.getByRole('button', { name: 'Apply range' }).click();
  const chart = demo.locator('figure[data-fountain-chart="bar"]');
  const ticks = chart.locator('[data-axis-tick] small');
  await expect(ticks).toHaveText(['-20', '-10', '0', '10', '20']);
  const boxes = await ticks.evaluateAll(nodes => nodes.map(n => {
    const rect = n.getBoundingClientRect();
    return { left: rect.left, right: rect.right };
  }));
  boxes.forEach((box, i) => { if (i) expect(box.left).toBeGreaterThan(boxes[i - 1].right); });
  await chart.screenshot({ path: info.outputPath('phone-ticks.png') });
  await interval.fill('');
  await demo.getByRole('button', { name: 'Apply range' }).click();
  await expect(ticks).toHaveCount(0);
  await expect(chart).toHaveAttribute('data-axis-min', '-20');
});

test('compares weekly orders with a target and reopens the downloaded Word chart', async ({ page }, info) => {
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: 'Bar chart', exact: true }).click();
  await demo.getByRole('combobox', { name: 'Chart type' }).selectOption('column');
  const chart = demo.locator('figure[data-fountain-chart="column"]');
  await demo.getByText('Target line', { exact: true }).click();
  await demo.getByLabel('Target value').fill('8');
  await demo.getByLabel('Target label').fill('Weekly goal');
  await demo.getByRole('button', { name: 'Apply target' }).click();
  await expect(chart.getByRole('img')).toHaveAccessibleName(/Weekly goal · 8/);
  await expect(chart.locator('[data-chart-target-line]')).toBeVisible();
  const marker = chart.locator('[data-chart-target-line]');
  const fraction = await marker.evaluate(el => {
    const graph = el.parentElement!.getBoundingClientRect();
    return (el.getBoundingClientRect().top - graph.top) / graph.height;
  });
  expect(fraction).toBeCloseTo(0.25, 2);
  await chart.screenshot({ path: info.outputPath('weekly-target.png') });
  await demo.getByRole('button', { name: 'html', exact: true }).click();
  const html = await demo.locator('pre').filter({ hasText: 'data-fountain-chart-source' }).innerText();
  await demo.getByRole('button', { name: 'Remove target' }).click();
  await expect(marker).toHaveCount(0);
  await page.goto('conversion-lab.html');
  const input = page.getByLabel('Choose documents');
  await input.setInputFiles({ name: 'weekly.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: weekly.html', exact: true });
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  await workspace.getByRole('button', { name: 'Check round trip' }).click();
  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const file = info.outputPath('weekly-target.docx');
  await (await download).saveAs(file);
  await input.setInputFiles(file);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: weekly-target.docx', exact: true });
  await expect(reopened.getByRole('textbox', { name: 'Imported document editor' }).locator('[data-chart-target-line]')).toBeVisible();
  await expect(reopened.getByRole('textbox', { name: 'Imported document editor' }).locator('table')).toHaveCount(1);
});

test('pastes a spreadsheet into chart preview, corrects a value and undoes the insertion', async ({ page }, info) => {
  const source = await page.context().newPage();
  await source.setContent('<textarea aria-label="Spreadsheet rows"></textarea>');
  const rows = 'Week\tActual\tForecast\nMonday\t12\t8\nTuesday\tTBD\t8';
  await source.getByRole('textbox').click();
  await source.getByRole('textbox').fill(rows);
  await source.keyboard.press('ControlOrMeta+a');
  await source.keyboard.press('ControlOrMeta+c');
  await page.bringToFront();
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByText('Chart from text', { exact: true }).click();
  const draft = demo.getByLabel('Chart rows');
  await draft.click();
  await page.keyboard.press('ControlOrMeta+v');
  await expect(draft).toHaveValue(rows);
  await demo.getByRole('button', { name: 'Preview chart' }).click();
  await expect(demo.getByText('Enter a number in row 3, column 2 to draw the chart.')).toBeVisible();
  await expect(demo.locator('figure[data-fountain-chart]')).toHaveCount(0);
  await draft.fill(rows.replace('TBD', '-4'));
  await demo.getByLabel('Chart title', { exact: true }).fill('Weekly orders');
  await demo.getByLabel('Default chart type').selectOption('column');
  await demo.getByRole('button', { name: 'Preview chart' }).click();
  const preview = demo.getByRole('region', { name: 'Chart preview' });
  await expect(preview.getByRole('img', { name: 'Weekly orders preview' })).toBeVisible();
  await expect(preview).toContainText('2 categories · 2 series · column');
  await preview.screenshot({ path: info.outputPath('orders-preview.png') });
  await preview.getByRole('button', { name: 'Insert previewed chart' }).click();
  const chart = demo.locator('figure[data-fountain-chart="column"]');
  await expect(chart.getByRole('row').last()).toContainText('-4');
  await chart.screenshot({ path: info.outputPath('orders-inserted.png') });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(chart).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(chart).toBeVisible();
  await source.close();
});

test('previews decimal-comma values as a single series and invalidates stale previews', async ({ page }) => {
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByText('Chart from text', { exact: true }).click();
  await demo.getByLabel('Chart rows').fill('Revenue\n1,5\n-2,5');
  await demo.getByText('Reading options', { exact: true }).click();
  await demo.getByLabel('Column separator').selectOption('lines');
  await demo.getByLabel('Decimal separator').selectOption(',');
  await demo.getByRole('button', { name: 'Preview chart' }).click();
  const preview = demo.getByRole('region', { name: 'Chart preview' });
  await expect(preview).toContainText('2 categories · 1 series');
  await demo.getByLabel('Chart title', { exact: true }).fill('Net revenue');
  await expect(preview).toHaveCount(0);
  await demo.getByRole('button', { name: 'Preview chart' }).click();
  await preview.getByRole('button', { name: 'Insert previewed chart' }).click();
  const rows = demo.locator('figure[data-fountain-chart="bar"] tr');
  await expect(rows.nth(1).getByRole('cell').last()).toHaveText('1.5');
  await expect(rows.nth(2).getByRole('cell').last()).toHaveText('-2.5');
});

test('reopens the weekly chart as text, previews the edits and restores the original in one undo', async ({ page }, info) => {
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: 'Bar chart', exact: true }).click();
  await demo.getByText('Target line', { exact: true }).click();
  await demo.getByLabel('Target value').fill('8');
  await demo.getByLabel('Target label').fill('Weekly goal');
  await demo.getByRole('button', { name: 'Apply target' }).click();
  await demo.getByText('Edit chart as text', { exact: true }).click();
  const source = demo.getByRole('textbox', { name: 'Chart source' });
  await expect(source).toHaveValue(/Monday,12/);
  const before = await source.inputValue();
  await source.fill(before.replace('Tuesday,-4', 'Tuesday,TBD'));
  await demo.getByRole('button', { name: 'Preview changes' }).click();
  await expect(demo.getByText(/Enter a number in row 3 to draw the chart/)).toBeVisible();
  const updated = before.replace(/^bar/, 'column').replace('Tuesday,-4', 'Tuesday,-6').replace('Wednesday,8', 'Wednesday,10');
  await source.fill(updated);
  await demo.getByRole('button', { name: 'Preview changes' }).click();
  const preview = demo.getByRole('region', { name: 'Edited chart preview' });
  await expect(preview.getByRole('img')).toBeVisible();
  await expect(demo.locator('figure[data-fountain-chart="bar"]')).toBeVisible();
  await preview.screenshot({ path: info.outputPath('source-preview.png') });
  await demo.getByRole('button', { name: 'Apply chart changes' }).click();
  const chart = demo.locator('figure[data-fountain-chart="column"]');
  await expect(chart.getByRole('img')).toHaveAccessibleName(/Weekly goal · 8/);
  await expect(chart.locator('tr').nth(2)).toContainText('-6');
  await expect(chart.locator('tr').last()).toContainText('10');
  await chart.screenshot({ path: info.outputPath('source-applied.png') });
  await page.keyboard.press('ControlOrMeta+z');
  const restored = demo.locator('figure[data-fountain-chart="bar"]');
  await expect(restored.locator('tr').nth(2)).toContainText('-4');
  await expect(restored.locator('tr').last()).toContainText('8');
  await demo.getByText('Edit chart as text', { exact: true }).click();
  await expect(source).toHaveValue(before);
  await source.fill(updated);
  await demo.getByLabel('Target value').fill('11');
  await demo.getByRole('button', { name: 'Apply target' }).click();
  await expect(demo.getByRole('button', { name: 'Preview changes' })).toBeDisabled();
  await expect(source).toHaveValue(updated);
  await demo.getByRole('button', { name: 'Reopen selected chart' }).click();
  await expect(source).toHaveValue(before);
  await demo.getByRole('button', { name: 'Cancel edit' }).click();
  await expect(restored.getByRole('img')).toHaveAccessibleName(/Weekly goal · 11/);
});
