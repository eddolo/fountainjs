import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

export async function docxNumberingJourney(page: Page, info: TestInfo): Promise<void> {
  await page.goto('/browser-tests.html');
  const result = await page.evaluate(() => (globalThis as any).fountainBrowserTest.docxVisual.render(true));
  expect(result.issues).toEqual([]);
  expect(result.reopened).toEqual(result.source);
  expect(result.fountainText).toBe(result.docxText);
  const comparison = page.locator('#browser-docx-visual-comparison');
  const editor = comparison.locator('[data-visual-fountain]');
  await expect(editor.locator('ol')).toHaveCount(4);
  expect(await editor.locator('ol').evaluateAll(lists => lists.map(list => (list as HTMLOListElement).start))).toEqual([0, 7, 1, 4]);
  await expect(comparison.locator('[data-visual-docx]')).toContainText('Approve the handover');
  // Guard the independent viewer's generated counters, not just textContent:
  // the first audit passed text checks while displaying every list from 1.
  const styles = await comparison.locator('[data-visual-docx-styles]').textContent();
  for (const reset of ['docx-num-1-0 -1', 'docx-num-2-0 6', 'docx-num-3-0 0', 'docx-num-5-1 3']) {
    expect(styles).toContain(reset);
  }
  const preview = comparison.locator('[data-visual-docx]');
  const parent = await preview.getByText('Nested checks', { exact: true }).boundingBox();
  const nested = await preview.getByText('Inspect the archive', { exact: true }).boundingBox();
  expect(nested!.x).toBeGreaterThan(parent!.x);
  const file = info.outputPath('release-procedure.docx');
  await writeFile(file, Buffer.from(result.bytes));
  await info.attach('DOCX numbering fixture', { path: file, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  await comparison.screenshot({ path: info.outputPath('editor-and-independent-docx.png') });
}
