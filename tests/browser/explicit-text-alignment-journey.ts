import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { Schema } from 'fountainjs-editor/core';
import { CoreSchemaSpec, HTMLExporter } from 'fountainjs-editor';
import { exportDOCX, importDOCX } from 'fountainjs-editor/docx';

export async function explicitTextAlignmentJourney(page: Page, info: TestInfo): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/go-docs-service.html');
  // A real embedding app can supply inherited RTL on its host surface. There
  // must not be a hidden requirement to set dir separately on every paragraph.
  await page.evaluate(() => { document.body.dir = 'rtl'; });
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click(); await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('אבגד');
  const paragraph = editor.locator(':scope > p').first();
  await expect(paragraph).not.toHaveAttribute('dir');
  expect(await paragraph.evaluate(element => (element as HTMLElement).style.textAlign)).toBe('');
  const textGeometry = () => paragraph.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const block = element.getBoundingClientRect(), text = range.getBoundingClientRect();
    return { left: text.left - block.left, right: block.right - text.right };
  });
  expect((await textGeometry()).right).toBeLessThan(5);
  await editor.screenshot({ path: info.outputPath('rtl-host-natural-alignment.png') });
  await page.getByRole('button', { name: 'Align left', exact: true }).click();
  await expect(paragraph).toHaveCSS('text-align', 'left');
  await expect(paragraph).toHaveAttribute('data-fountain-align-explicit', 'true');
  await expect(paragraph).not.toHaveAttribute('dir');
  await expect(paragraph).toHaveText('אבגד');
  expect((await textGeometry()).left).toBeLessThan(5);
  await editor.screenshot({ path: info.outputPath('rtl-host-explicit-left.png') });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await paragraph.evaluate(element => (element as HTMLElement).style.textAlign)).toBe('');
  await expect(paragraph).not.toHaveAttribute('data-fountain-align-explicit');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(paragraph).toHaveCSS('text-align', 'left');

  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const html = await output.locator('pre').innerText();
  expect(html).toContain('data-fountain-align-explicit="true"');
  const reader = await page.context().newPage();
  try {
    await reader.setContent(`<section dir="auto" style="border:1px solid #888;min-height:150px;width:350px">שלום<section>${html}</section></section>`);
    const readParagraph = reader.getByText('אבגד', { exact: true });
    await expect(readParagraph).toHaveCSS('direction', 'rtl');
    await expect(readParagraph).toHaveCSS('text-align', 'left');
    await reader.screenshot({ path: info.outputPath('inherited-auto-explicit-left-reader.png') });
  } finally { await reader.close(); }

  // Convert the actual UI document with the shipped DOM-free package, reopen
  // the actual Word bytes, and inspect that projection too. This is left-align
  // retention, not native Word typesetting/bidi certification.
  await output.getByRole('button', { name: 'json', exact: true }).click();
  const schema = new Schema(CoreSchemaSpec);
  const fountainDocument = schema.nodeFromJSON(JSON.parse(await output.locator('pre').innerText()));
  const word = exportDOCX(fountainDocument);
  const wordPath = info.outputPath('explicit-left.docx');
  await writeFile(wordPath, word.bytes);
  await info.attach('explicit-left.docx', { path: wordPath, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const reopened = importDOCX(word.bytes, schema).document;
  expect(reopened.child(0).attrs.alignExplicit).toBe(true);
  const wordReader = await page.context().newPage();
  try {
    await wordReader.setContent(`<section dir="rtl" style="border:1px solid #888;min-height:150px;width:350px">${HTMLExporter.export(reopened, { document: false })}</section>`);
    await expect(wordReader.getByText('אבגד', { exact: true })).toHaveCSS('text-align', 'left');
    await wordReader.screenshot({ path: info.outputPath('word-reopened-explicit-left-reader.png') });
  } finally { await wordReader.close(); }

  await editor.click(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => getSelection()?.focusOffset)).toBe(1);
  await page.keyboard.press('Enter');
  const blocks = editor.locator(':scope > p');
  await expect(blocks).toHaveCount(2);
  await expect(blocks).toHaveText(['א', 'בגד']);
  for (const block of await blocks.all()) {
    await expect(block).toHaveAttribute('data-fountain-align-explicit', 'true');
    await expect(block).toHaveCSS('text-align', 'left');
    await expect(block).not.toHaveAttribute('dir');
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(blocks).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 900 });
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: info.outputPath('rtl-host-explicit-left-mobile.png') });
  expect(errors).toEqual([]);
}
