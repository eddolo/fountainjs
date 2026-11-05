import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Schema, StarterKit } from 'fountainjs-editor';

/** Native directed selection and real toolbar clicks; model observations come
 * from downloaded files, never an injected editor/transaction API. */
export async function documentRangeFormattingJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('range-formatting');
  await mkdir(root, { recursive: true });
  const errors: string[] = [], observations: unknown[] = [];
  const schema = new Schema(StarterKit.schema);
  page.on('pageerror', error => errors.push(error.message));
  const png = await readFile(new URL('../fixtures/cross-container-figure.png', import.meta.url));
  const p = (text: string, id: string) => ({ type: 'paragraph', attrs: { nodeId: id, audit: { owner: 'Ada' } }, content: [{ type: 'text', text }] });
  const source = { type: 'doc', attrs: { audit: { title: 'Mixed range formatting' } }, content: [
    p('Before — leave this paragraph alone.', 'outside'), p('Left', 'selected'),
    { type: 'image_super', attrs: { src: `data:image/png;base64,${png.toString('base64')}`, alt: 'Retained figure', nodeId: 'figure' } },
  ] };
  await page.goto('/conversion-lab.html');
  for (const backward of [false, true]) {
    const name = backward ? 'backward' : 'forward';
    await page.getByLabel('Choose documents', { exact: true }).setInputFiles({ name: `${name}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
    const workspace = page.getByRole('region', { name: `Conversion workspace: ${name}.json`, exact: true });
    const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
    const download = async (stage: string) => {
      await workspace.getByLabel('Export format').selectOption('json');
      const pending = page.waitForEvent('download');
      await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
      const target = resolve(root, `${name}-${stage}.json`);
      await (await pending).saveAs(target);
      return { target, json: JSON.parse(await readFile(target, 'utf8')) };
    };
    const original = (await download('original')).json;
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
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Control+Shift+End');
    }
    const native = async () => page.evaluate(() => {
      const selection = getSelection();
      const endpoint = (node: Node | null | undefined, offset: number | undefined) => ({
        text: node?.textContent, offset,
        path: (node instanceof Element ? node : node?.parentElement)?.closest('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path') ?? null,
      });
      return { anchor: endpoint(selection?.anchorNode, selection?.anchorOffset), head: endpoint(selection?.focusNode, selection?.focusOffset), collapsed: selection?.isCollapsed };
    });
    const selected = await native();
    expect(selected.collapsed).toBe(false);
    expect((backward ? selected.head : selected.anchor)).toMatchObject({ text: 'Left', offset: 2 });
    expect((backward ? selected.anchor : selected.head).path).toBeNull();
    await editor.screenshot({ path: resolve(root, `${name}-selected.png`) });
    await workspace.getByRole('button', { name: 'H2 — Heading 2', exact: true }).click();
    await expect(editor.locator(':scope > h2')).toHaveText('Left');
    await workspace.getByRole('button', { name: 'Align center', exact: true }).click();
    await expect(editor.locator(':scope > h2')).toHaveCSS('text-align', 'center');
    await expect(editor.locator(':scope > p')).toHaveCSS('text-align', 'start');
    await expect(editor.locator('img')).toHaveCount(1);
    const formattedNative = await native();
    expect(formattedNative.collapsed).toBe(false);
    expect((backward ? formattedNative.head : formattedNative.anchor)).toMatchObject({ text: 'Left', offset: 2 });
    expect((backward ? formattedNative.anchor : formattedNative.head).path).toBeNull();
    await editor.screenshot({ path: resolve(root, `${name}-formatted.png`) });
    const formatted = await download('formatted');
    const expected = structuredClone(original);
    expected.content[1] = schema.nodes.heading!.create({ ...original.content[1].attrs, level: 2,
      align: 'center' }, schema.nodeFromJSON(original.content[1]).content).toJSON();
    expect(formatted.json).toEqual(expected);
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await download('undone')).json).toEqual(original);
    await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
    await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
    expect((await download('redone')).json).toEqual(formatted.json);
    const reader = workspace.getByRole('textbox', { name: 'Reopened export preview', exact: true });
    await expect(reader.locator(':scope > h2')).toHaveText('Left');
    await expect(reader.locator(':scope > h2')).toHaveCSS('text-align', 'center');
    await expect.poll(() => reader.locator('img').evaluateAll(images => images.length === 1 && images.every(image =>
      image instanceof HTMLImageElement && image.complete && image.naturalWidth === 400))).toBe(true);
    await reader.screenshot({ path: resolve(root, `${name}-reader.png`) });
    observations.push({ name, selected, formattedNative, untouchedOutsideBlock: true, metadataRetained: true,
      imageLoadedAndRetained: true, historyExact: true, downloadedJSONReopened: true });
  }
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name, observations, errors }, null, 2));
}
