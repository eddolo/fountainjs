import { expect, type Page, type TestInfo } from '@playwright/test';

export async function markdownEscapeJourney(page: Page, info: TestInfo): Promise<void> {
  await page.goto('/issue-editor.html');
  const capture = async (name: string) => {
    await expect(async () => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }).toPass({ timeout: 5_000 });
    await page.screenshot({ path: info.outputPath(name), fullPage: true });
  };
  const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true });
  const visualTab = page.getByRole('button', { name: 'Visual editor', exact: true });
  const source = page.getByRole('textbox', { name: 'Markdown description', exact: true });
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  await sourceTab.click();
  await source.fill(String.raw`# Regex review

| Pattern | Old label |
| --- | --- |
| ` + '`a\\\\|b`' + String.raw` | ~~\~\~old\~\~~~ |

Keep ordinary ` + '`a|b`' + ' outside the table.');
  await visualTab.click();
  const verify = async (surface: typeof editor, edited: boolean) => {
    await expect(surface.locator('table')).toHaveCount(1);
    await expect(surface.locator('tr')).toHaveCount(2);
    await expect(surface.locator('tr').nth(1).locator('td')).toHaveCount(2);
    await expect(surface.locator('td code')).toHaveText(edited ? 'a\\|b + check' : 'a\\|b');
    await expect(surface.locator('td s,td del')).toHaveText('~~old~~');
    await expect(surface.locator('code').last()).toHaveText('a|b');
  };
  await verify(editor, false);
  await editor.locator('td code').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' + check');
  await verify(editor, true);
  await page.keyboard.press('ControlOrMeta+z');
  await verify(editor, false);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await verify(editor, true);
  await capture('escape-table-editor.png');
  await sourceTab.click();
  const markdown = await source.inputValue();
  expect(markdown).toContain('`a\\\\|b + check`');
  expect(markdown).toContain(String.raw`~~\~\~old\~\~~~`);
  await capture('escape-table-source.png');
  await visualTab.click();
  await verify(editor, true);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const file = info.outputPath('regex-review.md');
  await (await downloading).saveAs(file);
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(file);
  await verify(editor, true);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await verify(reader, true);
  await expect(reader).toHaveAttribute('contenteditable', 'false');
  await capture('escape-table-reader.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await verify(reader, true);
  await capture('escape-table-reader-mobile.png');
}
