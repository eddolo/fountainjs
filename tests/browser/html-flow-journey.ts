import { expect, type Page, type TestInfo } from '@playwright/test';

export async function htmlTableFlowJourney(page: Page, info: TestInfo) {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Anonymous flow sample').selectOption('tables');
  const root = page.locator('#markdown-document-audit');
  const editor = root.getByRole('textbox', { name: 'Whole-document scope editor' });
  const table = editor.locator('section#results table');
  const rows = table.locator('tr');
  const save = root.getByRole('button', { name: 'Save Markdown', exact: true });
  const saved = root.getByLabel('Saved scope Markdown');
  await expect(rows).toHaveCount(3);
  await expect(rows.first().locator('th')).toHaveCount(2);
  await expect(rows.nth(1).locator('strong')).toHaveText('Alpha');
  await expect(rows.nth(1).locator('a')).toHaveAttribute('href', '/ready');
  await expect(rows.nth(1).locator('td').last().locator('p')).toHaveCSS('text-align', 'right');
  await save.click();
  await expect(root.locator('[data-save-status]')).toHaveText('Source preservation: exact');
  expect(await saved.inputValue()).toContain('| **Alpha** | [Ready][r] |');
  await editor.screenshot({ path: info.outputPath('table-flow-editor-original.png') });
  for (const [title, name] of [['Reference scope reader', 'reference'], ['Fountain scope reader', 'reader']] as const) {
    const frame = root.frameLocator(`iframe[title="${title}"]`);
    await expect(frame.locator('table tr')).toHaveCount(3);
    await expect(frame.locator('table a')).toHaveAttribute('href', '/ready');
    await root.locator(`iframe[title="${title}"]`).scrollIntoViewIfNeeded();
    await frame.locator('body').evaluate(body => body.ownerDocument.defaultView!.scrollTo(0, 0));
    await expect(frame.locator('section#results > p').first()).toBeInViewport();
    await expect(frame.locator('section#results > p').last()).toBeInViewport();
    await expect(frame.locator('section#results > p').first()).toHaveText('Before.');
    await expect(frame.locator('section#results > p').last()).toHaveText('After.');
    // Keep the reader scriptless: schedule paint checkpoints in the host page,
    // not inside a sandbox that Chromium may refuse to run callbacks in.
    await page.evaluate(() => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await page.screenshot({ path: info.outputPath(`table-flow-${name}-original.png`) });
  }
  const beta = rows.nth(2).locator('td').first();
  await beta.locator('p').click(); await page.keyboard.press('Home'); await page.keyboard.type('Edited: ');
  await expect(beta.locator('p')).toHaveText('Edited: Beta');
  await page.keyboard.press('Enter');
  await expect(beta.locator('p')).toHaveCount(2);
  await page.keyboard.press('Backspace');
  await expect(beta.locator('p')).toHaveCount(1);
  await expect(beta.locator('p')).toHaveText('Edited: Beta');
  await page.keyboard.press('Tab');
  await page.keyboard.press('End'); await page.keyboard.type(' + 1');
  const code = rows.nth(2).locator('td').last().locator('code');
  await expect(code).toHaveText('x + 1');
  await page.keyboard.press('ControlOrMeta+z'); await expect(code).toHaveText('x');
  await page.keyboard.press('ControlOrMeta+Shift+z'); await expect(code).toHaveText('x + 1');
  await save.click();
  await expect(root.locator('[data-save-status]')).toHaveText('Source preservation: canonical');
  await editor.screenshot({ path: info.outputPath('table-flow-editor-edited.png') });
  const reader = root.frameLocator('iframe[title="Fountain scope reader"]');
  await expect(reader.locator('table')).toContainText('Edited: Beta');
  await expect(reader.locator('table code')).toHaveText('x + 1');
  await root.locator('iframe[title="Fountain scope reader"]').scrollIntoViewIfNeeded();
  await reader.locator('body').evaluate(body => body.ownerDocument.defaultView!.scrollTo(0, 0));
  await expect(reader.locator('section#results > p').first()).toBeInViewport();
  await expect(reader.locator('section#results > p').last()).toBeInViewport();
  await expect(reader.locator('section#results > p').first()).toHaveText('Before.');
  await expect.poll(() => reader.locator('body').evaluate(body => body.ownerDocument.readyState)).toBe('complete');
  await reader.locator('section#results > p').first().screenshot({ path: info.outputPath('table-flow-reader-before-edited.png') });
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await page.screenshot({ path: info.outputPath('table-flow-reader-edited.png') });
  await root.getByRole('button', { name: 'Reopen saved Markdown' }).click();
  await expect(root.locator('[data-save-status]')).toContainText('Saved Markdown reopened');
  await expect(rows).toHaveCount(3);
  await expect(beta.locator('p')).toHaveText('Edited: Beta');
  await expect(code).toHaveText('x + 1');
  await expect(rows.nth(1).locator('strong')).toHaveText('Alpha');
  await expect(rows.nth(1).locator('a')).toHaveAttribute('href', '/ready');
  await expect(rows.nth(1).locator('td').last().locator('p')).toHaveCSS('text-align', 'right');
  await beta.locator('p').click(); await page.keyboard.press('End'); await page.keyboard.type(' reopened');
  await expect(beta.locator('p')).toHaveText('Edited: Beta reopened');
  await editor.screenshot({ path: info.outputPath('table-flow-editor-reopened.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.scrollIntoViewIfNeeded();
  expect(await table.evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
  await editor.screenshot({ path: info.outputPath('table-flow-editor-narrow.png') });
  expect(errors).toEqual([]);
}

export async function htmlBlockAtomsJourney(page: Page, info: TestInfo) {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Anonymous flow sample').selectOption('blocks');
  const root = page.locator('#markdown-document-audit');
  const editor = root.getByRole('textbox', { name: 'Whole-document scope editor' });
  const section = editor.locator('section#report');
  const save = root.getByRole('button', { name: 'Save Markdown', exact: true });
  const saved = root.getByLabel('Saved scope Markdown');
  await expect(section.locator('p')).toHaveCount(2);
  await expect(section.locator('hr')).toHaveCount(1);
  await expect(section.locator('img')).toHaveAttribute('src', '/demo-media.svg');
  await expect(section.locator('img')).toHaveAttribute('alt', 'A & B');
  await expect.poll(() => section.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await save.click();
  await expect(saved).toHaveValue('<section id="report">\n\nBefore.\n\n---\n\n![A & B](/demo-media.svg "Diagram")\n\nAfter **review**.\n\n</section>\n');
  await expect(section.getByLabel('Image caption')).toHaveValue('');
  await editor.screenshot({ path: info.outputPath('block-atoms-editor-original.png') });
  for (const [title, name] of [['Reference scope reader', 'reference'], ['Fountain scope reader', 'reader']] as const) {
    const frame = root.frameLocator(`iframe[title="${title}"]`);
    await expect(frame.locator('section#report hr')).toHaveCount(1);
    await expect(frame.locator('section#report img')).toHaveAttribute('alt', 'A & B');
    await expect.poll(() => frame.locator('section#report img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    const viewport = root.locator(`iframe[title="${title}"]`);
    await viewport.scrollIntoViewIfNeeded();
    await frame.locator('body').evaluate(body => body.ownerDocument.defaultView!.scrollTo(0, 0));
    await expect(frame.locator('section#report > p').first()).toBeInViewport();
    await expect(frame.locator('section#report > p').last()).toBeInViewport();
    // Record what the user actually sees, including the labelled reader and
    // page chrome. Do not mix a viewport-relative bounding box with a page clip
    // or ask an element screenshot to scroll the sandboxed document again.
    await page.screenshot({ path: info.outputPath(`block-atoms-${name}-original.png`), timeout: 10_000 });
  }
  const last = section.locator('p').last();
  await last.click(); await page.keyboard.press('Home'); await page.keyboard.type('Updated: ');
  await expect(last).toHaveText('Updated: After review.');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(last).toHaveText('After review.');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(last).toHaveText('Updated: After review.');
  await page.keyboard.press('Enter');
  await expect(section.locator('p')).toHaveCount(3);
  await page.keyboard.press('Backspace');
  await expect(section.locator('p')).toHaveCount(2);
  await expect(last).toHaveText('Updated: After review.');
  await expect(last.locator('strong')).toHaveText('review');
  await save.click();
  expect(await saved.inputValue()).toContain('Updated: After');
  await editor.screenshot({ path: info.outputPath('block-atoms-editor-edited.png') });
  await root.getByRole('button', { name: 'Reopen saved Markdown' }).click();
  await expect(root.locator('[data-save-status]')).toContainText('Saved Markdown reopened');
  await expect(section.locator('hr')).toHaveCount(1);
  await expect(section.locator('img')).toHaveAttribute('alt', 'A & B');
  await expect(section.locator('p').last()).toHaveText('Updated: After review.');
  await expect(section.locator('p').last().locator('strong')).toHaveText('review');
  await editor.screenshot({ path: info.outputPath('block-atoms-editor-reopened.png') });
  await section.locator('p').last().click(); await page.keyboard.press('End'); await page.keyboard.type(' Reopened.');
  await expect(section.locator('p').last()).toHaveText('Updated: After review. Reopened.');
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.scrollIntoViewIfNeeded();
  const imageBounds = await section.locator('img').boundingBox();
  expect(imageBounds).not.toBeNull();
  expect(imageBounds!.width).toBeLessThanOrEqual(390);
  await editor.screenshot({ path: info.outputPath('block-atoms-editor-mobile.png') });
  expect(errors).toEqual([]);
}

export async function htmlFlowJourney(page: Page, info: TestInfo) {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html');
  const input = page.getByLabel('Markdown input', { exact: true });
  await input.click(); await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('<a href="/guide">First paragraph.\n\nSecond **paragraph**.</a>\n');
  await page.getByLabel('Convert HTML across the complete document', { exact: true }).check();
  await expect(page.getByLabel('Markdown HTML conversion details')).toContainText('whitespace-only formatted paragraph');
  await page.getByLabel('Preserve anonymous inline HTML flow', { exact: true }).check();
  await expect(page.getByLabel('Markdown HTML conversion details')).not.toContainText('whitespace-only formatted paragraph');
  const output = page.locator('.demo-output');
  await expect(output).toContainText('"type": "html_flow"');
  const root = page.locator('#markdown-document-audit');
  const editor = root.getByRole('textbox', { name: 'Whole-document scope editor' });
  const saved = root.getByLabel('Saved scope Markdown');
  const save = root.getByRole('button', { name: 'Save Markdown', exact: true });
  const reference = root.locator('iframe[title="Reference scope reader"]');
  const reader = root.locator('iframe[title="Fountain scope reader"]');
  const referenceFrame = root.frameLocator('iframe[title="Reference scope reader"]');
  const readerFrame = root.frameLocator('iframe[title="Fountain scope reader"]');
  await save.click();
  await expect(editor.locator('p')).toHaveCount(2);
  await expect(editor.locator('[data-fountain-node="html_flow"]')).toHaveCount(1);
  await expect(saved).toHaveValue('<a href="/guide">First paragraph.\n\nSecond **paragraph**.</a>\n');
  await expect(readerFrame.locator('p')).toHaveCount(2);
  await expect(referenceFrame.locator('p')).toHaveCount(2);
  const geometry = async (frame: typeof readerFrame) => frame.locator('p').evaluateAll(nodes => {
    const first = nodes[0].getBoundingClientRect();
    return nodes.map(node => { const rect = node.getBoundingClientRect(); return [rect.y - first.y, rect.height, rect.width]; });
  });
  expect(await geometry(readerFrame)).toEqual(await geometry(referenceFrame));
  // The actual editor must not add a line either, even with its pre-wrap text CSS.
  const positions = await editor.locator('p').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().y));
  expect(positions[1] - positions[0]).toBe(40);
  await editor.scrollIntoViewIfNeeded(); await editor.screenshot({ path: info.outputPath('flow-editor-original.png') });
  await reader.scrollIntoViewIfNeeded(); await readerFrame.locator('body').screenshot({ path: info.outputPath('flow-reader-original.png') });
  await reference.scrollIntoViewIfNeeded(); await referenceFrame.locator('body').screenshot({ path: info.outputPath('flow-reference-original.png') });
  await root.getByRole('button', { name: 'Edit between paragraphs' }).click();
  await page.keyboard.type('Between');
  await expect(editor.locator('[data-fountain-node="html_flow"]')).toContainText('Between');
  await page.keyboard.press('Enter');
  await expect(editor.locator('p')).toHaveCount(3);
  await page.keyboard.type('New paragraph');
  await expect(editor.locator('p').filter({ hasText: 'New paragraph' })).toBeVisible();
  await page.keyboard.press('Home'); await page.keyboard.press('Backspace');
  await expect(editor.locator('p')).toHaveCount(2);
  await expect(editor.locator('[data-fountain-node="html_flow"]')).toContainText('BetweenNew paragraph');
  await editor.screenshot({ path: info.outputPath('flow-editor-enter-delete.png') });
  await save.click();
  await expect(root.getByRole('status')).toHaveText('Source preservation: canonical');
  expect(await saved.inputValue()).toContain('data-fountain-html-flow="true"');
  await expect(readerFrame.getByText('BetweenNew paragraph', { exact: false })).toBeVisible();
  await reader.scrollIntoViewIfNeeded(); await readerFrame.locator('body').screenshot({ path: info.outputPath('flow-reader-edited.png') });
  await editor.locator('[data-fountain-node="html_flow"]').click();
  await page.keyboard.press('ControlOrMeta+z'); // join
  await page.keyboard.press('ControlOrMeta+z'); // New paragraph typing
  await page.keyboard.press('ControlOrMeta+z'); // Enter
  await page.keyboard.press('ControlOrMeta+z'); // Between typing
  await save.click();
  await expect(saved).toHaveValue('<a href="/guide">First paragraph.\n\nSecond **paragraph**.</a>\n');
  await expect(root.getByRole('status')).toHaveText('Source preservation: exact');
  expect(await geometry(readerFrame)).toEqual(await geometry(referenceFrame));
  await page.setViewportSize({ width: 390, height: 844 });
  await reader.scrollIntoViewIfNeeded();
  expect(await geometry(readerFrame)).toEqual(await geometry(referenceFrame));
  await readerFrame.locator('body').screenshot({ path: info.outputPath('flow-reader-mobile.png') });
  await editor.scrollIntoViewIfNeeded(); await editor.screenshot({ path: info.outputPath('flow-editor-mobile.png') });
  expect(errors).toEqual([]);
}

export async function htmlFlowClipboardJourney(page: Page, info: TestInfo) {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Anonymous flow sample', { exact: true }).selectOption('plain-flow');
  const root = page.locator('#markdown-document-audit');
  const editor = root.getByRole('textbox', { name: 'Whole-document scope editor' });
  const flow = editor.locator('[data-fountain-node="html_flow"]');
  const focus = root.getByRole('button', { name: 'Edit inline content', exact: true });
  await expect(flow).toHaveText('Before');
  await page.evaluate(() => {
    document.querySelector('[aria-label="Whole-document scope editor"]')!.addEventListener('copy', event => {
      const data = (event as ClipboardEvent).clipboardData;
      (globalThis as any).__flowCopy = { plain: data?.getData('text/plain'), html: data?.getData('text/html') };
    }, { once: true });
    document.querySelector('[aria-label="Whole-document scope editor"]')!.addEventListener('paste', event => {
      const data = (event as ClipboardEvent).clipboardData;
      (globalThis as any).__flowPaste = { plain: data?.getData('text/plain'), html: data?.getData('text/html'), types: data ? [...data.types] : [] };
    }, { once: true });
  });
  await focus.click(); await page.keyboard.press('Shift+End');
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => (globalThis as any).__flowCopy?.plain)).toBe('Before');
  expect(await page.evaluate(() => (globalThis as any).__flowCopy?.html)).toContain('Before');
  await page.keyboard.press('End');
  const caret = await page.evaluate(() => {
    const selection = document.getSelection();
    return { collapsed: selection?.isCollapsed, text: selection?.toString(), anchor: selection?.anchorNode?.nodeName,
      offset: selection?.anchorOffset, parent: selection?.anchorNode?.parentElement?.outerHTML.slice(0, 300) };
  });
  await page.keyboard.press('ControlOrMeta+v');
  await info.attach('real-clipboard-evidence.json', { body: JSON.stringify({ caret,
    paste: await page.evaluate(() => (globalThis as any).__flowPaste ?? null) }), contentType: 'application/json' });
  await expect(flow).toHaveText('BeforeBefore');
  await expect(editor.locator('p')).toHaveCount(0);
  await editor.screenshot({ path: info.outputPath('flow-internal-real-paste.png') });
  await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await page.keyboard.press('ControlOrMeta+c');
  await page.evaluate(() => {
    const external = document.createElement('textarea'); external.setAttribute('aria-label', 'External plain-text destination');
    document.querySelector('#markdown-document-audit')!.append(external);
  });
  const external = page.getByRole('textbox', { name: 'External plain-text destination', exact: true });
  await external.focus(); await page.keyboard.press('ControlOrMeta+v');
  await expect(external).toHaveValue('BeforeBefore');
  await external.screenshot({ path: info.outputPath('flow-external-real-paste.png') });
  expect(errors).toEqual([]);
}

export async function htmlFlowRetentionJourney(page: Page, info: TestInfo) {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Anonymous flow sample', { exact: true }).selectOption('plain-flow');
  const root = page.locator('#markdown-document-audit');
  const editor = root.getByRole('textbox', { name: 'Whole-document scope editor' });
  const flow = editor.locator('[data-fountain-node="html_flow"]');
  const focus = root.getByRole('button', { name: 'Edit inline content', exact: true });
  const save = root.getByRole('button', { name: 'Save Markdown', exact: true });
  const reopen = root.getByRole('button', { name: 'Reopen saved Markdown', exact: true });
  const saved = root.getByLabel('Saved scope Markdown');
  const reader = root.frameLocator('iframe[title="Fountain scope reader"]');
  await expect(flow).toHaveText('Before');
  await focus.click(); await page.keyboard.press('End'); await page.keyboard.type('Before');
  await expect(flow).toHaveText('BeforeBefore');
  // Actual cut clears the whole leaf. Reopen must retain that leaf, not invent
  // a paragraph or silently redirect the edit to a different document block.
  await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
  await page.keyboard.press('ControlOrMeta+x');
  await expect(flow).toHaveText('');
  await expect(flow.locator('[data-fountain-text-path]')).toHaveCount(1);
  await save.click();
  await expect(saved).toHaveValue('<div data-fountain-html-flow="true" data-fountain-empty-text="true"></div>');
  // Image samples share this scriptless reader; validate the exact bounded
  // policy rather than the older pre-image policy or a permissive substring.
  await expect(reader.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content',
    `default-src 'none'; style-src 'unsafe-inline'; img-src ${new URL(page.url()).origin} data:`);
  await expect(root.locator('iframe[title="Fountain scope reader"]')).toHaveAttribute('sandbox', '');
  await expect(reader.locator('script')).toHaveCount(0);
  await expect(reader.locator('body')).toHaveText('');
  await expect(reader.locator('p')).toHaveCount(0);
  await reopen.click();
  await expect(root.getByRole('status')).toContainText('Saved Markdown reopened');
  await expect(flow.locator('[data-fountain-text-path]')).toHaveCount(1);
  await focus.click(); await page.keyboard.type('After reopening');
  await expect(flow).toHaveText('After reopening');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(flow).toHaveText('');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(flow).toHaveText('After reopening');
  await save.click();
  await expect(reader.locator('body')).toHaveText('After reopening');
  await expect(reader.locator('p')).toHaveCount(0);
  await editor.screenshot({ path: info.outputPath('flow-reopened-typed.png') });
  await root.locator('iframe[title="Fountain scope reader"]').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('flow-reopened-reader.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.scrollIntoViewIfNeeded();
  await editor.screenshot({ path: info.outputPath('flow-reopened-mobile.png') });
  await page.getByLabel('Anonymous flow sample', { exact: true }).selectOption('empty-flow');
  await expect(flow.locator('[data-fountain-text-path]')).toHaveCount(0);
  await expect(flow).toHaveAttribute('data-fountain-empty-text-block', 'true');
  await save.click();
  await expect(saved).toHaveValue('<div data-fountain-html-flow="true"></div>');
  await reopen.click();
  await focus.click(); await page.keyboard.type('Filled childless flow');
  await expect(flow).toHaveText('Filled childless flow');
  await expect(editor.locator('p')).toHaveCount(0);
  await editor.screenshot({ path: info.outputPath('flow-childless-filled-mobile.png') });
  await save.click();
  await expect(reader.locator('body')).toHaveText('Filled childless flow');
  await root.locator('iframe[title="Fountain scope reader"]').scrollIntoViewIfNeeded();
  await reader.locator('body').screenshot({ path: info.outputPath('flow-childless-filled-reader.png') });
  await focus.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('flow-workshop-controls-mobile.png') });
  expect(await root.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
}
