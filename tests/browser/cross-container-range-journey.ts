import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MarkdownImporter, Schema, StarterKit } from 'fountainjs-editor';
import { issueMarkdownOptions } from '../../examples/react-app/src/issue-markdown-policy';

export async function runCrossContainerRangeJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('cross-container-range-journey');
  await mkdir(root, { recursive: true });
  const figure = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="80"><rect width="480" height="80" fill="#dceeff"/><text x="20" y="48" font-size="24">Selected figure</text></svg>';
  await page.route('https://example.test/selected.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: figure }));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/issue-editor.html');
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const upload = page.getByLabel('Open Markdown draft file', { exact: true });
  const schema = new Schema(StarterKit.schema), observations = [];
  const image = '![Selected figure](https://example.test/selected.svg)';
  const cases = [
    { name: 'quote-to-paragraph', source: `Before.\n\n> Left\n>\n> ${image}\n\n${image}\n\nRight\n\nAfter.\n`,
      expected: 'Before.\n\n> LeXht\n\nAfter.\n' },
    { name: 'paragraph-to-quote', source: `Before.\n\nLeft\n\n${image}\n\n> ${image}\n>\n> Right\n>\n> Tail\n\nAfter.\n`,
      expected: 'Before.\n\nLeXht\n\n> Tail\n\nAfter.\n' },
    { name: 'list-items', source: `Before.\n\n- Left\n\n  ${image}\n\n- ${image}\n\n  Right\n\n  Tail\n\n- Last\n\nAfter.\n`,
      expected: 'Before.\n\n- LeXht\n\n  Tail\n\n- Last\n\nAfter.\n' },
  ];
  for (const item of cases.flatMap(item => [{ ...item, backward: false }, { ...item, name: `${item.name}-backward`, backward: true }])) {
    await writeFile(resolve(root, `${item.name}-original.md`), item.source);
    const expected = MarkdownImporter.parse(item.expected, schema, issueMarkdownOptions);
    await upload.setInputFiles({ name: `${item.name}.md`, mimeType: 'text/markdown', buffer: Buffer.from(item.source) });
    const left = editor.locator('[data-fountain-text-path]').filter({ hasText: /^Left$/ });
    const right = editor.locator('[data-fountain-text-path]').filter({ hasText: /^Right$/ });
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();
    await expect(editor.locator('img')).toHaveCount(2);
    await expect.poll(() => editor.locator('img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
    const point = async (element: typeof left, offset: number) => {
      await element.scrollIntoViewIfNeeded();
      return element.evaluate((wrapper, position) => {
        const range = document.createRange();
        range.setStart(wrapper.firstChild!, position); range.collapse(true);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + .1, y: rect.y + rect.height / 2 };
      }, offset);
    };
    const a = await point(item.backward ? right : left, item.backward ? 3 : 2);
    await page.mouse.click(a.x, a.y);
    const b = await point(item.backward ? left : right, item.backward ? 2 : 3);
    await page.keyboard.down('Shift');
    try { await page.mouse.click(b.x, b.y); } finally { await page.keyboard.up('Shift'); }
    const endpoints = { anchor: await (item.backward ? right : left).getAttribute('data-fountain-text-path'), anchorOffset: item.backward ? 3 : 2,
      focus: await (item.backward ? left : right).getAttribute('data-fountain-text-path'), focusOffset: item.backward ? 2 : 3 };
    await expect.poll(() => page.evaluate(() => {
      const selection = getSelection();
      const path = (node: Node | null | undefined) => (node instanceof Element ? node : node?.parentElement)
        ?.closest('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path') ?? null;
      return { anchor: path(selection?.anchorNode), anchorOffset: selection?.anchorOffset,
        focus: path(selection?.focusNode), focusOffset: selection?.focusOffset };
    })).toEqual(endpoints);
    await editor.screenshot({ path: resolve(root, `${item.name}-selection.png`) });
    await page.keyboard.type('X');
    await expect(editor.locator('img')).toHaveCount(0);
    await expect(editor.locator('p').filter({ hasText: /^LeXht$/ })).toHaveCount(1);
    await expect(editor.locator(':scope > p').first()).toHaveText('Before.');
    await expect(editor.locator(':scope > p').last()).toHaveText('After.');
    await expect.poll(() => page.evaluate(() => {
      const selection = getSelection();
      return { collapsed: selection?.isCollapsed, text: selection?.anchorNode?.textContent, offset: selection?.anchorOffset };
    })).toEqual({ collapsed: true, text: 'LeX', offset: 3 });
    await editor.screenshot({ path: resolve(root, `${item.name}-replaced.png`) });
    const download = async (suffix: string) => {
      const event = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
      const target = resolve(root, `${item.name}-${suffix}.md`);
      await (await event).saveAs(target);
      return { target, source: await readFile(target, 'utf8') };
    };
    const changed = await download('edited');
    expect(MarkdownImporter.parse(changed.source, schema, issueMarkdownOptions).toJSON()).toEqual(expected.toJSON());
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(editor.locator('img')).toHaveCount(2);
    expect((await download('undone')).source).toBe(item.source);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    expect((await download('redone')).source).toBe(changed.source);
    await upload.setInputFiles(changed.target);
    await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
    const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
    await expect(reader.locator('img')).toHaveCount(0);
    await expect(reader.locator('p').filter({ hasText: /^LeXht$/ })).toHaveCount(1);
    await expect(reader.locator(':scope > p').last()).toHaveText('After.');
    await reader.screenshot({ path: resolve(root, `${item.name}-reader.png`) });
    observations.push({ name: item.name, nativeShiftClick: endpoints, nativeCaretAfterTyping: { text: 'LeX', offset: 3 },
      selectedImagesRemoved: 2, completeReopenedExpectedModel: true, exactOriginalSourceOnUndo: true, exactEditedSourceOnRedo: true });
    await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  }
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name, observations, errors }, null, 2));
}

