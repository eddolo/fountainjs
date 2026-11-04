import { test, expect, type Locator } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function listGeometry(surface: Locator) {
  const firstWordX = (element: Locator) => element.evaluate(node => {
    const text = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
    if (!text) throw new Error('Expected visible paragraph text.');
    const range = node.ownerDocument.createRange();
    range.setStart(text, 0); range.setEnd(text, Math.min(6, text.textContent?.length ?? 0));
    return range.getBoundingClientRect().x;
  });
  const bodyX = await firstWordX(surface.locator('p').filter({ hasText: /^We compare how two vessels cool/ }));
  const listX = await firstWordX(surface.locator('ol > li > p').first());
  return { bodyX, listX, relativeTextIndent: listX - bodyX };
}

test('edits the independent scientific Word source and downloads the native audit export', async ({ page }, info) => {
  const root = resolve(process.env.FOUNTAIN_NATIVE_DOCX_AUDIT_DIR
    ? `${process.env.FOUNTAIN_NATIVE_DOCX_AUDIT_DIR}/${info.project.name}` : 'artifacts/docx-native-audit');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles(resolve(root, 'source.docx'));
  const workspace = page.getByRole('region', { name: 'Conversion workspace: source.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(editor).toContainText('Cooling experiment report');
  const title = editor.locator('p').filter({ hasText: /^Cooling experiment report$/ });
  await expect.poll(() => title.evaluate(element => getComputedStyle(element).fontFamily)).toBe('Calibri');
  await expect(editor.locator('img')).toHaveCount(3);
  await expect(editor.locator('[data-fountain-math]')).toHaveCount(2);
  const importedListGeometry = await listGeometry(editor);
  expect(importedListGeometry.relativeTextIndent).toBeCloseTo(24, 1);
  const instructions = editor.locator('ol > li');
  await expect(instructions).toHaveCount(3);
  const firstInstruction = instructions.first().locator('p').first();
  await expect(firstInstruction).toHaveText('Record the initial temperature before starting the timer.');
  await firstInstruction.click(); await page.keyboard.press('End'); await page.keyboard.press('Shift+Home');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('Record the initial temperature before starting the timer.');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(instructions).toHaveCount(4);
  await editor.screenshot({ path: resolve(root, 'editor-list-enter.png') });
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(instructions).toHaveCount(3);
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(instructions).toHaveCount(4);
  await expect(instructions.nth(1)).toHaveText('');
  await instructions.nth(1).locator('p').click(); await page.keyboard.press('Home'); await page.keyboard.press('Backspace');
  await expect(instructions).toHaveCount(3);
  await expect(firstInstruction).toHaveText('Record the initial temperature before starting the timer.');
  await expect.poll(() => editor.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await editor.screenshot({ path: resolve(root, 'editor-top.png') });
  for (let index = 0; index < 3; index++) {
    await editor.locator('img').nth(index).scrollIntoViewIfNeeded();
    await editor.screenshot({ path: resolve(root, `editor-image-${index + 1}.png`) });
  }
  for (let index = 0; index < 2; index++) {
    await editor.locator('[data-fountain-math]').nth(index).scrollIntoViewIfNeeded();
    await editor.screenshot({ path: resolve(root, `editor-equation-${index + 1}.png`) });
  }
  await editor.locator('table').scrollIntoViewIfNeeded();
  await editor.screenshot({ path: resolve(root, 'editor-table.png') });
  const ending = editor.locator('p').filter({ hasText: 'END OF REPORT' });
  await ending.click(); await page.keyboard.press('End'); await page.keyboard.type(' Checked in Fountain.');
  await expect(ending).toHaveText('END OF REPORT Checked in Fountain.');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(ending).toHaveText('END OF REPORT');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(ending).toHaveText('END OF REPORT Checked in Fountain.');
  await editor.screenshot({ path: resolve(root, 'editor-edited-ending.png') });
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('docx');
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  await (await pending).saveAs(resolve(root, 'exported.docx'));
  const reportPending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download diagnostic report', exact: true }).click();
  await (await reportPending).saveAs(resolve(root, 'conversion-report.json'));
  await page.getByLabel('Choose documents').setInputFiles(resolve(root, 'exported.docx'));
  const reopenedWorkspace = page.getByRole('region', { name: 'Conversion workspace: exported.docx', exact: true });
  const reopened = reopenedWorkspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(reopened).toContainText('END OF REPORT Checked in Fountain.');
  await expect.poll(() => reopened.locator('p').filter({ hasText: /^Cooling experiment report$/ })
    .evaluate(element => getComputedStyle(element).fontFamily)).toBe('Calibri');
  await expect(reopened.locator('img')).toHaveCount(3);
  await expect(reopened.locator('[data-fountain-math]')).toHaveCount(2);
  const reopenedListGeometry = await listGeometry(reopened);
  expect(reopenedListGeometry.relativeTextIndent).toBeCloseTo(24, 1);
  expect(reopenedListGeometry.relativeTextIndent).toBeCloseTo(importedListGeometry.relativeTextIndent, 1);
  await reopened.screenshot({ path: resolve(root, 'editor-reopened.png') });
  await reopenedWorkspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('html');
  const htmlPending = page.waitForEvent('download');
  await reopenedWorkspace.getByRole('button', { name: 'Download export', exact: true }).click();
  await (await htmlPending).saveAs(resolve(root, 'reader.html'));
  const reader = await page.context().newPage();
  reader.on('pageerror', error => errors.push(error.message));
  let readerListGeometry;
  let nativeFragmentFallback = false;
  try {
    await reader.goto(pathToFileURL(resolve(root, 'reader.html')).href);
    await expect(reader.locator('body')).toContainText('END OF REPORT Checked in Fountain.');
    await expect(reader.locator('img')).toHaveCount(3);
    for (let index = 0; index < 3; index++) {
      await reader.locator('img').nth(index).scrollIntoViewIfNeeded();
      await expect.poll(() => reader.locator('img').nth(index).evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    await reader.locator('p').filter({ hasText: /^Cooling experiment report$/ }).scrollIntoViewIfNeeded();
    readerListGeometry = await listGeometry(reader.locator('body'));
    expect(readerListGeometry.relativeTextIndent).toBeCloseTo(24, 1);
    await reader.screenshot({ path: resolve(root, 'reader.png'), fullPage: true });
    const fragment = await reader.locator('body').innerHTML();
    const external = await page.context().newPage();
    try {
      // Independent native HTML surface: no Fountain stylesheet or editor.
      await external.setContent(`<html><body>${fragment}</body></html>`);
      expect(await external.evaluate(() => document.styleSheets.length)).toBe(0);
      await expect(external.locator('ol > li')).toHaveCount(3);
      await expect(external.locator('ol > li').first()).toHaveCSS('list-style-type', 'decimal');
      expect(await external.locator('ol > li > p').first().evaluate(node => getComputedStyle(node, '::before').content)).toBe('none');
      const box = await external.locator('ol').boundingBox();
      if (!box) throw new Error('Missing independent native list.');
      await external.screenshot({ path: resolve(root, 'native-fragment.png'), clip: {
        x: 0, y: Math.max(0, box.y - 10), width: 1000, height: box.height + 25,
      } });
      nativeFragmentFallback = true;
    } finally { await external.close(); }
  } finally { await reader.close(); }
  expect(errors).toEqual([]);
  const diagnostic = JSON.parse(await readFile(resolve(root, 'conversion-report.json'), 'utf8'));
  await writeFile(resolve(root, 'browser-observations.json'), JSON.stringify({
    actualDownload: true, typingUndoRedo: true, actualReopen: true, images: 3, math: 2,
    listGeometryMaintained: true, importedListGeometry, reopenedListGeometry,
    listEnterUndoRedoBackspace: true, backwardKeyboardSelection: true,
    actualHTMLReader: true, readerListGeometry, nativeFragmentFallback,
    roundTripEqual: diagnostic.roundTrip.exactFountainJSONEquality,
    conversionIssues: diagnostic.roundTrip.issues, errors,
    nativeRenderingVerified: false,
  }, null, 2) + '\n');
});
