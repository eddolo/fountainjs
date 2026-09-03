import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/browser-tests.html');
});

test('edits through real beforeinput events and undoes a Markdown input rule', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await expect(editor).toContainText('Second paragraph');
  await page.locator('[data-fountain-path="1"]').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# ');
  await expect(editor.locator('[data-fountain-node="heading"]')).toHaveCount(1);

  await page.keyboard.press('Backspace');
  await expect(editor.locator('[data-fountain-node="heading"]')).toHaveCount(0);
  await expect(editor.locator('[data-fountain-path="2"]')).toHaveText('# ');
});

test('maps decorations through typing without persisting widget content', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await expect(editor.locator('.tested-range')).toHaveText('Alpha');
  await expect(editor.locator('[data-fountain-widget="remote"]')).toHaveText('Remote');

  await page.locator('[data-fountain-path="0"]').click();
  await page.keyboard.press('Home');
  await page.keyboard.type('!');
  await expect(editor.locator('.tested-range')).toHaveText('Alpha');
  await expect(editor).toContainText('!AlphaRemote Beta');
  await expect(page.getByLabel('Document JSON')).not.toContainText('Remote');
});

test('runs a view-focused chain and checks it without preview side effects', async ({ page }) => {
  const output = page.getByLabel('Document JSON');
  const before = await output.textContent();
  const canRun = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.can().chain().focus('end').insertText(' chained').run();
  });
  expect(canRun).toBe(true);
  await expect(output).toHaveText(before ?? '');

  const ran = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.chain().focus('end').insertText(' chained').run();
  });
  expect(ran).toBe(true);
  await expect(page.getByRole('textbox', { name: 'Browser contract editor' })).toBeFocused();
  await expect(page.locator('[data-fountain-path="1"]')).toContainText('Second paragraph chained');
});

test('replaces a DOM selection that crosses block boundaries', async ({ page }) => {
  await page.evaluate(() => {
    const wrappers = document.querySelectorAll<HTMLElement>('[data-fountain-text-path]');
    const textNode = (wrapper: HTMLElement, offset: number): { node: Node; offset: number } => {
      const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => node.parentElement?.closest('[data-fountain-widget]')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
      });
      let remaining = offset;
      let node = walker.nextNode();
      while (node) {
        const length = node.textContent?.length ?? 0;
        if (remaining <= length) return { node, offset: remaining };
        remaining -= length;
        node = walker.nextNode();
      }
      throw new Error('Unable to locate text offset.');
    };
    const start = textNode(wrappers[0] as HTMLElement, 6);
    const end = textNode(wrappers[1] as HTMLElement, 7);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });

  await page.keyboard.type('joined ');
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await expect(editor.locator('[data-fountain-node="paragraph"]')).toHaveCount(1);
  const documentJSON = JSON.parse(await page.getByLabel('Document JSON').textContent() ?? '{}');
  expect(documentJSON.content[0].content.map((node: { text?: string }) => node.text ?? '').join('')).toBe('Alpha joined paragraph');
  await expect(editor.locator('[data-fountain-widget="remote"]')).toHaveCount(1);
});

test('loads the public React playground without console or page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'One editor core. Any framework. Yours to extend.' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Rich text editor' })).toContainText('Build an editor');
  expect(errors).toEqual([]);
});
