import { expect, type Page, type TestInfo } from '@playwright/test';

export const fullReportHTML = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><title>Browser tab title — not an editor paragraph</title>
<style>body{font:18px system-ui;max-width:760px;margin:40px auto}td,th{padding:12px;border:1px solid #999}table{border-collapse:collapse}</style>
</head><body><h1 style="text-align:center">Release meeting</h1>
<p>Keep the <strong>approved decision</strong> in the report.</p>
<ol start="7"><li>Build package</li><li>Inspect release</li></ol>
<table><tr><th>Owner</th><th>Status</th></tr><tr><td>Ada</td><td>Ready</td></tr></table>
</body></html>`;

export async function htmlDocumentJourney(page: Page, info: TestInfo): Promise<void> {
  await page.setContent(fullReportHTML);
  await expect(page.locator('body')).not.toContainText('Browser tab title');
  await page.screenshot({ path: info.outputPath('original-html-page.png') });
  await page.goto('/demos/node-markdown.html');
  await page.getByRole('button', { name: 'Server HTML', exact: true }).click();
  await page.getByLabel('Server HTML input', { exact: true }).fill(fullReportHTML);
  const output = page.locator('.demo-output');
  await expect(async () => {
    const document = JSON.parse(await output.locator('pre').innerText());
    expect(document.content.map((node: { type: string }) => node.type)).toEqual(['heading', 'paragraph', 'ordered_list', 'table']);
    expect(JSON.stringify(document)).not.toContain('Browser tab title');
    expect(JSON.stringify(document)).not.toContain('font:18px');
    expect(document.content[0].attrs.align).toBe('center');
    expect(document.content[2].attrs.start).toBe(7);
  }).toPass();
  await expect(page.getByRole('list', { name: 'Server HTML conversion details' })).toContainText('Only the HTML document body');
  await page.getByLabel('Server HTML input', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('server-reopened-body-and-loss-report.png') });
  await output.getByRole('button', { name: 'html', exact: true }).click();
  const fragment = await output.locator('pre').innerText();
  await page.goto('/demos/go-docs-service.html');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await editor.click();
  await page.keyboard.press('Control+a');
  await editor.evaluate((element, source) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/html' ? source : '' } });
    element.dispatchEvent(event);
  }, fragment);
  await expect(editor.locator('h1')).toHaveText('Release meeting');
  await expect(editor.locator('h1')).toHaveCSS('text-align', 'center');
  await expect(editor.locator('ol')).toHaveAttribute('start', '7');
  await expect(editor.locator('td')).toHaveText(['Ada', 'Ready']);
  await expect(editor).not.toContainText('Browser tab title');
  await editor.getByText('Ready', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' for review');
  await expect(editor.locator('td').last()).toHaveText('Ready for review');
  await page.keyboard.press('Control+z');
  await expect(editor.locator('td').last()).toHaveText('Ready');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor.locator('td').last()).toHaveText('Ready for review');
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('reopened-editable-report.png') });
}
