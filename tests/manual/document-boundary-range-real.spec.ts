import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { runDocumentBoundaryRangeJourney } from '../browser/document-boundary-range-journey';

test('replaces directed text-to-image document boundary ranges in ordinary and virtual documents', async ({ page }, info) => {
  test.setTimeout(120_000); // Eight full import/edit/history/download/reopen workflows.
  await runDocumentBoundaryRangeJourney(page, info);
});

test('copies and cuts a partial text-to-image range using trusted native clipboard events', async ({ page, browserName }, info) => {
  const png = await readFile(new URL('../fixtures/cross-container-figure.png', import.meta.url));
  await page.route('https://example.test/clipboard.png', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.goto('/issue-editor.html');
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles({ name: 'clipboard-range.md',
    mimeType: 'text/markdown', buffer: Buffer.from('Left\n\n![Clipboard figure](https://example.test/clipboard.png)\n') });
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  await expect.poll(() => editor.locator('img').evaluateAll(images => images.length === 1 && images.every(image => image instanceof HTMLImageElement
    && image.complete && image.naturalWidth === 400))).toBe(true);
  await page.evaluate(() => {
    const records: unknown[] = [];
    Object.assign(globalThis, { boundaryClipboardRecords: records });
    for (const type of ['copy', 'cut']) document.addEventListener(type, event => {
      const clipboard = event as ClipboardEvent;
      records.push({ type, trusted: event.isTrusted, prevented: event.defaultPrevented,
        plain: clipboard.clipboardData?.getData('text/plain'), html: clipboard.clipboardData?.getData('text/html'),
        fountain: clipboard.clipboardData?.getData('application/x-fountainjs+json') });
    });
  });
  await editor.locator('[data-fountain-text-path]').filter({ hasText: /^Left$/ }).click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+Shift+End');
  await page.keyboard.press('Control+c');
  const records = async () => page.evaluate(() => (globalThis as unknown as { boundaryClipboardRecords: {
    type: string; trusted: boolean; prevented: boolean; plain: string; html: string; fountain: string;
  }[] }).boundaryClipboardRecords);
  await expect.poll(async () => (await records()).length).toBe(1);
  const copy = (await records())[0]!;
  expect(copy).toMatchObject({ type: 'copy', trusted: true, prevented: true });
  expect(copy.plain).toContain('ft');
  expect(copy.plain).not.toContain('Left');
  expect(copy.html).toContain('<img');
  expect(copy.html).not.toContain('data-fountain-path');
  const copied = JSON.parse(copy.fountain);
  expect(copied.document.content[0].content[0].text).toBe('ft');
  expect(copied.document.content[1].attrs.alt).toBe('Clipboard figure');
  await expect(editor.locator('img')).toHaveCount(1);
  await page.keyboard.press('Control+x');
  await expect.poll(async () => (await records()).length).toBe(2);
  expect((await records())[1]).toMatchObject({ type: 'cut', trusted: true, prevented: true, fountain: copy.fountain });
  await expect(editor.locator('img')).toHaveCount(0);
  await expect(editor.locator(':scope > p')).toHaveText('Le');
  await editor.screenshot({ path: info.outputPath('mixed-range-cut.png') });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.locator('img')).toHaveCount(1);
  await expect(editor.locator(':scope > p')).toHaveText('Left');
  if (browserName === 'chromium') {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    // A plain independent contenteditable receives OS clipboard HTML. It has
    // no Fountain renderer, editor state or clipboard handler.
    await page.evaluate(() => {
      const target = document.createElement('div'); target.contentEditable = 'true';
      target.setAttribute('role', 'textbox'); target.setAttribute('aria-label', 'External paste destination');
      target.style.cssText = 'min-height:100px;background:white;padding:20px'; document.body.appendChild(target); target.focus();
    });
    await page.keyboard.press('Control+v');
    const external = page.getByRole('textbox', { name: 'External paste destination' });
    await expect(external).toContainText('ft');
    await expect(external.locator('img[alt="Clipboard figure"]')).toHaveCount(1);
    await expect(external.locator('[data-fountain-path], [data-fountain-text-path], [data-fountain-widget]')).toHaveCount(0);
    await external.screenshot({ path: info.outputPath('mixed-range-external-paste.png') });
    await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
    await editor.locator('[data-fountain-text-path]').filter({ hasText: /^Left$/ }).click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('Control+Shift+End');
    await page.keyboard.press('Control+v');
    await expect(editor.locator(':scope > p')).toHaveText('ft');
    await expect(editor.locator('img[alt="Clipboard figure"]')).toHaveCount(1);
    // Pasting a final media block leaves an insertion gap. Typing must add a
    // paragraph after it rather than replace the newly pasted image.
    await page.keyboard.type('After');
    await expect(editor.locator('img[alt="Clipboard figure"]')).toHaveCount(1);
    await expect(editor.locator(':scope > p')).toHaveText(['ft', 'After']);
    await editor.screenshot({ path: info.outputPath('mixed-range-internal-paste.png') });
  }
  await writeFile(info.outputPath('clipboard-observations.json'), JSON.stringify({ engine: browserName,
    records: await records(), externalAndInternalOSPasteChecked: browserName === 'chromium' }, null, 2));
});
