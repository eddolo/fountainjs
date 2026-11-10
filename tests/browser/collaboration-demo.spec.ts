import { expect, test, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function pasteSettingsCopy(editor: Locator, nestedDepth = 0) {
  await editor.evaluate((element, depth) => {
    let details: unknown = 'Portable details';
    for (let level = 0; level < depth; level++) details = { next: details };
    const payload = JSON.stringify({
      version: 1, document: { type: 'doc', content: [{ type: 'collaboration_settings', attrs: {
        nodeId: 'shared-launch-settings', config: { title: 'Pasted settings copy', layout: { columns: 3, compact: false }, filters: [], details },
      } }] },
    });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [], getData: (type: string) => type === 'application/x-fountainjs+json' ? payload : '',
    } });
    element.dispatchEvent(event);
  }, nestedDepth);
}

test('opens the lazy collaboration demo after a slow module load and shares typing', async ({ page }, info) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*CollaborationDemo*', async route => {
    await pending;
    await route.continue();
  }, { times: 1 });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Loading the collaboration demo…')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Ada collaborative editor' })).toHaveCount(0);
    release();
    const left = page.getByRole('textbox', { name: 'Ada collaborative editor' });
    const right = page.getByRole('textbox', { name: 'Grace collaborative editor' });
    await expect(left).toContainText('Shared launch note');
    await expect(right).toContainText('Shared launch note');
    await left.getByText('Shared launch note', { exact: true }).click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' after loading');
    await expect(right).toContainText('Shared launch note after loading');
    await page.getByRole('button', { name: 'Undo Ada' }).click();
    await expect(right).not.toContainText('after loading');
    expect(errors).toEqual([]);
    await page.locator('#collaboration').screenshot({ path: info.outputPath('resumed-collaboration.png') });
  } finally { release(); }
});

test('recovers a failed collaboration load in a new tab without losing the current draft', async ({ page }, info) => {
  let failedModule = '';
  await page.route('**/*CollaborationDemo*', route => {
    failedModule = route.request().url();
    return route.abort('failed');
  }, { times: 1 });
  await page.goto('/#collaboration', { waitUntil: 'domcontentloaded' });
  const fallback = page.locator('#collaboration');
  await expect(fallback.getByRole('alert')).toContainText('The collaboration demo could not load');
  const draft = page.locator('.studio').getByRole('textbox', { name: 'Rich text editor', exact: true });
  await draft.locator('p').first().click();
  await expect(draft).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type(' Keep this unsaved draft.');
  await expect(draft).toContainText('Keep this unsaved draft.');
  const before = await draft.innerText();
  const retry = fallback.getByRole('link', { name: 'Open the collaboration demo in a new tab', exact: true });
  await expect(retry).toHaveAttribute('target', '_blank');
  await fallback.screenshot({ path: info.outputPath('collaboration-load-failure.png') });

  const [reopened, recoveredModule] = await Promise.all([
    page.context().waitForEvent('page'),
    page.context().waitForEvent('response', response =>
      response.url().includes('CollaborationDemo') && response.ok() && response.url() !== failedModule),
    retry.click(),
  ]);
  try {
    const left = reopened.getByRole('textbox', { name: 'Ada collaborative editor' });
    const right = reopened.getByRole('textbox', { name: 'Grace collaborative editor' });
    await left.getByText('Shared launch note', { exact: true }).click();
    await reopened.keyboard.press('End');
    await reopened.keyboard.insertText(' after recovery');
    await expect(right).toContainText('Shared launch note after recovery');
    await expect(draft).toHaveText(before, { useInnerText: true });
    await info.attach('collaboration-module-urls', {
      body: JSON.stringify({ failedModule, recoveredModule: recoveredModule.url() }),
      contentType: 'application/json',
    });
    await reopened.locator('.collaboration-demo__editors').screenshot({ path: info.outputPath('collaboration-recovered.png') });
  } finally {
    await reopened.close();
  }
});

