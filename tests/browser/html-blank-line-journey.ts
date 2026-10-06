import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo } from '@playwright/test';

export async function htmlBlankLineJourney(page: Page, info: TestInfo) {
  await page.setViewportSize({ width: 1280, height: 1200 });
  await page.goto('/demos/node-markdown.html#inert-source');
  const workshop = page.getByRole('region', { name: 'Inert HTML preservation workshop' });
  const editor = workshop.getByRole('textbox', { name: 'Inert HTML source editor', exact: true });
  const json = workshop.getByLabel('Inert native document JSON');
  const empty = (layout: Record<string, unknown>) => `<p data-fountain-empty="block" data-fountain-paragraph-layout="${JSON.stringify({ unit: 'pt', ...layout }).replaceAll('"', '&quot;')}"></p>`;
  const source = '<warning><h2>Keep the blank lines</h2><p>Before three blank lines.</p>'
    + empty({ fontFamily: 'Arial', fontSize: 18, lineHeight: 1.5, lineHeightUnit: 'multiple', lineHeightRule: 'auto' })
    + '<p></p><p><strong></strong></p><p>After three blank lines.</p><blockquote>'
    + empty({ fontSize: 24, lineHeight: 2, lineHeightUnit: 'multiple', lineHeightRule: 'auto' })
    + '<p>Quote after its blank line.</p></blockquote><table><tr><td>'
    + empty({ fontSize: 12, lineHeight: 10, lineHeightUnit: 'pt', lineHeightRule: 'exact' })
    + '<p>Cell after its blank line.</p></td></tr></table></warning>';
  await workshop.getByLabel('Inert input format').selectOption('HTML');
  await workshop.getByLabel('Inert source input', { exact: true }).fill(source);
  await workshop.getByRole('button', { name: 'Import inert source', exact: true }).click();
  const before = JSON.parse(await json.inputValue());
  expect(before.content[0].content[4].content[0].marks).toEqual([{ type: 'strong' }]);
  for (const format of ['HTML', 'Markdown', 'JSON']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    expect(JSON.parse(await json.inputValue())).toEqual(before);
    await expect(workshop.getByRole('status')).toContainText(`${format}: Complete native JSON retained.`);
  }
  const reader = workshop.frameLocator('iframe[title="Inert source reader"]');
  const measure = (elements: Element[]) => elements.filter(element => element.textContent === '').map(element => {
    const box = element.getBoundingClientRect();
    return { height: box.height, top: box.top, bottom: box.bottom,
      lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
      fontSize: getComputedStyle(element).fontSize,
      marked: Boolean(element.querySelector('strong')) };
  });
  const editorMetrics = await editor.locator('p').evaluateAll(measure);
  const readerMetrics = await reader.locator('p').evaluateAll(measure);
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: info.outputPath('blank-lines-editor.png') });
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('h2').scrollIntoViewIfNeeded();
  await workshop.locator('iframe').screenshot({ path: info.outputPath('blank-lines-reader-top.png') });
  await reader.locator('table').scrollIntoViewIfNeeded();
  await workshop.locator('iframe').screenshot({ path: info.outputPath('blank-lines-reader-table.png') });
  const downloadPromise = page.waitForEvent('download');
  await workshop.getByRole('button', { name: 'Download standalone HTML', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('fountain-inert-document.html');
  const filePath = info.outputPath('blank-lines.html');
  await download.saveAs(filePath);
  const standalone = await page.context().newPage();
  try {
    await standalone.goto(pathToFileURL(filePath).href);
    await expect(standalone.getByRole('heading', { name: 'Keep the blank lines', exact: true })).toBeVisible();
    const fileMetrics = await standalone.locator('p').evaluateAll(measure);
    await standalone.screenshot({ path: info.outputPath('blank-lines-standalone.png'), fullPage: true });
    const geometry = JSON.stringify({ editorMetrics, readerMetrics, fileMetrics }, null, 2);
    await writeFile(info.outputPath('blank-line-geometry.json'), geometry);
    await info.attach('blank-line-geometry', { body: geometry, contentType: 'application/json' });
    for (const [name, metrics] of [['editor', editorMetrics], ['reader', readerMetrics], ['standalone file', fileMetrics]] as const) {
      expect(metrics, `${name} must retain all six blank paragraphs`).toHaveLength(6);
      for (const metric of metrics) {
        expect(Number.isFinite(metric.lineHeight), `${name} computed line height`).toBe(true);
        expect(metric.height, `${name} blank paragraph at ${metric.fontSize}`).toBeGreaterThanOrEqual(metric.lineHeight - 0.5);
      }
      expect(metrics[0].height, `${name} first blank has a 36px line`).toBeCloseTo(36, 0);
      expect(metrics[3].height, `${name} quoted blank has a 64px line`).toBeCloseTo(64, 0);
      expect(metrics[4].height, `${name} cell has a 10pt exact blank line`).toBeCloseTo(40 / 3, 0);
      for (const index of [1, 2]) expect(metrics[index].top, `${name} consecutive blank lines cannot overlap`).toBeGreaterThanOrEqual(metrics[index - 1].bottom - 0.5);
    }
  } finally { await standalone.close(); }
}
