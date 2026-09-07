import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

export async function docxMathJourney(page: Page, info: TestInfo) {
  await page.goto('/browser-tests.html');
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.docxVisual.math());
  const root = page.locator('#docx-math-audit');
  await expect(root.locator('[data-source] [data-document-mathjax] svg')).toHaveCount(8);
  const download = page.waitForEvent('download');
  await root.getByRole('button', { name: 'Export and inspect current DOCX' }).click();
  const file = await download;
  await file.saveAs(info.outputPath('experimental-equations.docx'));
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const parts = unzipSync(Buffer.concat(chunks));
  const xml = strFromU8(parts['word/document.xml']);
  // The actual archive has the semantics the independent viewer drops. Keep
  // this check separate from the viewer observations; do not rewrite OMML to
  // reproduce docx-preview limitations.
  for (const required of ['<m:sSubSup>', '<m:acc>', '<m:type m:val="noBar"/>', '<m:limLoc m:val="subSup"/>']) expect(xml).toContain(required);
  await expect(root.getByRole('status')).toContainText('8 experimental equations exported');
  await expect(root.locator('[data-word] math')).toHaveCount(8);
  const issues = root.locator('[data-viewer-issues]');
  await expect(issues).toContainText('Subscript and superscript: missing equation content');
  await expect(issues).toContainText('Accent: missing equation content');
  await expect(issues).toContainText('Fraction without a bar: bar suppression is not represented');
  await expect(issues).toContainText('Large operator with side limits: side-limit structure is not represented');
  await page.evaluate(() => document.fonts.ready);
  await root.screenshot({ path: info.outputPath('equations-side-by-side.png') });
  const mathML = await root.locator('[data-word] math').evaluateAll(nodes => nodes.map(node => node.outerHTML));
  await writeFile(info.outputPath('viewer-observations.json'), JSON.stringify({ viewer: 'docx-preview 0.4.0', issues: await issues.textContent(), mathML }, null, 2));
  await info.attach('independent-viewer-mathml', { body: JSON.stringify(mathML, null, 2), contentType: 'application/json' });

  const first = root.locator('[data-source] [data-fountain-math="block"]').first();
  await first.click();
  const source = first.getByLabel('Edit math source', { exact: true });
  await source.fill('z+1');
  await expect(root.getByRole('status')).toContainText('Source changed');
  await expect(root.locator('[data-word] math')).toHaveCount(0);
  await root.getByRole('button', { name: 'Export and inspect current DOCX' }).click();
  await expect(root.getByRole('status')).toContainText('7 experimental equations exported; 1 other conversion warnings');
  await expect(root.locator('[data-word]')).toContainText('z+1');
  await root.getByRole('button', { name: 'Undo equation edit' }).click();
  await expect(source).toHaveValue(String.raw`\frac{x^2}{\sqrt{y}}`);
  await root.getByRole('button', { name: 'Export and inspect current DOCX' }).click();
  await expect(root.getByRole('status')).toContainText('8 experimental equations exported');
  await root.screenshot({ path: info.outputPath('restored-equations.png') });
}
