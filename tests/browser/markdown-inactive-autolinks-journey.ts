import { readFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo } from '@playwright/test';

export async function runMarkdownInactiveAutolinksJourney(page: Page, info: TestInfo) {
  const source = '# Protocol notes\r\n\r\n<irc://example.org/room> <javascript:alert(1)> <https://example.org>\r\n\r\nEdit here.\r\n';
  await page.goto('/conversion-lab.html');
  const input = page.getByLabel('Choose documents');
  const upload = (name: string) => input.setInputFiles({ name, mimeType: 'text/markdown', buffer: Buffer.from(source) });
  const workspace = (name: string) => page.getByRole('region', { name: 'Conversion workspace: ' + name, exact: true });
  const surface = (name: string) => workspace(name).getByRole('textbox', { name: 'Imported document editor' });
  await upload('default.md');
  await expect(surface('default.md')).toContainText('<irc://example.org/room>');
  await expect(surface('default.md').locator('[data-fountain-inert-anchor]')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Preserve supported HTML structure', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Preserve blocked Markdown autolinks as inactive data', exact: true }).check();
  await upload('inactive.md');
  const editor = surface('inactive.md');
  const active = workspace('inactive.md');
  const carriers = editor.locator('span[data-fountain-inert-anchor="v1"]');
  await expect(carriers).toHaveCount(2);
  await expect(carriers.nth(0)).toContainText('irc://example.org/room');
  await expect(carriers.nth(1)).toContainText('javascript:alert(1)');
  await expect(editor.getByRole('link')).toHaveCount(1);
  await expect(editor.getByRole('link')).toHaveAttribute('href', 'https://example.org');
  await editor.getByText('Edit here.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Kept the destination data.');
  await editor.screenshot({ path: info.outputPath('author.png') });
  const download = async (format: 'markdown' | 'html') => {
    await active.getByRole('combobox', { name: 'Export format' }).selectOption(format);
    const pending = page.waitForEvent('download');
    await active.getByRole('button', { name: 'Download export' }).click();
    const target = info.outputPath('saved.' + (format === 'markdown' ? 'md' : format));
    await (await pending).saveAs(target);
    await expect(active.getByLabel('Round-trip result')).toContainText('Exact Fountain document equality after reopening.');
    return readFile(target, 'utf8');
  };
  expect(await download('markdown')).toBe(source.replace('Edit here.', 'Edit here. Kept the destination data.'));
  const html = await download('html');
  const reader = await page.context().newPage();
  try {
    await reader.setContent(html);
    await expect(reader.locator('span[data-fountain-inert-anchor="v1"]')).toHaveCount(2);
    await expect(reader.locator('a')).toHaveCount(1);
    await expect(reader.locator('a')).toHaveAttribute('href', 'https://example.org');
    await reader.screenshot({ path: info.outputPath('reader.png') });
  } finally { await reader.close(); }
}
