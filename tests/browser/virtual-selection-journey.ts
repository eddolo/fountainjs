import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MarkdownImporter, Schema, StarterKit } from 'fountainjs-editor';
import { issueMarkdownOptions } from '../../examples/react-app/src/issue-markdown-policy';

export async function runVirtualSelectionJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('virtual-selection-journey');
  await mkdir(root, { recursive: true });
  const firstText = 'Anchor paragraph.';
  const lastText = 'Paragraph 4999.';
  const source = '# Navigation audit\n\n' + firstText + '\n\n'
    + Array.from({ length: 4999 }, (_, index) => `Paragraph ${index + 1}.\n\n`).join('');
  await writeFile(resolve(root, 'original.md'), source);
  const errors: string[] = [];
  const downloadEvents: unknown[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('download', value => downloadEvents.push({ event: 'download', filename: value.suggestedFilename() }));
  page.on('console', message => {
    if (message.text().startsWith('fountain-download-input:')) downloadEvents.push(JSON.parse(message.text().slice('fountain-download-input:'.length)));
  });
  await page.goto('/issue-editor.html');
  // Observe actual input delivery when diagnosing a missing download event;
  // never replace a real click with an injected handler or synthetic download.
  await page.evaluate(() => {
    for (const type of ['pointerdown', 'pointerup', 'click']) document.addEventListener(type, event => {
      if (event.target instanceof Element && event.target.closest('button')?.textContent === 'Download Markdown draft') {
        console.debug('fountain-download-input:' + JSON.stringify({ event: type, trusted: event.isTrusted, at: performance.now() }));
      }
    }, true);
  });
  const upload = page.getByLabel('Open Markdown draft file', { exact: true });
  await upload.setInputFiles({ name: 'navigation.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const blocks = page.getByRole('complementary', { name: 'Fountain diagnostics' }).locator('dt:has-text("Document blocks") + dd');
  await expect(blocks).toHaveText('5001 top-level blocks');
  expect(await editor.locator(':scope > p').count()).toBeLessThan(200);
  const native = () => page.evaluate(() => {
    const selection = document.getSelection();
    const path = (node: Node | null | undefined) => (node instanceof Element ? node : node?.parentElement)
      ?.closest('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path') ?? null;
    return { anchor: path(selection?.anchorNode), anchorOffset: selection?.anchorOffset,
      focus: path(selection?.focusNode), focusOffset: selection?.focusOffset, collapsed: selection?.isCollapsed };
  });
  const first = editor.locator(':scope > p[data-fountain-path="1"]');
  await first.click();
  await page.keyboard.press('End');
  const ranges = [];
  for (const key of ['End', 'Home', 'End']) {
    await page.keyboard.press(`Control+Shift+${key}`);
    const expected = { anchor: '1.0', anchorOffset: firstText.length, focus: key === 'End' ? '5000.0' : '0.0',
      focusOffset: key === 'End' ? lastText.length : 0, collapsed: false };
    await expect.poll(native).toEqual(expected);
    ranges.push({ key, selection: await native() });
  }
  await page.screenshot({ path: resolve(root, 'forward-range.png') });
  // Replacement must remove every selected offscreen paragraph, not only the
  // DOM fragments currently mounted at the native selection's endpoints.
  await page.keyboard.type(' Replacement.');
  await expect(blocks).toHaveText('2 top-level blocks');
  await expect(editor.getByRole('heading', { name: 'Navigation audit', exact: true })).toBeVisible();
  await expect(editor.locator(':scope > p')).toHaveText(firstText + ' Replacement.');
  const schema = new Schema(StarterKit.schema);
  const original = MarkdownImporter.parse(source, schema, issueMarkdownOptions);
  const expectedDoc = original.copy([original.child(0), schema.node('paragraph', {}, [schema.text(firstText + ' Replacement.')])]);
  const download = async (name: string) => {
    downloadEvents.push({ request: name });
    try {
      const event = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
      const path = resolve(root, name);
      await (await event).saveAs(path);
      downloadEvents.push({ saved: name });
      return await readFile(path, 'utf8');
    } finally {
      await writeFile(resolve(root, 'download-observations.json'), JSON.stringify(downloadEvents, null, 2));
    }
  };
  const changed = await download('replacement.md');
  expect(MarkdownImporter.parse(changed, schema, issueMarkdownOptions).eq(expectedDoc)).toBe(true);
  await page.screenshot({ path: resolve(root, 'replaced.png') });
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await undo.click();
  await expect(blocks).toHaveText('5001 top-level blocks');
  expect(await download('undone.md')).toBe(source);
  await redo.click();
  await expect(blocks).toHaveText('2 top-level blocks');
  expect(await download('redone.md')).toBe(changed);
  await undo.click();
  await expect(blocks).toHaveText('5001 top-level blocks');
  await first.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Control+Shift+Home');
  await expect.poll(native).toEqual({ anchor: '5000.0', anchorOffset: lastText.length, focus: '0.0', focusOffset: 0, collapsed: false });
  await page.keyboard.type('Entire replacement.');
  await expect(blocks).toHaveText('1 top-level blocks');
  const whole = await download('whole-replacement.md');
  const wholeExpected = original.copy([schema.node('heading', original.child(0).attrs, [schema.text('Entire replacement.')])]);
  expect(MarkdownImporter.parse(whole, schema, issueMarkdownOptions).eq(wholeExpected)).toBe(true);
  await undo.click();
  await expect(blocks).toHaveText('5001 top-level blocks');
  expect(await download('whole-undone.md')).toBe(source);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await expect(reader).toHaveAttribute('contenteditable', 'false');
  await reader.locator(':scope > p[data-fountain-path="1"]').click();
  await page.keyboard.press('End');
  for (const key of ['End', 'Home']) {
    await page.keyboard.press(`Control+Shift+${key}`);
    await expect.poll(native).toEqual({ anchor: '1.0', anchorOffset: firstText.length, focus: key === 'End' ? '5000.0' : '0.0',
      focusOffset: key === 'End' ? lastText.length : 0, collapsed: false });
  }
  await page.screenshot({ path: resolve(root, 'reader-range.png') });
  expect(await download('reader.md')).toBe(source);
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name, ranges,
    forwardReplacementIncludesOffscreenContent: true, wholeBackwardReplacement: true, undoRedoRestoresCompleteSource: true,
    readerAnchorRetained: true, errors }, null, 2));
}
