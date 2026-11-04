import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function runMarkdownNestedSourceJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('nested-source-journey');
  await mkdir(root, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  const source = ['# Research notes ###', '', '> First __quoted__ paragraph.', '>', '  > Edit this quote.',
    '>', ' > Last _quoted_ paragraph.', '', '*   First __source__ item', '', '*   Edit this item.', '',
    '*   Last _source_ item', ''].join('\r\n');
  await writeFile(resolve(root, 'original.md'), source);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'nested-notes.md', mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: nested-notes.md', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  await expect(editor.locator('blockquote > p')).toHaveCount(3);
  await expect(editor.locator('ul > li')).toHaveCount(3);
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
  const itemEdited = source.replace('Edit this item.', 'Reviewed this item.');
  // StarterKit keeps a caret paragraph after the terminal list. It must survive
  // an edited export rather than being omitted to make source comparisons pass.
  const first = await download('item-edited.md');
  expect(first).toContain(itemEdited.trimEnd());
  expect(first.slice(itemEdited.trimEnd().length)).toBe('\r\n\r\n<p data-fountain-empty="text"></p>');
  await editor.screenshot({ path: resolve(root, 'item-edited.png'), caret: 'initial' });
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.locator('p').filter({ hasText: 'Edit this item.' })).toBeVisible();
  // Untouched source has the pre-existing exact-source exemption for the
  // automatic caret paragraph; its round-trip status is intentionally different.
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('markdown');
  const undonePending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  await (await undonePending).saveAs(resolve(root, 'undone.md'));
  expect(await readFile(resolve(root, 'undone.md'), 'utf8')).toBe(source);
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await download('redone.md')).toBe(first);
  await edit('Edit this quote.', 'Reviewed this quote.');
  expect(await download('quote-edited.md')).toBe(first.replace('Edit this quote.', 'Reviewed this quote.'));
  await editor.screenshot({ path: resolve(root, 'quote-edited.png'), caret: 'initial' });
  const taskSource = '- [ ] Review the proof.\r\n- [X] Preserve __source__.\r\n';
  await writeFile(resolve(root, 'tasks-original.md'), taskSource);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'nested-tasks.md', mimeType: 'text/markdown', buffer: Buffer.from(taskSource) });
  const tasksWorkspace = page.getByRole('region', { name: 'Conversion workspace: nested-tasks.md', exact: true });
  const tasksEditor = tasksWorkspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
  const checkbox = tasksEditor.getByRole('checkbox').first();
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  expect(await download('task-checked.md', tasksWorkspace)).toBe(taskSource.replace('[ ]', '[x]')
    + '\r\n<p data-fountain-empty="text"></p>');
  await tasksEditor.screenshot({ path: resolve(root, 'task-checked.png'), caret: 'initial' });
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  // Returning to the original complete model restores exact source spelling.
  await tasksWorkspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('markdown');
  const clearedPending = page.waitForEvent('download');
  await tasksWorkspace.getByRole('button', { name: 'Download export', exact: true }).click();
  await (await clearedPending).saveAs(resolve(root, 'task-cleared.md'));
  expect(await readFile(resolve(root, 'task-cleared.md'), 'utf8')).toBe(taskSource);
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name,
    nativeTyping: true, terminalListCaretRetained: true, untouchedItemAndQuoteSourceRetained: true,
    undoOriginalExact: true, redoExact: true, nativeTaskCheckboxRetained: true,
    editedFullModelReopened: true, errors }, null, 2));
}
