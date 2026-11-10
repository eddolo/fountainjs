import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Schema, StarterKit, MarkdownImporter } from 'fountainjs-editor';
import { exportDOCX } from 'fountainjs-editor/docx';

export async function conversionWordHyperlinksJourney(page: Page, info: TestInfo) {
  const schema = new Schema(StarterKit.schema);
  const textURL = 'https://example.com/lines';
  const imageURL = 'https://example.com/figure';
  const link = schema.mark('link', { href: textURL });
  const figure = await readFile(new URL('../fixtures/cross-container-figure.png', import.meta.url));
  const image = schema.node('inline_image', {
    src: `data:image/png;base64,${figure.toString('base64')}`, alt: 'Linked evidence', width: '320px', height: '48px',
  });
  const original = schema.node('doc', {}, [
    schema.node('paragraph', {}, [schema.text('First linked line', [link]), schema.node('hard_break'), schema.text('Second linked line', [link])]),
    schema.node('paragraph', {}, [image]),
  ]);
  const archive = unzipSync(exportDOCX(original).bytes);
  const body = 'word/document.xml';
  archive[body] = strToU8(strFromU8(archive[body]!)
    .replace('<w:r><w:br/></w:r>', '<w:hyperlink r:id="rId1"><w:r><w:br/></w:r></w:hyperlink>')
    .replace(/(<wp:docPr [^>]+)\/>/u, '$1><a:hlinkClick r:id="rIdFigureLink"/></wp:docPr>'));
  const rels = 'word/_rels/document.xml.rels';
  archive[rels] = strToU8(strFromU8(archive[rels]!).replace('</Relationships>',
    `<Relationship Id="rIdFigureLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${imageURL}" TargetMode="External"/></Relationships>`));
  const source = info.outputPath('word-linked-figure.docx');
  await writeFile(source, zipSync(archive));

  await page.goto('/conversion-lab.html');
  const input = page.getByLabel('Choose documents');
  await input.setInputFiles(source);
  const workspace = page.getByRole('region', { name: 'Conversion workspace: word-linked-figure.docx' });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  async function expectLinks(root: ReturnType<Page['locator']>) {
    await expect(root.locator(`a[href="${textURL}"] br`)).toHaveCount(1);
    const linked = root.locator(`a[href="${imageURL}"] img[alt="Linked evidence"]`);
    await expect(linked).toBeVisible();
    await expect(linked).toHaveJSProperty('naturalWidth', 400);
  }
  await expectLinks(editor);
  const pagination = workspace.getByRole('region', { name: 'Draft pagination' });
  await pagination.getByRole('button', { name: 'Build page preview' }).click();
  const sheet = pagination.locator('.fountain-page-preview__sheet');
  await expectLinks(sheet);
  await sheet.screenshot({ path: info.outputPath('linked-figure-preview.png') });

  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const saved = info.outputPath('fountain-linked-figure.docx');
  await (await pending).saveAs(saved);
  const exported = unzipSync(await readFile(saved));
  expect(strFromU8(exported[body]!)).toContain('<a:hlinkClick r:id="rId2"/>');
  expect(strFromU8(exported[rels]!)).toContain(`Target="${imageURL}"`);
  await input.setInputFiles(saved);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: fountain-linked-figure.docx' })
    .getByRole('textbox', { name: 'Imported document editor' });
  await expectLinks(reopened);
}

