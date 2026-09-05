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

test('keeps editable page content continuous on a narrow screen', async ({ page }) => {
  await page.goto('/browser-tests.html?fixture=editable-pages');
  const region = page.getByLabel('Editable pages browser contract');
  const editor = page.getByRole('textbox', { name: 'Editable page canvas editor' });
  await expect(region.locator('.fountain-editable-pages__shells')).toBeHidden();
  await expect(editor).toContainText('First editable page');
  await expect(editor).toContainText('Second editable page');
  expect(await editor.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    parentWidth: element.parentElement?.getBoundingClientRect().width ?? 0,
    translations: [...element.children].map((child) => getComputedStyle(child).translate),
    paths: [...element.children].map((child) => child.getAttribute('data-fountain-path')),
  }))).toMatchObject({
    translations: ['none', 'none', 'none', 'none'],
    paths: ['0', '1', '2', '3'],
  });
  const sizes = await editor.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    parentWidth: element.parentElement?.getBoundingClientRect().width ?? 0,
  }));
  expect(sizes.width).toBeLessThanOrEqual(sizes.parentWidth);
});

test('keeps the public editor usable without horizontal overflow at a phone viewport', async ({ page }) => {
  await page.goto('/');
  const primary = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(primary.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  await expect(primary.getByRole('link', { name: '10 demos', exact: true })).toBeVisible();
  await expect(primary.getByRole('link', { name: 'Developers', exact: true })).toBeVisible();
  const heading = page.getByRole('heading', { name: 'Build a rich-text editor. Use any framework. Extend every layer.' });
  await expect(heading).toBeVisible();
  const heroLines = await heading.locator(':scope > *').evaluateAll((lines) => lines.map((line) => (
    line.getBoundingClientRect().top
  )));
  expect(heroLines).toHaveLength(3);
  expect(heroLines[1]).toBeGreaterThan(heroLines[0]);
  expect(heroLines[2]).toBeGreaterThan(heroLines[1]);
  await expect(page.getByRole('textbox', { name: 'Rich text editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Insert image from URL' }).click();
  await expect(page.getByLabel('Image URL')).toBeVisible();
  await page.getByText('Responsive sources', { exact: true }).click();
  await expect(page.getByLabel('Image source set')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('keeps tracked review complete and touch-operable on a phone viewport', async ({ page }) => {
  await page.goto('/');
  const workspace = page.locator('.tracked-demo__workspace');
  await workspace.scrollIntoViewIfNeeded();
  const panel = workspace.getByRole('region', { name: 'Review suggestions' });
  await expect(panel).toBeVisible();
  const replacement = panel.locator('.fountain-tracked-change-card').filter({ hasText: 'Replacement' });
  await expect(replacement.locator('.fountain-tracked-change-card__summary')).toContainText('product → team');
  await replacement.locator('.fountain-tracked-change-card__focus').tap();
  await expect(replacement).toHaveClass(/is-selected/);
  const reject = replacement.getByRole('button', { name: 'Reject', exact: true });
  const box = await reject.boundingBox();
  expect(box).not.toBeNull();
  await reject.tap();
  await expect(workspace.getByRole('textbox', { name: 'Tracked changes demo editor' })).toContainText('Every product deserves');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('keeps complete version names and guarded restore touch-operable on a phone', async ({ page }) => {
  await page.goto('/');
  const workspace = page.locator('.versions-demo__workspace');
  await workspace.scrollIntoViewIfNeeded();
  const panel = workspace.getByRole('region', { name: 'Saved versions' });
  await expect(panel).toContainText('First complete draft — nothing hidden after an ellipsis');
  const first = panel.locator('.fountain-version-card').filter({ hasText: 'First complete draft — nothing hidden after an ellipsis' });
  const restore = first.getByRole('button', { name: 'Restore', exact: true });
  const box = await restore.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await restore.tap();
  const confirmRestore = first.getByRole('button', { name: 'Confirm restore' });
  await expect(confirmRestore).toBeVisible();
  await confirmRestore.tap();
  await expect(workspace.getByRole('textbox', { name: 'Version history demo editor' })).toContainText('The first complete draft explains the launch in plain language.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('keeps native collapsible details readable and touch-operable on a phone', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const disclosure = editor.locator('details').first();
  const summary = disclosure.locator('summary');
  await expect(summary).toHaveText('Open this collapsible section');
  const target = await summary.boundingBox();
  expect(target).not.toBeNull();
  expect(target?.height ?? 0).toBeGreaterThanOrEqual(44);
  await summary.tap();
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(disclosure).toContainText('editable document content');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('keeps ruby annotation editing touch-operable and inside the phone viewport', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const annotation = editor.locator('ruby rt').first();
  const target = await annotation.boundingBox();
  expect(target).not.toBeNull();
  expect(target?.width ?? 0).toBeGreaterThanOrEqual(24);
  await annotation.tap();

  const dialog = page.getByRole('dialog', { name: 'Edit ruby annotation' });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('textbox', { name: 'Ruby annotation' });
  await input.fill('Tokyo');
  const save = dialog.getByRole('button', { name: 'Save' });
  const saveTarget = await save.boundingBox();
  expect(saveTarget?.height ?? 0).toBeGreaterThanOrEqual(44);
  await save.tap();
  await expect(editor.locator('ruby rt').first()).toHaveText('Tokyo');
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

test('keeps contextual menus reachable and touch-selectable on a phone viewport', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const firstText = editor.locator('[data-fountain-text-path]').first();
  await firstText.click();
  await firstText.evaluate((wrapper) => {
    const text = wrapper.firstChild;
    if (!text) throw new Error('Expected editor text.');
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(8, text.textContent?.length ?? 0));
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });

  const bubble = page.getByRole('toolbar', { name: 'Selection actions' });
  await expect(bubble).toBeVisible();
  const viewport = page.viewportSize();
  const bubbleBox = await bubble.boundingBox();
  expect(bubbleBox).not.toBeNull();
  expect((bubbleBox?.x ?? -1)).toBeGreaterThanOrEqual(0);
  expect((bubbleBox?.x ?? 0) + (bubbleBox?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  await bubble.getByRole('button', { name: 'Underline selection' }).click();
  await expect(editor.locator('u').first()).toBeAttached();

  const paragraph = editor.locator('[data-fountain-node="paragraph"]').first();
  await paragraph.click();
  await paragraph.locator('[data-fountain-text-path]').last().evaluate((wrapper) => {
    const range = document.createRange();
    range.selectNodeContents(wrapper);
    range.collapse(false);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.press('Enter');
  const floating = page.getByRole('toolbar', { name: 'Empty block actions' });
  await expect(floating).toBeVisible();
  const floatingBox = await floating.boundingBox();
  expect(floatingBox).not.toBeNull();
  expect((floatingBox?.x ?? -1)).toBeGreaterThanOrEqual(0);
  expect((floatingBox?.x ?? 0) + (floatingBox?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  await floating.getByRole('button', { name: 'Use heading 1' }).click();
  await expect(editor.locator('h1').last()).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('keeps a composed icon toolbar reachable and touch-operable on a phone viewport', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Use compact toolbar' }).tap();
  const toolbar = page.getByRole('toolbar', { name: 'Compact writing toolbar' });
  await expect(toolbar).toBeVisible();
  const viewport = page.viewportSize();
  const box = await toolbar.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? -1)).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  const overflow = await toolbar.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(overflow.scroll).toBeGreaterThan(overflow.client);

  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  const firstText = editor.locator('[data-fountain-text-path]').first();
  await firstText.tap();
  const strong = toolbar.getByRole('button', { name: 'Strong emphasis' });
  await strong.tap();
  await expect(strong).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('keeps the complete text-style panel usable without mobile page overflow', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await editor.locator('[data-fountain-text-path]').first().tap();
  const styles = page.getByRole('button', { name: 'Text styles' });
  await styles.scrollIntoViewIfNeeded();
  await styles.tap();
  const panel = page.locator('.fountain-toolbar__popover.is-text-style');
  await expect(panel).toBeVisible();
  await expect(page.getByLabel('Font family')).toBeVisible();
  await expect(page.getByLabel('Font size')).toBeVisible();
  await expect(page.getByLabel('Line height')).toBeVisible();
  await page.getByLabel('Line height').fill('1.7');
  await page.getByRole('button', { name: 'Apply line height' }).tap();
  const viewport = page.viewportSize();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.x ?? -1)).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('exposes touch-sized block movement controls without page overflow', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await editor.locator('[data-fountain-path="0"]').tap();
  const controls = page.getByRole('toolbar', { name: 'Heading block controls' });
  await expect(controls).toBeVisible();
  const moveAfter = controls.getByRole('button', { name: 'Move Heading block after' });
  const box = await moveAfter.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await moveAfter.tap();
  await expect(editor.locator(':scope > [data-fountain-path="0"]')).toContainText('Select text, type across paragraphs');
  await expect(controls).toHaveAttribute('data-fountain-block-path', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
