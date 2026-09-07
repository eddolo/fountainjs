import { expect, type Page, type TestInfo } from '@playwright/test';

export async function markdownNewlineJourney(page: Page, info: TestInfo): Promise<void> {
  await page.goto('/issue-editor.html');
  const capture = async (filename: string) => {
    await expect(async () => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }).toPass({ timeout: 5_000 });
    await page.screenshot({ path: info.outputPath(filename), fullPage: true });
  };
  const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true });
  const visualTab = page.getByRole('button', { name: 'Visual editor', exact: true });
  const source = page.getByRole('textbox', { name: 'Markdown description', exact: true });
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const narrative = 'Incident timeline\n# literal label, not a heading\n- literal entry, not a list\n\nEnd of report';
  const code = 'first_line()\nsecond_line()';
  await sourceTab.click();
  await source.fill('Incident timeline&#10;# literal label, not a heading&#10;- literal entry, not a list&#10;&#10;End of report\n\n'
    + '<span data-fountain-text-style="true" style=""><code>first_line()&#10;second_line()</code></span>');
  await visualTab.click();
  const verify = async (surface: typeof editor, edited: boolean) => {
    await expect(surface.locator('p')).toHaveCount(2);
    await expect(surface.locator('h1,h2,h3,ul,ol,br')).toHaveCount(0);
    expect(await surface.locator('p').first().textContent()).toBe(`${edited ? 'Reviewed. ' : ''}${narrative}`);
    expect(await surface.locator('code').textContent()).toBe(code);
    // Character retention is not enough: literal LF must occupy real lines.
    const lines = await surface.locator('p').first().evaluate(element => {
      const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
      const offset = text.textContent!.indexOf('#');
      const range = document.createRange();
      range.setStart(text, 0); range.setEnd(text, 1);
      const first = range.getBoundingClientRect().top;
      range.setStart(text, offset); range.setEnd(text, offset + 1);
      return { first, second: range.getBoundingClientRect().top };
    });
    expect(lines.second).toBeGreaterThan(lines.first + 10);
  };
  await verify(editor, false);
  await editor.locator('p').first().click({ position: { x: 8, y: 8 } });
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type('Reviewed. ');
  await verify(editor, true);
  await page.keyboard.press('ControlOrMeta+z');
  await verify(editor, false);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await verify(editor, true);
  await capture('newline-editor.png');
  await sourceTab.click();
  expect(await source.inputValue()).toContain('&#10;');
  await visualTab.click();
  await verify(editor, true);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const file = info.outputPath('incident-newlines.md');
  await (await downloading).saveAs(file);
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(file);
  await verify(editor, true);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await verify(reader, true);
  await expect(reader).toHaveAttribute('contenteditable', 'false');
  await capture('newline-reader.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await verify(reader, true);
  await capture('newline-reader-mobile.png');
}
