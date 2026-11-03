import { expect, type Page, type TestInfo } from '@playwright/test';

export async function htmlSourceEOFJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html#inert-source');
  const workshop = page.locator('#inert-source');
  await workshop.getByLabel('Retain HTML source doctype on next import').check();
  await workshop.getByRole('button', { name: 'Retained EOF source sample', exact: true }).click();
  const editor = workshop.getByRole('textbox', { name: 'Inert HTML source editor', exact: true });
  const code = editor.locator('pre[data-fountain-source-eof] code');
  const json = workshop.getByLabel('Inert native document JSON', { exact: true });
  const before = await json.inputValue();
  await expect(code).toContainText('<div data-note="unfinished');
  await workshop.getByText('Reconstruct original HTML as source', { exact: true }).click();
  const inspect = workshop.getByRole('button', { name: 'Inspect reconstructed HTML source', exact: true });
  const source = workshop.getByLabel('Reconstructed HTML source', { exact: true });
  await inspect.click(); await expect(source).toHaveValue(/literal & <not active$/);
  await code.scrollIntoViewIfNeeded();
  const point = await code.evaluate(node => {
    const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(text, 2); range.setEnd(text, 3);
    const rect = range.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y); await page.keyboard.press('End');
  await page.keyboard.press('Enter'); await page.keyboard.type('reviewed <still literal');
  await expect(code).toContainText('reviewed <still literal');
  const edited = await json.inputValue();
  let undos = 0;
  while (await json.inputValue() !== before && undos < 3) { await workshop.getByRole('button', { name: 'Undo inert edit', exact: true }).click(); undos++; }
  expect(await json.inputValue()).toBe(before);
  for (let i = 0; i < undos; i++) await workshop.getByRole('button', { name: 'Redo inert edit', exact: true }).click();
  expect(await json.inputValue()).toBe(edited);
  for (const format of ['JSON', 'HTML']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    await expect(workshop.getByRole('status')).toContainText('Complete native JSON retained.');
    expect(await json.inputValue()).toBe(edited);
  }
  await inspect.click(); await expect(source).toHaveValue(/reviewed <still literal/);
  await workshop.getByRole('button', { name: 'Add paragraph after EOF source', exact: true }).click();
  const paragraph = editor.locator(':scope > p').last();
  await paragraph.click(); await page.keyboard.type('Must survive.');
  const invalid = await json.inputValue();
  await inspect.click(); await expect(workshop.getByRole('region', { name: 'HTML source export result' })).toContainText('Source export refused');
  expect(await json.inputValue()).toBe(invalid); await expect(paragraph).toHaveText('Must survive.');
  // A refused raw-source export must not prevent safe reader/native saving of
  // the entire current document, including the following paragraph.
  await workshop.getByRole('button', { name: 'Export HTML and reopen', exact: true }).click();
  await expect(workshop.getByRole('status')).toContainText('Complete native JSON retained.');
  expect(await json.inputValue()).toBe(invalid);
  await inspect.click(); await expect(workshop.getByRole('region', { name: 'HTML source export result' })).toContainText('Source export refused');
  await workshop.getByRole('region', { name: 'HTML source export result' }).screenshot({ path: info.outputPath('eof-source-refused.png'), timeout: 10000 });
  const reader = workshop.frameLocator('iframe[title="Inert source reader"]');
  await expect(reader.locator('pre[data-fountain-source-eof]')).toContainText('reviewed <still literal');
  await expect(reader.locator('p')).toHaveText('Must survive.');
  await expect(editor.locator('div[data-note]')).toHaveCount(0);
  expect(errors).toEqual([]);
  await editor.screenshot({ path: info.outputPath('eof-source-editor.png'), timeout: 10000 });
  await workshop.locator('iframe[title="Inert source reader"]').screenshot({ path: info.outputPath('eof-source-reader.png'), timeout: 10000 });
}
