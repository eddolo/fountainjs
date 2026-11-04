import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MarkdownImporter, Schema, StarterKit, type Node as FountainNode } from 'fountainjs-editor';
import { issueMarkdownOptions } from '../../examples/react-app/src/issue-markdown-policy';

export async function runNestedSiblingRangeJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('nested-sibling-range-journey');
  await mkdir(root, { recursive: true });
  const figure = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="96"><rect width="480" height="96" fill="#dceeff"/><text x="24" y="56" font-family="sans-serif" font-size="24">Selected figure must be removed</text></svg>';
  await page.route('https://example.test/figure.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: figure }));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/issue-editor.html');
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const upload = page.getByLabel('Open Markdown draft file', { exact: true });
  const schema = new Schema(StarterKit.schema);
  const observations = [];
  for (const item of [
    { name: 'quote', selector: 'blockquote', path: [0], source: '> Left\n>\n> ![Figure](https://example.test/figure.svg)\n>\n> Right\n\nAfter.\n' },
    { name: 'list', selector: 'li', path: [0, 0], source: '- Left\n\n  ![Figure](https://example.test/figure.svg)\n\n  Right\n\nAfter.\n' },
    { name: 'cell', selector: 'td', path: [0, 0, 0], source: '<table><tr><td><p>Left</p><img src="https://example.test/figure.svg" alt="Figure"><p>Right</p></td></tr></table>\n\nAfter.\n' },
  ].flatMap(item => [{ ...item, backward: false }, { ...item, name: `${item.name}-backward`, backward: true }])) {
    await writeFile(resolve(root, `${item.name}-original.md`), item.source);
    const original = MarkdownImporter.parse(item.source, schema, issueMarkdownOptions);
    let parent = original;
    for (const index of item.path) parent = parent.child(index);
    expect(parent.childCount).toBe(3);
    const merged = parent.copy([parent.child(0).copy([schema.text('LeXht')])]);
    const replace = (node: FountainNode, path: number[]): FountainNode => path.length
      ? node.copy(node.content.map((child, index) => index === path[0] ? replace(child, path.slice(1)) : child)) : merged;
    const expectedDoc = replace(original, item.path);
    await upload.setInputFiles({ name: `${item.name}.md`, mimeType: 'text/markdown', buffer: Buffer.from(item.source) });
    await page.getByRole('combobox', { name: 'Table export', exact: true }).selectOption('html');
    const parentView = editor.locator(item.selector).first();
    await expect(parentView.getByText('Left', { exact: true })).toBeVisible();
    const left = editor.locator('[data-fountain-text-path]').filter({ hasText: /^Left$/ });
    const right = editor.locator('[data-fountain-text-path]').filter({ hasText: /^Right$/ });
    // Measure text coordinates only; the selection is placed by actual pointer
    // input and Shift-click, without assigning the DOM or model selection.
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
    const expectedPaths = { anchor: await (item.backward ? right : left).getAttribute('data-fountain-text-path'), anchorOffset: item.backward ? 3 : 2,
      focus: await (item.backward ? left : right).getAttribute('data-fountain-text-path'), focusOffset: item.backward ? 2 : 3 };
    await expect.poll(() => page.evaluate(() => {
      const selection = getSelection();
      const path = (node: Node | null | undefined) => (node instanceof Element ? node : node?.parentElement)
        ?.closest('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path') ?? null;
      return { anchor: path(selection?.anchorNode), anchorOffset: selection?.anchorOffset,
        focus: path(selection?.focusNode), focusOffset: selection?.focusOffset };
    })).toEqual(expectedPaths);
    await editor.screenshot({ path: resolve(root, `${item.name}-selection.png`) });
    await page.keyboard.type('X');
    await expect(parentView.locator('p')).toHaveText(['LeXht']);
    await expect(parentView.locator('img')).toHaveCount(0);
    await expect(editor.locator(':scope > p').last()).toHaveText('After.');
    await editor.screenshot({ path: resolve(root, `${item.name}-replaced.png`) });
    const download = async (suffix: string) => {
      const event = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
      const target = resolve(root, `${item.name}-${suffix}.md`);
      await (await event).saveAs(target);
      return { target, source: await readFile(target, 'utf8') };
    };
    const changed = await download('edited');
    expect(MarkdownImporter.parse(changed.source, schema, issueMarkdownOptions).eq(expectedDoc)).toBe(true);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(parentView.locator('img')).toHaveCount(1);
    expect((await download('undone')).source).toBe(item.source);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    expect((await download('redone')).source).toBe(changed.source);
    await upload.setInputFiles(changed.target);
    await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
    const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
    await expect(reader.locator(item.selector).first().locator('p')).toHaveText(['LeXht']);
    await expect(reader.locator('img')).toHaveCount(0);
    await expect(reader.locator(':scope > p').last()).toHaveText('After.');
    await reader.screenshot({ path: resolve(root, `${item.name}-reader.png`) });
    observations.push({ name: item.name, backward: item.backward, nativeShiftClick: true, exactNativeEndpoints: expectedPaths,
      selectedImageRemoved: true, completeExpectedReopenedModel: true, undoSourceExact: true, redoSourceExact: true });
    await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  }
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name, observations, errors }, null, 2));
}
