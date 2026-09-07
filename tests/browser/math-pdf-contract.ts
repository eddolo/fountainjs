import { expect, type Page, type TestInfo } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function inspectEquationPDF(page: Page, info: TestInfo, expectedLinks: readonly { id: string; page?: string | null }[]) {
  const preview = page.getByRole('region', { name: 'Paged equation snapshot', exact: true });
  const count = await preview.locator('.fountain-page-preview__sheet').count();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('region', { name: 'Equation authoring', exact: true })).toBeHidden();
  const buffer = await page.pdf({ path: info.outputPath('equation-pages.pdf'), printBackground: true, preferCSSPageSize: true });
  const loading = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const pdf = await loading.promise;
  try {
    expect(pdf.numPages).toBe(count);
    const text: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const sheet = await pdf.getPage(i);
      const bounds = sheet.getViewport({ scale: 1 });
      expect(bounds.width).toBeCloseTo(792, 0);
      expect(bounds.height).toBeCloseTo(612, 0);
      const content = await sheet.getTextContent();
      text.push(content.items.map(item => 'str' in item ? item.str : '').join(' '));
    }
    // The accessible copy and the author/reader surfaces must not be printed.
    for (let i = 1; i <= 20; i++) expect(text.join(' ').match(new RegExp(`Research note ${i}:`, 'g'))).toHaveLength(1);
    expect(text.join(' ')).not.toContain('Developer integration');
    const annotations = await (await pdf.getPage(1)).getAnnotations();
    const links = annotations.filter(annotation => annotation.subtype === 'Link');
    await info.attach('pdf-link-annotations', { body: JSON.stringify(links, null, 2), contentType: 'application/json' });
    expect(links).toHaveLength(expectedLinks.length);
    for (let i = 0; i < links.length; i++) {
      expect(links[i].url).toBeUndefined();
      expect(links[i].dest).toBe(expectedLinks[i].id);
      const destination = await pdf.getDestination(links[i].dest);
      expect(destination).not.toBeNull();
      expect(await pdf.getPageIndex(destination![0])).toBe(Number(expectedLinks[i].page) - 1);
    }
  } finally {
    await loading.destroy();
    await page.emulateMedia({ media: 'screen' });
  }
}
