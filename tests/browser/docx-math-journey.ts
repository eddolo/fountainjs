import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

export async function docxMathJourney(page: Page, info: TestInfo) {
  await page.goto('/browser-tests.html');
  await page.evaluate(() => (globalThis as any).fountainBrowserTest.docxVisual.math());
  const root = page.locator('#docx-math-audit');
  await expect(root.locator('[data-source] [data-document-mathjax] svg')).toHaveCount(8);
  const exportCurrent = async (name: string) => {
    const download = page.waitForEvent('download');
    await root.getByRole('button', { name: 'Export and inspect current DOCX' }).click();
    const file = await download;
    await file.saveAs(info.outputPath(`${name}.docx`));
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    return unzipSync(Buffer.concat(chunks));
  };
  const parts = await exportCurrent('experimental-equations');
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
  const edited = await exportCurrent('edited-equations');
  expect(strFromU8(edited['customXml/fountainMath.xml'])).toContain('z+1');
  await expect(root.getByRole('status')).toContainText('8 experimental equations exported; 0 other conversion warnings');
  await expect(root.locator('[data-word]')).toContainText('z+1');
  await expect(root.locator('[data-word] math').first()).toHaveText('z+1');
  await root.screenshot({ path: info.outputPath('edited-equations.png') });
  await root.getByRole('button', { name: 'Undo equation edit' }).click();
  await expect(source).toHaveValue(String.raw`\frac{x^2}{\sqrt{y}}`);
  // A newly authored structured equation must compile, not merely a plain token.
  await source.fill(String.raw`\frac{a^3+b}{\sqrt{c}}`);
  const compound = await exportCurrent('edited-compound-equations');
  expect(strFromU8(compound['customXml/fountainMath.xml'])).toContain('a^3+b');
  await expect(root.getByRole('status')).toContainText('8 experimental equations exported; 0 other conversion warnings');
  await expect(root.locator('[data-word] math').first().locator('mfrac')).toHaveCount(1);
  await expect(root.locator('[data-word] math').first()).toHaveText('a3+bc');
  await root.screenshot({ path: info.outputPath('edited-compound-equations.png') });
  await root.getByRole('button', { name: 'Undo equation edit' }).click();
  await expect(source).toHaveValue(String.raw`\frac{x^2}{\sqrt{y}}`);
  // Explicit spacing is outside the projection contract; it must not disappear.
  await source.fill(String.raw`z\quad 1`);
  const fallback = await exportCurrent('fallback-equations');
  expect(strFromU8(fallback['word/document.xml'])).toContain(String.raw`z\quad 1`);
  await expect(root.getByRole('status')).toContainText('7 experimental equations exported; 2 other conversion warnings');
  await expect(root.getByRole('list', { name: 'Conversion warnings' })).toContainText('Unsupported DOCX math mspace');
  await expect(root.locator('[data-word]')).toContainText(String.raw`z\quad 1`);
  await root.screenshot({ path: info.outputPath('fallback-equations.png') });
  await root.getByRole('button', { name: 'Undo equation edit' }).click();
  await expect(source).toHaveValue(String.raw`\frac{x^2}{\sqrt{y}}`);
  await exportCurrent('restored-equations');
  await expect(root.getByRole('status')).toContainText('8 experimental equations exported');
  await expect(root.locator('[data-conversion-issues] li')).toHaveCount(0);
  await root.screenshot({ path: info.outputPath('restored-equations.png') });
}
