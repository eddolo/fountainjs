import { test, expect } from '@playwright/test';

// Model calls below only create fixtures and read outcomes. Every selection,
// clipboard transfer, placement and history action uses trusted browser input.
test('copies rich cell ranges and merged notes to external editors and real table/document targets', async ({ page, browserName }, info) => {
  if (browserName === 'chromium') await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/browser-tests.html');
  await page.waitForFunction(() => Boolean((globalThis as any).fountainBrowserTest?.pages?.editor));
  await page.evaluate(() => {
    const { editor } = (globalThis as any).fountainBrowserTest.pages, { schema } = editor.state;
    const p = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
    const cell = (text: string) => schema.node('table_cell', {}, [p(text)]);
    const reference = () => schema.node('footnote_reference', { id: 'table-clipboard-note' });
    const header = (text: string, attrs = {}) => schema.node('table_header', attrs, [schema.node('paragraph', {}, [
      schema.text(text, [schema.mark('strong')]), reference(),
    ])]);
    editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [
      schema.node('table', {}, [schema.node('table_row', {}, [header('Source cell', { background: '#fff0aa' }), cell('B')]),
        schema.node('table_row', {}, [cell('C'), cell('D')])]),
      schema.node('table', {}, [schema.node('table_row', {}, [header('Merged cell', { background: '#ffe0b2', rowspan: 2, colspan: 2 }),
        schema.node('table_cell', { rowspan: 2 }, [p('Beside the merge')])]), schema.node('table_row')]),
      schema.node('table', {}, [schema.node('table_row', {}, [cell('Old A'), cell('Old B')]),
        schema.node('table_row', {}, [cell('Old C'), cell('Old D')])]),
      p('Insert a table here.'),
      schema.node('footnote_definition', { id: 'table-clipboard-note' }, [schema.node('paragraph', {}, [schema.text('Owned table note.', [schema.mark('strong')])])]),
    ])));
    const root = document.querySelector('[aria-label="Page intent contract editor"]')!;
    const external = document.createElement('textarea'); external.setAttribute('aria-label', 'Independent table text destination');
    external.style.cssText = 'display:block;width:100%;height:100px'; root.insertAdjacentElement('afterend', external);
    const frame = document.createElement('iframe'); frame.title = 'Independent rich table editor'; frame.style.cssText = 'width:100%;height:260px';
    frame.srcdoc = '<div role="textbox" aria-label="Independent rich table destination" contenteditable="true" style="min-height:220px"></div>';
    external.insertAdjacentElement('afterend', frame);
    (globalThis as any).tableClipboardProbe = { copies: [], pastes: [] };
    for (const type of ['copy', 'paste']) document.addEventListener(type, event => {
      const data = (event as ClipboardEvent).clipboardData;
      (globalThis as any).tableClipboardProbe[type === 'copy' ? 'copies' : 'pastes'].push({ trusted: event.isTrusted,
        data: data ? Object.fromEntries([...data.types].map(key => [key, data.getData(key)])) : {} });
    });
  });
  const editor = page.getByRole('textbox', { name: 'Page intent contract editor', exact: true });
  const documentJSON = () => page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.editor.getJSON());
  const selection = () => page.evaluate(() => {
    const value = (globalThis as any).fountainBrowserTest.pages.editor.state.selection;
    return { kind: value.kind, cells: value.cellPaths?.length, rows: value.rowTo - value.rowFrom + 1, columns: value.columnTo - value.columnFrom + 1 };
  });
  const tables = editor.locator(':scope > table');
  const notes = editor.locator('[data-fountain-footnote-definition]');
  const original = await documentJSON();
  await tables.nth(0).getByText('Source cell', { exact: true }).click();
  await page.keyboard.press('Alt+Shift+ArrowRight'); await page.keyboard.press('Alt+Shift+ArrowDown');
  expect(await selection()).toEqual({ kind: 'cell', cells: 4, rows: 2, columns: 2 });
  await page.keyboard.press('ControlOrMeta+c');
  const offered = await page.evaluate(() => (globalThis as any).tableClipboardProbe.copies.at(-1));
  expect(offered.trusted).toBe(true); expect(offered.data['text/plain']).toContain('Source cell[^table-clipboard-note]\tB\nC\tD');
  expect(offered.data['text/plain']).toContain('[^table-clipboard-note]: Owned table note.');
  expect(offered.data['text/html']).toContain('Owned table note.');
  await info.attach('offered-table-clipboard', { body: JSON.stringify(offered), contentType: 'application/json' });
  const rich = page.frameLocator('iframe[title="Independent rich table editor"]').getByRole('textbox', { name: 'Independent rich table destination' });
  await rich.click(); await page.keyboard.press('ControlOrMeta+v');
  await expect(rich.locator('table')).toHaveCount(1); await expect(rich.locator('th strong')).toHaveText('Source cell');
  await expect(rich.locator('th')).toHaveCSS('background-color', 'rgb(255, 240, 170)'); await expect(rich).toContainText('Owned table note.');
  await rich.screenshot({ path: info.outputPath('external-rich-table.png') });
  const plain = page.getByRole('textbox', { name: 'Independent table text destination', exact: true });
  await plain.click(); await page.keyboard.press('ControlOrMeta+v'); await expect(plain).toHaveValue(offered.data['text/plain']);
  await plain.screenshot({ path: info.outputPath('external-table-text.png') });
  expect(await documentJSON()).toEqual(original);
  await tables.nth(2).getByText('Old A', { exact: true }).click();
  await page.keyboard.press('Alt+Shift+ArrowRight'); await page.keyboard.press('Alt+Shift+ArrowDown');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(notes).toHaveCount(2); await expect(tables).toHaveCount(3);
  await expect(tables.nth(2).locator('th strong')).toHaveText('Source cell');
  await expect(tables.nth(2).locator('table')).toHaveCount(0);
  await expect(tables.nth(2).locator('td')).toHaveText(['B', 'C', 'D']);
  const firstPaste = await documentJSON(); await editor.screenshot({ path: info.outputPath('rich-grid-pasted.png') });
  await page.keyboard.press('ControlOrMeta+z'); expect(await documentJSON()).toEqual(original);
  await page.keyboard.press('ControlOrMeta+Shift+z'); expect(await documentJSON()).toEqual(firstPaste);

  await tables.nth(1).getByText('Merged cell', { exact: true }).click();
  await page.keyboard.press('Alt+Shift+ArrowRight'); await page.keyboard.press('Alt+Shift+ArrowLeft');
  expect(await selection()).toEqual({ kind: 'cell', cells: 1, rows: 2, columns: 2 });
  await page.keyboard.press('ControlOrMeta+c');
  await tables.nth(2).getByText('D', { exact: true }).click(); await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(notes).toHaveCount(3);
  await expect(tables.nth(2).locator('tr')).toHaveCount(3);
  await expect(tables.nth(2).locator('th').filter({ hasText: 'Merged cell' })).toHaveAttribute('rowspan', '2');
  await expect(tables.nth(2).locator('th').filter({ hasText: 'Merged cell' })).toHaveAttribute('colspan', '2');
  const mergedPaste = await documentJSON(); await editor.screenshot({ path: info.outputPath('merged-grid-expanded.png') });
  await page.keyboard.press('ControlOrMeta+z'); expect(await documentJSON()).toEqual(firstPaste);
  await page.keyboard.press('ControlOrMeta+Shift+z'); expect(await documentJSON()).toEqual(mergedPaste);

  await editor.getByText('Insert a table here.', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.press('Enter'); const beforeDocumentPaste = await documentJSON();
  await page.keyboard.press('ControlOrMeta+v');
  await expect(tables).toHaveCount(4); await expect(notes).toHaveCount(4);
  await expect(tables.nth(3).locator('th')).toHaveAttribute('rowspan', '2');
  await expect(tables.nth(3).locator('th')).toHaveAttribute('colspan', '2');
  await expect(notes.locator('strong')).toHaveCount(4);
  expect(await page.evaluate(() => (globalThis as any).fountainBrowserTest.pages.inspect().valid)).toBe(true);
  const final = await documentJSON(); await editor.screenshot({ path: info.outputPath('merged-slice-in-document.png') });
  await page.keyboard.press('ControlOrMeta+z'); expect(await documentJSON()).toEqual(beforeDocumentPaste);
  await page.keyboard.press('ControlOrMeta+Shift+z'); expect(await documentJSON()).toEqual(final);
  await info.attach('table-clipboard-outcome', { body: JSON.stringify({ browserName, final,
    clipboard: await page.evaluate(() => (globalThis as any).tableClipboardProbe) }), contentType: 'application/json' });
});
