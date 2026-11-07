import { readFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo } from '@playwright/test';

export async function runMarkdownFrontmatterJourney(page: Page, info: TestInfo) {
  const source = [
    '---', 'Quarterly briefing', '---', '',
    'Read https://example.org and <https://example.org/official>.', '',
    'Edit this sentence.', '', 'Keep __this spelling__.', '',
  ].join('\r\n');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/conversion-lab.html');
  const input = page.getByLabel('Choose documents');
  const choice = page.getByRole('checkbox', { name: 'Use CommonMark rules for delimiters and bare addresses', exact: true });
  const importFile = (name: string) => input.setInputFiles({ name, mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const workspace = (name: string) => page.getByRole('region', { name: 'Conversion workspace: ' + name, exact: true });
  const surface = (name: string) => workspace(name).getByRole('textbox', { name: 'Imported document editor', exact: true });
  const heading = (name: string) => surface(name).getByRole('heading', { name: 'Quarterly briefing', exact: true });
  await importFile('metadata.md');
  await expect(surface('metadata.md').getByRole('link', { name: 'https://example.org', exact: true })).toBeVisible();
  await expect(heading('metadata.md')).toHaveCount(0);
  await choice.check();
  await expect(heading('metadata.md')).toHaveCount(0);
  await importFile('markdown-body.md');
  const editor = surface('markdown-body.md');
  await expect(heading('markdown-body.md')).toBeVisible();
  await expect(editor.locator('hr')).toHaveCount(1);
  await expect(editor.getByRole('link')).toHaveCount(1);
  await expect(editor.getByRole('link')).toHaveAttribute('href', 'https://example.org/official');
  await choice.uncheck();
  await expect(heading('markdown-body.md')).toBeVisible();
  await editor.getByText('Edit this sentence.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Updated in the editor.');
  await expect(editor.getByText('Edit this sentence. Updated in the editor.', { exact: true })).toBeVisible();
  const active = workspace('markdown-body.md');
  await active.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('markdown');
  const pending = page.waitForEvent('download');
  await active.getByRole('button', { name: 'Download export', exact: true }).click();
  const saved = info.outputPath('markdown-body-edited.md');
  await (await pending).saveAs(saved);
  await expect(active.getByLabel('Round-trip result')).toContainText('Exact Fountain document equality after reopening.');
  await expect(active.getByLabel('Round-trip result')).toContainText('Bare addresses stay as text.');
  const expected = source.replace('Edit this sentence.', 'Edit this sentence. Updated in the editor.');
  expect(await readFile(saved, 'utf8')).toBe(expected);
  await active.getByLabel('Round-trip result').screenshot({ path: info.outputPath('round-trip.png') });
  await choice.check();
  await input.setInputFiles(saved);
  const reopened = surface('markdown-body-edited.md');
  await expect(heading('markdown-body-edited.md')).toBeVisible();
  await expect(reopened.getByText('Edit this sentence. Updated in the editor.', { exact: true })).toBeVisible();
  await expect(reopened.getByRole('link')).toHaveCount(1);
  await reopened.screenshot({ path: info.outputPath('reopened.png') });
  expect(errors).toEqual([]);
}
