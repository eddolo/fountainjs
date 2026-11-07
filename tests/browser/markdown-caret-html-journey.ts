import { readFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo } from '@playwright/test';

export async function runMarkdownCaretHTMLJourney(page: Page, info: TestInfo) {
  const markdown = '>\n\n- First\n-\n- Last\n\n<p data-fountain-empty="text"></p>\n\nReader text.\n';
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles({
    name: 'reader.md', mimeType: 'text/markdown', buffer: Buffer.from(markdown),
  });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: reader.md' });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const check = workspace.getByLabel('Round-trip result');
  await expect(editor.locator('blockquote p')).toHaveCount(1);
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('html');
  const omit = workspace.getByRole('checkbox', { name: 'Omit Markdown’s editor-only caret paragraphs in HTML' });
  const native = await page.context().newPage();
  async function readExport(name: string) {
    const pending = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export' }).click();
    const file = info.outputPath(name + '.html');
    await (await pending).saveAs(file);
    await native.setContent(await readFile(file, 'utf8'));
  }
  try {
    await readExport('default');
    await expect(native.locator('blockquote > p')).toHaveCount(1);
    await expect(native.locator('ul > li').nth(1).locator('p')).toHaveCount(1);
    await omit.check();
    await expect(check).toContainText('Outdated check');
    await readExport('reader');
    await expect(native.locator('blockquote')).toHaveCount(1);
    await expect(native.locator('blockquote > p')).toHaveCount(0);
    await expect(native.locator('ul > li')).toHaveCount(3);
    await expect(native.locator('ul > li').nth(1).locator('p')).toHaveCount(0);
    await expect(native.locator('body > p')).toHaveCount(2);
    await expect(native.locator('body > p').last()).toHaveText('Reader text.');
    await expect(editor.locator('blockquote p')).toHaveCount(1);
    await native.screenshot({ path: info.outputPath('reader.png') });

    await editor.locator('blockquote p').click();
    await page.keyboard.type('An authored quote.');
    await expect(editor.locator('blockquote')).toHaveText('An authored quote.');
    await readExport('edited-reader');
    await expect(native.locator('blockquote > p')).toHaveText('An authored quote.');
    await expect(native.locator('ul > li').nth(1).locator('p')).toHaveCount(0);
    await expect(native.locator('body > p')).toHaveCount(2);
    await native.screenshot({ path: info.outputPath('edited-reader.png') });
  } finally {
    await native.close();
  }
}
