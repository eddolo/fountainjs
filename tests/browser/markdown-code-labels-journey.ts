import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export async function markdownCodeLabelsJourney(page: Page, info: TestInfo): Promise<void> {
  const labels = ['x"y', 'constructor', '__proto__', 'custom-' + 'x'.repeat(70), '<img/src=x/onerror=alert(1)>'];
  const code = labels.map((label, index) => `\`\`\`${label}\nexample ${index + 1}\n\`\`\``).join('\n\n');
  const source = '# Code label handoff\n\nTechnical labels are data, not executable markup.\n\n' + code;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
  const capture = async (name: string) => {
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: 'instant' }); });
    await page.screenshot({ path: info.outputPath(name), fullPage: true });
  };
  await page.goto('/issue-editor.html');
  await page.getByRole('button', { name: 'Markdown source', exact: true }).click();
  await page.getByLabel('Markdown description', { exact: true }).fill(source);
  await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  const verify = async (surface: typeof editor, edited: boolean) => {
    await expect(surface.locator('h1')).toHaveText('Code label handoff');
    await expect(surface.locator('pre')).toHaveCount(labels.length);
    for (const [index, label] of labels.entries()) {
      await expect(surface.locator('pre').nth(index)).toHaveAttribute('data-language', label);
      await expect.poll(() => surface.locator('pre').nth(index).textContent()).toBe(`example ${index + 1}${index === 0 && edited ? ' edited' : ''}`);
    }
    await expect(surface.locator('img,script,iframe')).toHaveCount(0);
    expect(errors).toEqual([]);
  };
  await verify(editor, false);
  for (const [index, label] of labels.entries()) await expect(editor.locator('pre').nth(index)).toHaveAttribute('title', label);
  // The generated label is not document text, but clicking it must still let
  // an author enter the code instead of typing at a stale/outside selection.
  if (info.project.use.hasTouch) await editor.locator('pre').first().tap({ position: { x: 40, y: 24 } });
  else await editor.locator('pre').first().click({ position: { x: 40, y: 24 } });
  await expect.poll(() => editor.locator('pre').first().evaluate(pre => {
    const native = getSelection();
    return pre.contains(native?.anchorNode ?? null) && native?.isCollapsed && native.anchorOffset === 0;
  })).toBe(true);
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  await verify(editor, true);
  await page.keyboard.press('ControlOrMeta+z');
  await verify(editor, false);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await verify(editor, true);
  // Ordinary source clicks and backwards Shift-click remain native, rather
  // than being redirected to the start by the label's pointer handler.
  const codeText = editor.locator('pre').first().locator('[data-fountain-text-path]').first();
  const point = async (offset: number) => codeText.evaluate((wrapper, index) => {
    const range = document.createRange(); range.setStart(wrapper.firstChild!, index); range.collapse(true);
    const rect = range.getBoundingClientRect(); return { x: rect.x + .1, y: rect.y + rect.height / 2 };
  }, offset);
  const end = await point(4); await page.mouse.click(end.x, end.y);
  const start = await point(1);
  await page.keyboard.down('Shift');
  try { await page.mouse.click(start.x, start.y); } finally { await page.keyboard.up('Shift'); }
  await expect.poll(() => codeText.evaluate(wrapper => {
    const native = getSelection();
    return { anchor: wrapper.contains(native?.anchorNode ?? null) ? native?.anchorOffset : null,
      focus: wrapper.contains(native?.focusNode ?? null) ? native?.focusOffset : null };
  })).toEqual({ anchor: 4, focus: 1 });
  await editor.screenshot({ path: info.outputPath('code-labels-backward-selection.png') });
  await page.keyboard.type('Z');
  await expect(editor.locator('pre').first()).toHaveText('eZple 1 edited');
  await expect(editor.locator('h1')).toHaveText('Code label handoff');
  await page.keyboard.press('ControlOrMeta+z');
  await verify(editor, true);
  await capture('code-labels-editor.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await verify(editor, true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect.poll(() => editor.locator('pre').nth(3).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await editor.locator('pre').nth(3).evaluate(element => getComputedStyle(element, '::before').whiteSpace)).toBe('normal');
  await capture('code-labels-mobile-editor.png');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: 'Markdown source', exact: true }).click();
  await expect(page.getByLabel('Markdown description', { exact: true })).toHaveValue(/```x&#34;y\nexample 1 edited/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const path = info.outputPath('code-labels.md');
  await (await download).saveAs(path);
  await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(path);
  await verify(editor, true);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  await verify(reader, true);
  await capture('code-labels-reader.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await verify(reader, true);
  await capture('code-labels-mobile-reader.png');

  // Markdown retains an empty text leaf here, unlike a structurally childless
  // code node. Its native text caret must still enter code, not the heading.
  const emptySource = '# Empty code entry\n\n```text\n```\n';
  await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  await page.getByRole('button', { name: 'Markdown source', exact: true }).click();
  await page.getByLabel('Markdown description', { exact: true }).fill(emptySource);
  await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  const emptyCode = editor.locator('pre').first();
  await expect(emptyCode).toHaveText('');
  if (info.project.use.hasTouch) await emptyCode.tap({ position: { x: 40, y: 24 } });
  else await emptyCode.click({ position: { x: 40, y: 24 } });
  await expect.poll(() => emptyCode.evaluate(pre => pre.contains(getSelection()?.anchorNode ?? null))).toBe(true);
  await page.keyboard.type('first code');
  await expect(emptyCode).toHaveText('first code');
  await expect(editor.locator('h1')).toHaveText('Empty code entry');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(emptyCode).toHaveText('');
  const emptyDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const emptyPath = info.outputPath('code-labels-empty.md');
  await (await emptyDownload).saveAs(emptyPath);
  expect(await readFile(emptyPath, 'utf8')).toBe(emptySource);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  await expect(reader.locator('pre')).toHaveText('');
  await expect(reader.locator('h1')).toHaveText('Empty code entry');
  await capture('code-labels-empty-reader.png');
}
