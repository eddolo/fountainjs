import { expect, test } from '@playwright/test';

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

test('keeps offline text when a peer quotes its paragraph in the public collaboration demo', async ({ page }, info) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  const demo = page.locator('#collaboration');
  const left = demo.getByRole('textbox', { name: 'Ada collaborative editor' });
  const right = demo.getByRole('textbox', { name: 'Grace collaborative editor' });
  const text = 'Edit either side. Text, blocks, selections, and undo remain author-aware.';
  const edited = 'EdX' + text.slice(2);

  await expect(right.locator('p').first()).toContainText(text);
  const phrase = demo.locator('h2 .keep-together');
  expect(await phrase.evaluate(element => element.getClientRects().length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await demo.getByRole('button', { name: 'Pause document sync' }).click();
  await expect(demo.getByRole('button', { name: 'Switch both editors to Planning room' })).toBeDisabled();
  await expect(page.locator('.fountain-widget-overlay .fountain-collaboration-caret')).toHaveCount(0);

  await left.locator('p').first().click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('X');
  await expect(left.locator('p').first()).toContainText(edited);
  await expect(right.locator('p').first()).toContainText(text);

  await right.locator('p').first().click({ position: { x: 5, y: 5 } });
  await demo.getByRole('button', { name: 'Toggle quote' }).click();
  await expect(right.locator('blockquote')).toContainText(text);
  await expect(left.locator('blockquote')).toHaveCount(0);
  await demo.getByRole('button', { name: 'Resume document sync' }).click();
  await expect(left.locator('blockquote')).toContainText(edited);
  await expect(right.locator('blockquote')).toContainText(edited);
  await expect(demo.getByRole('button', { name: 'Switch both editors to Planning room' })).toBeEnabled();
  await demo.screenshot({ path: info.outputPath('retained-quote-merged.png') });

  await demo.getByRole('button', { name: 'Undo Ada' }).click();
  await expect(left.locator('blockquote')).toContainText(text);
  await expect(right.locator('blockquote')).toContainText(text);
  await demo.locator('[data-collaboration-editor="ada"]').getByRole('button', { name: 'Redo' }).click();
  await expect(left.locator('blockquote')).toContainText(edited);
  await expect(right.locator('blockquote')).toContainText(edited);
  expect(pageErrors).toEqual([]);
});

test('merges nested collaborative settings through the public two-editor demo', async ({ page }) => {
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

test('keeps threads in their room and clears the open draft without remounting the editors', async ({ page }, info) => {
  await page.goto('/');
  const panel = page.getByLabel('Shared review');
  const left = page.getByRole('textbox', { name: 'Ada collaborative editor' });
  const right = page.getByRole('textbox', { name: 'Grace collaborative editor' });
  const seeded = 'Could we make the provider boundary even clearer?';
  await expect(panel).toContainText(seeded);
  await left.evaluate(element => { (globalThis as any).__fountainRoomEditor = element; });
  await panel.getByRole('button', { name: 'New comment', exact: true }).click();
  await panel.getByRole('textbox', { name: 'New comment', exact: true }).fill('Unsubmitted launch draft');

  await page.getByRole('button', { name: 'Switch both editors to Planning room' }).click();
  await expect(panel).toContainText('0 threads · connected');
  await expect(panel).not.toContainText(seeded);
  await expect(panel.getByRole('textbox', { name: 'New comment', exact: true })).toHaveCount(0);
  await expect(left.locator('[data-fountain-comment-thread]')).toHaveCount(0);
  await expect(right.locator('[data-fountain-comment-thread]')).toHaveCount(0);

  await panel.getByRole('button', { name: 'New comment', exact: true }).click();
  await panel.getByLabel('Comment target').selectOption('document');
  await panel.getByRole('textbox', { name: 'New comment', exact: true }).fill('Planning-only decision');
  await panel.getByRole('button', { name: 'Create thread' }).click();
  await expect(panel).toContainText('Planning-only decision');
  await expect(page.locator('[data-collaboration-editor="grace"]')).toContainText('1 threads');
  await panel.screenshot({ path: info.outputPath('planning-discussion.png') });

  await page.getByRole('button', { name: 'Switch both editors to Launch room' }).click();
  await expect(panel).toContainText(seeded);
  await expect(panel).not.toContainText('Planning-only decision');
  await expect(left.locator('[data-fountain-comment-thread="demo-thread-review"]').first()).toBeVisible();
  await expect(right.locator('[data-fountain-comment-thread="demo-thread-review"]').first()).toBeVisible();
  expect(await left.evaluate(element => element === (globalThis as any).__fountainRoomEditor)).toBe(true);
  await panel.screenshot({ path: info.outputPath('launch-discussion.png') });

  await page.getByRole('button', { name: 'Switch both editors to Planning room' }).click();
  await expect(panel).toContainText('Planning-only decision');
  await expect(panel).not.toContainText(seeded);
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
