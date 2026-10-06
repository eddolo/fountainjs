import { expect, type Page, type TestInfo } from '@playwright/test';

export async function markdownEmphasisRunsJourney(page: Page, info: TestInfo): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/issue-editor.html');
  const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true });
  const visualTab = page.getByRole('button', { name: 'Visual editor', exact: true });
  const source = page.getByRole('textbox', { name: 'Markdown description', exact: true });
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const original = '# Delimiter review\n\nUnequal: ***alpha* and ____beta__.\n\n'
    + 'Overlap: ***!] beta **中*._`code`.\n\n'
    + 'Linked: [***label*](/safe).\n\nNested: ****gamma***.\n';
  const verify = async (surface: typeof editor, edited: boolean) => {
    await expect(surface.locator('h1')).toHaveText('Delimiter review');
    const paragraphs = surface.locator('p');
    await expect(paragraphs).toHaveCount(4);
    await expect(paragraphs.nth(0)).toHaveText(`Unequal: **${edited ? 'reviewed' : 'alpha'} and __beta.`);
    await expect(paragraphs.nth(0).locator('em')).toHaveText(edited ? 'reviewed' : 'alpha');
    await expect(paragraphs.nth(0).locator('strong')).toHaveText('beta');
    await expect(paragraphs.nth(1)).toHaveText('Overlap: ***!] beta *中._code.');
    await expect(paragraphs.nth(1).locator('em')).toHaveText('中');
    await expect(paragraphs.nth(1).locator('code')).toHaveText('code');
    await expect(paragraphs.nth(2).locator('a')).toHaveText('**label');
    await expect(paragraphs.nth(2).locator('a')).toHaveAttribute('href', '/safe');
    await expect(paragraphs.nth(2).locator('a em')).toHaveText('label');
    await expect(paragraphs.nth(3)).toHaveText('Nested: *gamma.');
    // Editor and export renderers may wrap the same two marks in opposite
    // orders. Require both marks on the same text, not an arbitrary tag order.
    const nested = paragraphs.nth(3).locator('em strong, strong em');
    await expect(nested).toHaveCount(1);
    await expect(nested).toHaveText('gamma');
    await expect(nested).toHaveCSS('font-style', 'italic');
    await expect(nested).toHaveCSS('font-weight', '700');
  };
  await sourceTab.click();
  await source.fill(original);
  await visualTab.click();
  await verify(editor, false);
  await editor.locator('p').first().locator('em').dblclick();
  // Windows Chromium/Firefox word selection includes the following space;
  // WebKit selects only the word. Use a real key to narrow that native range
  // before replacing it, rather than synthesizing an editor selection.
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  expect(['alpha', 'alpha ']).toContain(selected);
  if (selected === 'alpha ') await page.keyboard.press('Shift+ArrowLeft');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('alpha');
  await page.keyboard.type('reviewed');
  await verify(editor, true);
  await page.keyboard.press('ControlOrMeta+z');
  await verify(editor, false);
  await sourceTab.click();
  expect(await source.inputValue()).toBe(original);
  await visualTab.click();
  await editor.locator('p').first().locator('em').click();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await verify(editor, true);
  await page.screenshot({ path: info.outputPath('delimiter-runs-edited.png') });
  await sourceTab.click();
  const saved = await source.inputValue();
  expect(saved).not.toBe(original);
  expect(saved).toContain('Overlap: ***!] beta **中*._`code`.');
  expect(saved).toContain('Linked: [***label*](/safe).');
  expect(saved).toContain('Nested: ****gamma***.');
  await visualTab.click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const file = info.outputPath('delimiter-review.md');
  await (await downloading).saveAs(file);
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(file);
  await verify(editor, true);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await expect(reader).toHaveAttribute('contenteditable', 'false');
  await verify(reader, true);
  await page.screenshot({ path: info.outputPath('delimiter-runs-reader.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await verify(reader, true);
  await reader.locator('p').last().scrollIntoViewIfNeeded();
  await expect(reader.locator('h1')).toBeInViewport();
  await expect(reader.locator('p').first()).toBeInViewport();
  await expect(reader.locator('p').last()).toBeInViewport();
  // Scrolling a real reader used to bleed underlying title/source text through
  // the sticky navigation, especially where backdrop blur is unavailable.
  // Navigation must remain readable independently of compositor/filter support.
  await expect(page.locator('.site-header')).toHaveCSS('background-color', 'rgb(247, 245, 240)');
  await page.screenshot({ path: info.outputPath('delimiter-runs-reader-390.png') });
}

export async function markdownPartialSchemaJourney(page: Page, info: TestInfo, mark: 'em' | 'strong'): Promise<void> {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto(`/browser-tests.html?fixture=markdown-${mark}-only`);
  const editor = page.getByRole('textbox', { name: 'Browser contract editor', exact: true });
  const literal = mark === 'em' ? '**' : '*';
  const source = mark === 'em' ? '*before **inside** after*\n\n***alpha***\n'
    : '**before *inside* after**\n\n***alpha***\n';
  const verify = async (edited: boolean) => {
    const paragraphs = editor.locator('p');
    await expect(paragraphs).toHaveCount(2);
    await expect(paragraphs.first()).toHaveText(`${edited ? 'Review: ' : ''}before ${literal}inside${literal} after`);
    await expect(paragraphs.first().locator(mark)).toHaveText(`${edited ? 'Review: ' : ''}before ${literal}inside${literal} after`);
    await expect(paragraphs.last()).toHaveText(`${literal}alpha${literal}`);
    await expect(paragraphs.last().locator(mark)).toHaveText(mark === 'em' ? '**alpha**' : 'alpha');
    await expect(editor.locator(mark === 'em' ? 'strong' : 'em')).toHaveCount(0);
  };
  await verify(false);
  const before = await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON());
  await editor.locator('p').first().click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type('Review: ');
  await verify(true);
  await page.keyboard.press('ControlOrMeta+z');
  await verify(false);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON())).toEqual(before);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.partialMarkdownSource().markdown)).toBe(source);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await verify(true);
  const saved = await page.evaluate(() => {
    const api = (globalThis as any).fountainBrowserTest;
    return api.inspectMarkdown(api.partialMarkdownSource().markdown);
  });
  expect(saved.losses).toEqual([]);
  expect(saved.roundTrip).toEqual(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.getJSON()));
  await page.screenshot({ path: info.outputPath(`partial-${mark}-edited.png`) });
}
