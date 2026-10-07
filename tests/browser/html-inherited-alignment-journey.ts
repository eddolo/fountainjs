import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const source = '<div style="text-align:right"><ul><li>List item right</li></ul></div><section dir="rtl" style="text-align:center"><h2>Alignment import</h2><p>Inherited center</p><div style="text-align:right"><p>Inherited right</p></div><p style="text-align:left">Physical left</p></section>';

export async function htmlInheritedAlignmentJourney(page: Page, info: TestInfo): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // A separate untouched page supplies native inheritance, not a second call
  // to Fountain's importer/exporter. Geometry is relative to its own text box.
  const original = await page.context().newPage();
  try {
    await original.setContent(`<style>section{width:400px;margin:20px}p,h2{font:16px/24px sans-serif;margin:12px 0}</style>${source}`);
    const native = await original.locator('p').evaluateAll(elements => elements.map(element => ({
      text: element.textContent, align: getComputedStyle(element).textAlign, dir: getComputedStyle(element).direction,
    })));
    expect(native).toEqual([
      { text: 'Inherited center', align: 'center', dir: 'rtl' },
      { text: 'Inherited right', align: 'right', dir: 'rtl' },
      { text: 'Physical left', align: 'left', dir: 'rtl' },
    ]);
    await expect(original.locator('li')).toHaveCSS('text-align', 'right');
    await original.locator('body').screenshot({ path: info.outputPath('inherited-alignment-native.png') });
    const nativePath = info.outputPath('native-inline-alignment.json');
    await writeFile(nativePath, JSON.stringify(native, null, 2));
    await info.attach('native-inline-alignment.json', { path: nativePath, contentType: 'application/json' });
  } finally { await original.close(); }

  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'inherited-alignment.html', mimeType: 'text/html', buffer: Buffer.from(source) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: inherited-alignment.html', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const paragraph = (text: string) => editor.locator('p').filter({ hasText: text });
  await expect(paragraph('List item right')).toHaveCSS('text-align', 'right');
  for (const [text, align] of [['Inherited center', 'center'], ['Inherited right', 'right'], ['Physical left', 'left']]) {
    await expect(paragraph(text!)).toHaveCSS('text-align', align!);
    await expect(paragraph(text!)).toHaveCSS('direction', 'rtl');
    const geometry = await paragraph(text!).evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      const box = element.getBoundingClientRect(), textBox = range.getBoundingClientRect();
      return { left: textBox.left - box.left, right: box.right - textBox.right };
    });
    if (align === 'center') expect(Math.abs(geometry.left - geometry.right)).toBeLessThan(3);
    else expect(align === 'left' ? geometry.left : geometry.right).toBeLessThan(3);
  }
  await editor.screenshot({ path: info.outputPath('inherited-alignment-editor.png') });
  await paragraph('Physical left').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' revised');
  await expect(paragraph('Physical left')).toHaveText('Physical left revised');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('New left paragraph');
  await expect(paragraph('New left paragraph')).toHaveCSS('text-align', 'left');
  await expect(paragraph('New left paragraph')).toHaveCSS('direction', 'rtl');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(paragraph('New left paragraph')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor.locator('p')).toHaveCount(4);
  await expect(paragraph('Physical left')).toHaveCSS('text-align', 'left');

  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('html');
  const downloadPromise = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const downloaded = await downloadPromise;
  const html = await readFile((await downloaded.path())!, 'utf8');
  expect(html).toContain('text-align:center');
  expect(html).toContain('text-align:right');
  expect(html).toContain('text-align:left');
  const reader = await page.context().newPage();
  try {
    await reader.setContent(html);
    await expect(reader.locator('li p')).toHaveCSS('text-align', 'right');
    for (const [text, align] of [['Inherited center', 'center'], ['Inherited right', 'right'], ['Physical left', 'left']]) {
      await expect(reader.locator('p').filter({ hasText: text! })).toHaveCSS('text-align', align!);
      await expect(reader.locator('p').filter({ hasText: text! })).toHaveCSS('direction', 'rtl');
    }
    await reader.locator('body').screenshot({ path: info.outputPath('inherited-alignment-downloaded-reader.png') });
  } finally { await reader.close(); }
  expect(errors).toEqual([]);
}
