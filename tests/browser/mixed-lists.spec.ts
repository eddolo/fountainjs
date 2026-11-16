import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test.use({ video: 'on' });
test('edits, copies and reopens mixed bullets and numbered tasks through the public conversion UI', async ({ page }, info) => {
  const output = resolve('artifacts/mixed-lists-desktop-20261116', info.project.name);
  await mkdir(output, { recursive: true });
  const source = '- [x] Parent\n  - Plain context\n  - [ ] Nested pending\n- Plain sibling\n\n3. [ ] Numbered pending\n4. Plain numbered\n5. [x] Numbered done';
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'mixed-lists.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: mixed-lists.md', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const download = async (format: string, name: string) => {
    await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption(format);
    const pending = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const path = resolve(output, name); await (await pending).saveAs(path);
    return readFile(path, 'utf8');
  };
  await expect(editor.locator('input[type="checkbox"]')).toHaveCount(4);
  await expect(editor.getByText('Plain context', { exact: true })).toHaveCSS('text-decoration-line', 'none');
  const numbered = editor.getByText('Numbered done', { exact: true }).locator('xpath=ancestor::li[1]');
  await expect(numbered).toHaveCSS('display', 'list-item');
  await expect(numbered.locator('xpath=..')).toHaveAttribute('start', '3');
  const before = JSON.parse(await download('json', 'before.json'));
  // Only native pointer/keyboard input from this point changes the document.
  for (const text of ['Plain context', 'Numbered done']) {
    await editor.getByText(text, { exact: true }).click();
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter'); await page.keyboard.press('Backspace');
    await expect(editor.getByText(text, { exact: true })).toBeVisible();
  }
  const pendingTask = editor.getByText('Nested pending', { exact: true }).locator('xpath=ancestor::li[1]').locator('input');
  await pendingTask.check(); await expect(pendingTask).toBeChecked();
  await editor.click(); await page.keyboard.press('Control+z'); await expect(pendingTask).not.toBeChecked();
  // Copy to an ordinary external text field, using the actual system clipboard.
  await editor.click(); await page.keyboard.press('Control+a'); await page.keyboard.press('Control+c');
  const external = await page.context().newPage();
  await external.setContent('<label>External plain text<textarea aria-label="External plain text"></textarea></label>');
  await external.getByRole('textbox').focus(); await external.keyboard.press('Control+v');
  const plain = await external.getByRole('textbox').inputValue();
  expect(plain).toContain('- Plain context'); expect(plain).toContain('[ ] Nested pending');
  expect(plain).toContain('3. [ ] Numbered pending'); expect(plain).toContain('5. [x] Numbered done');
  await writeFile(resolve(output, 'external-paste.txt'), plain);
  await external.close();
  // Same-editor native paste must keep the structured item kinds, not merely text.
  await editor.focus(); await page.keyboard.press('Control+a'); await page.keyboard.press('Control+v');
  await expect(editor.locator('input[type="checkbox"]')).toHaveCount(4);
  const after = JSON.parse(await download('json', 'after.json'));
  const semantics = (node: any): any => [node.type, node.attrs?.checked ?? null, node.attrs?.start ?? null,
    node.type === 'paragraph' ? (node.content ?? []).map((item: any) => item.text ?? '').join('') : (node.content ?? []).map(semantics)];
  expect(semantics(after)).toEqual(semantics(before));
  await editor.screenshot({ path: resolve(output, 'editor.png') });
  await info.attach('Mixed-list editor', { path: resolve(output, 'editor.png'), contentType: 'image/png' });
  await writeFile(resolve(output, 'observations.json'), JSON.stringify({ browser: info.project.name,
    nestedBulletUnstruck: true, nativeSplitJoin: true, checkboxUndo: true,
    systemClipboardExternalPaste: true, sameEditorStructuredPaste: true }, null, 2) + '\n');
});
