import { expect, type Page, type TestInfo } from '@playwright/test';

export async function markdownScopeJourney(page: Page, info: TestInfo): Promise<void> {
  const capture = async (name: string) => {
    await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: 'instant' }); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
    await page.screenshot({ path: info.outputPath(name), fullPage: true });
  };
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill('# Retired work\n\n<del>\n\n*Old first*\n\nOld second\n\n</del>\n\nCurrent plan.');
  await page.getByRole('checkbox', { name: 'Convert HTML blocks to rich content' }).check();
  await page.getByRole('checkbox', { name: 'Convert inline HTML formatting' }).check();
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await expect(output.locator('pre')).toContainText('<p><s><em>Old first</em></s></p>');
  await expect(output.locator('pre')).toContainText('<p><s>Old second</s></p>');
  const html = await output.locator('pre').innerText();
  await page.goto('/issue-editor.html');
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  // Exercise the clipboard HTML payload handler, not a private model setter.
  await editor.evaluate((element, value) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/html' ? value : '' } });
    element.dispatchEvent(event);
  }, html);
  const verify = async (surface: typeof editor) => {
    await expect(surface.locator('h1')).toHaveText('Retired work');
    await expect(surface.locator('p')).toHaveText(['Old first', 'Old second', 'Current plan.']);
    await expect(surface.locator('s')).toHaveCount(2);
    await expect(surface.locator('s').nth(0)).toHaveCSS('text-decoration-line', 'line-through');
    await expect(surface.locator('s').nth(1)).toHaveCSS('text-decoration-line', 'line-through');
    await expect(surface.locator('em')).toHaveText('Old first');
    await expect(surface.getByText('Current plan.', { exact: true })).toHaveCSS('text-decoration-line', 'none');
    const first = await surface.locator('p').nth(0).boundingBox();
    const second = await surface.locator('p').nth(1).boundingBox();
    expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
  };
  await verify(editor);
  await capture('scoped-paragraphs-editor.png');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const path = info.outputPath('retired-work.md');
  await (await pending).saveAs(path);
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(path);
  await verify(editor);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await verify(reader);
  await capture('scoped-paragraphs-reader.png');
}
