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
  // Measure actual painted source text, not the pre's inherited foreground:
  // native clipboard markup can include its own nested colour marks.
  const codeAppearance = async (surface: import('@playwright/test').Locator) => surface.locator('pre code').evaluate(code => {
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && !text.textContent?.trim()) text = walker.nextNode();
    if (!text?.parentElement) throw new Error('No visible code source to inspect');
    const foreground = getComputedStyle(text.parentElement).color;
    let background = 'rgb(255, 255, 255)';
    for (let ancestor: Element | null = text.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const value = getComputedStyle(ancestor).backgroundColor;
      if (value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)') { background = value; break; }
    }
    const luminance = (value: string) => {
      const channels = value.match(/[\d.]+/g)!.slice(0, 3).map(value => {
        const channel = Number(value) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
    };
    const light = luminance(foreground), dark = luminance(background);
    return { foreground, background, contrast: (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05) };
  });
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
    const nativeAppearance = await codeAppearance(control);
    await writeFile(info.outputPath('native-rich-paste-control.json'), JSON.stringify({ source, nativeEvents, nativeHTML, nativeAppearance }, null, 2));
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
    const editorAppearance = await codeAppearance(editor);
    await writeFile(info.outputPath('native-rich-paste-editor.json'), JSON.stringify({ source, nativeEvents, nativeHTML,
      nativeAppearance, editorAppearance, editorEvents: await page.evaluate(() => (globalThis as any).__nativeRichPasteEvents), editorHTML: await editor.innerHTML(), pageErrors: errors }, null, 2));
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
    expect(nativeAppearance.contrast, JSON.stringify(nativeAppearance)).toBeGreaterThanOrEqual(4.5);
    expect(editorAppearance.contrast, JSON.stringify(editorAppearance)).toBeGreaterThanOrEqual(4.5);
  } finally { await native.close(); }
}
