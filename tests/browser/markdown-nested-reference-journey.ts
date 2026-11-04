import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function runMarkdownNestedReferenceJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('nested-reference-journey');
  await mkdir(root, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  const source = ['[ref]: /target "Original title"', '', '# Research notes ###', '',
    '> First __quoted__ [link][ref].', '>', '  > Edit this quote.', '>', ' > Last _quoted_ [ref].', '',
    '*   First __source__ [link][ref].', '', '*   Edit this item.', '', '*   Last _source_ [ref].', '', 'After the list.', ''].join('\r\n');
  await writeFile(resolve(root, 'original.md'), source);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'reference-notes.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: reference-notes.md', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(editor.locator('blockquote > p')).toHaveCount(3);
  await expect(editor.locator('ul > li')).toHaveCount(3);
  await expect(editor.getByRole('link', { name: 'link', exact: true }).first()).toHaveAttribute('title', 'Original title');
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
  expect(await download('quote-edited.md')).toBe(edited.replace('Edit this quote.', 'Reviewed this quote.'));
  await editor.screenshot({ path: resolve(root, 'edited.png'), caret: 'initial' });
  // Reopen the actual downloaded bytes, rather than a constructed equivalent.
  await page.getByLabel('Choose documents').setInputFiles(resolve(root, 'quote-edited.md'));
  const reopened = page.getByRole('region', { name: 'Conversion workspace: quote-edited.md', exact: true })
    .getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(reopened.locator('p').filter({ hasText: 'Reviewed this item.' })).toBeVisible();
  await expect(reopened.locator('p').filter({ hasText: 'Reviewed this quote.' })).toBeVisible();
  await expect(reopened.getByRole('link', { name: 'link', exact: true }).first()).toHaveAttribute('href', '/target');
  await expect(reopened.getByRole('link', { name: 'link', exact: true }).first()).toHaveAttribute('title', 'Original title');
  await reopened.screenshot({ path: resolve(root, 'reopened.png'), caret: 'initial' });
  const tasks = ['[ref]: /first "First"', '', '- [ ] Review [proof][ref].', '- [X] Preserve __source__ [ref].', '',
    'Ready to publish.', '', '[ref]: /ignored "Ignored"', ''].join('\r\n');
  await writeFile(resolve(root, 'tasks-original.md'), tasks);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'reference-tasks.md', mimeType: 'text/markdown', buffer: Buffer.from(tasks) });
  const tasksWorkspace = page.getByRole('region', { name: 'Conversion workspace: reference-tasks.md', exact: true });
  const tasksEditor = tasksWorkspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const checkbox = tasksEditor.getByRole('checkbox').first();
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  expect(await download('task-checked.md', tasksWorkspace)).toBe(tasks.replace('[ ]', '[x]'));
  await expect(tasksEditor.getByRole('link', { name: 'proof', exact: true })).toHaveAttribute('href', '/first');
  await tasksEditor.screenshot({ path: resolve(root, 'task-checked.png'), caret: 'initial' });
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  expect(await download('task-cleared.md', tasksWorkspace)).toBe(tasks);
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name,
    nativeTyping: true, untouchedNestedSourceRetained: true, referenceDestinationsAndTitlesRetained: true,
    undoOriginalExact: true, redoExact: true, nativeTaskCheckboxRetained: true, duplicateDefinitionPrecedenceRetained: true,
    actualDownloadUploadedAgain: true, editedFullModelReopened: true, CRLFDownloadsRetained: true, errors }, null, 2));
}
