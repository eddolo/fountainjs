import { expect, type Page, type TestInfo } from '@playwright/test';

export async function textDirectionJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('אבגד הוזח');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('مرحبا world שלום');
  const blocks = editor.locator(':scope > p');
  await expect(blocks).toHaveText(['אבגד הוזח', 'مرحبا world שלום']);
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'RTL', exact: true }).click();
  await page.getByRole('button', { name: 'Align start', exact: true }).click();
  for (const block of await blocks.all()) {
    await expect(block).toHaveAttribute('dir', 'rtl');
    await expect(block).toHaveCSS('direction', 'rtl');
    await expect(block).toHaveCSS('text-align', 'start');
  }
  await blocks.first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => getSelection()?.focusOffset)).toBe(1);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('בג');
  await page.keyboard.insertText('XY');
  await expect(blocks.first()).toHaveText('אXYד הוזח');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(blocks.first()).toHaveText('אבגד הוזח');

  // Enter must carry base direction into the newly created paragraph.
  await blocks.first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(blocks).toHaveText(['א', 'בגד הוזח', 'مرحبا world שלום']);
  await expect(blocks.nth(1)).toHaveAttribute('dir', 'rtl');
  await expect(blocks.nth(1)).toHaveCSS('text-align', 'start');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(blocks).toHaveText(['אבגד הוזח', 'مرحبا world שלום']);

  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'Centre', exact: true }).click();
  await page.getByRole('button', { name: 'LTR', exact: true }).click();
  await expect(blocks.first()).toHaveCSS('direction', 'ltr');
  await expect(blocks.first()).toHaveCSS('text-align', 'center');
  await page.getByRole('button', { name: 'Auto direction', exact: true }).click();
  await page.getByRole('button', { name: 'Align start', exact: true }).click();
  await expect(blocks.first()).toHaveAttribute('dir', 'auto');
  await expect(blocks.first()).toHaveCSS('direction', 'rtl');
  await editor.screenshot({ path: info.outputPath('rtl-editor-desktop.png') });

  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const html = await output.locator('pre').innerText();
  expect(html).toContain('dir="auto"');
  expect(html).toContain('text-align:start');
  const reader = await page.context().newPage();
  await reader.setContent(html);
  await expect(reader.getByText('אבגד הוזח', { exact: true })).toHaveCSS('direction', 'rtl');
  await expect(reader.getByText('مرحبا world שלום', { exact: true })).toHaveCSS('text-align', 'start');
  await reader.screenshot({ path: info.outputPath('rtl-exported-reader.png') });
  await reader.close();
  await page.setViewportSize({ width: 390, height: 900 });
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: info.outputPath('rtl-editor-mobile.png') });
  expect(errors).toEqual([]);
}
