import { readFile } from 'node:fs/promises';
import { expect, test, type Locator } from '@playwright/test';

const frameSelector = 'iframe[title="BPMN process preview"]';

async function checkProcess(surface: Locator, reviewLabel: string) {
  await surface.locator(frameSelector).scrollIntoViewIfNeeded();
  const frame = surface.frameLocator(frameSelector);
  await expect(frame.locator('[data-element-id="Decision"] .djs-visual')).toBeVisible({ timeout: 15000 });
  await expect(frame.locator('[data-element-id="Review"]')).toContainText(reviewLabel);
  await expect(frame.locator('[data-element-id="Revise"]')).toContainText(/Request\s*revisions/);
  await expect(frame.locator('.djs-connection')).toHaveCount(6);
  await expect(frame.locator('a.bjs-powered-by')).toBeVisible();
}

test('keeps the downloadable BPMN source available after a viewer error', async ({ page }, info) => {
  const input = Buffer.from('\uFEFF<?xml version="1.0" encoding="UTF-8"?>\r\n<unfinished>\r\n');
  await page.goto('conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'unfinished.bpmn', mimeType: 'application/xml', buffer: input });
  const editor = page.getByRole('textbox', { name: 'Imported document editor' });
  await editor.locator(frameSelector).scrollIntoViewIfNeeded();
  await expect(editor.frameLocator(frameSelector).getByRole('alert')).toContainText('BPMN preview unavailable.');
  await page.getByLabel('Export format').selectOption('bpmn');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download export' }).click();
  const path = info.outputPath('unfinished.bpmn');
  await (await pending).saveAs(path);
  expect(await readFile(path)).toEqual(input);
});

test('edits a BPMN process and reopens the downloaded source with both outcomes', async ({ page }, info) => {
  await page.goto('index.html#playground');
  const demo = page.locator('#playground');
  await demo.getByRole('button', { name: 'BPMN process', exact: true }).click();
  await checkProcess(demo, 'Review draft');
  const code = demo.locator('pre[data-language="bpmn"] code');
  const original = (await code.textContent())!;
  // Select the task name across any syntax-highlighting spans before typing.
  await code.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const offset = element.textContent!.indexOf('Review draft');
    const range = document.createRange();
    let start = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const end = start + node.textContent!.length;
      if (start <= offset && offset < end) range.setStart(node, offset - start);
      if (start < offset + 12 && offset + 12 <= end) { range.setEnd(node, offset + 12 - start); break; }
      start = end;
    }
    (element.closest('[contenteditable=true]') as HTMLElement).focus();
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.keyboard.insertText('Review copy');
  await checkProcess(demo, 'Review copy');
  await page.keyboard.press('ControlOrMeta+z');
  await checkProcess(demo, 'Review draft');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await checkProcess(demo, 'Review copy');
  await demo.locator(frameSelector).screenshot({ path: info.outputPath('editorial-process.png') });
  const pending = page.waitForEvent('download');
  await demo.getByRole('button', { name: 'Download BPMN source' }).click();
  const path = info.outputPath('process.bpmn');
  await (await pending).saveAs(path);
  expect(await readFile(path, 'utf8')).toBe(original.replace('Review draft', 'Review copy'));
  await page.goto('conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles(path);
  await checkProcess(page.getByRole('textbox', { name: 'Imported document editor' }), 'Review copy');
  await page.getByLabel('Export format').selectOption('bpmn');
  await page.getByRole('button', { name: 'Check round trip' }).click();
  await checkProcess(page.getByLabel('Reopened export preview', { exact: true }), 'Review copy');
});
