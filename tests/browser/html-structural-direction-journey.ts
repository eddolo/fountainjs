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

/** Native source, actual imported editing, and a separately opened download. */
export async function htmlStructuralDirectionJourney(page: Page, info: TestInfo): Promise<void> {
  const observations: Record<string, unknown> = {
    status: 'Supported structural direction retained; native Word/full bidi parity not certified',
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
      listDirection: 'rtl', quoteDirection: 'rtl', tableDirection: 'rtl', firstColumnIsRight: true,
      paragraphDirections: Array(7).fill('rtl'),
    });
    expect(observations.imported).toEqual(observations.native);
    await expect(workspace.getByText('is not retained on the structural container', { exact: false })).toHaveCount(0);
    observations.report = await workspace.locator('.lab-notice').allTextContents();
    await workspace.screenshot({ path: info.outputPath('rtl-structural-imported-with-report.png') });

    await editor.locator('p').filter({ hasText: 'Edit audit note' }).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText(' revised');
    await expect(editor.locator('p').filter({ hasText: 'Edit audit note' })).toHaveText('Edit audit note revised');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor.locator('p').filter({ hasText: 'Edit audit note' })).toHaveText('Edit audit note');
    expect(await structure(editor)).toEqual(observations.imported);

    const first = editor.locator('th').first();
    await first.locator('p').click();
    await workspace.getByRole('button', { name: 'Table options', exact: true }).click();
    await workspace.getByLabel('Table reading direction', { exact: true }).selectOption('ltr');
    await expect(editor.locator('table')).toHaveCSS('direction', 'ltr');
    await expect(first.locator('p')).toHaveCSS('direction', 'ltr');
    observations.authorLTR = await structure(editor);
    await workspace.getByRole('button', { name: 'Close', exact: true }).click();
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await structure(editor)).toEqual(observations.imported);

    // The first source column is physically on the right; moving left extends
    // the selection into the next logical column, not an out-of-grid position.
    await first.locator('p').click();
    await page.keyboard.press('Alt+Shift+ArrowLeft');
    await expect(editor.locator('[data-fountain-selected-cell="true"]')).toHaveCount(2);
    await editor.screenshot({ path: info.outputPath('rtl-structural-physical-cell-selection.png') });
    const handle = first.locator('.fountain-table-cell__resize-handle');
    await handle.focus();
    const width = Number(await handle.getAttribute('aria-valuenow'));
    await page.keyboard.press('ArrowLeft');
    await expect(handle).toHaveAttribute('aria-valuenow', String(width + 5));
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(handle).toHaveAttribute('aria-valuenow', String(width));
    await handle.scrollIntoViewIfNeeded();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(handle).toHaveAttribute('aria-valuenow', String(width + 30));
    observations.resize = { initial: width, keyboard: width + 5, pointer: width + 30 };
    await editor.screenshot({ path: info.outputPath('rtl-structural-resized.png') });
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(handle).toHaveAttribute('aria-valuenow', String(width));

    await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('html');
    const pendingDownload = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const download = await pendingDownload;
    const html = await readFile((await download.path())!, 'utf8');
    expect(html).toContain('<table dir="rtl"');
    observations.downloadedHTML = html;
    const reader = await page.context().newPage();
    try {
      await reader.setContent(html);
      observations.reader = await structure(reader.locator('body'));
      expect(observations.reader).toEqual(observations.imported);
      await reader.locator('body').screenshot({ path: info.outputPath('rtl-structural-downloaded-reader.png') });
    } finally { await reader.close(); }

    // A Latin-text override does not reverse table geometry. Exercise a cell
    // spanning two logical columns alongside a two-row cell in actual use.
    const spans = '<table dir="rtl"><tr><td rowspan="2"><p>Two-row label</p></td><td colspan="2" dir="ltr" data-colwidth="150,250"><p>Merged Latin</p></td></tr><tr><td><p>First lower</p></td><td><p>Second lower</p></td></tr></table><p>After spans</p>';
    const spanGeometry = (root: Locator) => root.locator('table').evaluate(table => {
      const cells = Array.from(table.querySelectorAll('td'));
      return { direction: getComputedStyle(table).direction,
        firstCellIsRight: cells[0].getBoundingClientRect().left > cells[1].getBoundingClientRect().left,
        spans: cells.map(cell => [cell.rowSpan, cell.colSpan]),
        directions: cells.map(cell => getComputedStyle(cell).direction),
      };
    });
    const spanNative = await page.context().newPage();
    try {
      await spanNative.setContent(`<style>table{width:760px;border-collapse:collapse}td{border:1px solid #ddd;padding:12px}</style>${spans}`);
      observations.nativeSpans = await spanGeometry(spanNative.locator('body'));
      await spanNative.locator('body').screenshot({ path: info.outputPath('rtl-structural-native-spans.png') });
    } finally { await spanNative.close(); }
    await page.getByLabel('Choose documents').setInputFiles({ name: 'rtl-spans.html', mimeType: 'text/html', buffer: Buffer.from(spans) });
    const spanWorkspace = page.getByRole('region', { name: 'Conversion workspace: rtl-spans.html', exact: true });
    const spanEditor = spanWorkspace.getByRole('textbox', { name: 'Imported document editor', exact: true });
    await expect(spanEditor.locator('td')).toHaveCount(4);
    observations.importedSpans = await spanGeometry(spanEditor);
    expect(observations.importedSpans).toEqual(observations.nativeSpans);
    const merged = spanEditor.locator('td[colspan="2"]');
    const mergedHandle = merged.locator('.fountain-table-cell__resize-handle');
    await mergedHandle.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(merged).toHaveAttribute('data-colwidth', '150,255');
    await expect(spanEditor.locator('td').last()).toHaveAttribute('data-colwidth', '255');
    await expect(merged).toHaveCSS('direction', 'ltr');
    await spanEditor.screenshot({ path: info.outputPath('rtl-structural-merged-cell-resize.png') });
    await spanWorkspace.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(merged).toHaveAttribute('data-colwidth', '150,250');
    await spanWorkspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('html');
    const spanDownload = page.waitForEvent('download');
    await spanWorkspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const spanHTML = await readFile((await (await spanDownload).path())!, 'utf8');
    const spanReader = await page.context().newPage();
    try {
      await spanReader.setContent(spanHTML);
      observations.readerSpans = await spanGeometry(spanReader.locator('body'));
      expect(observations.readerSpans).toEqual(observations.nativeSpans);
      await spanReader.locator('body').screenshot({ path: info.outputPath('rtl-structural-downloaded-spans.png') });
    } finally { await spanReader.close(); }
    expect(errors).toEqual([]);
  } finally {
    const path = info.outputPath('rtl-structural-observations.json');
    await writeFile(path, JSON.stringify(observations, null, 2));
    await info.attach('rtl-structural-observations', { path, contentType: 'application/json' });
  }
}
