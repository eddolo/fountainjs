import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Schema, StarterKit, type NodeJSON } from 'fountainjs-editor';

test('wraps native text-to-media selections in quotes and lists, retains source data and toggles them off', async ({ page }, info) => {
  test.setTimeout(180_000);
  const root = info.outputPath('structural-wrapping'); await mkdir(root, { recursive: true });
  const errors: string[] = [], observations: unknown[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const png = await readFile(new URL('../fixtures/cross-container-figure.png', import.meta.url));
  const schema = new Schema(StarterKit.schema);
  const source = { type: 'doc', attrs: { audit: 'wrapping-root' }, content: [
    { type: 'paragraph', attrs: { nodeId: 'outside' }, content: [{ type: 'text', text: 'Before — leave this paragraph alone.' }] },
    { type: 'paragraph', attrs: { nodeId: 'selected', audit: { owner: 'Ada' } }, content: [{ type: 'text', text: 'Left' }] },
    { type: 'image_super', attrs: { src: `data:image/png;base64,${png.toString('base64')}`, alt: 'Retained figure', nodeId: 'figure' } },
    // A real caret endpoint after atomic media: Ctrl+End must not have to
    // create a new paragraph after the original model has been downloaded.
    { type: 'paragraph', content: [{ type: 'text', text: '' }] },
  ] };
  const commands = [
    { name: 'quote', label: 'Quote selected blocks', undoLabel: 'Remove quote', type: 'blockquote', selector: ':scope > blockquote' },
    { name: 'bullet', label: 'Bullet list', undoLabel: 'Bullet list', type: 'bullet_list', selector: ':scope > ul' },
    { name: 'ordered', label: '123 — Numbered list', undoLabel: '123 — Numbered list', type: 'ordered_list', selector: ':scope > ol' },
    { name: 'task', label: 'Task list', undoLabel: 'Task list', type: 'task_list', selector: ':scope > ul' },
  ];
  await page.goto('/conversion-lab.html');
  for (const command of commands) for (const backward of [false, true]) {
    const name = `${command.name}-${backward ? 'backward' : 'forward'}`;
    await page.getByLabel('Choose documents', { exact: true }).setInputFiles({ name: `${name}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
    const workspace = page.getByRole('region', { name: `Conversion workspace: ${name}.json`, exact: true });
    const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
    const download = async (stage: string) => {
      await workspace.getByLabel('Export format').selectOption('json');
      const pending = page.waitForEvent('download');
      await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
      const target = resolve(root, `${name}-${stage}.json`); await (await pending).saveAs(target);
      return JSON.parse(await readFile(target, 'utf8')) as NodeJSON;
    };
    const original = await download('original');
    const text = editor.locator('[data-fountain-text-path]').filter({ hasText: /^Left$/ });
    await expect.poll(() => editor.locator('img').evaluateAll(images => images.length === 1 && images.every(image =>
      image instanceof HTMLImageElement && image.complete && image.naturalWidth === 400))).toBe(true);
    await text.click();
    if (backward) {
      await page.keyboard.press('Control+End');
      const at = await text.evaluate(wrapper => {
        const range = document.createRange(); range.setStart(wrapper.firstChild!, 2); range.collapse(true);
        const rect = range.getBoundingClientRect(); return { x: rect.x + .1, y: rect.y + rect.height / 2 };
      });
      await page.keyboard.down('Shift');
      try { await page.mouse.click(at.x, at.y); } finally { await page.keyboard.up('Shift'); }
    } else {
      await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Control+Shift+End');
    }
    await editor.screenshot({ path: resolve(root, `${name}-selected.png`) });
    await workspace.getByRole('button', { name: command.label, exact: true }).click();
    await expect(editor.locator(command.selector)).toHaveCount(1);
    await expect(editor.locator(':scope > p')).toHaveText(['Before — leave this paragraph alone.', '']);
    await expect(editor.locator('img')).toHaveCount(1);
    const native = await page.evaluate(() => {
      const selection = getSelection();
      return { collapsed: selection?.isCollapsed, anchorText: selection?.anchorNode?.textContent,
        anchorOffset: selection?.anchorOffset, headText: selection?.focusNode?.textContent, headOffset: selection?.focusOffset };
    });
    expect(native.collapsed).toBe(false);
    expect(backward ? native.headText : native.anchorText).toBe('Left');
    expect(backward ? native.headOffset : native.anchorOffset).toBe(2);
    await editor.screenshot({ path: resolve(root, `${name}-wrapped.png`) });
    const wrapped = await download('wrapped');
    const blocks = original.content!.slice(1, 3).map(node => schema.nodeFromJSON(node));
    const expected = structuredClone(original);
    expected.content = [original.content![0]!, schema.nodes[command.type]!.create({}, command.name === 'quote' ? blocks
      : blocks.map(node => schema.nodes[command.name === 'task' ? 'task_item' : 'list_item']!.create({}, [node]))).toJSON(),
      ...original.content!.slice(3)];
    expect(wrapped).toEqual(JSON.parse(JSON.stringify(expected)));
    const reader = workspace.getByRole('textbox', { name: 'Reopened export preview', exact: true });
    await expect(reader.locator(command.selector)).toHaveCount(1);
    await expect.poll(() => reader.locator('img').evaluateAll(images => images.length === 1 && images.every(image =>
      image instanceof HTMLImageElement && image.complete && image.naturalWidth === 400))).toBe(true);
    await reader.screenshot({ path: resolve(root, `${name}-reader.png`) });
    await workspace.getByRole('button', { name: command.undoLabel, exact: true }).click();
    expect(await download('unwrapped')).toEqual(original);
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await download('undone')).toEqual(wrapped);
    await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
    expect(await download('redone')).toEqual(original);
    observations.push({ name, native, exactWrappedModel: true, exactUnwrappedModel: true, historyExact: true, loadedFigurePreserved: true });
  }
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name, observations, errors }, null, 2));
});
