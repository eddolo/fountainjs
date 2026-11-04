import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function runMarkdownReferenceBoundariesJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('reference-boundary-journey');
  await mkdir(root, { recursive: true });
  const source = '[ref]: /target "Original title"\r\n\r\n# Keep [link][ref] ###\r\n\r\n~~~~js\r\nfirst\r\n';
  await writeFile(resolve(root, 'original.md'), source);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'references.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: references.md', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const heading = editor.getByRole('heading', { name: 'Keep link', exact: true });
  await expect(heading.getByRole('link')).toHaveAttribute('href', '/target');
  await expect(heading.getByRole('link')).toHaveAttribute('title', 'Original title');
  await expect(editor.locator('pre')).toHaveText('first');
  await editor.screenshot({ path: resolve(root, 'imported.png'), caret: 'initial' });
  // A normal Enter at the end of a heading inserts a paragraph before the
  // terminal code block. The export must also protect its definition footer.
  await heading.click({ position: { x: 12, y: 12 } });
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Added in browser.');
  await expect(editor.locator(':scope > p').filter({ hasText: 'Added in browser.' })).toBeVisible();
  const download = async (name: string) => {
    await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('markdown');
    const pending = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const target = resolve(root, name);
    await (await pending).saveAs(target);
    await expect(workspace.getByLabel('Round-trip result')).toContainText('Exact Fountain document equality after reopening.');
    return readFile(target, 'utf8');
  };
  const expected = '# Keep [link][ref] ###\r\n\r\nAdded in browser.\r\n\r\n```js\r\nfirst\r\n```\r\n\r\n[ref]: /target "Original title"';
  expect(await download('edited.md')).toBe(expected);
  await editor.screenshot({ path: resolve(root, 'edited.png'), caret: 'initial' });
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await download('undone.md')).not.toContain('Added in browser.');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await download('redone.md')).toBe(expected);
  await expect(heading.getByRole('link')).toHaveAttribute('href', '/target');
  await expect(editor.locator('pre')).toHaveText('first');
  await editor.screenshot({ path: resolve(root, 'redone.png'), caret: 'initial' });
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name,
    nativeEnterAndTyping: true, actualDownloads: 3, completeEditedModelsReopened: true,
    referenceDestinationAndTitleRetained: true, definitionFooterOutsideFence: true,
    untouchedHeadingSourceRetained: true, undoRedo: true, errors }, null, 2));
}
