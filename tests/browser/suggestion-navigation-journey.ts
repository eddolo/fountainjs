import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

async function openSuggestions(page: Page, query: string) {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await editor.locator('[data-fountain-node="paragraph"]').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(query);
  return editor;
}

async function expectActiveOption(editor: Locator, option: Locator) {
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await expect(editor).toHaveAttribute('aria-activedescendant', (await option.getAttribute('id'))!);
  await expect(option).toBeInViewport({ ratio: 0.98 });
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await expect(editor).toBeFocused();
}

export async function suggestionScrollJourney(page: Page, info: TestInfo) {
  await page.setViewportSize({ width: 900, height: 650 });
  const editor = await openSuggestions(page, '/');
  const menu = page.locator('.fountain-slash-command-menu');
  const options = menu.getByRole('option');
  await expect(options.first()).toContainText('Write ordinary body text.');
  await expect(options.last()).toContainText('Callout');
  await options.first().hover();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await expectActiveOption(editor, options.first());
  await page.keyboard.press('ArrowUp');
  await expectActiveOption(editor, options.last());
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await menu.screenshot({ path: info.outputPath('slash-last-option-visible.png') });
  await page.keyboard.press('ArrowDown');
  await expectActiveOption(editor, options.first());
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await options.nth(1).hover();
  await expectActiveOption(editor, options.nth(1));
  await page.keyboard.press('ArrowUp');
  await expectActiveOption(editor, options.first());
  await page.keyboard.press('ArrowUp');
  await expectActiveOption(editor, options.last());
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(editor.locator('.demo-callout').last()).toContainText('A custom node supplied by the demo extension.');
  await expect(editor).toBeFocused();
}

export async function suggestionTabJourney(page: Page, info: TestInfo) {
  const editor = await openSuggestions(page, ':rock');
  const menu = page.getByRole('listbox', { name: 'Choose an emoji' });
  await expect(menu.getByRole('option')).toContainText('rocket');
  await expect(editor.locator('[data-fountain-suggestion-query]')).toHaveText(':rock');
  await expect(editor).toBeFocused();
  const before = await editor.innerText();
  await page.keyboard.press('Tab');
  await expect(menu).toHaveCount(0);
  await expect(editor).not.toBeFocused();
  await expect(editor).not.toHaveAttribute('aria-activedescendant');
  await expect(editor).toHaveText(before, { useInnerText: true });
  await page.screenshot({ path: info.outputPath('tab-leaves-emoji-query.png') });
}

export async function formattedSuggestionJourney(page: Page, info: TestInfo) {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await editor.locator('[data-fountain-node="paragraph"]').last().click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await expect(editor.locator('[data-fountain-node="paragraph"]').last()).toHaveText('');
  const bold = page.getByRole('button', { name: 'Bold', exact: true });
  const undo = page.locator('[data-fountain-toolbar-action="undo"]');
  const redo = page.locator('[data-fountain-toolbar-action="redo"]');
  await bold.click(); await page.keyboard.type('@a'); await bold.click(); await page.keyboard.type('da');
  const paragraph = editor.locator('[data-fountain-node="paragraph"]').filter({ hasText: '@ada' }).last();
  await expect(paragraph.locator('strong')).toHaveText('@a');
  const mentions = page.getByRole('listbox', { name: 'Mention a person or topic', exact: true });
  await expect(mentions.getByRole('option')).toContainText('Ada Lovelace');
  await expect(editor).toBeFocused();
  expect((await editor.locator('[data-fountain-suggestion-query="@"]')
    .allTextContents()).join('')).toBe('@ada');
  await page.screenshot({ path: info.outputPath('formatted-mention-query.png'), fullPage: true });
  await page.keyboard.press('Enter');
  const mention = editor.locator('[data-fountain-mention][data-id="ada"]');
  await expect(mention).toHaveText('@Ada Lovelace'); await expect(mentions).toHaveCount(0);
  await page.keyboard.type('continues after the reference');
  await expect(mention.locator('..')).toContainText('@Ada Lovelace continues after the reference');
  await undo.click(); await undo.click();
  await expect(mention).toHaveCount(0); await expect(paragraph).toHaveText('@ada');
  await expect(paragraph.locator('strong')).toHaveText('@a');
  await redo.click(); await expect(mention).toHaveText('@Ada Lovelace');
  await page.screenshot({ path: info.outputPath('formatted-mention-accepted.png'), fullPage: true });

  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await bold.click(); await page.keyboard.type('/head'); await bold.click(); await page.keyboard.type('ing');
  const slash = page.locator('.fountain-slash-command-menu');
  await expect(slash.getByRole('option').filter({ hasText: 'Heading 1' })).toBeVisible();
  await slash.getByRole('option').filter({ hasText: 'Heading 1' }).click();
  await expect(slash).toHaveCount(0);
  await undo.click(); await expect(editor.locator('[data-fountain-node="paragraph"]').filter({ hasText: '/heading' }).last()).toHaveText('/heading');
  await redo.click(); await page.keyboard.type('A heading created from a formatted query');
  await expect(editor.getByRole('heading', { level: 1, name: 'A heading created from a formatted query', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('formatted-slash-accepted.png'), fullPage: true });
}
