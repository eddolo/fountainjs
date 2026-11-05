import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MarkdownImporter, Schema, StarterKit } from 'fountainjs-editor';
import { issueMarkdownOptions } from '../../examples/react-app/src/issue-markdown-policy';

export async function runDocumentBoundaryRangeJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('document-boundary-range-journey');
  await mkdir(root, { recursive: true });
  const errors: string[] = [], observations: unknown[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const png = await readFile(new URL('../fixtures/cross-container-figure.png', import.meta.url));
  await page.route('https://example.test/boundary.png', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.goto('/issue-editor.html');
  await page.evaluate(() => {
    const records: unknown[] = [];
    Object.assign(globalThis, { boundaryNavigationRecords: records });
    for (const type of ['keydown', 'keyup', 'selectionchange']) document.addEventListener(type, event => {
      const selection = getSelection();
      const point = (node: Node | null | undefined, offset: number | undefined) => ({
        path: (node instanceof Element ? node : node?.parentElement)?.closest('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path'),
        text: node?.textContent?.slice(0, 35), offset,
      });
      records.push({ type, key: event instanceof KeyboardEvent ? event.key : null, prevented: event.defaultPrevented,
        anchor: point(selection?.anchorNode, selection?.anchorOffset), head: point(selection?.focusNode, selection?.focusOffset),
        active: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName });
      if (records.length > 120) records.shift();
    });
  });
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const upload = page.getByLabel('Open Markdown draft file', { exact: true });
  const schema = new Schema(StarterKit.schema);
  const image = '![Boundary figure](https://example.test/boundary.png)';
  for (const virtual of [false, true]) for (const leading of [false, true]) for (const backward of [false, true]) {
    const name = `${virtual ? 'virtual' : 'ordinary'}-${leading ? 'leading' : 'terminal'}-${backward ? 'backward' : 'forward'}`;
    const filler = virtual ? Array.from({ length: 300 }, (_, index) => `Paragraph ${index + 1}.`).join('\n\n') : '';
    const source = (leading ? [image, filler, 'Right'] : ['Left', filler, image]).filter(Boolean).join('\n\n') + '\n';
    const expected = MarkdownImporter.parse(leading ? 'Xht\n' : 'LeX\n', schema, issueMarkdownOptions);
    await writeFile(resolve(root, `${name}-original.md`), source);
    await upload.setInputFiles({ name: `${name}.md`, mimeType: 'text/markdown', buffer: Buffer.from(source) });
    const text = editor.locator('[data-fountain-text-path]').filter({ hasText: leading ? /^Right$/ : /^Left$/ });
    // Visit the edge containing the figure before selecting, so a broken image
    // or an unloaded virtualized NodeView cannot pass as successful media.
    await text.scrollIntoViewIfNeeded();
    await text.click();
    await page.keyboard.press(leading ? 'Control+Home' : 'Control+End');
    await expect(editor.locator('img')).toHaveCount(1);
    await expect.poll(() => editor.locator('img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement
      && image.complete && image.naturalWidth === 400))).toBe(true);
    const checkpoints: unknown[] = [];
    const checkpoint = async (phase: string) => {
      checkpoints.push(await editor.evaluate((element, phase) => {
        const selection = getSelection();
        return { phase, anchor: selection?.anchorNode?.nodeName, anchorText: selection?.anchorNode?.textContent?.slice(0, 30),
          anchorOffset: selection?.anchorOffset, head: selection?.focusNode?.nodeName, headOffset: selection?.focusOffset,
          gaps: Array.from(element.querySelectorAll('[data-fountain-gap]')).map(node => ({ path: node.getAttribute('data-fountain-path'), gap: node.getAttribute('data-fountain-gap') })) };
      }, phase));
    };
    await checkpoint('edge');
    const point = async () => {
      await text.scrollIntoViewIfNeeded();
      return text.evaluate((wrapper, offset) => {
        const range = document.createRange(); range.setStart(wrapper.firstChild!, offset); range.collapse(true);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + .1, y: rect.y + rect.height / 2 };
      }, leading ? 3 : 2);
    };
    if (leading ? backward : !backward) {
      if (virtual) await page.keyboard.press(leading ? 'Control+End' : 'Control+Home');
      // Native click waits for the virtual block's measured position to settle.
      // A precomputed viewport coordinate can otherwise hit below the viewport
      // while WebKit corrects estimated block heights after scrolling.
      await text.click();
      await page.keyboard.press('Home');
      for (let index = 0; index < (leading ? 3 : 2); index++) await page.keyboard.press('ArrowRight');
      await writeFile(resolve(root, `${name}-navigation.json`), JSON.stringify(await page.evaluate(() =>
        (globalThis as unknown as { boundaryNavigationRecords: unknown[] }).boundaryNavigationRecords), null, 2));
      await expect.poll(() => page.evaluate(() => ({ text: getSelection()?.focusNode?.textContent,
        offset: getSelection()?.focusOffset }))).toEqual({ text: leading ? 'Right' : 'Left', offset: leading ? 3 : 2 });
      await page.keyboard.press(leading ? 'Control+Shift+Home' : 'Control+Shift+End');
    } else if (virtual) {
      // The target text is unmounted at the other edge. Extend there using
      // native document navigation, then move the head to the partial offset.
      await page.keyboard.press(leading ? 'Control+Shift+End' : 'Control+Shift+Home');
      await checkpoint('document-extended');
      for (let index = 0; index < 2; index++) {
        await page.keyboard.press(leading ? 'Shift+ArrowLeft' : 'Shift+ArrowRight');
        await checkpoint(`character-extended-${index + 1}`);
      }
    } else {
      // Returning from the opposite edge must retain the structural anchor.
      const at = await point();
      await checkpoint('before-shift');
      await page.keyboard.down('Shift');
      await checkpoint('shift-down');
      try { await page.mouse.click(at.x, at.y); } finally { await page.keyboard.up('Shift'); }
    }
    const native = await page.evaluate(() => {
      const selection = getSelection();
      const endpoint = (node: Node | null | undefined, offset: number | undefined) => ({
        textPath: (node instanceof Element ? node : node?.parentElement)?.closest('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path') ?? null,
        element: node instanceof Element ? node.tagName : node?.nodeName, offset,
      });
      return { anchor: endpoint(selection?.anchorNode, selection?.anchorOffset),
        head: endpoint(selection?.focusNode, selection?.focusOffset), collapsed: selection?.isCollapsed };
    });
    await writeFile(resolve(root, `${name}-native.json`), JSON.stringify(native, null, 2));
    await writeFile(resolve(root, `${name}-checkpoints.json`), JSON.stringify(checkpoints, null, 2));
    expect(native.collapsed).toBe(false);
    const textEndpoint = backward ? native.head : native.anchor;
    const boundaryEndpoint = backward ? native.anchor : native.head;
    // In a leading-image forward selection the text is the head, not anchor.
    const actualText = leading ? boundaryEndpoint : textEndpoint;
    const actualBoundary = leading ? textEndpoint : boundaryEndpoint;
    expect(actualText.textPath).toBe(await text.getAttribute('data-fountain-text-path'));
    expect(actualText.offset).toBe(leading ? 3 : 2);
    expect(actualBoundary.textPath).toBeNull();
    await page.screenshot({ path: resolve(root, `${name}-selected.png`) });
    await page.keyboard.type('X');
    await expect(editor.locator('img')).toHaveCount(0);
    await expect(editor.locator(':scope > p')).toHaveCount(1);
    await expect(editor.locator(':scope > p')).toHaveText(leading ? 'Xht' : 'LeX');
    await expect.poll(() => editor.locator('[data-fountain-text-path]').first().evaluate(element => {
      const rect = element.getBoundingClientRect();
      const header = document.querySelector('.site-header')?.getBoundingClientRect();
      return rect.top >= Math.max(0, header?.bottom ?? 0) && rect.bottom <= innerHeight;
    }), { message: 'After replacing a long virtual range the edited text and caret must remain visible.' }).toBe(true);
    await page.screenshot({ path: resolve(root, `${name}-edited.png`) });
    const download = async (suffix: string) => {
      const event = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
      const target = resolve(root, `${name}-${suffix}.md`);
      await (await event).saveAs(target);
      return { target, source: await readFile(target, 'utf8') };
    };
    const edited = await download('edited');
    expect(MarkdownImporter.parse(edited.source, schema, issueMarkdownOptions).toJSON()).toEqual(expected.toJSON());
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await download('undone')).source).toBe(source);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    expect((await download('redone')).source).toBe(edited.source);
    await upload.setInputFiles(edited.target);
    await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
    const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
    await expect(reader.locator('img')).toHaveCount(0);
    await expect(reader.locator(':scope > p')).toHaveText(leading ? 'Xht' : 'LeX');
    await reader.screenshot({ path: resolve(root, `${name}-reader.png`) });
    observations.push({ name, native, originalBlocks: virtual ? 302 : 2, replacedBlocks: 1,
      loadedImageWidth: 400, completeExportedModel: true, originalSourceUndo: true, editedSourceRedo: true, reopenedReader: true });
    await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  }
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name, observations, errors }, null, 2));
}
