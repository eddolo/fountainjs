import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MarkdownImporter, Schema, StarterKit } from 'fountainjs-editor';
import { issueMarkdownOptions } from '../../examples/react-app/src/issue-markdown-policy';

export async function runIssueHTMLSourceJourney(page: Page, info: TestInfo): Promise<void> {
  const root = info.outputPath('issue-html-source-journey');
  await mkdir(root, { recursive: true });
  const original = '[ref]: /target "Original title"\r\n\r\n# Keep [link][ref] ###\r\n\r\n~~~~js\r\nfirst\r\n';
  await writeFile(resolve(root, 'original.md'), original);
  const schema = new Schema(StarterKit.schema);
  const imported = MarkdownImporter.parse(original, schema, issueMarkdownOptions);
  const editedModel = imported.copy([imported.child(0), schema.node('paragraph', {}, [schema.text('Added in issue workflow.')]), imported.child(1)]);
  const undoneModel = imported.copy([imported.child(0), schema.node('paragraph', {}, [schema.text('')]), imported.child(1)]);
  const expected = '# Keep [link][ref] ###\r\n\r\nAdded in issue workflow.\r\n\r\n```js\r\nfirst\r\n```\r\n\r\n[ref]: /target "Original title"';
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/issue-editor.html');
  const upload = page.getByLabel('Open Markdown draft file', { exact: true });
  await upload.setInputFiles({ name: 'issue-references.md', mimeType: 'text/markdown', buffer: Buffer.from(original) });
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const heading = editor.getByRole('heading', { name: 'Keep link', exact: true });
  await expect(heading.getByRole('link')).toHaveAttribute('href', '/target');
  await expect(editor.locator('pre')).toHaveText('first');
  await editor.screenshot({ path: resolve(root, 'imported.png'), caret: 'initial' });
  await heading.click({ position: { x: 12, y: 12 } });
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Added in issue workflow.');
  await expect(editor.locator(':scope > p')).toHaveText('Added in issue workflow.');
  await expect(editor.locator(':scope > p a')).toHaveCount(0);
  await editor.screenshot({ path: resolve(root, 'edited.png'), caret: 'initial' });
  const download = async (name: string) => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
    const path = resolve(root, name);
    await (await pending).saveAs(path);
    return { path, text: await readFile(path, 'utf8') };
  };
  const first = await download('edited.md');
  // Reopen the actual downloaded file before checking source spelling. A bad
  // old export visibly puts its definition footer inside the code block.
  await upload.setInputFiles(first.path);
  await expect(editor.locator('pre')).toHaveText('first');
  await expect(heading.getByRole('link')).toHaveAttribute('href', '/target');
  expect(first.text).toBe(expected);
  expect(MarkdownImporter.parse(first.text, schema, issueMarkdownOptions).toJSON()).toEqual(editedModel.toJSON());
  await editor.screenshot({ path: resolve(root, 'reopened.png'), caret: 'initial' });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.locator(':scope > p')).toHaveText('');
  const undone = await download('undone.md');
  expect(MarkdownImporter.parse(undone.text, schema, issueMarkdownOptions).toJSON()).toEqual(undoneModel.toJSON());
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect((await download('redone.md')).text).toBe(expected);
  await page.getByRole('button', { name: 'Markdown source', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown description', exact: true })).toHaveValue(expected.replaceAll('\r\n', '\n'));
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await expect(reader).toHaveAttribute('contenteditable', 'false');
  await expect(reader.getByRole('link', { name: 'link', exact: true })).toHaveAttribute('title', 'Original title');
  await expect(reader.locator('pre')).toHaveText('first');
  await expect(reader.locator(':scope > p')).toHaveText('Added in issue workflow.');
  expect((await download('reader.md')).text).toBe(expected);
  await reader.screenshot({ path: resolve(root, 'reader.png'), caret: 'initial' });
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
  await writeFile(resolve(root, 'observations.json'), JSON.stringify({ engine: info.project.name,
    actualIssueHTMLBlockPolicy: true, nativeEnterAndTyping: true, actualFileReopened: true,
    expectedCompleteModelChecked: true, undoRedo: true, sourceAndReaderModes: true,
    CRLFDownloadsRetained: true, errors }, null, 2));
}
