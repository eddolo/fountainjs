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

test('moves a task on the BPMN canvas and saves the graphical edit through undo and export', async ({ page }, info) => {
  const original = '\uFEFF' + (await readFile('examples/react-app/src/editorial-review.bpmn', 'utf8')).replace(/\r?\n/g, '\r\n');
  await page.goto('conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'review.bpmn', mimeType: 'application/xml', buffer: Buffer.from(original) });
  const editor = page.getByRole('textbox', { name: 'Imported document editor' });
  const code = editor.locator('pre[data-language="bpmn"] code');
  const launch = page.getByRole('button', { name: 'Edit diagram on canvas' });
  const dialog = page.getByRole('dialog', { name: 'Edit BPMN diagram' });
  const frame = dialog.frameLocator('iframe');
  const apply = dialog.getByRole('button', { name: 'Apply diagram changes' });
  const review = frame.locator('.djs-shape[data-element-id="Review"]');
  async function moveTask() {
    await expect(apply).toBeEnabled();
    const box = (await review.boundingBox())!;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const before = await review.getAttribute('transform');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 4, y + 5, { steps: 3 });
    await page.mouse.move(x + 65, y + 75, { steps: 12 });
    await page.mouse.up();
    await expect(review).not.toHaveAttribute('transform', before!);
  }
  await launch.click();
  await moveTask();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(code).toHaveJSProperty('textContent', original);
  await launch.click();
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(dialog).toHaveCount(0);
  await expect(code).toHaveJSProperty('textContent', original);
  await launch.click();
  await moveTask();
  // Route a revision back to review instead of finishing the workflow.
  const route = frame.locator('.djs-connection[data-element-id="F6"] .djs-visual > path');
  const point = await route.evaluate(element => {
    const path = element as SVGPathElement;
    const p = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  const iframe = dialog.locator('iframe');
  const offset = await iframe.evaluate(el => ({ x: el.getBoundingClientRect().x + el.clientLeft, y: el.getBoundingClientRect().y + el.clientTop }));
  await page.mouse.click(offset.x + point.x, offset.y + point.y);
  const handle = frame.locator('.djs-bendpoints[data-element-id="F6"] .djs-bendpoint:not(.floating) circle.djs-hit').last();
  const end = (await handle.boundingBox())!;
  const target = (await review.boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
  await page.mouse.up();
  await dialog.screenshot({ path: info.outputPath('editing-process.png') });
  await apply.click();
  await expect(dialog).toHaveCount(0);
  const revised = (await code.textContent())!;
  expect(revised.startsWith('\uFEFF')).toBe(true);
  expect(revised).toContain('\r\n');
  const geometry = (xml: string) => page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    const bounds = doc.querySelector('[bpmnElement="Review"] > [width]')!;
    return { x: Number(bounds.getAttribute('x')), y: Number(bounds.getAttribute('y')),
      revisionTarget: doc.querySelector('[id="F6"]')?.getAttribute('targetRef'),
      drawings: doc.getElementsByTagNameNS('*', 'BPMNDiagram').length, flows: doc.getElementsByTagNameNS('*', 'sequenceFlow').length };
  }, xml);
  const before = await geometry(original), after = await geometry(revised);
  expect(after.x).toBeGreaterThan(before.x);
  expect(after.y).toBeGreaterThan(before.y);
  expect(before.revisionTarget).toBe('Done');
  expect(after.revisionTarget).toBe('Review');
  expect(after.drawings).toBe(2);
  expect(after.flows).toBe(8);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(code).toHaveJSProperty('textContent', original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(code).toHaveJSProperty('textContent', revised);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download export' }).click();
  const file = info.outputPath('moved-process.bpmn');
  await (await pending).saveAs(file);
  expect(await readFile(file, 'utf8')).toBe(revised);
  const reader = page.getByLabel('Reopened export preview', { exact: true });
  await checkProcess(reader, 'Review draft');
  await expect(reader.frameLocator(frameSelector).locator('.djs-shape[data-element-id="Review"]'))
    .toHaveAttribute('transform', new RegExp(after.x + '[ ,]+' + after.y));
});

test('retains XML metadata when the BPMN modeler cannot serialize it', async ({ page }) => {
  const xml = (await readFile('examples/react-app/src/editorial-review.bpmn', 'utf8'))
    .replace('<process id="Editorial"', '<!-- signed off by the editor -->\n  <process id="Editorial"');
  await page.goto('conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'annotated.bpmn', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await page.getByRole('button', { name: 'Edit diagram on canvas' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit BPMN diagram' });
  await expect(dialog.getByRole('status')).toContainText('XML comments');
  await expect(dialog.getByRole('button', { name: 'Apply diagram changes' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('textbox', { name: 'Imported document editor' }).locator('pre code')).toHaveJSProperty('textContent', xml);
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
