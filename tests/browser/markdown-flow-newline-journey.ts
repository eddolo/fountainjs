import { expect, type Page, type TestInfo } from '@playwright/test';

export async function markdownFlowNewlineJourney(page: Page, info: TestInfo): Promise<void> {
  await page.goto('/demos/node-markdown.html');
  await page.getByRole('checkbox', { name: 'Preserve anonymous inline HTML flow', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Convert HTML across the complete document', exact: true }).check();
  const source = page.getByLabel('Markdown input', { exact: true });
  const output = page.locator('.demo-output');
  const rendered = output.locator('pre');
  const json = output.getByRole('button', { name: 'json', exact: true });
  const markdown = output.getByRole('button', { name: 'markdown', exact: true });
  const original = '<Warning>\n*bar*\n</Warning>\n';
  await source.fill(original);
  await expect(rendered).toContainText('"type": "html_flow"');
  const imported = JSON.parse(await rendered.innerText());
  expect(imported.content.map((node: { type: string }) => node.type)).toEqual(['html_flow']);
  const text = imported.content[0].content.map((node: { type: string; text: string }) => {
    expect(node.type).toBe('text');
    return node.text;
  }).join('');
  expect(text).toBe('\n*bar*\n\n');
  await markdown.click();
  await expect(markdown).toHaveAttribute('aria-pressed', 'true');
  await expect(rendered).toContainText('data-fountain-html-flow="true"');
  const canonical = await rendered.innerText();
  expect(canonical).toContain('&#10;*bar*&#10;&#10;');
  expect(canonical).not.toMatch(/[\r\n]/u);
  expect(await source.inputValue()).toBe(original);
  await source.fill(canonical);
  await json.click();
  await expect(json).toHaveAttribute('aria-pressed', 'true');
  await expect(rendered).toContainText('"text": "\\n*bar*\\n\\n"');
  // The unsupported wrapper is already projected away with the import report.
  // Canonical HTML coalesces its two original text leaves, but not their text.
  expect(JSON.parse(await rendered.innerText())).toEqual({
    type: 'doc', content: [{ type: 'html_flow', content: [{ type: 'text', text }] }],
  });
  await output.screenshot({ path: info.outputPath('literal-flow-reopened-json.png') });
  await markdown.click();
  await expect(rendered).toHaveText(canonical);
  await output.screenshot({ path: info.outputPath('literal-flow-canonical-markdown.png') });
}
