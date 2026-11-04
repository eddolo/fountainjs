import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MarkdownImporter, type Node } from 'fountainjs-editor';
import { labSchema } from '../../examples/react-app/src/conversion-lab';

const replace = (node: Node, path: readonly number[], value: Node): Node => !path.length ? value
  : node.copy(node.content.map((child, index) => index === path[0] ? replace(child, path.slice(1), value) : child));

export async function runMarkdownBoundaryRepairJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('boundary-repair-journey');
  await mkdir(root, { recursive: true });
  const source = ['# Research notes [link][ref] ###', '', '> [ref]: /target "Original"', '>',
    '> # Short title ###', '> Following __source__ [ref].', '>',
    '> > # Nested title ###', '> > Nested __source__ [ref].', '>',
    '> ## Keep compact ###', '> Untouched _last_.', '', 'After [ref].', ''].join('\r\n');
  await writeFile(resolve(root, 'original.md'), source);
  const imported = MarkdownImporter.parse(source, labSchema);
  const paragraph = (text: string) => labSchema.node('paragraph', {}, [labSchema.text(text)]);
  const firstModel = replace(imported, [1, 0], paragraph('Short title'));
  const bothModel = replace(firstModel, [1, 2, 0], paragraph('Nested title'));
  const editedModel = replace(bothModel, [1, 0], paragraph('Revised short title.'));
  const firstSource = source.replace('> # Short title ###\r\n', '> Short title\r\n> \r\n');
  const bothSource = firstSource.replace('> > # Nested title ###\r\n', '> > Nested title\r\n> > \r\n');
  const editedSource = bothSource.replace('> Short title\r\n', '> Revised short title.\r\n');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({ name: 'boundary-notes.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: boundary-notes.md', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(editor.locator('blockquote')).toHaveCount(2);
  await expect(editor.getByRole('heading', { name: 'Keep compact', exact: true })).toBeVisible();
  await editor.screenshot({ path: resolve(root, 'imported.png'), caret: 'initial' });
  const download = async (name: string, expectedSource: string, expectedModel: Node, current = workspace) => {
    await current.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('markdown');
    const pending = page.waitForEvent('download');
    await current.getByRole('button', { name: 'Download export', exact: true }).click();
    const target = resolve(root, name);
    await (await pending).saveAs(target);
    const markdown = await readFile(target, 'utf8');
    expect(markdown).toBe(expectedSource);
    expect(MarkdownImporter.parse(markdown, labSchema).toJSON()).toEqual(expectedModel.toJSON());
    await expect(current.getByLabel('Round-trip result')).toContainText('Exact Fountain document equality after reopening.');
    return target;
  };
  await editor.getByRole('heading', { name: 'Short title', exact: true }).click();
  await workspace.getByRole('button', { name: 'Paragraph', exact: true }).click();
  await expect(editor.getByRole('heading', { name: 'Short title', exact: true })).toHaveCount(0);
  await expect(editor.locator('blockquote > p').filter({ hasText: 'Short title' })).toHaveCount(1);
  await download('demoted.md', firstSource, firstModel);
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.getByRole('heading', { name: 'Short title', exact: true })).toBeVisible();
  await download('undone.md', source, imported);
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await download('redone.md', firstSource, firstModel);
  await editor.getByRole('heading', { name: 'Nested title', exact: true }).click();
  await workspace.getByRole('button', { name: 'Paragraph', exact: true }).click();
  await expect(editor.getByRole('heading', { name: 'Nested title', exact: true })).toHaveCount(0);
  await download('both-demoted.md', bothSource, bothModel);
  await editor.screenshot({ path: resolve(root, 'demoted.png'), caret: 'initial' });
  await editor.locator('blockquote > p').filter({ hasText: 'Short title' }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.type('Revised short title.');
  await expect(editor.locator('blockquote > p').filter({ hasText: 'Revised short title.' })).toBeVisible();
  const editedFile = await download('edited.md', editedSource, editedModel);
  await editor.screenshot({ path: resolve(root, 'edited.png'), caret: 'initial' });
  await page.getByLabel('Choose documents').setInputFiles(editedFile);
  const reopenedWorkspace = page.getByRole('region', { name: 'Conversion workspace: edited.md', exact: true });
  const reopened = reopenedWorkspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(reopened.locator('blockquote')).toHaveCount(2);
  await expect(reopened.getByRole('heading', { name: 'Keep compact', exact: true })).toBeVisible();
  await expect(reopened.getByRole('heading', { name: 'Research notes link', exact: true }).getByRole('link')).toHaveAttribute('href', '/target');
  await expect(reopened.getByRole('link', { name: 'ref', exact: true }).first()).toHaveAttribute('title', 'Original');
  await download('reopened.md', editedSource, editedModel, reopenedWorkspace);
  await reopened.screenshot({ path: resolve(root, 'reopened.png'), caret: 'initial' });
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name,
    nativeParagraphToolbar: true, nestedParagraphToolbar: true, nativeTyping: true, undoOriginalExact: true,
    redoExact: true, onlyNecessarySeparatorsChanged: true, referencesRetained: true,
    completeExpectedModelsChecked: true, actualDownloadedFileReopened: true, errors }, null, 2));
}
