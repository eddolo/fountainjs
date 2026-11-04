import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MarkdownImporter } from 'fountainjs-editor';
import { labSchema } from '../../examples/react-app/src/conversion-lab';

export async function runMarkdownContainerReferenceJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('container-reference-journey');
  await mkdir(root, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  const source = ['# Research notes [link][ref] ###', '', '> [ref]: /first "First"', '>',
    '> First __quoted__ [link][ref].', '>', '  > Edit this quote.', '>', ' > Last _quoted_ [ref].', '',
    '*   [other]: /second "Second"', '', '    First __source__ [link][other].', '', '    Edit this item.', '',
    '    Last _source_ [other].', '', '*   Tail.', '', 'After [link][ref] and [other].', ''].join('\r\n');
  await writeFile(resolve(root, 'original.md'), source);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'container-notes.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: container-notes.md', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(editor.locator('blockquote > p')).toHaveCount(3);
  await expect(editor.locator('ul > li')).toHaveCount(2);
  await expect(editor.getByRole('heading').getByRole('link')).toHaveAttribute('href', '/first');
  await editor.screenshot({ path: resolve(root, 'imported.png'), caret: 'initial' });
  const download = async (name: string, currentWorkspace = workspace) => {
    await currentWorkspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('markdown');
    const pending = page.waitForEvent('download');
    await currentWorkspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const target = resolve(root, name);
    await (await pending).saveAs(target);
    await expect(currentWorkspace.getByLabel('Round-trip result')).toContainText('Exact Fountain document equality after reopening.');
    return readFile(target, 'utf8');
  };
  const edit = async (before: string, after: string) => {
    await editor.locator('p').filter({ hasText: before }).click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.type(after);
    await expect(editor.locator('p').filter({ hasText: after })).toBeVisible();
  };
  await edit('Edit this item.', 'Reviewed this item.');
  const edited = source.replace('Edit this item.', 'Reviewed this item.');
  expect(await download('item-edited.md')).toBe(edited);
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await download('undone.md')).toBe(source);
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await download('redone.md')).toBe(edited);
  await edit('Edit this quote.', 'Reviewed this quote.');
  const bothEdited = edited.replace('Edit this quote.', 'Reviewed this quote.');
  expect(await download('quote-edited.md')).toBe(bothEdited);
  await editor.screenshot({ path: resolve(root, 'edited.png'), caret: 'initial' });
  // A normal toolbar action removes the physical owner of the hidden definition.
  // The intended model still contains all linked text and must reopen completely.
  await editor.locator('blockquote > p').filter({ hasText: 'Reviewed this quote.' }).click();
  await workspace.getByRole('button', { name: 'Remove quote', exact: true }).click();
  await expect(editor.locator('blockquote')).toHaveCount(0);
  const expected = MarkdownImporter.parse(bothEdited, labSchema);
  const [heading, quote, list, tail] = expected.content;
  const unwrapped = expected.copy([heading, ...quote.content, list, tail]);
  const unwrappedText = await download('quote-unwrapped.md');
  expect(MarkdownImporter.parse(unwrappedText, labSchema).toJSON()).toEqual(unwrapped.toJSON());
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.locator('blockquote')).toHaveCount(1);
  expect(await download('quote-restored.md')).toBe(bothEdited);
  await page.getByLabel('Choose documents').setInputFiles(resolve(root, 'quote-unwrapped.md'));
  const reopened = page.getByRole('region', { name: 'Conversion workspace: quote-unwrapped.md', exact: true })
    .getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(reopened.locator('blockquote')).toHaveCount(0);
  await expect(reopened.locator('p').filter({ hasText: 'Reviewed this quote.' })).toBeVisible();
  await expect(reopened.getByRole('heading').getByRole('link')).toHaveAttribute('href', '/first');
  await expect(reopened.getByRole('heading').getByRole('link')).toHaveAttribute('title', 'First');
  await reopened.screenshot({ path: resolve(root, 'reopened.png'), caret: 'initial' });
  const tasks = ['# Keep [link][ref] ###', '', '- [ ] Review [proof][ref].', '', '  [ref]: /target "Original"', '',
    '- [X] Preserve __source__ [ref].', '', 'After [link][ref].', '', '[ref]: /ignored "Ignored"', ''].join('\r\n');
  await writeFile(resolve(root, 'tasks-original.md'), tasks);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'container-tasks.md', mimeType: 'text/markdown', buffer: Buffer.from(tasks) });
  const tasksWorkspace = page.getByRole('region', { name: 'Conversion workspace: container-tasks.md', exact: true });
  const tasksEditor = tasksWorkspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const checkbox = tasksEditor.getByRole('checkbox').first();
  await expect(tasksEditor.getByRole('link', { name: 'proof', exact: true })).toHaveAttribute('href', '/target');
  await expect(tasksEditor.locator('pre')).toHaveCount(0);
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  expect(await download('task-checked.md', tasksWorkspace)).toBe(tasks.replace('[ ]', '[x]'));
  await expect(tasksEditor.getByRole('link', { name: 'proof', exact: true })).toHaveAttribute('href', '/target');
  await tasksEditor.screenshot({ path: resolve(root, 'task-checked.png'), caret: 'initial' });
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  expect(await download('task-cleared.md', tasksWorkspace)).toBe(tasks);
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name,
    nativeTyping: true, untouchedNestedSourceRetained: true, crossBlockReferenceDestinationsRetained: true,
    undoOriginalExact: true, redoExact: true, nativeTaskCheckboxRetained: true, duplicateDefinitionPrecedenceRetained: true,
    nativeQuoteUnwrap: true, quoteUndoRestoresSource: true, expectedUnwrappedCompleteModelChecked: true,
    actualDownloadUploadedAgain: true, editedFullModelReopened: true, CRLFDownloadsRetained: true, errors }, null, 2));
}
