import { expect, type Page, type TestInfo } from '@playwright/test';

export async function markdownLiteralJourney(page: Page, info: TestInfo): Promise<void> {
  await page.goto('/issue-editor.html');
  const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true });
  const visualTab = page.getByRole('button', { name: 'Visual editor', exact: true });
  const source = page.getByRole('textbox', { name: 'Markdown description', exact: true });
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const text = 'Keep ~not deleted~ and ==not highlighted== and $not_math$ literal; writer@example.com.';
  await sourceTab.click();
  await source.fill(String.raw`Keep \~not deleted\~ and \=\=not highlighted\=\= and \$not\_math\$ literal; writer\@example.com.

[Docs](https://example.com/docs)`);
  await visualTab.click();
  const verify = async (surface: typeof editor, edited: boolean) => {
    await expect(surface.locator('p').first()).toHaveText(`${edited ? 'Reviewed. ' : ''}${text}`);
    await expect(surface.locator('s, del, mark, [data-fountain-node="inline_math"]')).toHaveCount(0);
    await expect(surface.getByRole('link')).toHaveCount(1);
    await expect(surface.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', 'https://example.com/docs');
  };
  await verify(editor, false);
  await editor.locator('p').first().click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Reviewed. ');
  await verify(editor, true);
  await page.keyboard.press('ControlOrMeta+z');
  await verify(editor, false);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await verify(editor, true);
  await sourceTab.click();
  const exported = await source.inputValue();
  expect(exported).toContain(String.raw`\~not deleted\~`);
  expect(exported).toContain(String.raw`\$not\_math\$`);
  expect(exported).toContain(String.raw`writer\@example.com`);
  await page.screenshot({ path: info.outputPath('literal-markdown-source.png'), fullPage: true });
  await visualTab.click();
  await verify(editor, true);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const download = await downloading;
  const file = info.outputPath('literal-issue.md');
  await download.saveAs(file);
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(file);
  await verify(editor, true);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await verify(reader, true);
  await expect(reader).toHaveAttribute('contenteditable', 'false');
  await page.screenshot({ path: info.outputPath('literal-reader.png'), fullPage: true });
}
