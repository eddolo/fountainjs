import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

/** File import, normal toolbar/keyboard actions, dynamic first-strong editing,
 * actual download/reopen. DOM access only observes state; it never sets a caret.
 */
export async function listAutoScopeJourney(page: Page, info: TestInfo, action: 'convert' | 'lift', clipboard = false): Promise<void> {
  const source = '<ol dir="auto" start="0"><li><p>שלום</p></li><li><p>English selected</p></li><li><p>English tail</p></li></ol>';
  const observations: Record<string, unknown> = { action, source };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const native = await page.context().newPage();
  try {
    await native.setContent(`<style>body{width:700px}p{margin:16px 0}</style>${source}`);
    observations.nativeBefore = await native.locator('p').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).direction));
    expect(observations.nativeBefore).toEqual(['rtl', 'rtl', 'rtl']);
    if (!clipboard) await native.locator('body').screenshot({ path: info.outputPath('auto-scope-native.png') });
  } finally { await native.close(); }
  await page.goto('/conversion-lab.html');
  const name = `automatic-list-${action}.html`;
  await page.getByLabel('Choose documents').setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from(source) });
  const workspace = page.getByRole('region', { name: `Conversion workspace: ${name}`, exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const selected = editor.locator('p').filter({ hasText: 'English selected' });
  await expect(selected).toBeVisible();
  const original = await editor.locator('p').allTextContents();
  const directions = () => editor.locator('p').filter({ hasText: /שלום|English selected|English tail/ }).evaluateAll(nodes => nodes.map(node => getComputedStyle(node).direction));
  expect(await directions()).toEqual(observations.nativeBefore);
  await selected.click();
  await workspace.getByRole('button', { name: action === 'lift' ? 'Lift list item' : 'Bullet list', exact: true }).click();
  const group = editor.locator('div[data-fountain-direction-scope]');
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAttribute('dir', 'auto');
  expect(await directions()).toEqual(observations.nativeBefore);
  expect(await editor.locator('p').allTextContents()).toEqual(original);
  observations.afterTransform = await directions();
  if (!clipboard) await editor.screenshot({ path: info.outputPath('auto-scope-transformed.png') });
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(group).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(group).toHaveCount(1);
  if (action === 'lift') {
    await selected.click();
    await workspace.getByRole('button', { name: 'Bullet list', exact: true }).click();
    await expect(group.locator(':scope > ul')).toHaveCount(1);
    await selected.click();
    await page.keyboard.press('Shift+Tab');
    await expect(group.locator(':scope > p').filter({ hasText: 'English selected' })).toHaveCount(1);
    await expect(group).toHaveCount(1);
  }
  await selected.click();
  await page.keyboard.press('End');
  const paragraphs = await editor.locator('p').count();
  await page.keyboard.press('Enter');
  await expect(editor.locator('p')).toHaveCount(paragraphs + 1);
  await page.keyboard.insertText('Real new line');
  await expect(editor.locator('p').filter({ hasText: 'Real new line' })).toBeVisible();
  if (!clipboard) await editor.screenshot({ path: info.outputPath('auto-scope-enter.png') });
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await expect(editor.locator('p')).toHaveCount(paragraphs);
  await expect(selected).toContainText('Real new line');
  if (!clipboard) await editor.screenshot({ path: info.outputPath('auto-scope-backspace.png') });

  const anchor = editor.locator('p').filter({ hasText: 'שלום' });
  await anchor.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('שלום');
  await page.keyboard.insertText('English anchor');
  await expect(editor.locator('p').filter({ hasText: 'English anchor' })).toHaveText('English anchor');
  observations.afterAnchorEdit = await group.locator('p').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).direction));
  expect((observations.afterAnchorEdit as string[]).every(dir => dir === 'ltr')).toBe(true);
  await expect(group).toHaveAttribute('dir', 'auto');
  if (!clipboard) await editor.screenshot({ path: info.outputPath('auto-scope-anchor-edited.png') });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(anchor).toHaveText('שלום');
  expect((await group.locator('p').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).direction))).every(dir => dir === 'rtl')).toBe(true);
  if (!clipboard) await editor.screenshot({ path: info.outputPath('auto-scope-anchor-undo.png') });
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  expect((await group.locator('p').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).direction))).every(dir => dir === 'ltr')).toBe(true);
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('html');
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const download = await pending;
  const html = await readFile((await download.path())!, 'utf8');
  expect(html.match(/dir="auto"/g)).toHaveLength(1);
  const reader = await page.context().newPage();
  try {
    await reader.setContent(html);
    observations.reader = await reader.locator('[data-fountain-direction-scope] p').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, direction: getComputedStyle(node).direction })));
    expect((observations.reader as {direction: string}[]).every(node => node.direction === 'ltr')).toBe(true);
    expect(await reader.locator('[data-fountain-direction-scope] p').allTextContents()).toEqual(await group.locator('p').allTextContents());
    if (!clipboard) await reader.locator('body').screenshot({ path: info.outputPath('auto-scope-downloaded-reader.png') });
  } finally { await reader.close(); }
  if (clipboard) {
    // Observe, but never manufacture, the native clipboard payload.
    await editor.evaluate(element => element.addEventListener('copy', event => {
      const data = (event as ClipboardEvent).clipboardData;
      (globalThis as any).__autoScopeCopy = { plain: data?.getData('text/plain'), html: data?.getData('text/html'),
        types: data ? [...data.types] : [], json: data?.getData('application/x-fountainjs+json') };
    }, { once: true }));
    await editor.evaluate(element => element.addEventListener('paste', event => {
      const data = (event as ClipboardEvent).clipboardData;
      (globalThis as any).__autoScopePaste = { plain: data?.getData('text/plain'), html: data?.getData('text/html'),
        types: data ? [...data.types] : [], json: data?.getData('application/x-fountainjs+json') };
    }, { once: true }));
    const beforePaste = await editor.locator('p').allTextContents();
    await selected.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+c');
    const copied = await page.evaluate(() => (globalThis as any).__autoScopeCopy as {plain: string; html: string});
    // Portable plain text intentionally includes list markers. The retained
    // zero-based prefix and restarted suffix must not be renumbered on copy.
    expect(copied.plain.trim()).toBe(`0. English anchor\n${action === 'convert' ? '- ' : ''}English selectedReal new line\n2. English tail`);
    expect(copied.html).toContain('data-fountain-direction-scope');
    // A no-op paste into identical selected content would not prove that the
    // browser actually delivered a payload. Replace it first, then restore.
    await page.keyboard.insertText('Temporary replacement');
    await expect(group).toHaveCount(0);
    await expect(editor).toContainText('Temporary replacement');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+v');
    // Preserve delivered payload and resulting surface before the retention
    // assertion, including on failure. Copy-event setData is not proof that the
    // OS/browser subsequently delivers those same formats to a paste target.
    const deliveryPath = info.outputPath('auto-scope-native-clipboard-delivery.json');
    await writeFile(deliveryPath, JSON.stringify(await editor.evaluate(element => ({
      copied: (globalThis as any).__autoScopeCopy, delivered: (globalThis as any).__autoScopePaste,
      result: element.outerHTML,
    })), null, 2));
    await info.attach('auto-scope-native-clipboard-delivery.json', { path: deliveryPath, contentType: 'application/json' });
    await expect(group).toHaveCount(1);
    await expect(group.locator(':scope > ol')).toHaveCount(2);
    expect(await group.locator(':scope > ol').evaluateAll(nodes => nodes.map(node => node.getAttribute('start')))).toEqual(['0', '2']);
    await expect(group.locator(':scope > ul')).toHaveCount(action === 'convert' ? 1 : 0);
    await expect(group.locator(':scope > p')).toHaveCount(action === 'lift' ? 1 : 0);
    expect(await editor.locator('p').allTextContents()).toEqual(beforePaste);
    expect((await group.locator('p').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).direction))).every(dir => dir === 'ltr')).toBe(true);
    await editor.screenshot({ path: info.outputPath('auto-scope-internal-paste.png') });
    await page.evaluate(() => {
      const external = document.createElement('textarea');
      external.setAttribute('aria-label', 'External automatic-scope text destination');
      external.rows = 5; external.cols = 65;
      document.body.append(external);
    });
    const external = page.getByRole('textbox', { name: 'External automatic-scope text destination', exact: true });
    await external.click();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(external).toHaveValue(copied.plain);
    await external.screenshot({ path: info.outputPath('auto-scope-external-paste.png') });
    observations.clipboard = { ...copied, external: await external.inputValue(), internalParagraphs: beforePaste };
  }
  expect(errors).toEqual([]);
  observations.pageErrors = errors;
  await writeFile(info.outputPath('auto-scope-observations.json'), JSON.stringify(observations, null, 2));
}
