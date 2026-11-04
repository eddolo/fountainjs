import { test, expect } from '@playwright/test';
import { writeFile, readFile } from 'node:fs/promises';
import { MarkdownImporter, Schema, StarterKit } from 'fountainjs-editor';
import { issueMarkdownOptions } from '../examples/react-app/src/issue-markdown-policy';

test('document-boundary replacement includes a terminal atomic image', async ({ page }, info) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS9sAAAAASUVORK5CYII=', 'base64');
  await page.route('https://example.test/terminal-figure.png', route => route.fulfill({ contentType: 'image/png', body: png }));
  const source = 'Start here.\n\n' + Array.from({ length: 300 }, (_, index) => `Paragraph ${index + 1}.\n\n`).join('')
    + '![Terminal figure](https://example.test/terminal-figure.png)\n';
  await writeFile(info.outputPath('original.md'), source);
  await page.goto('/issue-editor.html');
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles({ name: 'terminal-image.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const blocks = page.getByRole('complementary', { name: 'Fountain diagnostics' }).locator('dt:has-text("Document blocks") + dd');
  await expect(blocks).toHaveText('302 top-level blocks');
  await editor.locator(':scope > p').first().click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+Shift+End');
  const native = await page.evaluate(() => {
    const selection = getSelection();
    const path = (node: Node | null | undefined) => (node instanceof Element ? node : node?.parentElement)
      ?.closest('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path');
    return { anchor: path(selection?.anchorNode), anchorOffset: selection?.anchorOffset,
      focus: path(selection?.focusNode), focusOffset: selection?.focusOffset };
  });
  await page.screenshot({ path: info.outputPath('selected-boundary.png') });
  await page.keyboard.type('Entire replacement.');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  await (await event).saveAs(info.outputPath('actual-replacement.md'));
  const actualSource = await readFile(info.outputPath('actual-replacement.md'), 'utf8');
  const doc = MarkdownImporter.parse(actualSource, new Schema(StarterKit.schema), issueMarkdownOptions);
  const images = doc.content.filter(node => node.type.name === 'image' || node.type.name === 'image_super').length;
  await page.screenshot({ path: info.outputPath('actual-replacement.png') });
  await writeFile(info.outputPath('observations.json'), JSON.stringify({ engine: info.project.name, native,
    actualTopLevelBlocks: doc.childCount, terminalImagesRemaining: images, actualDocument: doc.toJSON(),
    requiredBehavior: 'Ctrl+Home then Ctrl+Shift+End must include the terminal image in replacement.' }, null, 2));
  expect(images, 'A full document-boundary selection must include the terminal atomic block.').toBe(0);
  expect(doc.childCount).toBe(1);
});