export async function runCrossContainerAttributesJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('cross-container-attributes-journey');
  await mkdir(root, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  // The lab deliberately blocks network images. Use a self-contained real PNG,
  // and require native load completion rather than accepting an error widget.
  const png = await readFile(new URL('../fixtures/cross-container-figure.png', import.meta.url));
  const image = { type: 'image_super', attrs: { src: `data:image/png;base64,${png.toString('base64')}`, alt: 'Selected figure' } };
  const source = { type: 'doc', attrs: { audit: { title: 'Preserve outside quote direction' } }, content: [p('Before.'),
    { type: 'blockquote', attrs: { dir: 'ltr' }, content: [p('Left'), image] },
    { type: 'blockquote', attrs: { dir: 'rtl' }, content: [image, p('Right'), p('Tail')] }, p('After.'),
  ] };
  const schema = new Schema(StarterKit.schema);
  const original = schema.nodeFromJSON(source).toJSON();
  const expected = schema.nodeFromJSON({ ...source, content: [p('Before.'),
    { type: 'blockquote', attrs: { dir: 'ltr' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LeX' }, { type: 'text', text: 'ht' }] }] },
    { type: 'blockquote', attrs: { dir: 'rtl' }, content: [p('Tail')] }, p('After.'),
  ] }).toJSON();
  const observations = [];
  for (const backward of [false, true]) {
    const name = backward ? 'quote-attributes-backward' : 'quote-attributes-forward', filename = `${name}.json`;
    await writeFile(resolve(root, `${name}-original.json`), JSON.stringify(source, null, 2));
    await page.getByLabel('Choose documents').setInputFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
    const workspace = page.getByRole('region', { name: `Conversion workspace: ${filename}`, exact: true });
    const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
    const download = async (suffix: string) => {
      await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('json');
      const event = page.waitForEvent('download');
      await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
      const target = resolve(root, `${name}-${suffix}.json`);
      await (await event).saveAs(target);
      return JSON.parse(await readFile(target, 'utf8'));
    };
    expect(await download('before')).toEqual(original);
    await expect(editor.locator('img')).toHaveCount(2);
    await expect.poll(() => editor.locator('img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth === 400))).toBe(true);
    const left = editor.locator('[data-fountain-text-path]').filter({ hasText: /^Left$/ });
    const right = editor.locator('[data-fountain-text-path]').filter({ hasText: /^Right$/ });
    const point = async (element: typeof left, offset: number) => {
      await element.scrollIntoViewIfNeeded();
      return element.evaluate((wrapper, position) => {
        const range = document.createRange(); range.setStart(wrapper.firstChild!, position); range.collapse(true);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + .1, y: rect.y + rect.height / 2 };
      }, offset);
    };
    const a = await point(backward ? right : left, backward ? 3 : 2);
    await page.mouse.click(a.x, a.y);
    const b = await point(backward ? left : right, backward ? 2 : 3);
    await page.keyboard.down('Shift');
    try { await page.mouse.click(b.x, b.y); } finally { await page.keyboard.up('Shift'); }
    const endpoints = { anchor: await (backward ? right : left).getAttribute('data-fountain-text-path'), anchorOffset: backward ? 3 : 2,
      focus: await (backward ? left : right).getAttribute('data-fountain-text-path'), focusOffset: backward ? 2 : 3 };
    await expect.poll(() => page.evaluate(() => {
      const selection = getSelection();
      const path = (node: Node | null | undefined) => (node instanceof Element ? node : node?.parentElement)
        ?.closest('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path') ?? null;
      return { anchor: path(selection?.anchorNode), anchorOffset: selection?.anchorOffset,
        focus: path(selection?.focusNode), focusOffset: selection?.focusOffset };
    })).toEqual(endpoints);
    await editor.screenshot({ path: resolve(root, `${name}-selection.png`) });
    await page.keyboard.type('X');
    await expect(editor.locator('img')).toHaveCount(0);
    await expect(editor.locator('blockquote').first()).toHaveAttribute('dir', 'ltr');
    await expect(editor.locator('blockquote').first()).toHaveText('LeXht');
    await expect(editor.locator('blockquote').last()).toHaveAttribute('dir', 'rtl');
    await expect(editor.locator('blockquote').last()).toHaveText('Tail');
    await editor.screenshot({ path: resolve(root, `${name}-replaced.png`) });
    expect(await download('edited')).toEqual(expected);
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await download('undone')).toEqual(original);
    await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
    expect(await download('redone')).toEqual(expected);
    await expect(workspace.getByLabel('Round-trip result', { exact: true })).toContainText('Exact Fountain document equality after reopening.');
    const reader = workspace.getByRole('textbox', { name: 'Reopened export preview', exact: true });
    await expect(reader.locator('img')).toHaveCount(0);
    await expect(reader.locator('blockquote').first()).toHaveAttribute('dir', 'ltr');
    await expect(reader.locator('blockquote').last()).toHaveAttribute('dir', 'rtl');
    await expect(reader.locator('blockquote').last()).toHaveText('Tail');
    await reader.screenshot({ path: resolve(root, `${name}-reader.png`) });
    observations.push({ backward, nativeEndpoints: endpoints, directionsRetained: ['ltr', 'rtl'],
      completeJSONOriginalEditedUndoneRedone: true, rootMetadataRetained: true, exactReopenedModel: true });
  }
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name, observations, errors }, null, 2));
}
