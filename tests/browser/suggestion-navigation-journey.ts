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
