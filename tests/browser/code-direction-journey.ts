import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

// Direction on PRE alone is insufficient: a block CODE child can accidentally
// suppress native per-line plaintext bidi layout. Measure a real Latin line.
async function latinLineAlignment(pre: Locator, reference = 'print(value)'): Promise<'left' | 'right'> {
  return pre.evaluate((element, reference) => {
    const code = element.querySelector('code')!;
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.parentElement?.closest('[data-fountain-widget]')) texts.push(node);
    }
    const source = texts.map(node => node.data).join('');
    const start = source.indexOf(reference);
    if (start < 0) throw new Error('Missing reference line');
    const endpoint = (offset: number): [Text, number] => {
      for (const node of texts) {
        if (offset <= node.length) return [node, offset];
        offset -= node.length;
      }
      throw new Error('Reference range outside code source');
    };
    const range = document.createRange();
    range.setStart(...endpoint(start)); range.setEnd(...endpoint(start + reference.length));
    const line = range.getBoundingClientRect(), box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const left = line.left - box.left - parseFloat(style.paddingLeft);
    const right = box.right - line.right - parseFloat(style.paddingRight);
    return left < right ? 'left' : 'right';
  }, reference);
}

/** Real file import, code-property UI, typing/newlines/history, download/reopen.
 * Browser access observes source and resolved direction; it never sets a caret.
 */
