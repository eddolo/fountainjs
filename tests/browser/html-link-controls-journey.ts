import { expect, type Page, type TestInfo } from '@playwright/test';

export async function htmlLinkControlsJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html#inert-source');
  await page.waitForFunction(() => Boolean(document.querySelector('#inert-source .fountain-editor')));
  await page.evaluate(() => { (globalThis as any).linkPwned = 0; });
  const workshop = page.locator('#inert-source');
  const editor = workshop.getByRole('textbox', { name: 'Inert HTML source editor', exact: true });
  const json = workshop.getByLabel('Inert native document JSON', { exact: true });
  await workshop.getByRole('button', { name: 'Safe link destination sample', exact: true }).click();
  const link = editor.locator('a');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('href', 'folder\\report');
  await expect(link).toHaveAttribute('data-fountain-html-href', 'folder\\\nreport');
  expect(await link.evaluate((element: HTMLAnchorElement) => element.href)).toBe(new URL('folder/report', page.url()).href);
  await expect(editor).toContainText('Blocked unsafe link remains readable.');
  const diagnostics = workshop.getByLabel('Inert import diagnostics');
  await expect(diagnostics).toContainText('normalized-link-url');
  await expect(diagnostics).toContainText('rejected-url');
  const destinations = workshop.getByLabel('Imported link destinations');
  await expect(destinations).toContainText('folder%5C%0Areport');
  const original = JSON.parse(await json.inputValue());
  await link.dblclick();
  // Chromium can include the following blank in native word selection.
  // Trim it with a real key gesture; edit the link only, not its neighbour.
  if ((await page.evaluate(() => window.getSelection()?.toString() ?? '')).endsWith(' ')) await page.keyboard.press('Shift+ArrowLeft');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('destination');
  await page.keyboard.type('revised');
  await expect(link).toHaveText('revised');
  await expect(link).toHaveAttribute('href', 'folder\\report');
  await expect(editor.locator('[data-fountain-node="paragraph"]').first()).toHaveText('Open revised after.');
  const edited = JSON.parse(await json.inputValue());
  let undos = 0;
  for (; undos < 8 && JSON.stringify(JSON.parse(await json.inputValue())) !== JSON.stringify(original); undos++) {
    const before = await json.inputValue();
    await workshop.getByRole('button', { name: 'Undo inert edit', exact: true }).click();
    await expect(json).not.toHaveValue(before);
  }
  expect(JSON.parse(await json.inputValue())).toEqual(original);
  for (let index = 0; index < undos; index++) await workshop.getByRole('button', { name: 'Redo inert edit', exact: true }).click();
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(edited);
  // Rejected HTML is unsupported structure: its two adjacent unmarked text
  // runs canonically merge. Keep the public mismatch warning and verify the
  // complete expected model, not a weakened text-only/URL-only comparison.
  expect(edited.content[1].content).toEqual([
    { type: 'text', text: 'Blocked unsafe link' }, { type: 'text', text: ' remains readable.' },
  ]);
  const canonical = { ...edited, content: [edited.content[0], { ...edited.content[1],
    content: [{ type: 'text', text: 'Blocked unsafe link remains readable.' }] }] };
  await workshop.getByRole('button', { name: 'Export Markdown and reopen', exact: true }).click();
  await expect(workshop.getByRole('status')).toContainText('Markdown: Round-trip mismatch — inspect the document.');
  expect(JSON.parse(await json.inputValue())).toEqual(canonical);
  for (const format of ['HTML', 'JSON']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    await expect(workshop.getByRole('status')).toContainText(`${format}: Complete native JSON retained.`);
    expect(JSON.parse(await json.inputValue())).toEqual(canonical);
  }
  const reader = workshop.frameLocator('iframe[title="Inert source reader"]');
  await expect(reader.locator('a')).toHaveCount(1);
  await expect(reader.locator('a')).toHaveAttribute('href', 'folder\\report');
  expect(await reader.locator('a').evaluate((element: HTMLAnchorElement) => element.href)).toBe(new URL('folder/report', page.url()).href);
  await expect(reader.locator('body')).toContainText('Blocked unsafe link remains readable.');
  expect(await page.evaluate(() => (globalThis as any).linkPwned)).toBe(0);
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: info.outputPath('encoded-link-editor.png') });
  await destinations.scrollIntoViewIfNeeded();
  await destinations.screenshot({ path: info.outputPath('encoded-link-destinations.png') });
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('encoded-link-reader.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await editor.screenshot({ path: info.outputPath('encoded-link-editor-mobile.png') });
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('encoded-link-reader-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await workshop.getByRole('button', { name: 'Literal Markdown link sample', exact: true }).click();
  const literalHrefs = ['foo\\bar', 'https://example.com?find=\\*', '/url\\bar*baz', 'https://example.com/\\[\\'];
  await expect(editor.locator('a')).toHaveCount(4);
  for (let at = 0; at < literalHrefs.length; at++) {
    await expect(editor.locator('a').nth(at)).toHaveAttribute('href', literalHrefs[at].replaceAll('\\', '%5C'));
    await expect(editor.locator('a').nth(at)).toHaveAttribute('data-fountain-link-href', literalHrefs[at]);
  }
  const literalOriginal = JSON.parse(await json.inputValue());
  await editor.locator('a').first().dblclick();
  await page.keyboard.type('Renamed');
  await expect(editor.locator('a').first()).toHaveText('Renamed');
  const literalEdited = JSON.parse(await json.inputValue());
  await workshop.getByRole('button', { name: 'Undo inert edit', exact: true }).click();
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(literalOriginal);
  await workshop.getByRole('button', { name: 'Redo inert edit', exact: true }).click();
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(literalEdited);
  for (const format of ['Markdown', 'HTML', 'JSON']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    await expect(workshop.getByRole('status')).toContainText(`${format}: Complete native JSON retained.`);
    expect(JSON.parse(await json.inputValue())).toEqual(literalEdited);
  }
  for (let at = 0; at < literalHrefs.length; at++) {
    await expect(reader.locator('a').nth(at)).toHaveAttribute('href', literalHrefs[at].replaceAll('\\', '%5C'));
  }
  expect(await reader.locator('a').first().evaluate((element: HTMLAnchorElement) => new URL(element.href).pathname)).toContain('foo%5Cbar');
  await editor.screenshot({ path: info.outputPath('literal-markdown-links-editor.png') });
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('literal-markdown-links-reader.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('literal-markdown-links-reader-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await workshop.getByRole('button', { name: 'HTML navigation intent sample', exact: true }).click();
  const htmlSources = ['/bar\\/)', 'foo  \nbar', 'foo\\\nbar', 'folder/\tname', '#note\rpart'];
  const htmlOriginal = JSON.parse(await json.inputValue());
  await expect(editor.locator('a')).toHaveCount(htmlSources.length);
  const checkNavigation = async (anchors: ReturnType<typeof editor.locator>) => {
    for (let at = 0; at < htmlSources.length; at++) {
      await expect(anchors.nth(at)).toHaveAttribute('href', htmlSources[at].replace(/[\t\n\r]/gu, ''));
      await expect(anchors.nth(at)).toHaveAttribute('data-fountain-html-href', htmlSources[at]);
      expect(await anchors.nth(at).evaluate((element: HTMLAnchorElement) => element.href))
        .toBe(new URL(htmlSources[at], page.url()).href);
    }
  };
  await checkNavigation(editor.locator('a'));
  await editor.locator('a').first().dblclick();
  // Native word selection can also include the following blank here. Keep
  // the neighbour intact and verify the human-visible edit, not only JSON.
  if ((await page.evaluate(() => window.getSelection()?.toString() ?? '')).endsWith(' ')) await page.keyboard.press('Shift+ArrowLeft');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('backslash');
  await page.keyboard.type('Renamed');
  await expect(editor.locator('a').first()).toHaveText('HTML Renamed path');
  const htmlEdited = JSON.parse(await json.inputValue());
  expect(htmlEdited).not.toEqual(htmlOriginal);
  await workshop.getByRole('button', { name: 'Undo inert edit', exact: true }).click();
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(htmlOriginal);
  await workshop.getByRole('button', { name: 'Redo inert edit', exact: true }).click();
  await expect.poll(async () => JSON.parse(await json.inputValue())).toEqual(htmlEdited);
  for (const format of ['Markdown', 'HTML', 'JSON']) {
    await workshop.getByRole('button', { name: `Export ${format} and reopen`, exact: true }).click();
    await expect(workshop.getByRole('status')).toContainText(`${format}: Complete native JSON retained.`);
    expect(JSON.parse(await json.inputValue())).toEqual(htmlEdited);
    await checkNavigation(editor.locator('a'));
    await checkNavigation(reader.locator('a'));
  }
  await editor.screenshot({ path: info.outputPath('html-navigation-editor.png') });
  await destinations.screenshot({ path: info.outputPath('html-navigation-destinations.png') });
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('html-navigation-reader.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await workshop.locator('iframe').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('html-navigation-reader-mobile.png') });
  expect(errors).toEqual([]);
}
