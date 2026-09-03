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
  expect(await editor.locator('.tested-range').allTextContents()).toEqual(['Alp', 'ha']);
  expect(await editor.locator('.tested-overlap').allTextContents()).toEqual(['ha', ' Bet']);
  await expect(editor.locator('[data-fountain-widget="remote"]')).toHaveText('Remote');

  await page.locator('[data-fountain-path="0"]').click();
  await page.keyboard.press('Home');
  await page.keyboard.type('!');
  expect(await editor.locator('.tested-range').allTextContents()).toEqual(['Alp', 'ha']);
  expect(await editor.locator('.tested-overlap').allTextContents()).toEqual(['ha', ' Bet']);
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

test('applies every configured paste-rule match through a browser paste event', async ({ page }) => {
  await page.locator('[data-fountain-path="1"]').click();
  await page.keyboard.press('End');
  const prevented = await page.locator('[data-fountain-path="1"]').evaluate((target) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) => type === 'text/plain' ? ' one -- two --' : '',
      },
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(page.locator('[data-fountain-path="1"]')).toContainText('Second paragraph one — two —');
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

test('uses Ctrl+A as an explicit all-document selection and replaces the document', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Browser contract editor' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('all');
  expect(await page.evaluate(() => document.getSelection()?.toString())).toContain('Alpha');

  await page.keyboard.type('Replacement');
  await expect(editor).toHaveText('Replacement');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('text');
});

test('selects and deletes an atomic image through real pointer and keyboard input', async ({ page }) => {
  const inserted = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.commands.insertImage({ src: 'https://example.com/selected.png', alt: 'Selected image' });
  });
  expect(inserted).toBe(true);
  const image = page.locator('[data-fountain-node="image_super"]');
  await page.locator('[data-fountain-path="0"]').click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowRight');
  await expect(image).toHaveAttribute('data-fountain-selected-node', 'true');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('node');

  await page.locator('[data-fountain-path="0"]').click();
  await image.click();
  await expect(image).toHaveAttribute('data-fountain-selected-node', 'true');
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('node');

  await page.keyboard.press('Backspace');
  await expect(image).toHaveCount(0);
});

test('extends and replaces a rectangular cell selection through real pointer input', async ({ page }) => {
  const inserted = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    const didInsert = contract.commands.commands.insertTable({ rows: 2, columns: 2, headerRow: true });
    contract.commands.commands.selectText([1, 0, 0, 0, 0], 0);
    return didInsert;
  });
  expect(inserted).toBe(true);
  await page.locator('[data-fountain-path="1.1.1"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-fountain-selected-cell="true"]')).toHaveCount(4);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.editor.state.selection.kind)).toBe('cell');

  await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    contract.commands.commands.selectText([1, 0, 0, 0, 0], 0);
    contract.view.focus();
  });
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await expect(page.locator('[data-fountain-selected-cell="true"]')).toHaveCount(4);

  await page.keyboard.type('First cell only');
  await expect(page.locator('[data-fountain-path="1.0.0"]')).toHaveText('First cell only');
  await expect(page.locator('[data-fountain-path="1.0.1"]')).toHaveText('');
  await expect(page.locator('[data-fountain-path="1.1.0"]')).toHaveText('');
  await expect(page.locator('[data-fountain-path="1.1.1"]')).toHaveText('');
});

test('renders and types into a structural gap as a new block', async ({ page }) => {
  const selected = await page.evaluate(() => {
    const contract = (globalThis as any).fountainBrowserTest;
    return contract.commands.commands.selectGap(12);
  });
  expect(selected).toBe(true);
  await expect(page.locator('[data-fountain-path="1"]')).toHaveAttribute('data-fountain-gap', 'before');
  await page.keyboard.type('Between');
  await expect(page.locator('[data-fountain-path="1"]')).toHaveText('Between');
  await expect(page.locator('[data-fountain-path="2"]')).toContainText('Second paragraph');
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

test('publishes semantic selection controls and table interaction in the demo gallery', async ({ page }) => {
  await page.goto('/demos/svelte-report.html');
  await expect(page.getByRole('heading', { name: 'Structured data report' })).toBeVisible();
  await expect(page.getByText('Rectangular cell selection', { exact: true })).toBeVisible();
  const editor = page.getByRole('textbox', { name: 'Rich text editor' });
  await expect(editor).toContainText('Quarterly service report');

  await page.locator('[data-fountain-path="2.0.0"]').click();
  await page.locator('[data-fountain-path="2.1.2"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('[data-fountain-selected-cell="true"]')).toHaveCount(6);

  await page.getByRole('button', { name: 'Gap after first' }).click();
  await expect(page.locator('[data-fountain-path="1"]')).toHaveAttribute('data-fountain-gap', 'before');
  await page.getByRole('button', { name: 'Select all' }).click();
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString() ?? '')).toContain('Quarterly service report');
});
