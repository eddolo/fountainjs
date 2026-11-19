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

test('switches BPMN drawings, recovers from an unusable first drawing and preserves the whole file', async ({ page }, info) => {
  const example = await readFile('examples/react-app/src/editorial-review.bpmn', 'utf8');
  const source = example.replace('<bdi:BPMNDiagram id="Diagram">', '<bdi:BPMNDiagram id="Incomplete" />\n  <bdi:BPMNDiagram id="Diagram">');
  const bytes = Buffer.from('\uFEFF' + source.replace(/\r?\n/g, '\r\n'));
  await page.goto('conversion-lab.html');
  const chooser = page.getByLabel('Choose documents');
  await chooser.setInputFiles({ name: 'workflows.bpmn', mimeType: 'application/xml', buffer: bytes });
  const editor = page.getByRole('textbox', { name: 'Imported document editor' });
  await editor.locator(frameSelector).scrollIntoViewIfNeeded();
  const frame = editor.frameLocator(frameSelector);
  const menu = frame.getByRole('combobox', { name: 'Diagram', exact: true });
  await expect(frame.getByRole('alert')).toContainText('BPMN preview unavailable.');
  await menu.selectOption({ label: '2. Editorial review' });
  await checkProcess(editor, 'Review draft');
  await expect(frame.getByRole('alert')).toHaveCount(0);
  await menu.focus();
  await menu.press('End');
  await menu.press('Enter');
  await expect(menu).toBeFocused();
  await expect(frame.locator('[data-element-id="Notify"]')).toContainText(/Notify\s*subscribers/);
  await expect(frame.locator('[data-element-id="Decision"]')).toHaveCount(0);
  await expect(frame.locator('.djs-connection')).toHaveCount(2);
  await editor.locator(frameSelector).screenshot({ path: info.outputPath('publication-handoff.png') });
  await menu.selectOption({ label: '1. Incomplete' });
  await expect(frame.getByRole('alert')).toContainText('BPMN preview unavailable.');
  await expect(frame.locator('[data-element-id="Notify"]')).toHaveCount(0);
  await menu.selectOption({ label: '2. Editorial review' });
  await checkProcess(editor, 'Review draft');
  await page.getByLabel('Export format').selectOption('bpmn');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download export' }).click();
  const exported = info.outputPath('workflows.bpmn');
  await (await pending).saveAs(exported);
  expect(await readFile(exported)).toEqual(bytes);
  const reader = page.getByLabel('Reopened export preview', { exact: true });
  await reader.locator(frameSelector).scrollIntoViewIfNeeded();
  const reopened = reader.frameLocator(frameSelector);
  await reopened.getByRole('combobox', { name: 'Diagram' }).selectOption({ label: '3. Publication handoff' });
  await expect(reopened.locator('[data-element-id="Notify"]')).toContainText(/Notify\s*subscribers/);
});

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
  await demo.getByRole('button', { name: 'BPMN process', exact: true }).click();
  await expect(demo.getByRole('alert')).toContainText('This playground allows 5,000 characters');
  await demo.getByRole('button', { name: 'Dismiss process notice' }).click();
  await expect(demo.locator(frameSelector)).toHaveCount(1);
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
