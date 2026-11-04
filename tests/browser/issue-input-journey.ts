import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MarkdownImporter, Schema, StarterKit } from 'fountainjs-editor';
import { issueMarkdownOptions } from '../../examples/react-app/src/issue-markdown-policy';

type Probe = { events: { type: string; key?: string; ctrl?: boolean; meta?: boolean; anchor: string | null; offset: number; scrollY: number; target: string | null }[]; exports: { durationMs: number }[]; inputs: { data: string | null; toTwoFramesMs: number }[] };
declare global { interface Window { __issueInputProbe: Probe } }

export async function measureIssueInput(page: Page, info: TestInfo) {
  const root = info.outputPath('issue-input-journey');
  await mkdir(root, { recursive: true });
  const source = ['[ref]: /target "Original"', '', '# Large issue ###', '', 'Edit this paragraph.', '',
    ...Array.from({ length: 4999 }, (_, index) => `Paragraph ${index + 1} with __source__ [link][ref].\r\n`), ''].join('\r\n');
  await writeFile(resolve(root, 'original.md'), source);
  const moduleURLs: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (/(?:\/deps\/fountainjs-editor|\/dist\/index)\.js(?:\?|$)/u.test(response.url()) && !response.url().includes('/node_modules/.pnpm/')) moduleURLs.push(response.url()); });
  await page.goto('/issue-editor.html');
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  await expect(editor).toBeVisible();
  expect(moduleURLs.length, 'Observe the actual module used by the host before instrumenting it.').toBeGreaterThan(0);
  const moduleURL = moduleURLs.at(-1)!;
  await page.evaluate(async url => {
    const { MarkdownExporter } = await import(/* @vite-ignore */ url);
    window.__issueInputProbe = { exports: [], inputs: [], events: [] };
    const record = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('[aria-label="Issue description editor"]')) return;
      const selection = document.getSelection(), anchor = selection?.anchorNode;
      const element = anchor?.nodeType === 1 ? anchor as Element : anchor?.parentElement;
      window.__issueInputProbe.events.push({ type: event.type, key: (event as KeyboardEvent).key,
        ctrl: (event as KeyboardEvent).ctrlKey, meta: (event as KeyboardEvent).metaKey,
        anchor: element?.closest('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path') ?? null,
        offset: selection?.anchorOffset ?? -1, scrollY,
        target: target.closest('[data-fountain-path]')?.getAttribute('data-fountain-path') ?? null });
    };
    for (const type of ['pointerdown', 'pointerup', 'keydown', 'keyup']) document.addEventListener(type, record, true);
    const original = MarkdownExporter.exportWithSource;
    MarkdownExporter.exportWithSource = function (this: typeof MarkdownExporter, ...args: Parameters<typeof original>) {
      const start = performance.now();
      try { return original.apply(this, args); }
      finally { window.__issueInputProbe.exports.push({ durationMs: performance.now() - start }); }
    };
    document.addEventListener('beforeinput', event => {
      if (!(event.target instanceof Element) || event.target.getAttribute('aria-label') !== 'Issue description editor') return;
      const start = performance.now(), data = (event as InputEvent).data;
      requestAnimationFrame(() => requestAnimationFrame(() => window.__issueInputProbe.inputs.push({ data, toTwoFramesMs: performance.now() - start })));
    }, true);
  }, moduleURL);
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles({ name: 'large-issue.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const first = editor.locator(':scope > p[data-fountain-path="1"]');
  await expect(page.getByRole('complementary', { name: 'Fountain diagnostics' }).locator('dt:has-text("Document blocks") + dd')).toHaveText('5001 top-level blocks');
  const mountedParagraphs = await editor.locator(':scope > p').count();
  expect(mountedParagraphs).toBeLessThan(200);
  await expect(first).toHaveText('Edit this paragraph.');
  const importExports = await page.evaluate(() => window.__issueInputProbe.exports.length);
  await first.click();
  await page.keyboard.press('End');
  await page.evaluate(() => { window.__issueInputProbe.exports = []; window.__issueInputProbe.inputs = []; });
  for (const [index, character] of [...'XYZ'].entries()) {
    await page.keyboard.type(character);
    await expect.poll(() => page.evaluate(() => window.__issueInputProbe.inputs.length)).toBe(index + 1);
  }
  const measured = await page.evaluate(() => window.__issueInputProbe);
  await page.screenshot({ path: resolve(root, 'typed.png') });
  await writeFile(resolve(root, 'input-measurement.json'), JSON.stringify({ engine: info.project.name, documentParagraphs: 5000,
    moduleURL, importExports, mountedParagraphs, ...measured, errors }, null, 2));
  await expect(first).toHaveText('Edit this paragraph.XYZ');
  return { root, editor, first, source, importExports, expected: source.replace('Edit this paragraph.', 'Edit this paragraph.XYZ'), measured, errors };
}

export async function runIssueInputJourney(page: Page, info: TestInfo): Promise<void> {
  const result = await measureIssueInput(page, info);
  expect(result.measured.exports, 'Typing must not serialize the full document.').toEqual([]);
  expect(result.importExports, 'Opening a draft must not run an unrequested export.').toBe(0);
  // Returning from a remembered far caret must let the new pointer win before
  // native focus can reveal that old position. Verify actual insertion/removal.
  await page.keyboard.press('Control+End');
  await expect(result.editor.locator(':scope > p[data-fountain-path="5000"]')).toBeVisible();
  await page.getByLabel('Issue title', { exact: true }).click();
  await result.first.click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect(result.first).toHaveText('Edit this paragraph.XYZ!');
  await page.keyboard.press('Backspace');
  await expect(result.first).toHaveText('Edit this paragraph.XYZ');
  expect(await page.evaluate(() => window.__issueInputProbe.exports.length)).toBe(0);

  const diagnostics = page.getByRole('complementary', { name: 'Fountain diagnostics' });
  const preservation = diagnostics.locator('dt:has-text("Source preservation") + dd');
  const warnings = diagnostics.locator('dt:has-text("Export warnings") + dd');
  const check = diagnostics.getByRole('button', { name: 'Check Markdown export', exact: true });
  const countExports = () => page.evaluate(() => window.__issueInputProbe.exports.length);
  const pending = () => expect(preservation).toHaveText('Not checked for this draft');
  await pending();
  await check.click();
  expect(await countExports(), 'Positive control: the observer must see a real requested export.').toBe(1);
  await expect(preservation).toHaveText('blocks');
  await expect(warnings).toHaveText('0');
  await page.getByLabel('Issue title', { exact: true }).fill('Large source audit');
  await expect(preservation).toHaveText('blocks');
  expect(await countExports()).toBe(1);
  await result.first.click();
  await page.keyboard.press('End');
  await page.keyboard.type('Q');
  await pending();
  expect(await countExports()).toBe(1);
  // Native document-end navigation must reach the offscreen model, not merely
  // the final currently mounted paragraph.
  await page.keyboard.press('Control+End');
  const last = result.editor.locator(':scope > p').filter({ hasText: 'Paragraph 4999 with source link.' });
  await expect(last).toBeVisible();
  await page.keyboard.type(' tail.');
  await expect(last).toHaveText('Paragraph 4999 with source link. tail.');
  const expected = result.expected.replace('Edit this paragraph.XYZ', 'Edit this paragraph.XYZQ')
    .replace('Paragraph 4999 with __source__ [link][ref].', 'Paragraph 4999 with **source** [link](/target "Original"). tail.');
  const schema = new Schema(StarterKit.schema);
  const original = MarkdownImporter.parse(result.source, schema, issueMarkdownOptions);
  const originalLast = original.content.at(-1)!;
  const lastLeaf = originalLast.content.at(-1)!;
  const expectedDoc = original.copy([original.child(0), schema.node('paragraph', {}, [schema.text('Edit this paragraph.XYZQ')]),
    ...original.content.slice(2, -1), originalLast.copy([...originalLast.content.slice(0, -1), schema.text(lastLeaf.textContent + ' tail.', lastLeaf.marks)])]);
  const format = page.getByRole('combobox', { name: 'Table export', exact: true });
  await format.selectOption('html');
  await pending();
  expect(await countExports()).toBe(1);
  await check.click();
  expect(await countExports()).toBe(2);
  await format.selectOption('pipe');
  await pending();
  const download = async (name: string, expectedSource: string) => {
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
    const target = resolve(result.root, name);
    await (await event).saveAs(target);
    expect(await readFile(target, 'utf8') === expectedSource, 'The actual download must contain the complete current source.').toBe(true);
    return target;
  };
  const editedFile = await download('edited.md', expected);
  expect(MarkdownImporter.parse(await readFile(editedFile, 'utf8'), schema, issueMarkdownOptions).eq(expectedDoc)).toBe(true);
  expect(await countExports()).toBe(3);
  await page.screenshot({ path: resolve(result.root, 'last-edited.png') });
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(editedFile);
  // Reopening retains the model selection/scroll position. Navigate the model
  // rather than assuming the first mounted paragraph is document paragraph zero.
  await result.editor.locator(':scope > p').last().click();
  await page.keyboard.press('Control+Home');
  await expect(result.first).toHaveText('Edit this paragraph.XYZQ');
  await pending();
  expect(await countExports()).toBe(3);
  await page.getByRole('button', { name: 'Markdown source', exact: true }).click();
  expect(await countExports()).toBe(4);
  const raw = page.getByRole('textbox', { name: 'Markdown description', exact: true });
  const beforeRaw = await raw.inputValue();
  expect(beforeRaw === expected.replaceAll('\r\n', '\n')).toBe(true);
  await expect(check).toBeDisabled();
  await raw.press('Control+End');
  await page.keyboard.type('\n\nRaw addition.');
  const rawValue = await raw.inputValue();
  expect(rawValue === beforeRaw + '\n\nRaw addition.').toBe(true);
  await download('raw-buffer.md', rawValue);
  expect(await countExports(), 'Raw download must save the unapplied buffer without conversion.').toBe(4);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await expect(reader).toHaveAttribute('contenteditable', 'false');
  await expect(reader.locator(':scope > p').first()).toHaveText('Edit this paragraph.XYZQ');
  expect(await reader.locator(':scope > p').count()).toBeLessThan(200);
  await pending();
  expect(await countExports()).toBe(4);
  await check.click();
  expect(await countExports()).toBe(5);
  await expect(preservation).toHaveText('exact');
  const final = await download('reader.md', rawValue);
  const rawDoc = expectedDoc.copy([...expectedDoc.content, schema.node('paragraph', {}, [schema.text('Raw addition.')])]);
  expect(MarkdownImporter.parse(await readFile(final, 'utf8'), schema, issueMarkdownOptions).eq(rawDoc)).toBe(true);
  expect(await countExports()).toBe(6);
  await reader.locator(':scope > p').first().click();
  await page.keyboard.press('Control+End');
  await expect(reader.locator(':scope > p').filter({ hasText: 'Raw addition.' })).toBeVisible();
  await page.screenshot({ path: resolve(result.root, 'reader.png') });
  // A real nonzero report must disappear when the option changes, rather than
  // remaining as stale warnings from a different conversion policy.
  const table = '<table><tr><td><p>Cell</p><p>Second</p></td><td>Other</td></tr></table>\n\nEnd.\n';
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles({ name: 'warning-table.md', mimeType: 'text/markdown', buffer: Buffer.from(table) });
  await pending();
  await result.editor.locator('td p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');
  expect(await countExports()).toBe(6);
  await check.click();
  const warningList = diagnostics.getByRole('list', { name: 'Markdown export warnings', exact: true });
  await expect(warningList).toContainText('Pipe Markdown makes the first row column headers');
  const pipeWarnings = await warningList.getByRole('listitem').allTextContents();
  await format.selectOption('html');
  await pending();
  await expect(warningList).toHaveCount(0);
  expect(await countExports()).toBe(7);
  await check.click();
  await expect(warnings).toHaveText('1');
  await expect(warningList.getByRole('listitem')).toHaveText([
    'table: HTML projection requires an HTML-enabled Markdown reader and matching parse rules. Arbitrary schema metadata and original source spelling are not guaranteed.',
  ]);
  const htmlWarnings = await warningList.getByRole('listitem').allTextContents();
  expect(await countExports()).toBe(8);
  await page.screenshot({ path: resolve(result.root, 'fresh-warning-check.png') });
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(result.errors).toEqual([]);
  await writeFile(resolve(result.root, 'observations.json'), JSON.stringify({ engine: info.project.name,
    noExportsDuringTyping: true, nativeFarEndEditing: true, nativeFocusReturn: true, complete5000ParagraphDocumentRetained: true,
    currentDocumentSnapshotAndOptionsChecked: true, noStaleWarnings: true, rawDownloadUnconverted: true,
    actualFileReopened: true, virtualReader: true, observedRequestedExports: await countExports(),
    pipeWarnings, htmlWarnings, errors: result.errors }, null, 2));
}