export async function codeDirectionJourney(page: Page, info: TestInfo, dir: 'ltr' | 'rtl' | 'auto'): Promise<void> {
  const raw = '# שלום comment\nvalue = "مرحبا"\nprint(value)';
  const source = `<blockquote dir="rtl"><p>Inherited technical note</p><pre data-language="python"><code>${raw}</code></pre></blockquote><pre dir="${dir}" data-language="python"><code>${raw}</code></pre><p>After the code</p>`;
  const evidence: Record<string, unknown> = { dir, source };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const native = await page.context().newPage();
  try {
    await native.setContent(`<style>body{font:18px/1.5 sans-serif;width:700px}pre{padding:16px;border:1px solid #bbb}</style>${source}`);
    evidence.nativeDirections = await native.locator('pre').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).direction));
    expect(evidence.nativeDirections).toEqual(['rtl', dir === 'ltr' ? 'ltr' : 'rtl']);
    evidence.nativeLatinAlignment = [await latinLineAlignment(native.locator('pre').nth(0)), await latinLineAlignment(native.locator('pre').nth(1))];
    expect(evidence.nativeLatinAlignment).toEqual(['right', dir === 'rtl' ? 'right' : 'left']);
    evidence.nativeCommentAlignment = [await latinLineAlignment(native.locator('pre').nth(0), '# שלום comment'), await latinLineAlignment(native.locator('pre').nth(1), '# שלום comment')];
    await native.locator('body').screenshot({ path: info.outputPath('code-direction-native.png') });
  } finally { await native.close(); }
  await page.goto('/conversion-lab.html');
  const name = `technical-direction-${dir}.html`;
  await page.getByLabel('Choose documents').setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from(source) });
  const workspace = page.getByRole('region', { name: `Conversion workspace: ${name}`, exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const inherited = editor.locator('blockquote pre'), owned = editor.locator(':scope > pre');
  await expect(owned).toHaveText(raw);
  await expect(inherited).not.toHaveAttribute('dir');
  expect(await editor.locator('pre').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).direction))).toEqual(evidence.nativeDirections);
  expect([await latinLineAlignment(inherited), await latinLineAlignment(owned)]).toEqual(evidence.nativeLatinAlignment);
  expect([await latinLineAlignment(inherited, '# שלום comment'), await latinLineAlignment(owned, '# שלום comment')]).toEqual(evidence.nativeCommentAlignment);
  await editor.screenshot({ path: info.outputPath('code-direction-imported.png') });
  const changeDirection = async (value: string) => {
    // The generated language label is a supported user-facing way to enter a
    // code buffer. Its handler lands at source offset zero, not inside a gutter.
    await owned.click({ position: { x: 40, y: 24 } });
    await workspace.getByRole('button', { name: 'Code block and language', exact: true }).click();
    await workspace.getByRole('combobox', { name: 'Code reading direction', exact: true }).selectOption(value);
    await page.keyboard.press('Escape');
  };
  const changed = dir === 'ltr' ? 'rtl' : 'ltr';
  await changeDirection(changed);
  await expect(owned).toHaveAttribute('dir', changed); await expect(owned).toHaveText(raw);
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(owned).toHaveAttribute('dir', dir); await expect(owned).toHaveText(raw);
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(owned).toHaveAttribute('dir', changed);
  await changeDirection('auto');
  await expect(owned).toHaveAttribute('dir', 'auto'); await expect(owned).toHaveCSS('direction', 'rtl');
  expect(await latinLineAlignment(owned)).toBe('left');
  await editor.screenshot({ path: info.outputPath('code-direction-property-controls.png') });
  await owned.click({ position: { x: 40, y: 24 } });
  await page.keyboard.insertText('English ');
  await expect(owned).toHaveText(`English ${raw}`); await expect(owned).toHaveCSS('direction', 'ltr');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(owned).toHaveText(raw); await expect(owned).toHaveCSS('direction', 'rtl');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(owned).toHaveText(`English ${raw}`); await expect(owned).toHaveCSS('direction', 'ltr');
  // Redo restores the source caret after the prefix. Enter/Backspace must add
  // and remove a real buffer newline, not an invisible layout-only position.
  await page.keyboard.press('Enter');
  await expect(owned).toHaveText(`English \n${raw}`); await expect(editor.locator('pre')).toHaveCount(2);
  expect(await latinLineAlignment(owned)).toBe('left');
  // Engines can differ in plaintext paragraph alignment after the first-strong
  // line changes. Compare the Hebrew line with native HTML in the same engine.
  const nativeNewline = await page.context().newPage();
  try {
    await nativeNewline.setContent(`<style>body{font:18px/1.5 sans-serif;width:700px}pre{padding:16px;border:1px solid #bbb}</style><pre dir="auto"><code>English \n${raw}</code></pre>`);
    evidence.nativeNewlineCommentAlignment = await latinLineAlignment(nativeNewline.locator('pre'), '# שלום comment');
    expect(await latinLineAlignment(owned, '# שלום comment')).toBe(evidence.nativeNewlineCommentAlignment);
    await nativeNewline.locator('body').screenshot({ path: info.outputPath('code-direction-native-newline.png') });
  } finally { await nativeNewline.close(); }
  await editor.screenshot({ path: info.outputPath('code-direction-real-newline.png') });
  await page.keyboard.press('Backspace');
  await expect(owned).toHaveText(`English ${raw}`);
  await expect(inherited).toHaveText(raw); await expect(inherited).toHaveCSS('direction', 'rtl');
  evidence.edited = { inherited: await inherited.textContent(), owned: await owned.textContent(), direction: await owned.evaluate(node => getComputedStyle(node).direction) };
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('html');
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const html = await readFile((await (await pending).path())!, 'utf8');
  evidence.downloadedHTML = html;
  const reader = await page.context().newPage();
  try {
    await reader.setContent(html);
    await expect(reader.locator('blockquote pre')).toHaveText(raw);
    await expect(reader.locator('blockquote pre')).not.toHaveAttribute('dir');
    await expect(reader.locator('blockquote pre')).toHaveCSS('direction', 'rtl');
    await expect(reader.locator('body > pre')).toHaveText(`English ${raw}`);
    await expect(reader.locator('body > pre')).toHaveAttribute('dir', 'auto');
    await expect(reader.locator('body > pre')).toHaveCSS('direction', 'ltr');
    expect(await latinLineAlignment(reader.locator('body > pre'))).toBe('left');
    await reader.locator('body').screenshot({ path: info.outputPath('code-direction-downloaded-reader.png') });
  } finally { await reader.close(); }
  const reopenedName = `reopened-${name}`;
  await page.getByLabel('Choose documents').setInputFiles({ name: reopenedName, mimeType: 'text/html', buffer: Buffer.from(html) });
  const reopened = page.getByRole('region', { name: `Conversion workspace: ${reopenedName}`, exact: true }).getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(reopened.locator('blockquote pre')).toHaveText(raw);
  await expect(reopened.locator(':scope > pre')).toHaveText(`English ${raw}`);
  await expect(reopened.locator(':scope > pre')).toHaveAttribute('dir', 'auto');
  await expect(reopened.locator(':scope > pre')).toHaveCSS('direction', 'ltr');
  expect(await latinLineAlignment(reopened.locator(':scope > pre'))).toBe('left');
  await reopened.screenshot({ path: info.outputPath('code-direction-reopened-editor.png') });
  expect(errors).toEqual([]); evidence.pageErrors = errors;
  await writeFile(info.outputPath('code-direction-observations.json'), JSON.stringify(evidence, null, 2));
}
