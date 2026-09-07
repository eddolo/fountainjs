import { expect, type Page, type TestInfo } from '@playwright/test';

export async function listNumberingJourney(page: Page, info: TestInfo, realClipboard = false): Promise<void> {
  const html = '<ol start="  +0tail"><li>Prepare</li><li>Review</li><li>Deploy</li></ol>';
  const capture = async (name: string) => {
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({ path });
    await info.attach(name, { path, contentType: 'image/png' });
  };
  await page.setContent(`<style>body{padding:48px;font:20px system-ui}li{padding:12px}</style><h1>Browser-rendered source</h1>${html}`);
  expect(await page.locator('ol').evaluate(list => (list as HTMLOListElement).start)).toBe(0);
  await capture('native-zero-based-list');
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  if (realClipboard) {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(async source => navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([source], { type: 'text/html' }),
    })]), html);
    await page.keyboard.press('Control+v');
  } else {
    await editor.evaluate((element, source) => {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/html' ? source : '' } });
      element.dispatchEvent(event);
    }, html);
  }
  await expect(editor.locator('ol')).toHaveAttribute('start', '0');
  await expect(editor.locator('li')).toHaveText(['Prepare', 'Review', 'Deploy']);
  await editor.scrollIntoViewIfNeeded();
  await capture('imported-zero-based-list');
  await editor.getByText('Review', { exact: true }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+Tab');
  const assertSplit = async () => {
    await expect(editor.locator(':scope > ol')).toHaveCount(2);
    await expect(editor.locator(':scope > ol').nth(0)).toHaveAttribute('start', '0');
    await expect(editor.locator(':scope > ol').nth(1)).toHaveAttribute('start', '2');
    await expect(editor.locator(':scope > p').first()).toHaveText('Review');
  };
  await assertSplit();
  await capture('outdented-list-retains-numbering');
  await page.keyboard.press('Control+z');
  await expect(editor.locator('ol')).toHaveCount(1);
  await expect(editor.locator('ol')).toHaveAttribute('start', '0');
  await expect(editor.locator('li')).toHaveCount(3);
  await page.keyboard.press('Control+Shift+z');
  await assertSplit();
  const output = page.locator('.demo-output');
  await output.getByRole('button', { name: 'markdown', exact: true }).click();
  const markdown = await output.locator('pre').innerText();
  expect(markdown).toContain('0. Prepare');
  expect(markdown).toContain('2. Deploy');
  await capture('numbered-list-export');
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(markdown);
  await expect(async () => {
    const nodes = JSON.parse(await output.locator('pre').innerText()).content;
    expect(nodes.filter((node: { type: string }) => node.type === 'ordered_list').map((node: { attrs: { start: number } }) => node.attrs.start)).toEqual([0, 2]);
  }).toPass();
}
