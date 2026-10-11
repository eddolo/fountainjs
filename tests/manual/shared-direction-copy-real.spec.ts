import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const source = { type: 'doc', content: [
  { type: 'blockquote', attrs: { dir: 'auto', directionGroup: 'original-context' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'שלום anchor' }] }] },
  { type: 'blockquote', attrs: { dir: 'auto', directionGroup: 'original-context' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'English member' }] }] },
] };
const destination = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Replace this' }] }] };

for (const partial of [false, true]) test(`native shared-context ${partial ? 'partial snapshot' : 'complete copy'}`, async ({ page }, info) => {
  const native = await page.context().newPage(), errors: string[] = [];
  const observations: Record<string, unknown> = { partial, source };
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/conversion-lab.html');
    await page.getByLabel('Choose documents').setInputFiles([
      { name: 'source.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) },
      { name: 'target.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(destination)) },
    ]);
    const workspace = (name: string) => page.getByRole('region', { name: `Conversion workspace: ${name}`, exact: true });
    const selectFile = (name: string) => page.getByRole('navigation', { name: 'Imported files' }).getByRole('button', { name, exact: true }).click();
    const editor = (name: string) => workspace(name).getByRole('textbox', { name: 'Imported document editor', exact: true });
    const original = editor('source.json'), target = editor('target.json');
    const download = async (name: string) => {
      await selectFile(name);
      await workspace(name).getByRole('combobox', { name: 'Export format', exact: true }).selectOption('json');
      const pending = page.waitForEvent('download');
      await workspace(name).getByRole('button', { name: 'Download export', exact: true }).click();
      return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
    };
    const before = await download('source.json'), targetBefore = await download('target.json');
    await selectFile('source.json');
    await page.evaluate(() => {
      const records: unknown[] = [];
      (globalThis as any).__sharedCopyEvents = records;
      for (const type of ['keydown', 'keyup', 'copy']) document.addEventListener(type, event => {
        const selected = document.getSelection();
        const clipboard = (event as ClipboardEvent).clipboardData;
        records.push({ type, trusted: event.isTrusted, key: (event as KeyboardEvent).key,
          selection: selected?.toString(), anchor: selected?.anchorOffset, focus: selected?.focusOffset,
          anchorText: selected?.anchorNode?.textContent, focusText: selected?.focusNode?.textContent,
          prevented: event.defaultPrevented, types: clipboard ? [...clipboard.types] : undefined,
          plain: clipboard?.getData('text/plain'), html: clipboard?.getData('text/html') });
      });
    });
    // The editor also contains an empty trailing caret paragraph. Target the
    // intended text, not the last paragraph in the normalized document.
    await original.locator('p').filter({ hasText: 'English member' }).click();
    if (partial) { await page.keyboard.press('Home'); await page.keyboard.press('Shift+End'); }
    else await page.keyboard.press('ControlOrMeta+a');
    const selectionText = await page.evaluate(() => document.getSelection()?.toString() ?? '');
    observations.selectionText = selectionText;
    expect(selectionText).toContain('English member');
    if (partial) expect(selectionText).not.toContain('שלום anchor');
    await page.keyboard.press('ControlOrMeta+c');
    observations.copyEvents = await page.evaluate(() => (globalThis as any).__sharedCopyEvents);
    await original.screenshot({ path: info.outputPath('shared-copy-source.png') });

    // An independent editable destination receives actual OS rich clipboard.
    await native.setContent('<style>body{font:18px/1.5 sans-serif;padding:24px}blockquote{border-inline-start:3px solid #7650ff;padding-inline-start:16px}</style><div contenteditable="true" role="textbox" aria-label="Native destination"></div>');
    const control = native.getByLabel('Native destination');
    await native.evaluate(() => {
      document.addEventListener('paste', event => {
        const data = event.clipboardData;
        (globalThis as any).__sharedPasteDelivery = { trusted: event.isTrusted, types: data ? [...data.types] : [],
          plain: data?.getData('text/plain'), html: data?.getData('text/html') };
      });
    });
    await native.bringToFront(); await control.click(); await native.keyboard.press('ControlOrMeta+v');
    observations.pasteDelivery = await native.evaluate(() => (globalThis as any).__sharedPasteDelivery ?? null);
    await expect(control).toContainText('English member');
    await expect(control.locator('blockquote')).toHaveCount(partial ? 1 : 2);
    await expect(control.locator('blockquote').last()).toHaveCSS('direction', 'rtl');
    observations.nativeHTML = await control.innerHTML();
    await control.screenshot({ path: info.outputPath('shared-copy-external.png') });

    await page.bringToFront(); await selectFile('target.json'); await target.click();
    await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('ControlOrMeta+v');
    await expect(target).toContainText('English member');
    await expect(target.locator('blockquote')).toHaveCount(partial ? 1 : 2);
    await expect(target.locator('blockquote').last()).toHaveCSS('direction', 'rtl');
    const pasted = await download('target.json');
    observations.pasted = pasted;
    expect(await download('source.json')).toEqual(before);
    if (partial) {
      expect(pasted.content[0].attrs.dir).toBe('rtl');
      expect(pasted.content[0].attrs.directionGroup).toBeUndefined();
      expect(pasted.content[0].content[0].content[0].text).toBe('English member');
    } else {
      const group = pasted.content[0].attrs.directionGroup;
      expect(group).toMatch(/^[A-Za-z0-9_-]{1,96}$/);
      expect(group).not.toBe('original-context');
      expect(pasted.content[1].attrs.directionGroup).toBe(group);
      expect(pasted.content.map((node: { attrs: { dir: string } }) => node.attrs.dir)).toEqual(['auto', 'auto']);
    }
    await selectFile('target.json');
    await target.screenshot({ path: info.outputPath('shared-copy-fountain.png') });
    await workspace('target.json').getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await download('target.json')).toEqual(targetBefore);
    await workspace('target.json').getByRole('button', { name: 'Redo', exact: true }).click();
    expect(await download('target.json')).toEqual(pasted);
    expect(errors).toEqual([]);
  } finally {
    observations.pageErrors = errors;
    await writeFile(info.outputPath('shared-copy-observations.json'), JSON.stringify(observations, null, 2));
    await native.close();
  }
});
