import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const source = '<h2>Structural RTL audit</h2><ul dir="rtl"><li><p>List alpha</p></li><li><p>List beta</p></li></ul><blockquote dir="rtl"><p>Quoted text</p></blockquote><table dir="rtl"><tr><th><p>First column</p></th><th><p>Second column</p></th></tr><tr><td><p>First value</p></td><td><p>Second value</p></td></tr></table><p>Edit audit note</p>';

const structure = (root: Locator) => root.evaluate(element => {
  const table = element.querySelector('table')!, cells = table.querySelector('tr')!.children;
  return {
    listDirection: getComputedStyle(element.querySelector('ul')!).direction,
    quoteDirection: getComputedStyle(element.querySelector('blockquote')!).direction,
    tableDirection: getComputedStyle(table).direction,
    firstColumnIsRight: cells[0].getBoundingClientRect().left > cells[1].getBoundingClientRect().left,
    paragraphDirections: Array.from(element.querySelectorAll('li p,blockquote p,td p,th p')).map(p => getComputedStyle(p).direction),
  };
});

/** A diagnostic of known gaps, not certification of structural RTL support. */
export async function htmlStructuralDirectionJourney(page: Page, info: TestInfo): Promise<void> {
  const observations: Record<string, unknown> = {
    status: 'Known structural-direction loss; not RTL layout parity approval',
    source,
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const native = await page.context().newPage();
    try {
      await native.setContent(`<style>body{max-width:760px;margin:24px;font:16px/1.7 sans-serif}table{width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #ddd}blockquote{padding-inline-start:16px;border-inline-start:3px solid #6d5dfc}p{margin:12px 0}</style>${source}`);
      observations.native = await structure(native.locator('body'));
      expect(observations.native).toMatchObject({ listDirection: 'rtl', quoteDirection: 'rtl', tableDirection: 'rtl', firstColumnIsRight: true });
      await native.locator('body').screenshot({ path: info.outputPath('rtl-structural-native.png') });
    } finally { await native.close(); }

    await page.goto('/conversion-lab.html');
    await page.getByLabel('Choose documents').setInputFiles({ name: 'structural-rtl.html', mimeType: 'text/html', buffer: Buffer.from(source) });
    const workspace = page.getByRole('region', { name: 'Conversion workspace: structural-rtl.html', exact: true });
    const editor = workspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
    await expect(editor.locator('table')).toBeVisible();
    observations.imported = await structure(editor);
    expect(observations.imported).toMatchObject({
      listDirection: 'ltr', quoteDirection: 'ltr', tableDirection: 'ltr', firstColumnIsRight: false,
      paragraphDirections: Array(7).fill('rtl'),
    });
    // These assertions deliberately document a remaining limitation. The
    // warnings must not claim paragraph retention also preserves structure.
    for (const tag of ['ul', 'blockquote', 'table']) {
      await expect(workspace.getByText(`${tag} reading direction (rtl) is not retained on the structural container.`, { exact: false })).toBeVisible();
    }
    observations.report = await workspace.locator('.lab-notice').filter({ hasText: 'Import report' }).innerText();
    await workspace.screenshot({ path: info.outputPath('rtl-structural-imported-with-report.png') });

    await editor.locator('p').filter({ hasText: 'Edit audit note' }).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText(' revised');
    await expect(editor.locator('p').filter({ hasText: 'Edit audit note' })).toHaveText('Edit audit note revised');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor.locator('p').filter({ hasText: 'Edit audit note' })).toHaveText('Edit audit note');
    expect(await structure(editor)).toEqual(observations.imported);

    await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('html');
    const pendingDownload = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const download = await pendingDownload;
    const html = await readFile((await download.path())!, 'utf8');
    expect(html).toContain('dir="rtl"'); // Descendant direction still survives.
    observations.downloadedHTML = html;
    const reader = await page.context().newPage();
    try {
      await reader.setContent(html);
      observations.reader = await structure(reader.locator('body'));
      expect(observations.reader).toEqual(observations.imported);
      await reader.locator('body').screenshot({ path: info.outputPath('rtl-structural-downloaded-reader.png') });
    } finally { await reader.close(); }
    expect(errors).toEqual([]);
  } finally {
    const path = info.outputPath('rtl-structural-observations.json');
    await writeFile(path, JSON.stringify(observations, null, 2));
    await info.attach('rtl-structural-observations', { path, contentType: 'application/json' });
  }
}