export async function conversionWordHyphensJourney(page: Page, info: TestInfo) {
  const schema = new Schema(StarterKit.schema);
  const doc = schema.node('doc', {
    pageSettings: { unit: 'pt', width: 244, height: 360, marginTop: 36, marginRight: 36, marginBottom: 36, marginLeft: 36 },
  }, ['Word wrapping sample', 'Layout checks compare NONBREAKING.', 'Layout checks compare OPTIONAL.']
    .map(text => schema.node('paragraph', {}, [schema.text(text)])));
  const archive = unzipSync(exportDOCX(doc).bytes);
  archive['word/document.xml'] = strToU8(strFromU8(archive['word/document.xml']!)
    .replace('NONBREAKING', 'non</w:t><w:noBreakHyphen/><w:t>breaking')
    .replace('OPTIONAL', 'inter</w:t><w:softHyphen/><w:t>operability'));
  const source = info.outputPath('word-hyphens.docx');
  await writeFile(source, zipSync(archive));
  const expected = ['Word wrapping sample', 'Layout checks compare non\u2011breaking.', 'Layout checks compare inter\u00adoperability.'];

  await page.goto('/conversion-lab.html');
  const input = page.getByLabel('Choose documents');
  await input.setInputFiles(source);
  const workspace = page.getByRole('region', { name: 'Conversion workspace: word-hyphens.docx' });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  await expect(editor.locator('p')).toHaveText(expected);
  await editor.getByText(expected[0]!, { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect(editor.locator('p').first()).toHaveText(expected[0]! + '!');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await expect(editor.locator('p')).toHaveText(expected);
  await editor.screenshot({ path: info.outputPath('hyphens-editor.png') });

  const pagination = workspace.getByRole('region', { name: 'Draft pagination' });
  await pagination.getByRole('button', { name: 'Build page preview' }).click();
  const sheet = pagination.locator('.fountain-page-preview__sheet');
  await expect(sheet.locator('p')).toHaveText(expected);
  await sheet.screenshot({ path: info.outputPath('hyphens-preview.png') });

  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const saved = info.outputPath('fountain-hyphens.docx');
  await (await pending).saveAs(saved);
  const xml = strFromU8(unzipSync(await readFile(saved))['word/document.xml']!);
  expect(xml.match(/<w:(?:noBreakHyphen|softHyphen)\/>/gu)).toEqual(['<w:noBreakHyphen/>', '<w:softHyphen/>']);
  await input.setInputFiles(saved);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: fountain-hyphens.docx' })
    .getByRole('textbox', { name: 'Imported document editor' });
  await expect(reopened.locator('p')).toHaveText(expected);
}

export async function conversionRowSplittingJourney(page: Page, info: TestInfo) {
  const schema = new Schema(StarterKit.schema);
  const lead = (text: string, pageBreakBefore = false) => schema.node('paragraph', {
    layout: { unit: 'pt', spacingAfter: 246, pageBreakBefore },
  }, [schema.text(text)]);
  const table = (prefix: string) => schema.node('table', {}, [
    schema.node('table_row', {}, [schema.node('table_cell', {},
      Array.from({ length: 8 }, (_, index) => schema.node('paragraph', {
        layout: { unit: 'pt', spacingAfter: 9, lineHeight: 16, lineHeightUnit: 'pt', lineHeightRule: 'exact' },
      }, [schema.text(`${prefix}${index + 1}`)])))]),
  ]);
  const doc = schema.node('doc', {
    pageSettings: { unit: 'pt', width: 360, height: 432, marginTop: 36, marginRight: 36, marginBottom: 36, marginLeft: 36 },
  }, [lead('Allowed to split'), table('AllowedLine'), lead('Keep row together', true), table('TogetherLine')]);
  const archive = unzipSync(exportDOCX(doc).bytes);
  const declarations = ['<w:cantSplit w:val="false"/>', '<w:cantSplit/>'];
  let index = 0;
  archive['word/document.xml'] = strToU8(strFromU8(archive['word/document.xml']!).replaceAll('<w:trPr>', open =>
    open + declarations[index++]));
  expect(index).toBe(2);
  const source = info.outputPath('word-row-splitting.docx');
  await writeFile(source, zipSync(archive));

  await page.goto('/conversion-lab.html');
  const input = page.getByLabel('Choose documents');
  await input.setInputFiles(source);
  const workspace = page.getByRole('region', { name: 'Conversion workspace: word-row-splitting.docx' });
  await expect(workspace).toContainText('table-row-splitting-preview-limited');
  async function expectPolicies(rows: ReturnType<Page['locator']>) {
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute('data-fountain-row-keep-together', 'false');
    await expect(rows.nth(0)).toHaveCSS('break-inside', 'auto');
    await expect(rows.nth(1)).toHaveAttribute('data-fountain-row-keep-together', 'true');
    await expect(rows.nth(1)).toHaveCSS('break-inside', 'avoid');
  }
  await expectPolicies(workspace.getByRole('textbox', { name: 'Imported document editor' }).locator('tr'));
  const pagination = workspace.getByRole('region', { name: 'Draft pagination' });
  await pagination.getByRole('button', { name: 'Build page preview' }).click();
  await expectPolicies(pagination.locator('.fountain-page-preview__sheet tr'));
  await pagination.locator('.fountain-page-preview__sheet').filter({ hasText: 'TogetherLine8' })
    .screenshot({ path: info.outputPath('row-splitting-preview.png') });

  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const saved = info.outputPath('fountain-row-splitting.docx');
  await (await pending).saveAs(saved);
  const xml = strFromU8(unzipSync(await readFile(saved))['word/document.xml']!);
  expect(xml.match(/<w:cantSplit[^>]*\/>/gu)).toEqual(declarations);
  await input.setInputFiles(saved);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: fountain-row-splitting.docx' });
  await expectPolicies(reopened.getByRole('textbox', { name: 'Imported document editor' }).locator('tr'));
}

export async function conversionTableIndentJourney(page: Page, info: TestInfo) {
  const schema = new Schema(StarterKit.schema);
  const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
  const table = (text: string) => schema.node('table', { preferredWidth: { unit: 'pt', value: 180 } }, [
    schema.node('table_row', {}, [schema.node('table_cell', { colwidth: [240] }, [paragraph(text)])]),
  ]);
  const doc = schema.node('doc', {}, [
    paragraph('Table placement reference'), table('BaselineCell'), paragraph('An indented table follows'),
    table('IndentedCell'), paragraph('End of table placement sample'),
  ]);
  const archive = unzipSync(exportDOCX(doc).bytes);
  const declarations = ['<w:tblInd w:w="0" w:type="dxa"/>', '<w:tblInd w:w="720" w:type="dxa"/>'];
  let index = 0;
  archive['word/document.xml'] = strToU8(strFromU8(archive['word/document.xml']!).replaceAll('<w:tblBorders>', open =>
    declarations[index++] + open));
  expect(index).toBe(2);
  const source = info.outputPath('word-table-indent.docx');
  await writeFile(source, zipSync(archive));

  await page.goto('/conversion-lab.html');
  const input = page.getByLabel('Choose documents');
  await input.setInputFiles(source);
  const workspace = page.getByRole('region', { name: 'Conversion workspace: word-table-indent.docx' });
  async function expectIndent(tables: ReturnType<Page['locator']>) {
    await expect(tables).toHaveCount(2);
    await expect(tables.nth(0)).toHaveAttribute('data-fountain-table-indent', '0');
    await expect(tables.nth(1)).toHaveAttribute('data-fountain-table-indent', '720');
    const delta = await tables.evaluateAll(([baseline, indented]) =>
      indented.getBoundingClientRect().left - baseline.getBoundingClientRect().left);
    expect(delta).toBeCloseTo(48, 0);
  }
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  await expectIndent(editor.locator('table'));
  await editor.screenshot({ path: info.outputPath('table-indent-editor.png') });
  const pagination = workspace.getByRole('region', { name: 'Draft pagination' });
  await pagination.getByRole('button', { name: 'Build page preview' }).click();
  await expectIndent(pagination.locator('.fountain-page-preview__sheet table'));
  await pagination.locator('.fountain-page-preview__sheet').screenshot({ path: info.outputPath('table-indent-preview.png') });

  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const saved = info.outputPath('fountain-table-indent.docx');
  await (await pending).saveAs(saved);
  const xml = strFromU8(unzipSync(await readFile(saved))['word/document.xml']!);
  expect(xml.match(/<w:tblInd[^>]+\/>/gu)).toEqual(declarations);
  await input.setInputFiles(saved);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: fountain-table-indent.docx' });
  await expectIndent(reopened.getByRole('textbox', { name: 'Imported document editor' }).locator('table'));
}

export async function conversionRowHeightJourney(page: Page, info: TestInfo) {
  const schema = new Schema(StarterKit.schema);
  const rows = [['Minimum row'], ['Exact row', 'Visible line two', 'Visible line three', 'Visible line four'], ['Natural row']];
  const doc = schema.node('doc', {}, [schema.node('table', {}, rows.map(lines => schema.node('table_row', {}, [
    schema.node('table_cell', {}, lines.map(text => schema.node('paragraph', {}, [schema.text(text)]))),
  ])))]);
  const archive = unzipSync(exportDOCX(doc).bytes);
  const declarations = ['<w:trHeight w:val="1200" w:hRule="atLeast"/>', '<w:trHeight w:val="360" w:hRule="exact"/>', ''];
  let index = 0;
  archive['word/document.xml'] = strToU8(strFromU8(archive['word/document.xml']!).replaceAll('<w:trPr>', open =>
    open + declarations[index++]));
  expect(index).toBe(3);
  const source = info.outputPath('word-row-heights.docx');
  await writeFile(source, zipSync(archive));

  await page.goto('/conversion-lab.html');
  const input = page.getByLabel('Choose documents');
  await input.setInputFiles(source);
  const workspace = page.getByRole('region', { name: 'Conversion workspace: word-row-heights.docx' });
  await expect(workspace).toContainText('table-row-height-browser-minimum');
  async function expectHeights(table: ReturnType<Page['locator']>) {
    const rows = table.locator('tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAttribute('data-fountain-row-height', 'atLeast:1200');
    await expect(rows.nth(1)).toHaveAttribute('data-fountain-row-height', 'exact:360');
    await expect(rows.nth(2)).not.toHaveAttribute('data-fountain-row-height');
    const heights = await rows.evaluateAll(items => items.map(row => row.getBoundingClientRect().height));
    expect(heights[0]).toBeGreaterThanOrEqual(79.5);
    expect(heights[1]).toBeGreaterThan(48);
    expect(heights[2]).toBeLessThan(60);
    const minimumCell = rows.nth(0).locator('td');
    await expect(minimumCell).toHaveCSS('vertical-align', 'top');
    const inset = await minimumCell.evaluate(cell => cell.querySelector('p')!.getBoundingClientRect().top - cell.getBoundingClientRect().top);
    expect(inset).toBeLessThan(12);
    await expect(rows.nth(1)).toContainText('Visible line four');
  }
  await expectHeights(workspace.getByRole('textbox', { name: 'Imported document editor' }).locator('table'));
  const pagination = workspace.getByRole('region', { name: 'Draft pagination' });
  await pagination.getByRole('button', { name: 'Build page preview' }).click();
  const table = pagination.locator('.fountain-page-preview__sheet table');
  await expectHeights(table);
  await table.screenshot({ path: info.outputPath('row-height-preview.png') });

  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const saved = info.outputPath('fountain-row-heights.docx');
  await (await pending).saveAs(saved);
  const xml = strFromU8(unzipSync(await readFile(saved))['word/document.xml']!);
  expect(xml.match(/<w:trHeight[^>]+\/>/gu)).toEqual(declarations.slice(0, 2));
  expect(xml).not.toContain('<w:vAlign');
  await input.setInputFiles(saved);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: fountain-row-heights.docx' });
  await expectHeights(reopened.getByRole('textbox', { name: 'Imported document editor' }).locator('table'));
}

export async function conversionCellAlignmentJourney(page: Page, info: TestInfo) {
  const schema = new Schema(StarterKit.schema);
  const cell = (lines: string[]) => schema.node('table_cell', {}, lines.map(text =>
    schema.node('paragraph', {}, [schema.text(text)])));
  const doc = schema.node('doc', {}, [schema.node('table', {}, [
    schema.node('table_row', {}, [
      cell(['Top aligned']), cell(['Center aligned']), cell(['Bottom aligned']),
      cell(['A tall cell', 'with several', 'paragraphs to', 'make the row', 'tall enough']),
    ]),
  ])]);
  const archive = unzipSync(exportDOCX(doc).bytes);
  const alignments = ['top', 'center', 'bottom', 'top'];
  let index = 0;
  archive['word/document.xml'] = strToU8(strFromU8(archive['word/document.xml']!).replaceAll('</w:tcPr>', closing =>
    `<w:vAlign w:val="${alignments[index++]}"/>${closing}`));
  expect(index).toBe(4);
  const sourcePath = info.outputPath('word-cell-alignment.docx');
  await writeFile(sourcePath, zipSync(archive));

  await page.goto('/conversion-lab.html');
  const input = page.getByLabel('Choose documents');
  await input.setInputFiles(sourcePath);
  const workspace = page.getByRole('region', { name: 'Conversion workspace: word-cell-alignment.docx' });
  async function expectAligned(table: ReturnType<Page['locator']>) {
    await expect(table.locator('td')).toHaveCount(4);
    const positions = await table.locator('td').evaluateAll(cells => cells.map(cell => ({
      alignment: getComputedStyle(cell).verticalAlign,
      top: cell.querySelector('p')!.getBoundingClientRect().top,
    })));
    expect(positions.map(cell => cell.alignment)).toEqual(['top', 'middle', 'bottom', 'top']);
    expect(positions[1]!.top - positions[0]!.top).toBeGreaterThan(15);
    expect(positions[2]!.top - positions[1]!.top).toBeGreaterThan(15);
  }
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  await expectAligned(editor.locator('table'));
  await expect(editor.locator(':scope > p').last()).toBeEmpty();
  const pagination = workspace.getByRole('region', { name: 'Draft pagination' });
  await pagination.getByRole('button', { name: 'Build page preview' }).click();
  const sheets = pagination.locator('.fountain-page-preview__sheet');
  await expectAligned(sheets.locator('table'));
  await sheets.locator('table').screenshot({ path: info.outputPath('cell-alignment-preview.png') });

  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const exportedPath = info.outputPath('fountain-cell-alignment.docx');
  await (await pending).saveAs(exportedPath);
  const exported = unzipSync(await readFile(exportedPath));
  expect(strFromU8(exported['word/document.xml']!)).toMatch(/<\/w:tbl><w:sectPr>/u);
  await expect(editor.locator(':scope > p').last()).toBeEmpty();
  await input.setInputFiles(exportedPath);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: fountain-cell-alignment.docx' });
  await expectAligned(reopened.getByRole('textbox', { name: 'Imported document editor' }).locator('table'));
}

export async function conversionScientificPreviewJourney(page: Page, info: TestInfo) {
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles('tests/fixtures/native-docx/cooling-report.docx');
  const workspace = page.getByRole('region', { name: 'Conversion workspace: cooling-report.docx' });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  await expect(editor.locator('img')).toHaveCount(3);
  await expect(editor.locator('[data-fountain-math]')).toHaveCount(2);
  const firstFigure = editor.locator('figure').filter({ hasText: 'Probe positions in the two vessels' });
  const firstImage = firstFigure.locator('img');
  const firstCaption = firstFigure.locator('figcaption');
  const resize = firstFigure.getByRole('slider', { name: 'Resize image from right' });
  const widthOf = (locator: typeof firstImage) => locator.evaluate(element => element.getBoundingClientRect().width);
  const imageWidth = await widthOf(firstImage);
  const captionWidth = await widthOf(firstCaption);
  await resize.focus();
  await resize.press('ArrowLeft');
  await expect.poll(() => widthOf(firstImage)).toBeCloseTo(Math.round(imageWidth) - 10, 0);
  expect(await widthOf(firstCaption)).toBeCloseTo(captionWidth, 0);
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => widthOf(firstImage)).toBeCloseTo(imageWidth, 0);
  const ending = editor.getByText('END OF REPORT', { exact: true });
  await ending.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Checked in the lab.');
  await expect(editor).toContainText('END OF REPORT Checked in the lab.');

  const controls = workspace.getByRole('region', { name: 'Draft pagination' });
  await controls.getByRole('button', { name: 'Build page preview' }).click();
  const preview = controls.getByRole('region', { name: 'Paged draft preview' });
  await expect(preview).toBeVisible();
  const sheets = preview.locator('.fountain-page-preview__sheet');
  const body = sheets.locator('.fountain-page-preview__body');
  const header = sheets.locator('.fountain-page-preview__header');
  const footer = sheets.locator('[data-fountain-page-template^="footer:"]');
  const notes = body.locator('.fountain-page-preview__footnotes');
  await expect(body.locator('img')).toHaveCount(2);
  await expect(body.locator('[data-fountain-math]')).toHaveCount(2);
  const math = body.locator('[data-fountain-math="block"]');
  for (const equation of await math.all()) {
    await expect(equation).toHaveCSS('padding-top', '0px');
    await expect(equation.locator('.katex-display')).toHaveCSS('margin-top', '0px');
    const spacingAfter = await equation.evaluate(element => parseFloat(getComputedStyle(element).marginBlockEnd));
    expect(Math.abs(spacingAfter - 28 / 3)).toBeLessThan(0.02);
  }
  const table = body.locator('table');
  await expect(table).toHaveCount(1);
  await expect(table).toHaveCSS('margin-top', '0px');
  await expect(table).toHaveCSS('margin-bottom', '0px');
  await expect(notes).toHaveCount(1);
  await expect(notes).toContainText('they are not measured experimental data.');
  await expect(sheets.last()).toContainText('END OF REPORT Checked in the lab.');
  await expect(sheets).toHaveCount(2);
  expect(await header.locator('img').count()).toBeGreaterThan(0);
  await expect(footer.first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const firstSheet = (await sheets.first().boundingBox())!;
  const firstHeader = (await header.first().boundingBox())!;
  const firstFooter = (await footer.first().boundingBox())!;
  // This fixture declares both edge distances at 36 pt (48 CSS px).
  expect(firstHeader.y - firstSheet.y).toBeCloseTo(48, 0);
  expect(firstSheet.y + firstSheet.height - firstFooter.y - firstFooter.height).toBeCloseTo(48, 0);
  const caption = body.locator('figcaption').filter({ hasText: 'Probe positions in the two vessels' });
  const positions = await caption.evaluate(element => {
    const figure = element.closest('figure')!;
    const body = element.closest('.fountain-page-preview__body')!;
    return { caption: element.getBoundingClientRect().left, image: figure.querySelector('img')!.getBoundingClientRect().left, body: body.getBoundingClientRect().left };
  });
  expect(positions.caption).toBeCloseTo(positions.body, 0);
  expect(positions.image - positions.body).toBeGreaterThan(25);
  await expect.poll(() => sheets.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.setViewportSize({ width: 1280, height: 1460 });
  for (const [index, sheet] of (await sheets.all()).entries()) {
    await sheet.screenshot({ path: info.outputPath(`cooling-report-sheet-${index + 1}.png`) });
  }

  await page.emulateMedia({ media: 'print' });
  await expect(editor).toBeHidden();
  const pdf = info.project.name === 'chromium'
    ? await page.pdf({ path: info.outputPath('cooling-report-print.pdf'), preferCSSPageSize: true, printBackground: true })
    : undefined;
  await page.emulateMedia({ media: 'screen' });
  return { pdf, sheetCount: await sheets.count() };
}

export async function conversionPagePreviewJourney(page: Page, info: TestInfo) {
  const schema = new Schema(StarterKit.schema);
  const paragraph = (lines: string[], keepWithNext = false) => schema.node('paragraph', {
    layout: { unit: 'pt', lineHeight: 18, lineHeightUnit: 'pt', lineHeightRule: 'exact', keepWithNext },
  }, lines.flatMap((line, index) => index ? [schema.node('hard_break'), schema.text(line)] : [schema.text(line)]));
  const fixture = schema.node('doc', {
    pageSettings: { unit: 'pt', width: 261, height: 153, marginTop: 7.5, marginRight: 7.5, marginBottom: 7.5, marginLeft: 7.5 },
  }, [paragraph(['Lead first', 'Lead second', 'Lead third']), paragraph(['Section heading'], true),
    paragraph(['Caption first', 'Caption second'], true), paragraph(['Body first', 'Body second'])]);
  await page.goto('/conversion-lab.html');
  await page.getByLabel('Choose documents').setInputFiles([
    { name: 'pagination.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(exportDOCX(fixture).bytes) },
    { name: 'other.md', mimeType: 'text/markdown', buffer: Buffer.from('# Separate draft\n\nThis text belongs to another file.\n\n| Name |\n| --- |\n| Other file |') },
  ]);
  const files = page.getByRole('navigation', { name: 'Imported files' });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: pagination.docx' });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const controls = workspace.getByRole('region', { name: 'Draft pagination' });
  const build = controls.getByRole('button', { name: 'Build page preview' });
  const print = controls.getByRole('button', { name: 'Print / Save PDF' });
  const sheets = controls.locator('.fountain-page-preview__sheet');
  await expect(print).toBeDisabled();
  await build.click();
  await expect(controls).toContainText('2 pages. Using the document’s paper size and margins.');
  await expect(sheets).toHaveCount(2);
  await expect(sheets.first()).toContainText('Lead third');
  await expect(sheets.first()).not.toContainText('Section heading');
  await expect(sheets.nth(1)).toContainText(/Section heading.*Caption first.*Body second/su);

  await editor.locator('p').filter({ hasText: 'Body second' }).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' Added in the lab.');
  await expect(editor).toContainText('Body second Added in the lab.');
  await expect(controls).toContainText('The draft changed. Build the page preview again.');
  await expect(print).toBeDisabled();
  await expect(sheets).toHaveCount(0);
  await build.click();
  await expect(sheets.nth(1)).toContainText('Body second Added in the lab.');
  await expect(print).toBeEnabled();
  await controls.screenshot({ path: info.outputPath('conversion-page-preview.png') });

  await page.evaluate(() => { window.print = () => { document.body.dataset.labPrintCalled = 'true'; }; });
  await print.click();
  await expect(page.locator('body')).toHaveAttribute('data-lab-print-called', 'true');
  await page.emulateMedia({ media: 'print' });
  await expect(editor).toBeHidden();
  await expect(sheets.first()).toBeVisible();
  const pdf = info.project.name === 'chromium'
    ? await page.pdf({ path: info.outputPath('conversion-page-preview.pdf'), preferCSSPageSize: true })
    : undefined;
  await page.emulateMedia({ media: 'screen' });

  await files.getByRole('button', { name: 'other.md' }).click();
  const other = page.getByRole('region', { name: 'Conversion workspace: other.md' }).getByRole('region', { name: 'Draft pagination' });
  await other.getByRole('button', { name: 'Build page preview' }).click();
  await expect(other).toContainText('1 page. Using Letter with 1-inch margins.');
  await expect(other.locator('.fountain-page-preview__sheet')).toContainText('This text belongs to another file.');
  await expect(other.locator('.fountain-page-preview__sheet table')).toHaveCSS('margin-top', '20px');
  await expect(page.locator('style[data-fountain-page-print-style]')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 800 });
  const mobilePreview = other.getByRole('region', { name: 'Paged draft preview' });
  await mobilePreview.focus();
  await expect(mobilePreview).toBeFocused();
  expect(await mobilePreview.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await mobilePreview.screenshot({ path: info.outputPath('conversion-page-preview-mobile.png') });
  await files.getByRole('button', { name: 'pagination.docx' }).click();
  await expect(editor).toContainText('Added in the lab.');
  await expect(print).toBeDisabled();
  await expect(page.locator('style[data-fountain-page-print-style]')).toHaveCount(0);
  return pdf;
}

export async function conversionSlowImagePreviewJourney(page: Page, info: TestInfo) {
  // Permit one local test fixture so we can exercise a real pending image.
  // The public page's normal CSP blocks all linked images.
  await page.route('**/conversion-lab.html', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('img-src data: blob:', "img-src 'self' data: blob:") });
  });
  await page.goto('/conversion-lab.html');
  const url = new URL('/slow-preview-figure.png', page.url()).href;
  const pixels = await readFile(new URL('../fixtures/cross-container-figure.png', import.meta.url));
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(url, async route => {
    await held;
    await route.fulfill({ contentType: 'image/png', body: pixels });
  });

  try {
    const requested = page.waitForRequest(url);
    const source = `<p>Before the figures</p><figure><img src="${url}" alt="Weather chart" width="266" height="40"></figure>
      <figure><img src="data:image/png;base64,${pixels.toString('base64')}" alt="Embedded sample" width="160" height="24"><figcaption>Local figure caption</figcaption></figure>
      <p>After the figures</p>`;
    await page.getByLabel('Choose documents').setInputFiles({ name: 'figures.html', mimeType: 'text/html', buffer: Buffer.from(source) });
    const workspace = page.getByRole('region', { name: 'Conversion workspace: figures.html' });
    const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
    const original = editor.locator('img[alt="Weather chart"]');
    await expect(original).toHaveAttribute('src', url);
    await original.scrollIntoViewIfNeeded();
    await requested;
    const controls = workspace.getByRole('region', { name: 'Draft pagination' });
    const build = controls.getByRole('button', { name: 'Build page preview' });
    const sheets = controls.locator('.fountain-page-preview__sheet');
    const unavailable = sheets.locator('[role="img"][aria-label="Image unavailable: Weather chart"]');
    await build.click();
    await expect(sheets.first()).toContainText('After the figures');
    await expect(unavailable).toBeVisible();
    await expect(sheets.locator('img[alt="Embedded sample"]')).toHaveJSProperty('naturalWidth', 400);
    await expect(sheets.locator('figcaption')).toHaveText('Local figure caption');
    await expect(sheets.locator('.fountain-image__caption-input, .fountain-image__resize-controls, .fountain-image__error')).toHaveCount(0);
    await expect(sheets.locator('img[srcset], img[alt="Weather chart"]')).toHaveCount(0);
    await expect(controls.getByRole('button', { name: 'Print / Save PDF' })).toBeEnabled();
    await controls.getByText('1 layout warning', { exact: true }).click();
    await expect(controls.getByText('One image was unavailable in this preview.', { exact: false })).toBeVisible();
    await expect(original).toHaveAttribute('src', url);
    await sheets.first().screenshot({ path: info.outputPath('preview-with-unavailable-image.png') });

    release();
    await expect(original).toHaveJSProperty('naturalWidth', 400);
    await expect(unavailable).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(editor).toBeHidden();
    await expect(unavailable).toBeVisible();
    const pdf = info.project.name === 'chromium'
      ? await page.pdf({ path: info.outputPath('preview-with-unavailable-image.pdf'), preferCSSPageSize: true })
      : undefined;
    await page.emulateMedia({ media: 'screen' });
    await build.click();
    await expect(sheets.locator('img[alt="Weather chart"]')).toHaveJSProperty('naturalWidth', 400);
    await expect(unavailable).toHaveCount(0);
    await sheets.first().screenshot({ path: info.outputPath('preview-after-image-loaded.png') });
    return pdf;
  } finally {
    release();
  }
}

export async function conversionLabJourney(page: Page, info: TestInfo) {
  const errors: string[] = [];
  let externalRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://lab-private.invalid/**', route => { externalRequests++; return route.abort(); });
  await page.goto('/demos.html');
  await page.getByRole('link', { name: 'Open the conversion lab' }).click();
  await expect(page.getByRole('heading', { name: 'Try your own documents.' })).toBeVisible();
  const schema = new Schema(StarterKit.schema);
  const imageSource = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 160;
    const context = canvas.getContext('2d')!; context.fillStyle = '#255a66'; context.fillRect(0, 0, 320, 160);
    context.fillStyle = '#fff'; context.font = '22px sans-serif'; context.fillText('Embedded image proof', 30, 86);
    return canvas.toDataURL('image/png');
  });
  const wordDoc = MarkdownImporter.parse('# Word original\n\nA retained paragraph.', schema);
  const word = exportDOCX(schema.node('doc', {}, [...wordDoc.content, schema.node('paragraph', {}, [schema.node('inline_image', { src: imageSource, alt: 'Embedded image proof' })])]));
  const source = '# Private source\n\nOriginal **paragraph**.\n';
  await page.getByLabel('Choose documents').setInputFiles([
    { name: 'private.md', mimeType: 'text/markdown', buffer: Buffer.from(source) },
    { name: 'article.html', mimeType: 'text/html', buffer: Buffer.from('<article><p>Imported HTML</p><img src="https://lab-private.invalid/tracker.png" alt="Remote image" /></article><script>window.labInjected=true</script>') },
    { name: 'word.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(word.bytes) },
    { name: 'unsupported.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not supported') },
    { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{bad') },
  ]);
  await expect(page.getByRole('status').filter({ hasText: '3 imported; 2 could not' })).toBeVisible();
  const files = page.getByRole('navigation', { name: 'Imported files' });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: private.md', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  await editor.click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.type(' Added in the lab.');
  await workspace.getByRole('combobox', { name: 'Export format', exact: true }).selectOption('json');
  await workspace.getByRole('button', { name: 'Check round trip' }).click();
  await expect(workspace.getByLabel('Round-trip result')).toContainText('Exact Fountain document equality');
  await expect(workspace.getByRole('textbox', { name: 'Reopened export preview' })).toContainText('Added in the lab.');
  await editor.click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.type(' Another edit.');
  await expect(workspace.getByLabel('Round-trip result')).toContainText('Outdated check');
  await files.getByRole('button', { name: 'article.html', exact: true }).click();
  const article = page.getByRole('region', { name: 'Conversion workspace: article.html', exact: true });
  await expect(article).toContainText('unmapped-block-wrapper');
  await article.getByRole('button', { name: 'Build page preview' }).click();
  await expect(article.locator('.fountain-page-preview__sheet [aria-label="Image unavailable: Remote image"]')).toBeVisible();
  expect(await page.evaluate(() => (window as any).labInjected)).toBeUndefined();
  expect(externalRequests).toBe(0);
  await files.getByRole('button', { name: 'word.docx', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Imported document editor' })).toContainText('Word original');
  const wordWorkspace = page.getByRole('region', { name: 'Conversion workspace: word.docx', exact: true });
  const recoveredImage = wordWorkspace.locator('.lab-assets img');
  await expect(recoveredImage).toBeVisible();
  await expect.poll(() => recoveredImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(320);
  const imageDownload = page.waitForEvent('download');
  await wordWorkspace.getByRole('button', { name: 'Download image 1' }).click();
  expect(await readFile((await (await imageDownload).path())!)).toEqual(Buffer.from(imageSource.split(',')[1], 'base64'));
  await wordWorkspace.locator('.lab-assets').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('recovered-image.png') });
  await wordWorkspace.getByRole('button', { name: 'Build page preview' }).click();
  const pagedImage = wordWorkspace.locator('.fountain-page-preview__sheet img[alt="Embedded image proof"]');
  await expect(pagedImage).toBeVisible();
  await expect.poll(() => pagedImage.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(320);
  await files.getByRole('button', { name: 'unsupported.pdf — not imported', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Not supported');
  await files.getByRole('button', { name: 'broken.json — not imported', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await files.getByRole('button', { name: 'private.md', exact: true }).click();
  await expect(editor).toContainText('Another edit.');
  await workspace.getByLabel('What went wrong?').fill('Private reproduction note.');
  const reportDownload = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download diagnostic report' }).click();
  const report = JSON.parse(await readFile((await (await reportDownload).path())!, 'utf8'));
  expect(report.editedDocument).toBeUndefined(); expect(report.fileName).toBeUndefined(); expect(report.note).toBeUndefined();
  expect(report.roundTrip.stale).toBe(true);
  const originalDownload = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download untouched original' }).click();
  expect(await readFile((await (await originalDownload).path())!, 'utf8')).toBe(source);
  const convertedDownload = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const converted = await readFile((await (await convertedDownload).path())!);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'reopened.json', mimeType: 'application/json', buffer: converted });
  await expect(page.getByRole('textbox', { name: 'Imported document editor' })).toContainText('Another edit.');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove selected file', exact: true }).click();
  await expect(files.getByRole('button', { name: 'reopened.json', exact: true })).toHaveCount(0);
  await page.getByRole('heading', { name: 'Try your own documents.' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('conversion-lab.png'), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const sourceBox = await workspace.getByRole('heading', { name: '1. Original source' }).boundingBox();
  const editorBox = await workspace.getByRole('heading', { name: '2. Imported document — editable' }).boundingBox();
  expect(sourceBox!.y).toBeLessThan(editorBox!.y);
  expect(Math.abs(sourceBox!.x - editorBox!.x)).toBeLessThan(2);
  await workspace.getByRole('heading', { name: '1. Original source' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('source-above-editor.png') });
  expect(errors).toEqual([]);
}
