import { expect, test } from '@playwright/test';

test('handles virtual-keyboard replacement, composition, deletion, and history input', async ({ page }) => {
  await page.goto('/browser-tests.html');
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.commands.commands.selectText([0, 0], 0, 5));
  await page.waitForTimeout(0);
  const events = await page.getByRole('textbox', { name: 'Browser contract editor' }).evaluate((editor) => {
    const replacement = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: 'Mobile',
    });
    editor.dispatchEvent(replacement);

    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const compositionCommit = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'insertCompositionText', data: '大阪',
    });
    editor.dispatchEvent(compositionCommit);
    editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '大阪' }));

    const deletion = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'deleteContentBackward',
    });
    editor.dispatchEvent(deletion);
    const historyUndo = new InputEvent('beforeinput', {
      bubbles: true, cancelable: true, inputType: 'historyUndo',
    });
    editor.dispatchEvent(historyUndo);
    return {
      replacement: replacement.defaultPrevented,
      composition: compositionCommit.defaultPrevented,
      deletion: deletion.defaultPrevented,
      history: historyUndo.defaultPrevented,
    };
  });

  expect(events).toEqual({ replacement: true, composition: true, deletion: true, history: true });
  await expect.poll(() => page.evaluate(() => (
    (globalThis as any).fountainBrowserTest.editor.state.doc.child(0).textContent
  ))).toBe('Mobile大阪 Beta');
});

test('keeps the public editor usable without horizontal overflow at a phone viewport', async ({ page }) => {
  await page.goto('/');
  const heading = page.getByRole('heading', { name: 'One editor core. Any framework. Yours to extend.' });
  await expect(heading).toBeVisible();
  const heroLines = await heading.locator(':scope > *').evaluateAll((lines) => lines.map((line) => {
    const range = document.createRange();
    range.selectNodeContents(line);
    return range.getClientRects().length;
  }));
  expect(heroLines).toEqual([1, 1, 1]);
  await expect(page.getByRole('textbox', { name: 'Rich text editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Insert image from URL' }).click();
  await expect(page.getByLabel('Image URL')).toBeVisible();
  await page.getByText('Responsive sources', { exact: true }).click();
  await expect(page.getByLabel('Image source set')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('keeps the suggestion picker visible and touch-selectable on a phone viewport', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const firstParagraph = editor.locator('[data-fountain-node="paragraph"]').first();
  await firstParagraph.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(':');

  const menu = page.locator('.fountain-suggestion-menu[aria-label="Choose an emoji"]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('option')).toHaveCount(24);
  const menuBox = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(menuBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect((menuBox?.x ?? -1)).toBeGreaterThanOrEqual(0);
  expect((menuBox?.x ?? 0) + (menuBox?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  expect((menuBox?.y ?? -1)).toBeGreaterThanOrEqual(0);
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);

  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(':rock');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await menu.getByRole('option').click();
  await expect(menu).toHaveCount(0);
  await expect(editor.locator('[data-fountain-emoji="true"]').last()).toContainText('🚀');

  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  const slashMenu = page.locator('.fountain-slash-command-menu');
  await expect(slashMenu).toBeVisible();
  await expect(slashMenu.getByRole('option')).toHaveCount(12);
  await expect(slashMenu.getByRole('group')).toHaveCount(5);
  const slashBox = await slashMenu.boundingBox();
  expect(slashBox).not.toBeNull();
  expect((slashBox?.x ?? -1)).toBeGreaterThanOrEqual(0);
  expect((slashBox?.x ?? 0) + (slashBox?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  expect((slashBox?.y ?? -1)).toBeGreaterThanOrEqual(0);
  expect((slashBox?.y ?? 0) + (slashBox?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
  await page.keyboard.type('callout');
  await slashMenu.getByRole('option').click();
  await expect(editor.locator('.demo-callout').last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
