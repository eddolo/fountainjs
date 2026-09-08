import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { HTMLExporter, MarkdownImporter, Schema, StarterKit } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

export async function definitionListJourney(page: Page, info: TestInfo): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/issue-editor.html');
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  // Public paste-event path; not a claim about the operating-system clipboard.
  await editor.evaluate(element => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    const html = '<h1>Service glossary</h1><dl><dt>Latency</dt><dd>Time to respond.</dd><dt>Throughput</dt><dd><p>Work per second.</p><ul><li>Measure over a fixed interval.</li></ul></dd></dl><p>Review notes</p>';
    Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/html' ? html : '' } });
    element.dispatchEvent(event);
  });
  await expect(editor.locator('dl')).toHaveCount(1);
  await expect(editor.locator('dt')).toHaveText(['Latency', 'Throughput']);
  await page.keyboard.press('ControlOrMeta+a');
  const clipboard = await editor.evaluate(element => {
    const values: Record<string, string> = {};
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { setData: (type: string, text: string) => { values[type] = text; } } });
    element.dispatchEvent(event);
    return values;
  });
  expect(clipboard['text/plain']).toContain('Latency\nTime to respond.\nThroughput\nWork per second.');
  expect(clipboard['text/html']).toContain('<dl>');
  const description = editor.locator('dd').first().locator('p');
  await description.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Measured in milliseconds.');
  await expect(editor.locator('dd').first().locator('p')).toHaveText(['Time to respond.', 'Measured in milliseconds.']);
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await expect(editor.locator('dd').first().locator('p')).toHaveText('Time to respond.Measured in milliseconds.');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor.locator('dd').first().locator('p')).toHaveCount(2);
  await page.getByRole('button', { name: 'Add term and description', exact: true }).click();
  await page.keyboard.type('Availability');
  await editor.locator('dd').last().locator('p').click();
  await page.keyboard.type('Fraction of successful requests.');
  await expect(editor.locator('dt')).toHaveText(['Latency', 'Throughput', 'Availability']);

  await editor.getByText('Review notes', { exact: true }).click();
  await page.getByRole('button', { name: 'Insert definition list', exact: true }).click();
  await page.keyboard.type('Temporary term');
  await expect(editor.locator('dl')).toHaveCount(2);
  await page.getByRole('button', { name: 'Delete definition list', exact: true }).click();
  await expect(editor.locator('dl')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.locator('dl')).toHaveCount(2);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor.locator('dl')).toHaveCount(1);
  await editor.screenshot({ path: info.outputPath('definition-list-author.png') });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const file = info.outputPath('service-glossary.md');
  await (await downloading).saveAs(file);
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(file);
  await expect(editor.locator('dt')).toHaveText(['Latency', 'Throughput', 'Availability']);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await expect(reader.locator('dt')).toHaveText(['Latency', 'Throughput', 'Availability']);
  await expect(reader.locator('dd').first().locator('p')).toHaveText(['Time to respond.', 'Measured in milliseconds.']);
  await expect(reader.locator('dd').nth(1).locator('li')).toHaveText('Measure over a fixed interval.');
  await expect(reader.locator('dd').last()).toHaveText('Fraction of successful requests.');
  await expect(reader).toHaveAttribute('contenteditable', 'false');
  await reader.screenshot({ path: info.outputPath('definition-list-reader.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(reader.locator('dt')).toHaveCount(3);
  const bounds = await reader.evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth }));
  expect(bounds.content).toBeLessThanOrEqual(bounds.width + 1);
  await reader.screenshot({ path: info.outputPath('definition-list-mobile.png') });
  const document = MarkdownImporter.parse(await readFile(file, 'utf8'), new Schema(StarterKit.schema), {
    parseHTMLBlock: (html, schema) => ServerHTMLImporter.parseFragment(html, schema),
  });
  const html = HTMLExporter.export(document, { title: 'Service glossary' });
  await writeFile(info.outputPath('service-glossary.html'), html);
  // Opening an export must unload the live React app and its subscriptions.
  // setContent alone replaces markup but leaves that page's JavaScript alive.
  await page.goto('about:blank');
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.setContent(html);
  await expect(page.locator('dt')).toHaveText(['Latency', 'Throughput', 'Availability']);
  await expect(page.locator('dt').first()).toHaveCSS('font-weight', '600');
  await expect(page.locator('dd').first().locator('p')).toHaveCount(2);
  const termBox = await page.locator('dt').first().boundingBox();
  const descriptionBox = await page.locator('dd').first().boundingBox();
  expect(descriptionBox!.x).toBeGreaterThan(termBox!.x + 10);
  await page.screenshot({ path: info.outputPath('definition-list-html-export.png'), fullPage: true });
  expect(errors).toEqual([]);
}
