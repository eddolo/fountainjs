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
  await expect(page.getByRole('heading', { name: 'One editor core. Any framework. Yours to extend.' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Rich text editor' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
