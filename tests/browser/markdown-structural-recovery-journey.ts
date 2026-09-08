import { expect, type Page, type TestInfo } from '@playwright/test';
import { inStableDocument } from './stable-document';

export async function markdownStructuralRecoveryJourney(page: Page, info: TestInfo): Promise<void> {
  const capture = async (name: string) => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo({ top: 0, behavior: 'instant' });
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await page.screenshot({ path: info.outputPath(name), fullPage: true });
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const body = '3. First step\n   - Inspect logs\n   - Retry request\n4. > Record outcome';
  await page.goto('/demos/node-markdown.html');
  const input = page.getByLabel('Markdown input', { exact: true });
  const output = page.locator('.demo-output');
  await input.fill(`<blockquote>\n\n${body}\n\n</blockquote>`);
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Recover Markdown text across HTML blocks' }).check();
  await expect(output.locator('pre')).toContainText('<ol start="3">');
  await expect(page.getByRole('list', { name: 'Markdown HTML conversion details' })).toContainText('Block grouping/identity');
  const html = await output.locator('pre').innerText();
  await capture('nested-flow-conversion.png');
  await page.goto('/issue-editor.html');
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await inStableDocument(page, 'Paste recovered nested list', async () => {
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    // Exercise the public paste handler, not an OS clipboard certification.
    await editor.evaluate((element, value) => {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/html' ? value : '' } });
      element.dispatchEvent(event);
    }, html);
  });
  const verify = async (surface: typeof editor, edited = false) => {
    await expect(surface.locator('ol')).toHaveCount(1);
    await expect(surface.locator('ol')).toHaveAttribute('start', '3');
    await expect(surface.locator('ol > li')).toHaveCount(2);
    await expect(surface.locator('ol > li').first().locator('ul > li')).toHaveText(['Inspect logs', 'Retry request']);
    await expect(surface.locator('ol > li').last().locator('blockquote')).toHaveText('Record outcome');
    await expect(surface.getByText(edited ? 'First step updated' : 'First step', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  };
  await verify(editor);
  await editor.getByText('First step', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' updated');
  await verify(editor, true);
  await page.keyboard.press('ControlOrMeta+z');
  await verify(editor);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await verify(editor, true);
  await capture('nested-flow-editor.png');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const file = info.outputPath('nested-flow.md');
  await (await download).saveAs(file);
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(file);
  await verify(editor, true);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  await verify(reader, true);
  await capture('nested-flow-reader.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await verify(reader, true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture('nested-flow-mobile-reader.png');
}
