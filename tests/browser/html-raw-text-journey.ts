import { expect, type Page, type TestInfo } from '@playwright/test';

export async function htmlRawTextJourney(page: Page, info: TestInfo) {
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('invalid.test')) requests.push(request.url()); });
  await page.addInitScript(() => { (globalThis as any).rawPwned = 0; });
  await page.goto('/demos/node-markdown.html#inert-source');
  const workshop = page.getByRole('region', { name: 'Inert HTML preservation workshop' });
  const editor = workshop.getByRole('textbox', { name: 'Inert HTML source editor', exact: true });
  const json = workshop.getByLabel('Inert native document JSON');
  const raw = editor.locator('[data-fountain-inert-raw-text]');
  await workshop.getByRole('button', { name: 'Inert script style textarea sample', exact: true }).click();
  await expect(raw).toHaveCount(3);
  const original = JSON.parse(await json.inputValue());
  const source = await workshop.getByLabel('Inert source input', { exact: true }).inputValue();
  await workshop.getByRole('button', { name: 'Export Markdown and reopen', exact: true }).click();
  await expect(workshop.getByRole('status')).toContainText('Complete native JSON retained.');
  await expect(workshop.getByLabel('Saved inert Markdown')).toHaveValue(source);
  const body = raw.first().locator('code[data-fountain-inert-content]');
  await expect(body).toContainText('😀 <strong>literal source</strong>');
  await expect(body).toHaveCSS('white-space', 'pre-wrap');
  await body.scrollIntoViewIfNeeded();
  // Read a glyph's geometry, not the multiline inline bounding-box gap. This
  // is a real pointer click; never inject or manufacture the native selection.
  const point = await body.evaluate(node => {
    const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode()!;
    const index = text.textContent!.search(/\S/u);
    const range = node.ownerDocument.createRange(); range.setStart(text, index); range.setEnd(text, index + 1);
    const rect = range.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  expect(await body.evaluate(node => node.contains(node.ownerDocument.getSelection()?.focusNode ?? null))).toBe(true);
  await page.keyboard.press('End');
  await page.keyboard.type(' /* reviewed */');
  await expect(body).toContainText(' /* reviewed */');
  const edited = JSON.parse(await json.inputValue());
  const beforeEnter = await body.textContent();
  await page.keyboard.press('Enter');
  await expect(body).toContainText(' /* reviewed */\n');
  await expect(raw).toHaveCount(3);
  const afterEnter = JSON.parse(await json.inputValue());
  expect(afterEnter.content.length).toBe(original.content.length);
  expect((await body.textContent())!.length).toBe(beforeEnter!.length + 1);
  await page.keyboard.press('Backspace');
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(edited);
  // Real history controls, without assuming browser-specific typing grouping.
  let undos = 0;
  for (; undos < 8 && JSON.stringify(JSON.parse(await json.inputValue())) !== JSON.stringify(original); undos++) {
    const before = await json.inputValue();
    await workshop.getByRole('button', { name: 'Undo inert edit', exact: true }).click();
    await expect(json).not.toHaveValue(before);
  }
  expect(JSON.parse(await json.inputValue())).toEqual(original);
  for (let index = 0; index < undos; index++) await workshop.getByRole('button', { name: 'Redo inert edit', exact: true }).click();
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(edited);
  for (const format of ['Markdown', 'HTML', 'JSON']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    await expect(workshop.getByRole('status')).toContainText(`${format}: Complete native JSON retained.`);
    expect(JSON.parse(await json.inputValue())).toEqual(edited);
  }
  const data = workshop.getByLabel('Retained inert source data');
  await expect(data).toContainText('<ScRiPt type=');
  await expect(data).toContainText('</SCRIPT>');
  await expect(data).toContainText('private-example');
  const reader = workshop.frameLocator('iframe[title="Inert source reader"]');
  await expect(reader.locator('body [data-fountain-inert-raw-text]')).toHaveCount(3);
  await expect(reader.locator('body')).toContainText(' /* reviewed */');
  await expect(reader.locator('body')).toContainText('😀 <strong>literal source</strong>');
  await expect(reader.locator('body')).toContainText('background:url(https://invalid.test/raw)');
  await expect(reader.locator('body script,body style,textarea,body [onclick],body [src]')).toHaveCount(0);
  await expect(editor.locator('script,style,textarea,strong')).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as any).rawPwned)).toBe(0);
  expect(requests).toEqual([]);
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: info.outputPath('raw-text-editor-edited.png') });
  await data.scrollIntoViewIfNeeded();
  await data.screenshot({ path: info.outputPath('raw-text-retained-data.png') });
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('raw-text-reader-edited.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await editor.screenshot({ path: info.outputPath('raw-text-editor-mobile.png') });
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('raw-text-reader-mobile.png') });
  await workshop.getByRole('button', { name: 'Empty inert script sample', exact: true }).click();
  await expect(raw).toHaveCount(1);
  const empty = JSON.parse(await json.inputValue());
  const emptyBody = raw.locator('code[data-fountain-inert-content]');
  await expect(raw).toHaveAttribute('data-fountain-empty-text-block', 'true');
  await emptyBody.click();
  await page.keyboard.type('literal 😀');
  await expect(emptyBody).toHaveText('literal 😀');
  await expect(raw).toHaveCount(1);
  const filled = JSON.parse(await json.inputValue());
  let emptyUndos = 0;
  for (; emptyUndos < 8 && JSON.stringify(JSON.parse(await json.inputValue())) !== JSON.stringify(empty); emptyUndos++) {
    const before = await json.inputValue();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(json).not.toHaveValue(before);
  }
  expect(JSON.parse(await json.inputValue())).toEqual(empty);
  for (let index = 0; index < emptyUndos; index++) await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(filled);
  await workshop.getByRole('button', { name: 'Export HTML and reopen', exact: true }).click();
  await expect(workshop.getByRole('status')).toContainText('Complete native JSON retained.');
  await expect(reader.locator('body')).toContainText('literal 😀');
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: info.outputPath('raw-text-empty-filled.png') });
  expect(errors).toEqual([]);
}