test('runs the public two-editor collaboration demo with presence and author-local undo', async ({ page }) => {
  await page.goto('/');
  const left = page.getByRole('textbox', { name: 'Ada collaborative editor' });
  const right = page.getByRole('textbox', { name: 'Grace collaborative editor' });
  await expect(left).toBeVisible();
  await expect(right).toContainText('Edit either side');

  const leftParagraph = left.locator('[data-fountain-node="paragraph"]').first();
  await left.focus();
  await leftParagraph.locator('[data-fountain-text-path]').first().evaluate((wrapper) => {
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('.fountain-collaboration-caret, .fountain-comment-thread--point')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    let text = walker.nextNode();
    for (let next = walker.nextNode(); next; next = walker.nextNode()) text = next;
    if (!text) throw new Error('Expected collaboration text.');
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.type(' LIVE');
  await expect(right).toContainText('author-aware. LIVE');

  await leftParagraph.locator('[data-fountain-text-path]').first().evaluate((wrapper) => {
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('.fountain-collaboration-caret, .fountain-comment-thread--point')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    const nodes: Node[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    const text = nodes[0];
    if (!text) throw new Error('Expected collaboration text.');
    let remaining = 4;
    let end = text;
    let endOffset = 0;
    for (const node of nodes) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        end = node;
        endOffset = remaining;
        break;
      }
      remaining -= length;
    }
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(end, endOffset);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await right.locator('p').first().scrollIntoViewIfNeeded();
  const adaCaret = page.locator('.fountain-widget-overlay .fountain-collaboration-caret').filter({ hasText: 'Ada' });
  await expect(adaCaret).toHaveAttribute('aria-label', "Ada's cursor");
  await expect(adaCaret).toBeVisible();
  await expect(right.locator('.fountain-collaboration-selection')).toContainText('Edit');

  await page.getByRole('button', { name: 'Undo Ada' }).click();
  await expect(right).not.toContainText(' LIVE');
  await expect(left).not.toContainText(' LIVE');
});

test('replaces both live collaboration documents without remounting the public editors', async ({ page }) => {
  await page.goto('/');
  const left = page.getByRole('textbox', { name: 'Ada collaborative editor' });
  const right = page.getByRole('textbox', { name: 'Grace collaborative editor' });
  const documentText = (target: typeof left) => target.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('.fountain-collaboration-caret')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    let value = '';
    for (let node = walker.nextNode(); node; node = walker.nextNode()) value += node.textContent ?? '';
    return value;
  });
  const switchToPlanning = page.getByRole('button', { name: 'Switch both editors to Planning room' });
  await expect(switchToPlanning).toBeVisible();
  await left.evaluate((element) => { (globalThis as any).__fountainLeftRoot = element.closest('[data-fountain-root]'); });

  await switchToPlanning.click();
  await expect(page.getByText('Room: Planning', { exact: true })).toBeVisible();
  await expect(left).toContainText('Shared planning agenda');
  await expect(right).toContainText('Shared planning agenda');
  await expect(left.locator('[data-collaboration-settings]')).toContainText('Shared planning settings');
  await expect(right.locator('[data-collaboration-settings]')).toContainText('Shared planning settings');
  await expect(left).not.toContainText('Shared launch note');
  await left.focus();
  await left.locator('[data-fountain-node="paragraph"]').last().locator('[data-fountain-text-path]').first().evaluate((wrapper) => {
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('.fountain-collaboration-caret')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    let text = walker.nextNode();
    for (let next = walker.nextNode(); next; next = walker.nextNode()) text = next;
    if (!text) throw new Error('Expected collaboration text.');
    const range = document.createRange();
    range.setStart(text, text.textContent?.length ?? 0);
    range.collapse(true);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.type(' PLANNING');
  await expect.poll(() => documentText(right)).toContain('PLANNING');

  await page.getByRole('button', { name: 'Switch both editors to Launch room' }).click();
  await expect(page.getByText('Room: Launch', { exact: true })).toBeVisible();
  await expect(left).toContainText('Shared launch note');
  await expect(right).toContainText('Shared launch note');
  await expect(left).not.toContainText('Shared planning agenda');
  await expect.poll(() => documentText(left)).not.toContain('PLANNING');
  await expect.poll(() => documentText(right)).not.toContain('PLANNING');
  expect(await left.evaluate((element) => element.closest('[data-fountain-root]') === (globalThis as any).__fountainLeftRoot)).toBe(true);

  await page.getByRole('button', { name: 'Switch both editors to Planning room' }).click();
  await expect.poll(() => documentText(left)).toContain('PLANNING');
  await expect.poll(() => documentText(right)).toContain('PLANNING');
  expect(await left.evaluate((element) => element.closest('[data-fountain-root]') === (globalThis as any).__fountainLeftRoot)).toBe(true);
});

test('protects a rejected collaboration draft from peer edits and room switching', async ({ page }, info) => {
  await page.goto('/');
  const demo = page.locator('#collaboration');
  const ada = demo.getByRole('textbox', { name: 'Ada collaborative editor' });
  const grace = demo.getByRole('textbox', { name: 'Grace collaborative editor' });
  const switchRoom = demo.getByRole('button', { name: 'Switch both editors to Planning room' });
  await expect(switchRoom).toBeEnabled();

  await ada.locator('p').first().click();
  await page.keyboard.press('End');
  await pasteSettingsCopy(ada, 40);
  await expect(demo.getByRole('alert')).toContainText('exceeds its depth limit');
  await expect(ada).toContainText('Pasted settings copy');
  await expect(grace).not.toContainText('Pasted settings copy');
  await expect(switchRoom).toBeDisabled();
  await expect(demo.getByRole('button', { name: 'Undo Ada' })).toBeDisabled();
  await expect(demo.getByLabel('Shared review')).toHaveCount(0);
  await expect(demo.getByRole('region', { name: 'Granular collaborative settings' })).toHaveCount(0);

  await grace.getByText('Shared launch note', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' peer edit');
  await expect(grace).toContainText('Shared launch note peer edit');
  await expect(ada).not.toContainText('peer edit');
  await ada.getByText('Shared launch note', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' local draft');
  await expect(ada).toContainText('Shared launch note local draft');
  await expect(grace).not.toContainText('local draft');

  const downloading = page.waitForEvent('download');
  await demo.getByRole('button', { name: 'Download Ada’s copy' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('fountain-ada-draft.json');
  const path = info.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  const json = await readFile(path, 'utf8');
  expect(json).toContain('Shared launch note local draft');
  expect(json).toContain('Pasted settings copy');
  expect(json).not.toContain('peer edit');
  await demo.screenshot({ path: info.outputPath('recoverable-collaboration-draft.png') });
});

test('merges two offline settings copies without reassigning the original card', async ({ page }, info) => {
  await page.goto('/');
  const demo = page.locator('#collaboration');
  const ada = demo.getByRole('textbox', { name: 'Ada collaborative editor' });
  const grace = demo.getByRole('textbox', { name: 'Grace collaborative editor' });
  await expect(ada.getByText('Shared launch settings', { exact: true })).toBeVisible();
  await demo.getByRole('button', { name: 'Pause document sync' }).click();
  for (const author of [ada, grace]) {
    await author.locator('p').first().click();
    await page.keyboard.press('End');
    await pasteSettingsCopy(author);
    await expect(author.locator('[data-collaboration-settings]').first()).toContainText('Pasted settings copy');
    await expect(author.getByText('Pasted settings copy', { exact: true })).toHaveCount(1);
  }
  await demo.getByRole('button', { name: 'Resume document sync' }).click();
  for (const author of [ada, grace]) await expect(author.getByText('Pasted settings copy', { exact: true })).toHaveCount(2);
  await expect(demo.getByRole('alert')).toHaveCount(0);
  await demo.getByRole('button', { name: 'Undo Ada' }).click();
  for (const author of [ada, grace]) await expect(author.getByText('Pasted settings copy', { exact: true })).toHaveCount(1);
  await demo.locator('[data-collaboration-editor="ada"]').getByRole('button', { name: 'Redo' }).click();
  for (const author of [ada, grace]) await expect(author.getByText('Pasted settings copy', { exact: true })).toHaveCount(2);

  await demo.getByRole('button', { name: 'Toggle density' }).click();
  for (const author of [ada, grace]) {
    const cards = author.locator('[data-collaboration-settings]');
    await expect(cards.filter({ hasText: 'Shared launch settings' })).toContainText('2 columns · compact');
    await expect(cards.filter({ hasText: 'Pasted settings copy' })).toHaveText([
      'Pasted settings copy3 columns · comfortable', 'Pasted settings copy3 columns · comfortable',
    ]);
  }
  await demo.screenshot({ path: info.outputPath('merged-settings-copies.png') });
});

test('copies a settings card through the real Chromium clipboard before its original', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'This exercises Chromium’s operating-system clipboard bridge.');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const demo = page.locator('#collaboration');
  const ada = demo.getByRole('textbox', { name: 'Ada collaborative editor' });
  const grace = demo.getByRole('textbox', { name: 'Grace collaborative editor' });
  const cards = (editor: Locator) => editor.locator('[data-collaboration-settings]');
  await cards(ada).click();
  await expect(cards(ada)).toHaveAttribute('data-fountain-selected-node', 'true');
  await page.keyboard.press('Control+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Shared launch settings');
  await ada.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Control+v');

  for (const author of [ada, grace]) await expect(cards(author)).toHaveCount(2);
  await expect(demo.getByRole('alert')).toHaveCount(0);
  await demo.getByRole('button', { name: 'Toggle density' }).click();
  for (const author of [ada, grace]) {
    await expect(cards(author).first()).toContainText('2 columns · comfortable');
    await expect(cards(author).last()).toContainText('2 columns · compact');
  }
  await demo.screenshot({ path: info.outputPath('native-settings-paste.png') });
});

test('preserves both editors and the open comment when preparing a room switch fails', async ({ page }, info) => {
  await page.goto('/');
  const demo = page.locator('#collaboration');
  const ada = demo.getByRole('textbox', { name: 'Ada collaborative editor' });
  const grace = demo.getByRole('textbox', { name: 'Grace collaborative editor' });
  const panel = demo.getByLabel('Shared review');
  const comment = 'Keep this Launch decision';
  const switchRoom = demo.getByRole('button', { name: 'Switch both editors to Planning room' });
  await expect(switchRoom).toBeEnabled();
  await ada.getByText('Shared launch note', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' retained edit');
  await expect(grace).toContainText('Shared launch note retained edit');
  await panel.getByRole('button', { name: 'New comment', exact: true }).click();
  await panel.getByLabel('Comment target').selectOption('document');
  const draft = panel.getByRole('textbox', { name: 'New comment', exact: true });
  await draft.fill(comment);
  await page.evaluate(() => {
    const randomUUID = crypto.randomUUID.bind(crypto);
    let attempts = 0;
    // Fail the second destination adapter's construction.
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => {
      if (++attempts === 2) {
        Reflect.deleteProperty(crypto, 'randomUUID');
        throw new Error('Room connection unavailable');
      }
      return randomUUID();
    } });
  });
  await switchRoom.click();
  await expect(demo.getByRole('alert')).toContainText('Both editors are still in Launch');
  await expect(demo.getByRole('alert')).toContainText('Room connection unavailable');
  await expect(demo.getByText('Room: Launch', { exact: true })).toBeVisible();
  await expect(ada).toContainText('Shared launch note retained edit');
  await expect(grace).toContainText('Shared launch note retained edit');
  await expect(panel).toContainText('Could we make the provider boundary even clearer?');
  await expect(draft).toHaveValue(comment);
  await expect(panel.getByLabel('Comment target')).toHaveValue('document');
  await expect(demo.getByRole('button', { name: 'Undo Ada' })).toBeEnabled();
  await expect(switchRoom).toBeEnabled();
  await demo.screenshot({ path: info.outputPath('room-switch-ready-to-retry.png') });

  await panel.getByRole('button', { name: 'Create thread' }).click();
  await expect(panel).toContainText(comment);
  await switchRoom.click();
  await expect(demo.getByText('Room: Planning', { exact: true })).toBeVisible();
  await expect(ada).toContainText('Shared planning agenda');
  await expect(grace).toContainText('Shared planning agenda');
  await expect(panel).not.toContainText(comment);
  await expect(demo.getByRole('alert')).toHaveCount(0);
  await demo.getByRole('button', { name: 'Switch both editors to Launch room' }).click();
  await expect(panel).toContainText(comment);
  await expect(ada).toContainText('Shared launch note retained edit');
  await expect(grace).toContainText('Shared launch note retained edit');
});

const offlineActions = [
  { label: 'quote', button: 'Toggle quote', selector: 'blockquote' },
  { label: 'bullet list', button: 'Toggle bullet list', selector: 'ul:not([data-type])' },
  { label: 'numbered list', button: 'Toggle numbered list', selector: 'ol' },
  { label: 'task list', button: 'Toggle task list', selector: 'ul[data-type="task-list"]' },
  { label: 'partial bold', button: 'Toggle bold', selector: 'p strong' },
  { label: 'paragraph split' },
] as const;

for (const action of offlineActions) {
  test(`keeps offline text through ${action.label} in the public collaboration demo`, async ({ page }, info) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('/');
    const demo = page.locator('#collaboration');
    const left = demo.getByRole('textbox', { name: 'Ada collaborative editor' });
    const right = demo.getByRole('textbox', { name: 'Grace collaborative editor' });
    const text = 'Edit either side. Text, blocks, selections, and undo remain author-aware.';
    const edited = 'EdX' + text.slice(2);
    const bold = action.label === 'partial bold';
    async function placeCaret(editor: Locator, offset: number) {
      await editor.locator('p').first().click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('Home');
      for (let index = 0; index < offset; index++) await page.keyboard.press('ArrowRight');
    }

    async function assertResult(editor: Locator, value: string) {
      if (!('selector' in action)) {
        const split = value === text ? 3 : 4;
        await expect(editor.locator('p')).toHaveText([value.slice(0, split), value.slice(split)]);
      } else if (bold) {
        await expect(editor.locator('p').first()).toHaveText(value);
        await expect.poll(async () => (await editor.locator(action.selector).allTextContents()).join('').replace('X', '')).toBe('dit');
      } else {
        await expect(editor.locator(action.selector)).toHaveText(value);
      }
    }

    await expect(right.locator('p').first()).toHaveText(text);
    expect(await demo.locator('h2 .keep-together').evaluate(element => element.getClientRects().length)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await demo.getByRole('button', { name: 'Pause document sync' }).click();
    await expect(demo.getByRole('button', { name: 'Switch both editors to Planning room' })).toBeDisabled();
    await expect(page.locator('.fountain-widget-overlay .fountain-collaboration-caret')).toHaveCount(0);

    await placeCaret(left, 2);
    await page.keyboard.type('X');
    await expect(left.locator('p').first()).toHaveText(edited);
    await expect(right.locator('p').first()).toHaveText(text);

    await placeCaret(right, bold ? 1 : 3);
    if (bold) {
      for (let index = 0; index < 3; index++) await page.keyboard.press('Shift+ArrowRight');
      await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe('dit');
    }
    if ('button' in action) await demo.getByRole('button', { name: action.button, exact: true }).click();
    else await page.keyboard.press('Enter');
    await assertResult(right, text);
    await expect(left.locator('p')).toHaveText([edited]);

    await demo.getByRole('button', { name: 'Resume document sync' }).click();
    for (const editor of [left, right]) await assertResult(editor, edited);
    await expect(demo.getByRole('button', { name: 'Switch both editors to Planning room' })).toBeEnabled();
    await demo.screenshot({ path: info.outputPath('retained-offline-merged.png') });

    await demo.getByRole('button', { name: 'Undo Ada' }).click();
    for (const editor of [left, right]) await assertResult(editor, text);
    await demo.locator('[data-collaboration-editor="ada"]').getByRole('button', { name: 'Redo' }).click();
    for (const editor of [left, right]) await assertResult(editor, edited);
    await demo.getByRole('button', { name: 'Undo Grace' }).click();
    for (const editor of [left, right]) {
      await expect(editor.locator('p')).toHaveText([edited]);
      await expect(editor.locator('blockquote, ul, ol, p strong')).toHaveCount(0);
    }
    expect(pageErrors).toEqual([]);
  });
}

test('continues editing after competing offline wraps in the public collaboration demo', async ({ page }, info) => {
  await page.goto('/');
  const demo = page.locator('#collaboration');
  const ada = demo.getByRole('textbox', { name: 'Ada collaborative editor' });
  const grace = demo.getByRole('textbox', { name: 'Grace collaborative editor' });
  const text = 'Edit either side. Text, blocks, selections, and undo remain author-aware.';
  await expect(ada.locator('p').first()).toHaveText(text);
  await demo.getByRole('button', { name: 'Pause document sync' }).click();
  await ada.locator('p').first().click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Home');
  await page.keyboard.type('Ada: ');
  await demo.getByRole('button', { name: 'Toggle Ada quote' }).click();
  await expect(ada.locator('blockquote')).toHaveText('Ada: ' + text);
  await grace.locator('p').first().click();
  await demo.getByRole('button', { name: 'Toggle bullet list', exact: true }).click();
  await expect(grace.locator('ul:not([data-type])')).toHaveText(text);

  await demo.getByRole('button', { name: 'Resume document sync' }).click();
  const wrapper = 'blockquote, ul:not([data-type])';
  await expect(ada.locator(wrapper)).toHaveText(['Ada: ' + text]);
  await expect(grace.locator(wrapper)).toHaveText(['Ada: ' + text]);
  expect(await ada.locator(wrapper).evaluate(element => element.tagName))
    .toBe(await grace.locator(wrapper).evaluate(element => element.tagName));
  await expect(demo.getByRole('alert')).toHaveCount(0);
  await grace.locator(wrapper).locator('p').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Home');
  await page.keyboard.type('Merged: ');
  await expect(ada.locator(wrapper)).toHaveText('Merged: Ada: ' + text);
  await demo.screenshot({ path: info.outputPath('competing-wraps-merged.png') });
});

test('merges nested collaborative settings through the public two-editor demo', async ({ page }) => {
  await page.addInitScript(() => {
    const random = crypto.getRandomValues.bind(crypto);
    let clientId = 4_000_000_000;
    // Force the first peer's flat attribute to win, so the second peer
    // generates a repair while the offline edits are being exchanged.
    crypto.getRandomValues = array => {
      if (array instanceof Uint32Array && array.length === 1) {
        array[0] = clientId--;
        return array;
      }
      return random(array);
    };
  });
  await page.goto('/');
  const controls = page.getByRole('region', { name: 'Granular collaborative settings' });
  const left = page.locator('[data-collaboration-editor="ada"]');
  const right = page.locator('[data-collaboration-editor="grace"]');

  await expect(left.locator('[data-collaboration-settings]')).toContainText('2 columns · comfortable');
  await expect(right.locator('[data-collaboration-settings]')).toContainText('2 columns · comfortable');
  await page.getByRole('button', { name: 'Pause document sync' }).click();
  await controls.getByRole('button', { name: 'Add a column' }).click();
  await controls.getByRole('button', { name: 'Toggle density' }).click();
  await expect(left.locator('[data-collaboration-settings]')).toContainText('3 columns · comfortable');
  await expect(right.locator('[data-collaboration-settings]')).toContainText('2 columns · compact');
  await page.getByRole('button', { name: 'Resume document sync' }).click();
  await expect(left.locator('[data-collaboration-settings]')).toContainText('3 columns · compact');
  await expect(right.locator('[data-collaboration-settings]')).toContainText('3 columns · compact');

  await controls.getByRole('button', { name: 'Add owner filter' }).click();
  await controls.getByRole('button', { name: 'Add priority filter' }).click();
  await expect(controls.getByText('3 columns · 3 filters', { exact: true })).toBeVisible();
  await expect(controls.getByText('Compact · 3 filters', { exact: true })).toBeVisible();
});

test('restores separate comment drafts and their targets without remounting the editors', async ({ page }, info) => {
  await page.goto('/');
  const panel = page.getByLabel('Shared review');
  const left = page.getByRole('textbox', { name: 'Ada collaborative editor' });
  const right = page.getByRole('textbox', { name: 'Grace collaborative editor' });
  const seeded = 'Could we make the provider boundary even clearer?';
  const launchDraft = 'Unsubmitted Launch decision';
  const planningDraft = 'Planning-only decision';
  const launchReply = 'Reply kept with the Launch thread';
  await expect(panel).toContainText(seeded);
  await left.evaluate(element => { (globalThis as any).__fountainRoomEditor = element; });
  const seededThread = panel.getByRole('region', { name: 'Thread by Grace' }).filter({ hasText: seeded });
  const seededAnchor = seededThread.getByRole('button', { name: 'inline Edit either side' });
  await seededAnchor.click();
  await seededThread.getByRole('textbox', { name: 'Reply to thread by Grace' }).fill(launchReply);
  await left.getByText('Shared launch note', { exact: true }).click();
  await page.keyboard.press('End');
  for (let index = 0; index < 'note'.length; index++) await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('note');
  await panel.getByRole('button', { name: 'New comment', exact: true }).click();
  const composer = panel.getByRole('textbox', { name: 'New comment', exact: true });
  await expect(composer).toBeFocused();
  await composer.fill(launchDraft);

  await page.getByRole('button', { name: 'Switch both editors to Planning room' }).press('Enter');
  await expect(panel).toContainText('0 threads · connected');
  await expect(panel).not.toContainText(seeded);
  await expect(composer).toHaveCount(0);
  await expect(left.locator('[data-fountain-comment-thread]')).toHaveCount(0);
  await expect(right.locator('[data-fountain-comment-thread]')).toHaveCount(0);

  await panel.getByRole('button', { name: 'New comment', exact: true }).click();
  await panel.getByLabel('Comment target').selectOption('document');
  await composer.fill(planningDraft);

  await page.getByRole('button', { name: 'Switch both editors to Launch room' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Switch both editors to Planning room' })).toBeFocused();
  await expect(panel).toContainText(seeded);
  await expect(composer).toHaveValue(launchDraft);
  await expect(panel.getByLabel('Comment target')).toHaveValue('inline');
  await expect(left.locator('[data-fountain-comment-thread="demo-thread-review"]').first()).toBeVisible();
  await expect(right.locator('[data-fountain-comment-thread="demo-thread-review"]').first()).toBeVisible();
  expect(await left.evaluate(element => element === (globalThis as any).__fountainRoomEditor)).toBe(true);
  await panel.screenshot({ path: info.outputPath('restored-launch-draft.png') });
  await panel.getByRole('button', { name: 'Create thread' }).click();
  const launchThread = panel.getByRole('region', { name: 'Thread by Ada' }).filter({ hasText: launchDraft });
  await expect(launchThread.getByRole('button', { name: 'inline note' })).toBeVisible();
  await seededAnchor.click();
  await expect(seededThread.getByRole('textbox', { name: 'Reply to thread by Grace' })).toHaveValue(launchReply);
  await seededThread.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(seededThread).toContainText(launchReply);
  await panel.screenshot({ path: info.outputPath('launch-discussion.png') });

  await page.getByRole('button', { name: 'Switch both editors to Planning room' }).press('Enter');
  await expect(composer).toHaveValue(planningDraft);
  await expect(panel.getByLabel('Comment target')).toHaveValue('document');
  await expect(panel).not.toContainText(seeded);
  await expect(panel).not.toContainText(launchDraft);
  await expect(panel).not.toContainText(launchReply);
  await panel.getByRole('button', { name: 'Create thread' }).click();
  const planningThread = panel.getByRole('region', { name: 'Thread by Ada' }).filter({ hasText: planningDraft });
  await expect(planningThread.getByRole('button', { name: 'document Whole document' })).toBeVisible();
  await expect(page.locator('[data-collaboration-editor="grace"]')).toContainText('1 threads');
  await panel.screenshot({ path: info.outputPath('planning-discussion.png') });
});

test('runs shared threaded comments through the public provider-neutral review panel', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByLabel('Shared review');
  const left = page.getByRole('textbox', { name: 'Ada collaborative editor' });
  const right = page.getByRole('textbox', { name: 'Grace collaborative editor' });
  await expect(panel).toContainText('1 thread · connected');
  await expect(panel).toContainText('Could we make the provider boundary even clearer?');
  await expect(left.locator('[data-fountain-comment-thread="demo-thread-review"]').first()).toBeVisible();
  await expect(right.locator('[data-fountain-comment-thread="demo-thread-review"]').first()).toBeVisible();

  await panel.locator('[data-thread-id="demo-thread-review"] .fountain-comment-thread-card__anchor').click();
  await panel.getByLabel('Reply to thread by Grace').fill('Yes — the host owns authentication and storage.');
  await panel.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(panel).toContainText('Yes — the host owns authentication and storage.');
  await panel.getByRole('button', { name: 'React 👍 to comment by Grace' }).click();
  await expect(panel.getByRole('button', { name: 'React 👍 to comment by Grace' })).toHaveText('👍 1');
  await panel.getByRole('button', { name: 'Resolve', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Reopen', exact: true })).toBeVisible();

  const leftParagraph = left.locator('[data-fountain-node="paragraph"]').first();
  await leftParagraph.locator('[data-fountain-text-path]').first().evaluate((wrapper) => {
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('.fountain-collaboration-caret, .fountain-comment-thread--point')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    const nodes: Node[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    const text = nodes[0];
    if (!text) throw new Error('Expected collaboration text.');
    let remaining = 4;
    let end = text;
    let endOffset = 0;
    for (const node of nodes) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        end = node;
        endOffset = remaining;
        break;
      }
      remaining -= length;
    }
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(end, endOffset);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await panel.getByRole('button', { name: 'New comment' }).click();
  await panel.getByLabel('New comment').fill('A second overlapping review thread.');
  await panel.getByRole('button', { name: 'Create thread' }).click();
  await expect(panel).toContainText('2 threads · connected');
  expect(await right.locator('[data-fountain-comment-thread]').count()).toBeGreaterThanOrEqual(2);
});
