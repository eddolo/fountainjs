import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function runMarkdownSourceBoundariesJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('source-boundary-journey');
  await mkdir(root, { recursive: true });
  const source = ['# Lab notes ###', 'Edit this paragraph.', '', '~~~~typescript', 'const first = 1;', '',
    'const second = 2;', '~~~~', '', '*   First __source__ item', '', '*   Second _source_ item', '',
    '> A __quoted__ line', '>', '> Another _quoted_ line', '', 'Last __source__ paragraph.', ''].join('\r\n');
  await writeFile(resolve(root, 'original.md'), source);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'lab-notes.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: lab-notes.md', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(editor.getByRole('heading', { name: 'Lab notes', exact: true })).toBeVisible();
  await expect(editor.locator('pre')).toContainText('const first = 1;\n\nconst second = 2;');
  await expect(editor.locator('ul > li')).toHaveCount(2);
  await expect(editor.locator('blockquote > p')).toHaveCount(2);
  await editor.screenshot({ path: resolve(root, 'imported.png'), caret: 'initial' });
  const paragraph = editor.locator('p').filter({ hasText: /^Edit this paragraph\.$/ });
  await paragraph.click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('Edited in browser.');
  await expect(editor.locator('p').filter({ hasText: /^Edited in browser\.$/ })).toBeVisible();
  await editor.screenshot({ path: resolve(root, 'edited.png'), caret: 'initial' });
  const download = async (name: string) => {
    await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('markdown');
    const pending = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const target = resolve(root, name);
    await (await pending).saveAs(target);
    await expect(workspace.getByLabel('Round-trip result')).toContainText('Exact Fountain document equality after reopening.');
    return readFile(target, 'utf8');
  };
  const edited = source.replace('Edit this paragraph.', 'Edited in browser.');
  expect(await download('edited.md')).toBe(edited);
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(paragraph).toBeVisible();
  expect(await download('undone.md')).toBe(source);
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await download('redone.md')).toBe(edited);
  await editor.getByRole('heading', { name: 'Lab notes', exact: true }).click();
  await workspace.getByRole('button', { name: 'Paragraph', exact: true }).click();
  await expect(editor.getByRole('heading', { name: 'Lab notes', exact: true })).toHaveCount(0);
  await expect(editor.locator(':scope > p').first()).toHaveText('Lab notes');
  const changedType = edited.replace('# Lab notes ###\r\n', 'Lab notes\r\n\r\n');
  expect(await download('changed-type.md')).toBe(changedType);
  await editor.screenshot({ path: resolve(root, 'changed-type.png'), caret: 'initial' });
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await download('type-undone.md')).toBe(edited);
  await editor.screenshot({ path: resolve(root, 'restored-heading.png'), caret: 'initial' });
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name,
    nativeTyping: true, downloadedExactEditedSource: true, downloadedExactUndoSource: true,
    redoExact: true, headingTypeChangeSeparatedParagraphs: true, untouchedFencesListsQuotesRetained: true,
    fullReopenedModelEquality: true, errors }, null, 2));
}
