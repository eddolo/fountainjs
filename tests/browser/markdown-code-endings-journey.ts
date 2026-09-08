import { expect, type Page, type TestInfo } from '@playwright/test';

export async function markdownCodeEndingsJourney(page: Page, info: TestInfo): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill('# Code handoff\n\n<div>\n\n```js\nconst value = 1;\n```\n\n```js\nconst value = 2;\n\n```\n\n</div>\n\n<pre>Raw code\n</pre>');
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Recover Markdown text across HTML blocks' }).check();
  await expect(output.locator('pre')).toContainText('const value = 1;</code>');
  await expect(output.locator('pre')).toContainText('const value = 2;\n</code>');
  const html = await output.locator('pre').innerText();
  await page.screenshot({ path: info.outputPath('code-ending-conversion.png'), fullPage: true });
  await page.goto('/issue-editor.html');
  const editor = page.getByRole('textbox', { name: 'Issue description editor', exact: true });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  // Standard paste payload, not an operating-system clipboard permission test.
  await editor.evaluate((element, html) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/html' ? html : '' } });
    element.dispatchEvent(event);
  }, html);
  const verify = async (surface: typeof editor, edited = false) => {
    await expect(surface.locator('pre')).toHaveCount(3);
    await expect.poll(() => surface.locator('pre').nth(0).textContent()).toBe(`const value = 1;${edited ? ' // reviewed' : ''}`);
    await expect.poll(() => surface.locator('pre').nth(1).textContent()).toBe('const value = 2;\n');
    await expect.poll(() => surface.locator('pre').nth(2).textContent()).toBe('Raw code\n');
  };
  await verify(editor);
  await editor.locator('pre').first().click({ position: { x: 30, y: 24 } });
  await page.keyboard.press('End');
  await page.keyboard.type(' // reviewed');
  await verify(editor, true);
  await page.keyboard.press('ControlOrMeta+z');
  await verify(editor);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await verify(editor, true);
  await editor.screenshot({ path: info.outputPath('code-ending-editor.png') });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown draft', exact: true }).click();
  const path = info.outputPath('code-endings.md');
  await (await downloading).saveAs(path);
  await page.getByLabel('Open Markdown draft file', { exact: true }).setInputFiles(path);
  await verify(editor, true);
  await page.getByRole('button', { name: 'Reader preview', exact: true }).click();
  const reader = page.getByRole('textbox', { name: 'Issue preview', exact: true });
  await verify(reader, true);
  const verifyVisibleBlankLine = async () => {
    const heights = await reader.locator('pre').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
    // Exact text retention alone misses the browser hiding a final empty line.
    expect(heights[1] - heights[0]).toBeGreaterThan(12);
    expect(heights[2] - heights[0]).toBeGreaterThan(12);
  };
  await verifyVisibleBlankLine();
  await reader.screenshot({ path: info.outputPath('code-ending-reader.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await verify(reader, true);
  await verifyVisibleBlankLine();
  await reader.screenshot({ path: info.outputPath('code-ending-mobile.png') });
  expect(errors).toEqual([]);
}
