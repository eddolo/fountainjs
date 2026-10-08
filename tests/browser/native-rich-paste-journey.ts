import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

/** Native external copy, independent rich destination, then real Fountain paste.
 * Event observers never supply data, move a caret or invoke editor commands.
 */
export async function nativeRichPasteJourney(page: Page, info: TestInfo): Promise<void> {
  const source = '<h2>Research note</h2><p>Result is <strong>bold</strong> with <em>emphasis</em> and <a href="https://example.org/reference">reference</a>.</p><blockquote dir="rtl"><p>שלום source</p></blockquote><pre dir="ltr"><code>value = 1\nprint(value)</code></pre><table><tbody><tr><td>Sample</td><td>Value</td></tr><tr><td>A</td><td>42</td></tr></tbody></table>';
  const native = await page.context().newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const observe = async (surface: import('@playwright/test').Locator) => {
    await surface.evaluate(element => {
      const events: unknown[] = [];
      (globalThis as any).__nativeRichPasteEvents = events;
      for (const type of ['paste', 'beforeinput']) element.addEventListener(type, event => {
        const data = type === 'paste' ? (event as ClipboardEvent).clipboardData : (event as InputEvent).dataTransfer;
        events.push({ type, trusted: event.isTrusted, cancelable: event.cancelable, inputType: (event as InputEvent).inputType,
          types: data ? [...data.types] : [], plain: data?.getData('text/plain') ?? '',
          html: data?.getData('text/html') ?? '', json: data?.getData('application/x-fountainjs+json') ?? '' });
      }, { capture: true });
    });
  };
  try {
    await native.setContent(`<style>body{font:18px/1.5 sans-serif;width:760px}td{border:1px solid #bbb;padding:8px}blockquote{border-inline-start:3px solid #7650ff;padding:12px}</style><div contenteditable="true" role="textbox" aria-label="Native source">${source}</div><hr><div contenteditable="true" role="textbox" aria-label="Native destination"></div>`);
    const original = native.getByLabel('Native source'), control = native.getByLabel('Native destination');
    await original.screenshot({ path: info.outputPath('native-rich-paste-original.png') });
    await original.focus();
    await native.keyboard.press('ControlOrMeta+a'); await native.keyboard.press('ControlOrMeta+c');
    await native.keyboard.insertText('The original source has been replaced');
    await observe(control); await control.focus(); await native.keyboard.press('ControlOrMeta+v');
    await control.screenshot({ path: info.outputPath('native-rich-paste-control.png') });
    const nativeEvents = await native.evaluate(() => (globalThis as any).__nativeRichPasteEvents);
    const nativeHTML = await control.innerHTML();
    await writeFile(info.outputPath('native-rich-paste-control.json'), JSON.stringify({ source, nativeEvents, nativeHTML }, null, 2));
    await expect(control.locator('h2')).toHaveText('Research note');
    await expect(control.locator('strong, b')).toHaveText('bold');
    await expect(control.locator('em, i')).toHaveText('emphasis');
    await expect(control.locator('a')).toHaveAttribute('href', 'https://example.org/reference');
    await expect(control.locator('blockquote')).toHaveText('שלום source');
    await expect(control.locator('blockquote')).toHaveCSS('direction', 'rtl');
    await expect(control.locator('td')).toHaveCount(4);
    expect(await control.locator('pre').textContent()).toBe('value = 1\nprint(value)');

    await page.goto('/conversion-lab.html');
    const name = 'native-rich-destination.html';
    await page.getByLabel('Choose documents').setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from('<p>Replace this destination</p>') });
    const workspace = page.getByRole('region', { name: `Conversion workspace: ${name}`, exact: true });
    const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
    await observe(editor); await editor.click();
    await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('ControlOrMeta+v');
    await editor.screenshot({ path: info.outputPath('native-rich-paste-editor.png') });
    await writeFile(info.outputPath('native-rich-paste-editor.json'), JSON.stringify({ source, nativeEvents, nativeHTML,
      editorEvents: await page.evaluate(() => (globalThis as any).__nativeRichPasteEvents), editorHTML: await editor.innerHTML(), pageErrors: errors }, null, 2));
    await expect(editor).not.toContainText('Replace this destination');
    await expect(editor.locator('h2')).toHaveText('Research note');
    await expect(editor.locator('strong')).toHaveText('bold');
    await expect(editor.locator('em')).toHaveText('emphasis');
    await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.org/reference');
    await expect(editor.locator('blockquote')).toHaveText('שלום source');
    await expect(editor.locator('blockquote')).toHaveCSS('direction', 'rtl');
    await expect(editor.locator('td')).toHaveCount(4);
    expect(await editor.locator('pre').textContent()).toBe('value = 1\nprint(value)');
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(editor).toHaveText('Replace this destination');
    await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(editor.locator('strong')).toHaveText('bold');
    await expect(editor.locator('td')).toHaveCount(4);
    expect(errors).toEqual([]);
  } finally { await native.close(); }
}
