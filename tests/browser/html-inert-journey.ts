import { expect, type Page, type TestInfo } from '@playwright/test';

export async function htmlIncompleteSourceJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html#inert-source');
  const workshop = page.getByRole('region', { name: 'Inert HTML preservation workshop' });
  const editor = workshop.getByRole('textbox', { name: 'Inert HTML source editor', exact: true });
  const json = workshop.getByLabel('Inert native document JSON');
  await workshop.getByRole('button', { name: 'Unfinished HTML source sample', exact: true }).click();
  await expect(editor).toContainText('<div id="private-example"');
  await expect(editor).toContainText('*Keep these words*');
  const diagnostic = workshop.getByRole('complementary', { name: 'Inert import diagnostics' });
  await expect(diagnostic.locator('li')).toHaveCount(1);
  await expect(diagnostic.locator('li')).toContainText('unfinished HTML tag');
  await expect(diagnostic.locator('li')).not.toContainText('private-example');
  const original = JSON.parse(await json.inputValue());
  const source = await workshop.getByLabel('Inert source input', { exact: true }).inputValue();
  await workshop.getByRole('button', { name: 'Export Markdown and reopen', exact: true }).click();
  await expect(workshop.getByRole('status')).toContainText('Source preservation: exact');
  await expect(workshop.getByLabel('Saved inert Markdown')).toHaveValue(source);
  // This paragraph has a hard break. A center click lands on its second
  // visual line; Home is line-local, not a document-start command. Click the
  // first line deliberately, exactly as a user choosing that insertion point.
  await editor.locator('p').first().click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Home');
  await page.keyboard.type('Reviewed: ');
  await expect(editor).toContainText('Reviewed: <div');
  const edited = JSON.parse(await json.inputValue());
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(original);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(edited);
  for (const format of ['Markdown', 'HTML', 'JSON']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    await expect(workshop.getByRole('status')).toContainText(`${format}: Complete native JSON retained.`);
    expect(JSON.parse(await json.inputValue())).toEqual(edited);
  }
  const reader = workshop.frameLocator('iframe[title="Inert source reader"]');
  await expect(reader.locator('body')).toContainText('Reviewed: <div id="private-example"');
  await expect(reader.locator('body')).toContainText('*Keep these words*');
  await expect(editor.locator('div[id="private-example"]')).toHaveCount(0);
  await expect(reader.locator('[id="private-example"]')).toHaveCount(0);
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: info.outputPath('incomplete-source-editor.png') });
  await diagnostic.scrollIntoViewIfNeeded();
  await diagnostic.screenshot({ path: info.outputPath('incomplete-source-diagnostics.png') });
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('incomplete-source-reader.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await editor.screenshot({ path: info.outputPath('incomplete-source-mobile.png') });
  // Direct HTML repair is intentionally different and must disclose omissions.
  await workshop.getByLabel('Inert input format').selectOption('HTML');
  await workshop.getByRole('button', { name: 'Import inert source', exact: true }).click();
  await expect(editor).not.toContainText('Keep these words');
  await expect(diagnostic.locator('li')).toContainText('eof-in-tag');
  await diagnostic.scrollIntoViewIfNeeded();
  await diagnostic.screenshot({ path: info.outputPath('incomplete-direct-html-diagnostics.png') });
  expect(errors).toEqual([]);
}

