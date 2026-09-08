import { expect, type Page, type TestInfo } from '@playwright/test';
import { createRequire } from 'node:module';
const { Parser, HtmlRenderer } = createRequire(import.meta.url)('commonmark') as {
  Parser: new () => { parse: (source: string) => unknown };
  HtmlRenderer: new () => { render: (ast: unknown) => string };
};

export async function markdownDocumentJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const source = '<a href="/guide">First paragraph.\n\nSecond **paragraph**.</a>\n';
  await page.goto('/demos/node-markdown.html');
  await page.getByLabel('Markdown input', { exact: true }).fill(source);
  await page.getByLabel('Convert HTML across the complete document', { exact: true }).check();
  await expect(page.getByLabel('Convert inline HTML formatting', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Markdown HTML conversion details')).toContainText('whitespace-only formatted paragraph');
  const output = page.locator('.demo-output');
  await expect(output).toContainText('"href": "/guide"');
  await output.getByRole('button', { name: 'html', exact: true }).click();
  await expect(output.locator('pre')).toContainText('<strong>paragraph</strong>');
  await page.screenshot({ path: info.outputPath('public-document-conversion.png') });
  await page.getByLabel('Markdown input', { exact: true }).fill('<b>Before\n\n<script>bad()</script>\n\nAfter</b>');
  await expect(page.getByLabel('Markdown HTML conversion details')).toContainText('Kept HTML as text');
  await expect(output.locator('pre')).toContainText('&lt;script&gt;');
  await page.goto('/browser-tests.html');
  // The development-only reference parser runs here in Node, never in the
  // deployed browser bundle. Its output is an inert sandboxed comparison.
  const reference = new HtmlRenderer().render(new Parser().parse(source));
  const initial = await page.evaluate(html => (globalThis as any).fountainBrowserTest.markdownDocument(html), reference);
  expect(initial.source).toBe(source);
  const root = page.locator('#markdown-document-audit');
  const editor = root.getByRole('textbox', { name: 'Whole-document scope editor' });
  await root.getByRole('button', { name: 'Save Markdown' }).click();
  await expect(root.getByLabel('Saved scope Markdown')).toHaveValue(source);
  await expect(root.getByRole('status')).toHaveText('Source preservation: exact');
  const referenceFrame = root.frameLocator('iframe[title="Reference scope reader"]');
  const fountainFrame = root.frameLocator('iframe[title="Fountain scope reader"]');
  await expect(referenceFrame.locator('p')).toHaveCount(2);
  await expect(fountainFrame.locator('p')).toHaveCount(3);
  await root.locator('iframe').last().scrollIntoViewIfNeeded();
  await expect(referenceFrame.getByText('Second paragraph.', { exact: false })).toBeVisible();
  await page.screenshot({ path: info.outputPath('reference-and-fountain-reader.png') });
  await editor.locator('p').filter({ hasText: 'Second paragraph.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Reviewed.');
  await expect(editor).toContainText('Reviewed.');
  await root.getByRole('button', { name: 'Save Markdown' }).click();
  await expect(root.getByRole('status')).toHaveText('Source preservation: canonical');
  expect(await root.getByLabel('Saved scope Markdown').inputValue()).toContain('Reviewed.');
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('edited-canonical-scope.png') });
  await editor.locator('p').filter({ hasText: 'Reviewed.' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await root.getByRole('button', { name: 'Save Markdown' }).click();
  await expect(root.getByLabel('Saved scope Markdown')).toHaveValue(source);
  await expect(root.getByRole('status')).toHaveText('Source preservation: exact');
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('edited-undo-scope.png') });

  const plain = 'Heading\n=======\n\nKeep __this__ spelling.\n\n~~~~html\n<b>literal</b>\n~~~~\n\nEdit here.\n';
  const plainReference = new HtmlRenderer().render(new Parser().parse(plain));
  await page.evaluate(html => (globalThis as any).fountainBrowserTest.markdownDocument(html, 'plain'), plainReference);
  await editor.getByText('Edit here.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Reviewed.');
  await root.getByRole('button', { name: 'Save Markdown' }).click();
  await expect(root.getByRole('status')).toHaveText('Source preservation: blocks');
  await expect(root.getByLabel('Saved scope Markdown')).toHaveValue(plain.replace('Edit here.', 'Edit here. Reviewed.'));
  await expect(fountainFrame.getByText('Edit here. Reviewed.', { exact: true })).toBeVisible();
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('ordinary-markdown-source-retained.png') });
  await editor.getByText('Edit here. Reviewed.', { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await root.getByRole('button', { name: 'Save Markdown' }).click();
  await expect(root.getByLabel('Saved scope Markdown')).toHaveValue(plain);
  await expect(root.getByRole('status')).toHaveText('Source preservation: exact');
  expect(errors).toEqual([]);
}