export async function htmlInertJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('invalid.test')) requests.push(request.url()); });
  await page.addInitScript(() => {
    (globalThis as any).inertUpgrades = 0; (globalThis as any).inertPwned = 0;
    customElements.define('fountain-unsafe', class extends HTMLElement { connectedCallback() { (globalThis as any).inertUpgrades++; } });
  });
  await page.goto('/demos/node-markdown.html#inert-source');
  const workshop = page.getByRole('region', { name: 'Inert HTML preservation workshop' });
  const editor = workshop.getByRole('textbox', { name: 'Inert HTML source editor', exact: true });
  const json = workshop.getByLabel('Inert native document JSON');
  const data = workshop.getByLabel('Retained inert source data');
  await expect(editor.locator('[data-fountain-inert-inline]')).toHaveCount(2);
  // The DOM view mounts in an effect before React publishes its JSON field.
  await expect(json).toHaveValue(/"type": "doc"/);
  const before = JSON.parse(await json.inputValue());
  await expect(data).toContainText("<FoO data-id='outer'>");
  await expect(data).toContainText('markdown-projection');
  const nested = editor.locator('[data-fountain-inert-content]').nth(1);
  const box = await nested.boundingBox(); expect(box).not.toBeNull();
  await nested.click({ position: { x: box!.width - 2, y: box!.height / 2 } });
  // Verify the native caret really belongs to the clicked editable child.
  expect(await nested.evaluate(element => element.contains(element.ownerDocument.getSelection()?.focusNode ?? null))).toBe(true);
  await page.keyboard.type(' revised');
  await expect(nested).toHaveText('inside revised');
  const after = JSON.parse(await json.inputValue());
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(before);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(after);
  for (const format of ['Markdown', 'HTML', 'JSON']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    await expect(workshop.getByRole('status')).toContainText(`${format}: Complete native JSON retained.`);
    expect(JSON.parse(await json.inputValue())).toEqual(after);
  }
  const reader = workshop.frameLocator('iframe[title="Inert source reader"]');
  await expect(reader.locator('body')).toContainText('inside revised');
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await workshop.screenshot({ path: info.outputPath('inert-nested-edited-reopened.png') });
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('inert-nested-reader.png') });
  await workshop.getByRole('button', { name: 'Empty and dotted HTML tag sample', exact: true }).click();
  await expect(workshop.getByLabel('Inert input format')).toHaveValue('HTML');
  await expect(editor.locator('[data-fountain-inert-inline]')).toHaveCount(2);
  await expect(editor.getByText('⟦foo: retained HTML⟧', { exact: false })).toBeVisible();
  await expect(editor).toContainText('measurement');
  await workshop.getByRole('button', { name: 'Export HTML and reopen', exact: true }).click();
  await expect(workshop.getByRole('status')).toContainText('Complete native JSON retained.');
  await expect(reader.locator('body')).toContainText('measurement');
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('inert-empty-reader.png') });
  await workshop.screenshot({ path: info.outputPath('inert-empty-dotted.png') });
  await workshop.getByRole('button', { name: 'Hostile attribute sample', exact: true }).click();
  await expect(editor).toContainText('Editable');
  const content = editor.locator('[data-fountain-inert-content]');
  const hostileBox = await content.boundingBox(); expect(hostileBox).not.toBeNull();
  await content.click({ position: { x: hostileBox!.width - 2, y: hostileBox!.height / 2 } });
  await page.keyboard.type(' safe');
  await expect(content).toHaveText('Editable safe');
  await workshop.getByRole('button', { name: 'Export Markdown and reopen', exact: true }).click();
  await expect(workshop.getByRole('status')).toContainText('Complete native JSON retained.');
  await expect(data).toContainText('globalThis.inertPwned=1');
  await expect(reader.locator('body')).toContainText('Editable safe');
  await expect(editor.locator('fountain-unsafe,[onclick],[href],[style]')).toHaveCount(0);
  await expect(reader.locator('fountain-unsafe,[onclick],[href],[style],script,img')).toHaveCount(0);
  expect(await page.evaluate(() => [(globalThis as any).inertUpgrades, (globalThis as any).inertPwned])).toEqual([0, 0]);
  expect(requests).toEqual([]);
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('inert-hostile-reader.png') });
  await workshop.screenshot({ path: info.outputPath('inert-hostile-edited.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.scrollIntoViewIfNeeded();
  await expect(editor).toContainText('Editable safe');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await editor.screenshot({ path: info.outputPath('inert-editor-mobile.png') });
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('inert-reader-mobile.png') });
  expect(errors).toEqual([]);
}
