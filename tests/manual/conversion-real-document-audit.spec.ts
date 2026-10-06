// Gap-finding audit: completing the workflow is NOT a fidelity pass.
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { NodeJSON } from 'fountainjs-editor';
import { importLab } from '../../examples/react-app/src/conversion-lab';
import { withDOCXExportStyles } from '../fixtures/docx-page-defaults';
const fixture = resolve('artifacts/conversion-real-use/source/cooling-report.docx');
const viewerOrigin = process.env.FJS_AUDIT_VIEWER_ORIGIN ?? 'http://127.0.0.1:4189';
const labURL = process.env.FJS_CONVERSION_AUDIT_URL ?? 'https://eddolo.github.io/fountainjs/conversion-lab.html';
const verifyShading = process.env.FJS_AUDIT_VERIFY_SHADING === '1';
const verifyIntake = process.env.FJS_AUDIT_VERIFY_INTAKE === '1';
const verifyFootnotes = process.env.FJS_AUDIT_VERIFY_FOOTNOTES === '1';
const verifyTemplates = process.env.FJS_AUDIT_VERIFY_TEMPLATES === '1';
const verifyBreaks = process.env.FJS_AUDIT_VERIFY_BREAKS === '1';
const verifySettings = process.env.FJS_AUDIT_VERIFY_SETTINGS === '1';
const verifyLayout = process.env.FJS_AUDIT_VERIFY_LAYOUT === '1';
const verifyTableWidths = process.env.FJS_AUDIT_VERIFY_TABLE_WIDTHS === '1';
const noteText = 'These values are generated from the stated model for conversion testing; they are not measured experimental data.';

test('imports table-owned text through actual typing history and native download reopening', async ({ page }, info) => {
  test.setTimeout(120000);
  const source = info.outputPath('table-text-source.docx');
  execFileSync('C:/Users/cappu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe', [resolve('scripts/create-table-style-fixture.py'), source, '--conditional', '--text']);
  await independentView(page, info, await readFile(source), 'table-text-independent-source');
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles(source);
  const workspace = page.getByRole('region', { name: 'Conversion workspace: table-text-source.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const cells = editor.locator('td');
  await expect(cells).toHaveCount(15);
  const sample = cells.nth(0).getByText('Sample', { exact: true });
  await expect(sample).toHaveCSS('font-weight', '700');
  await expect(sample).toHaveCSS('font-size', '16px');
  await expect(sample).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(cells.nth(0).locator('p')).toHaveCSS('text-align', 'center');
  await expect(cells.nth(5).locator('p')).toHaveCSS('text-align', 'center');
  await expect(cells.nth(10).getByText('Third body row', { exact: false })).toHaveCSS('color', 'rgb(51, 68, 85)');
  await editor.screenshot({ path: info.outputPath('table-text-imported.png') });
  await cells.nth(10).getByText('Third body row', { exact: false }).click();
  await page.keyboard.press('Home'); await page.keyboard.type('Reviewed: ');
  await expect(cells.nth(10)).toContainText('Reviewed: ');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(cells.nth(10)).not.toContainText('Reviewed: ');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(cells.nth(10)).toContainText('Reviewed: ');
  await editor.screenshot({ path: info.outputPath('table-text-edited.png') });
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('json');
  let pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const jsonPath = info.outputPath('table-text-edited.json'); await (await pending).saveAs(jsonPath);
  const edited = JSON.parse(await readFile(jsonPath, 'utf8')) as NodeJSON;
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const output = info.outputPath('table-text-export.docx'); await (await pending).saveAs(output);
  const exported = await readFile(output);
  expect(importLab(exported, 'docx').document.toJSON()).toEqual(withDOCXExportStyles(edited));
  await page.getByLabel('Choose documents').setInputFiles(output);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: table-text-export.docx', exact: true }).getByRole('textbox', { name: 'Imported document editor' });
  await expect(reopened.locator('td').nth(0).getByText('Sample', { exact: true })).toHaveCSS('font-size', '16px');
  await expect(reopened.locator('td').nth(0).getByText('Sample', { exact: true })).toHaveCSS('font-weight', '700');
  await expect(reopened.locator('td').nth(5).locator('p')).toHaveCSS('text-align', 'center');
  await expect(reopened).toContainText('Reviewed: ');
  await reopened.screenshot({ path: info.outputPath('table-text-reopened.png') });
  await independentView(page, info, exported, 'table-text-independent-export');
});

test('imports conditional table rules through real author editing history and native reopening', async ({ page }, info) => {
  test.setTimeout(120000);
  const python = 'C:/Users/cappu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
  const source = info.outputPath('conditional-table-source.docx');
  execFileSync(python, [resolve('scripts/create-table-style-fixture.py'), source, '--conditional']);
  const bytes = await readFile(source);
  await independentView(page, info, bytes, 'conditional-table-independent-source');
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles(source);
  const workspace = page.getByRole('region', { name: 'Conversion workspace: conditional-table-source.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const cells = editor.locator('td');
  await expect(cells).toHaveCount(15);
  const expected = [
    'rgb(201, 218, 248)', 'rgb(207, 226, 243)', 'rgb(217, 234, 211)',
    'rgb(239, 239, 239)', 'rgb(255, 255, 204)', 'rgb(231, 230, 230)',
    'rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)', 'rgb(231, 230, 230)',
    'rgb(239, 239, 239)', 'rgb(245, 248, 253)', 'rgb(231, 230, 230)',
    'rgb(255, 242, 204)', 'rgb(221, 238, 221)', 'rgb(244, 204, 204)',
  ];
  for (const [index, fill] of expected.entries()) await expect(cells.nth(index)).toHaveCSS('background-color', fill);
  await expect(editor.locator('th')).toHaveCount(0);
  await expect(editor.locator('tr').first()).toHaveAttribute('data-fountain-repeat-header', 'false');
  await editor.screenshot({ path: info.outputPath('conditional-table-imported.png') });
  await cells.nth(10).getByText('Third body row', { exact: false }).click();
  // End is a visual-line command; use the physical Home key and an insertion
  // before the existing sentence, not an assumed end-of-paragraph offset.
  await page.keyboard.press('Home'); await page.keyboard.type('Reviewed: ');
  await expect(cells.nth(10)).toContainText('Reviewed: ');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(cells.nth(10)).not.toContainText('Reviewed: ');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(cells.nth(10)).toContainText('Reviewed: ');
  await editor.screenshot({ path: info.outputPath('conditional-table-edited.png') });
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('json');
  let pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const jsonPath = info.outputPath('conditional-table-edited.json'); await (await pending).saveAs(jsonPath);
  const edited = JSON.parse(await readFile(jsonPath, 'utf8')) as NodeJSON;
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const output = info.outputPath('conditional-table-export.docx'); await (await pending).saveAs(output);
  const exported = await readFile(output);
  expect(importLab(exported, 'docx').document.toJSON()).toEqual(withDOCXExportStyles(edited));
  await page.getByLabel('Choose documents').setInputFiles(output);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: conditional-table-export.docx', exact: true }).getByRole('textbox', { name: 'Imported document editor' });
  for (const [index, fill] of expected.entries()) await expect(reopened.locator('td').nth(index)).toHaveCSS('background-color', fill);
  await expect(reopened).toContainText('Reviewed: ');
  await reopened.screenshot({ path: info.outputPath('conditional-table-reopened.png') });
  await independentView(page, info, exported, 'conditional-table-independent-export');
});

test('imports inherited table appearance from an independent producer through real editing and native reopening', async ({ page }, info) => {
  test.setTimeout(120000);
  const python = 'C:/Users/cappu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
  const source = info.outputPath('inherited-table-source.docx');
  execFileSync(python, [resolve('scripts/create-table-style-fixture.py'), source]);
  const bytes = await readFile(source);
  await independentView(page, info, bytes, 'inherited-table-independent-source');
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles(source);
  const workspace = page.getByRole('region', { name: 'Conversion workspace: inherited-table-source.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const cells = editor.locator('td');
  await expect(cells).toHaveCount(6);
  await expect(cells.nth(0)).toHaveCSS('background-color', 'rgb(237, 242, 248)');
  await expect(cells.nth(3)).toHaveCSS('background-color', 'rgb(255, 255, 204)');
  await expect(cells.nth(4)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(cells.nth(2)).toHaveCSS('padding-left', '0px');
  await expect(cells.nth(3)).toHaveCSS('padding-left', /5\.33/);
  await expect(editor.locator('table')).toHaveCSS('table-layout', 'fixed');
  await editor.screenshot({ path: info.outputPath('inherited-table-imported.png') });
  await cells.nth(3).getByText('Measured value retains', { exact: false }).click();
  await page.keyboard.press('End'); await page.keyboard.type(' Reviewed.');
  await expect(cells.nth(3)).toContainText('Reviewed.');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(cells.nth(3)).not.toContainText('Reviewed.');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(cells.nth(3)).toContainText('Reviewed.');
  await editor.screenshot({ path: info.outputPath('inherited-table-edited.png') });
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('json');
  let pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const jsonPath = info.outputPath('inherited-table-edited.json'); await (await pending).saveAs(jsonPath);
  const edited = JSON.parse(await readFile(jsonPath, 'utf8')) as NodeJSON;
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const output = info.outputPath('inherited-table-export.docx'); await (await pending).saveAs(output);
  const exported = await readFile(output);
  expect(importLab(exported, 'docx').document.toJSON()).toEqual(withDOCXExportStyles(edited));
  await page.getByLabel('Choose documents').setInputFiles(output);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: inherited-table-export.docx', exact: true }).getByRole('textbox', { name: 'Imported document editor' });
  await expect(reopened.locator('td').nth(0)).toHaveCSS('background-color', 'rgb(237, 242, 248)');
  await expect(reopened.locator('td').nth(3)).toHaveCSS('background-color', 'rgb(255, 255, 204)');
  await expect(reopened.locator('td').nth(2)).toHaveCSS('padding-left', '0px');
  await expect(reopened).toContainText('Reviewed.');
  await reopened.screenshot({ path: info.outputPath('inherited-table-reopened.png') });
  await independentView(page, info, exported, 'inherited-table-independent-export');
});

test('keeps Word row repetition separate from semantic header styling through real table controls and reopening', async ({ page }, info) => {
  test.setTimeout(120000);
  const { zipSync, strToU8, unzipSync, strFromU8 } = await import('fflate');
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paragraph = (text: string) => `<w:p><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:color w:val="000000"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
  const bytes = Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<w:document xmlns:w="${ns}"><w:body>${paragraph('Row repetition audit')}<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="4800"/></w:tblPr><w:tblGrid><w:gridCol w:w="4800"/></w:tblGrid>${['Plain repeating label', 'Editable body row'].map((text, index) => `<w:tr><w:trPr><w:tblHeader${index ? ' w:val="false"' : ''}/></w:trPr><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="4800"/></w:tcPr>${paragraph(text)}</w:tc></w:tr>`).join('')}</w:tbl><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`),
  }));
  await writeFile(info.outputPath('row-repeat-source.docx'), bytes);
  await independentView(page, info, bytes, 'row-repeat-independent-source');
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'row-repeat-source.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: bytes });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: row-repeat-source.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const first = editor.locator('tr').first();
  await expect(first).toHaveAttribute('data-fountain-repeat-header', 'true');
  await expect(first.locator('th')).toHaveCount(0);
  await expect(first.locator('td')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(first.locator('td')).toHaveCSS('font-weight', '400');
  await editor.screenshot({ path: info.outputPath('row-repeat-imported.png') });
  await first.getByText('Plain repeating label', { exact: true }).click();
  await workspace.getByRole('button', { name: 'Table options', exact: true }).click();
  const repeat = workspace.getByRole('button', { name: 'Repeat row on pages', exact: true });
  await expect(repeat).toHaveAttribute('aria-pressed', 'true');
  await repeat.click();
  await expect(first).toHaveAttribute('data-fountain-repeat-header', 'false');
  await expect(repeat).toHaveAttribute('aria-pressed', 'false');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(first).toHaveAttribute('data-fountain-repeat-header', 'true');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(first).toHaveAttribute('data-fountain-repeat-header', 'false');
  await repeat.click();
  await expect(first).toHaveAttribute('data-fountain-repeat-header', 'true');
  await workspace.getByRole('button', { name: 'Make/unmake header row', exact: true }).click();
  await expect(first.locator('th')).toHaveCount(1);
  await expect(first).toHaveAttribute('data-fountain-repeat-header', 'true');
  await workspace.getByRole('button', { name: 'Make/unmake header row', exact: true }).click();
  await expect(first.locator('th')).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Close', exact: true }).click();
  await first.getByText('Plain repeating label', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.type(' Reviewed.');
  await editor.screenshot({ path: info.outputPath('row-repeat-edited.png') });
  // JSON is the complete model backup, then native DOCX is checked independently.
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('json');
  let pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const jsonPath = info.outputPath('row-repeat-edited.json'); await (await pending).saveAs(jsonPath);
  const edited = JSON.parse(await readFile(jsonPath, 'utf8')) as NodeJSON;
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  pending = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const output = info.outputPath('row-repeat-export.docx'); await (await pending).saveAs(output);
  const nativeBytes = await readFile(output);
  const reopenedJSON = importLab(nativeBytes, 'docx').document.toJSON();
  expect(reopenedJSON).toEqual(withDOCXExportStyles(edited));
  const nativeXML = strFromU8(unzipSync(nativeBytes)['word/document.xml']!);
  expect(nativeXML.match(/<w:tblHeader\/>/g)).toHaveLength(1);
  expect(nativeXML.match(/<w:tblHeader w:val="false"\/>/g)).toHaveLength(1);
  expect(nativeXML).not.toContain('EDE9FE');
  await page.getByLabel('Choose documents').setInputFiles(output);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: row-repeat-export.docx', exact: true });
  const reopenedEditor = reopened.getByRole('textbox', { name: 'Imported document editor' });
  await expect(reopenedEditor.locator('tr').first()).toHaveAttribute('data-fountain-repeat-header', 'true');
  await expect(reopenedEditor.locator('th')).toHaveCount(0);
  await expect(reopenedEditor).toContainText('Plain repeating label Reviewed.');
  await reopenedEditor.screenshot({ path: info.outputPath('row-repeat-reopened.png') });
  await independentView(page, info, nativeBytes, 'row-repeat-independent-export');
});

for (const useTheme of [false, true]) test(`${useTheme ? 'embedded theme' : 'explicit'} font families and sizes survive real editing and DOCX reopening`, async ({ page }, info) => {
  test.setTimeout(120000);
  const { unzipSync, zipSync, strToU8 } = await import('fflate');
  // A separate direct-formatting fixture, not a rewritten cooling report used
  // to hide its still-missing inherited title/heading styles.
  const sourceArchive = unzipSync(await readFile(fixture));
  const archive: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/_rels/document.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'word/styles.xml': sourceArchive['word/styles.xml']!,
  };
  archive['word/document.xml'] = strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
    <w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="48"/></w:rPr><w:t>Physical font fidelity</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="25"/></w:rPr><w:t>Source remains editable.</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
    </w:body></w:document>`);
  if (useTheme) {
    const { strFromU8 } = await import('fflate');
    archive['word/document.xml'] = strToU8(strFromU8(archive['word/document.xml']!).replace('w:ascii="Times New Roman" w:hAnsi="Times New Roman"', 'w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"').replace('w:ascii="Courier New" w:hAnsi="Courier New"', 'w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"'));
    archive['word/theme/theme1.xml'] = strToU8('<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Research"><a:themeElements><a:fontScheme name="Research"><a:majorFont><a:latin typeface="Times New Roman"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Courier New"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme></a:themeElements></a:theme>');
    archive['word/_rels/document.xml.rels'] = strToU8(strFromU8(archive['word/_rels/document.xml.rels']!).replace('</Relationships>', '<Relationship Id="theme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>'));
    archive['[Content_Types].xml'] = strToU8(strFromU8(archive['[Content_Types].xml']!).replace('</Types>', '<Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>'));
  }
  const bytes = Buffer.from(zipSync(archive));
  await writeFile(info.outputPath('font-source.docx'), bytes);
  await independentView(page, info, bytes, 'font-original');
  expect(await page.getByText('Physical font fidelity', { exact: true }).evaluate(el => getComputedStyle(el).fontFamily)).toContain('Times New Roman');
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'font-source.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: bytes });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: font-source.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const title = editor.getByText('Physical font fidelity', { exact: true });
  await expect(title).toHaveCSS('font-size', '32px');
  expect(await title.evaluate(el => getComputedStyle(el).fontFamily)).toContain('Times New Roman');
  const source = editor.getByText('Source remains editable.', { exact: true });
  expect(await source.evaluate(el => getComputedStyle(el).fontFamily)).toContain('Courier New');
  expect(await source.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(12.5 * 96 / 72, 2);
  await source.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Reviewed.');
  await expect(editor).toContainText('Source remains editable. Reviewed.');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor).not.toContainText('Reviewed.');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor).toContainText('Source remains editable. Reviewed.');
  await editor.screenshot({ path: info.outputPath('font-editor.png') });
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const output = info.outputPath('font-edited.docx');
  await (await download).saveAs(output);
  await expect(workspace.getByLabel('Round-trip result')).toContainText('Exact Fountain document equality');
  await page.getByLabel('Choose documents').setInputFiles(output);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: font-edited.docx', exact: true }).getByRole('textbox', { name: 'Imported document editor' });
  const edited = reopened.getByText('Source remains editable. Reviewed.', { exact: true });
  expect(await edited.evaluate(el => getComputedStyle(el).fontFamily)).toContain('Courier New');
  expect(await edited.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(12.5 * 96 / 72, 2);
  await reopened.screenshot({ path: info.outputPath('font-reopened.png') });
  const rendered = await independentView(page, info, await readFile(output), 'font-exported');
  expect(rendered.pages).toBe(1);
  const nativeTitle = page.getByText('Physical font fidelity', { exact: true });
  await expect(nativeTitle).toHaveCSS('font-size', '32px');
  expect(await nativeTitle.evaluate(el => getComputedStyle(el).fontFamily)).toContain('Times New Roman');
});

test('explicit normal emphasis survives backward toolbar selection, typing, and DOCX reopening', async ({ page }, info) => {
  test.setTimeout(120000);
  // This isolates the editable reset contract. It is not an inherited-style
  // fixture and must not replace the unchanged cooling-report comparison.
  const text = (value: string, size = '12pt', extra: string[] = []) => ({ type: 'text', text: value, marks: [
    { type: 'font_family', attrs: { family: 'Arial' } }, { type: 'font_size', attrs: { size } },
    { type: 'text_color', attrs: { color: '#000000' } }, ...extra.map(type => ({ type })),
  ] });
  const source = { type: 'doc', attrs: { pageSettings: { unit: 'pt', width: 612, height: 792, marginTop: 72, marginRight: 72,
    marginBottom: 72, marginLeft: 72, headerDistance: 36, footerDistance: 36, gutter: 0 } }, content: [
    { type: 'heading', attrs: { level: 1, emphasis: 'explicit' }, content: [text('Normal weight heading', '25pt')] },
    { type: 'blockquote', content: [{ type: 'paragraph', attrs: { emphasis: 'explicit' }, content: [text('Upright quotation')] }] },
    { type: 'paragraph', attrs: { emphasis: 'explicit' }, content: [text('Bold stays bold', '12pt', ['strong']), text(' and italic stays italic', '12pt', ['em'])] },
  ] };
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'emphasis.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: emphasis.json', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const title = editor.locator('h1');
  await expect(title).toHaveCSS('font-weight', '400');
  await expect(editor.locator('blockquote p')).toHaveCSS('font-style', 'normal');
  await editor.screenshot({ path: info.outputPath('emphasis-initial.png') });
  await title.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Normal weight heading');
  const bold = workspace.getByRole('button', { name: 'Bold', exact: true });
  await bold.click();
  await expect(title.locator('strong')).toHaveText('Normal weight heading');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(title.locator('strong')).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(title.locator('strong')).toHaveCount(1);
  await bold.click();
  await expect(title.locator('strong')).toHaveCount(0);
  await title.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('A new editable paragraph.');
  await expect(editor.getByText('A new editable paragraph.', { exact: true })).toBeVisible();
  await expect(editor.locator('p').filter({ hasText: 'A new editable paragraph.' })).toHaveAttribute('data-fountain-emphasis', 'explicit');
  await editor.screenshot({ path: info.outputPath('emphasis-edited.png') });
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const output = info.outputPath('emphasis-edited.docx');
  await (await download).saveAs(output);
  // DOCX canonicalizes the order of these non-conflicting marks and its public
  // Word stylesheet becomes explicit effective paragraph layout on reimport.
  // Keep the lab's exact-equality failure visible, and check the ENTIRE expected
  // tree with those declared export defaults added. Never strip actual data to
  // manufacture a passing result.
  await expect(workspace.getByLabel('Round-trip result')).toContainText('The reopened Fountain document differs');
  await workspace.getByRole('checkbox', { name: 'Include filename, document content and my note in the downloaded report' }).check();
  const reportDownload = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download diagnostic report' }).click();
  const reportPath = info.outputPath('emphasis-report.json');
  await (await reportDownload).saveAs(reportPath);
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const reopenedJSON = importLab(await readFile(output), 'docx').document.toJSON();
  const normalizeKnownMarkOrder = (node: NodeJSON): NodeJSON => {
    if (node.marks?.some(mark => !['font_family', 'font_size', 'text_color', 'strong', 'em'].includes(mark.type))) throw new Error('Unexpected mark: this fixture cannot assume it commutes.');
    return { ...node, ...(node.marks ? { marks: [...node.marks].sort((a, b) => a.type.localeCompare(b.type)) } : {}),
      ...(node.content ? { content: node.content.map(normalizeKnownMarkOrder) } : {}) };
  };
  expect(reopenedJSON).not.toEqual(report.editedDocument);
  const expectedReopened = withDOCXExportStyles(report.editedDocument);
  expect(normalizeKnownMarkOrder(reopenedJSON)).toEqual(normalizeKnownMarkOrder(expectedReopened));
  await writeFile(info.outputPath('emphasis-round-trip.json'), JSON.stringify({
    exactEquality: false,
    knownExportPresentationAndMarkOrderOnly: true,
    expectedReopenedDocument: expectedReopened,
    reopenedDocument: reopenedJSON,
  }, null, 2));
  await page.getByLabel('Choose documents').setInputFiles(output);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: emphasis-edited.docx', exact: true }).getByRole('textbox', { name: 'Imported document editor' });
  await expect(reopened.locator('h1')).toHaveCSS('font-weight', '400');
  await expect(reopened.locator('blockquote p')).toHaveCSS('font-style', 'normal');
  await expect(reopened).toContainText('A new editable paragraph.');
  await reopened.screenshot({ path: info.outputPath('emphasis-reopened.png') });
  const rendered = await independentView(page, info, await readFile(output), 'emphasis-exported');
  expect(rendered.pages).toBe(1);
  await expect(page.getByText('Normal weight heading', { exact: true })).toHaveCSS('font-weight', '400');
  await expect(page.getByText('Upright quotation', { exact: true })).toHaveCSS('font-style', 'normal');
  await expect(page.getByText('Bold stays bold', { exact: true })).toHaveCSS('font-weight', '700');
  await expect(page.getByText(' and italic stays italic', { exact: true })).toHaveCSS('font-style', 'italic');
});

test('keeps a Word image caption attached, richly editable, linked, and exportable', async ({ page }, info) => {
  test.setTimeout(120000);
  const { strFromU8, strToU8, unzipSync, zipSync } = await import('fflate');
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const drawing = `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="3048000" cy="1714500"/><wp:docPr id="1" name="evidence.png" descr="Evidence plot" title="Measured output"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="evidence.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3048000" cy="1714500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const bytes = Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/_rels/document.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/evidence.png"/><Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/evidence" TargetMode="External"/></Relationships>'),
    'word/media/evidence.png': pixel,
    'word/document.xml': strToU8(`<w:document xmlns:w="${word}" xmlns:r="${rel}"><w:body><w:p>${drawing}</w:p><w:p><w:pPr><w:pStyle w:val="Caption"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Measured </w:t></w:r><w:hyperlink r:id="rIdLink"><w:r><w:t>evidence</w:t></w:r></w:hyperlink></w:p><w:sectPr/></w:body></w:document>`),
  }));
  await writeFile(info.outputPath('rich-caption-source.docx'), bytes);
  const original = await independentView(page, info, bytes, 'rich-caption-original');
  expect(original.images).toBe(1);
  expect(original.text).toContain('Measured evidence');

  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'rich-caption.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: bytes });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: rich-caption.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const figure = editor.locator('.fountain-image');
  await expect(figure.locator('img')).toHaveAttribute('alt', 'Evidence plot');
  await expect(figure).toHaveAttribute('data-align', 'left');
  await expect(figure.locator('figcaption')).toHaveCSS('text-align', 'left');
  await expect(figure.locator('figcaption strong')).toHaveText('Measured ');
  await expect(figure.locator('figcaption a')).toHaveAttribute('href', 'https://example.com/evidence');
  const caption = figure.locator('figcaption');
  await caption.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' reviewed');
  await expect(caption).toContainText('Measured evidence reviewed');
  await editor.screenshot({ path: info.outputPath('rich-caption-edited.png') });

  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const output = info.outputPath('rich-caption-export.docx');
  await (await download).saveAs(output);
  const exportedBytes = await readFile(output);
  const archive = unzipSync(exportedBytes);
  const xml = strFromU8(archive['word/document.xml']!);
  expect(xml).toContain('<w:pStyle w:val="Caption"/>');
  expect(xml).toContain('<w:b/>');
  expect(xml).toContain('<w:hyperlink');
  expect(strFromU8(archive['word/_rels/document.xml.rels']!)).toContain('Target="https://example.com/evidence"');

  await page.getByLabel('Choose documents').setInputFiles(output);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: rich-caption-export.docx', exact: true });
  const reopenedFigure = reopened.locator('.fountain-image');
  await expect(reopenedFigure.locator('figcaption')).toContainText('Measured evidence reviewed');
  await expect(reopenedFigure.locator('figcaption strong')).toHaveText('Measured ');
  await expect(reopenedFigure.locator('figcaption')).toHaveCSS('text-align', 'left');
  await expect(reopenedFigure.locator('figcaption em')).toHaveCount(0);
  await expect(reopenedFigure.locator('figcaption a')).toHaveAttribute('href', 'https://example.com/evidence');
  await reopened.getByRole('textbox', { name: 'Imported document editor' }).screenshot({ path: info.outputPath('rich-caption-reopened.png') });
  const exported = await independentView(page, info, exportedBytes, 'rich-caption-exported');
  expect(exported.images).toBe(1);
  expect(exported.text).toContain('Measured evidence reviewed');
});

test('keeps fixed Word columns stable while editing long content and reopening the export', async ({ page }, info) => {
  const { zipSync, unzipSync, strToU8, strFromU8 } = await import('fflate');
  const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const source = Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<w:document xmlns:w="${word}"><w:body><w:tbl>
      <w:tblPr><w:tblW w:w="6000" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>
      <w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="3600"/></w:tblGrid>
      <w:tr><w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Fixed scientific measurements</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:trPr><w:tblHeader w:val="0"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Measurement</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="3600" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Stable second column</w:t></w:r></w:p></w:tc></w:tr>
      </w:tbl><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`),
  }));
  await writeFile(info.outputPath('fixed-table-source.docx'), source);
  const original = await independentView(page, info, source, 'fixed-table-original');
  expect(original.tableWidth).toBeCloseTo(400, 0);
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'fixed-table.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: source });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: fixed-table.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const table = editor.locator('table');
  await expect(table).toHaveCSS('table-layout', 'fixed');
  await expect(table).toHaveCSS('border-top-width', '0px');
  await expect(table.locator('td').first()).toHaveCSS('border-bottom-width', '0px');
  await expect(table.locator('td').first()).toHaveCSS('padding-left', '0px');
  await expect(table.locator('.fountain-table-cell__content').first()).toHaveCSS('padding-left', '0px');
  await expect(table.locator('th')).toHaveCount(0);
  await expect(table.locator('tr').last().locator('td')).toHaveCount(2);
  const widths = async () => table.locator('tr').last().locator('td').evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().width));
  const initial = await widths();
  expect(initial[0]).toBeCloseTo(160, 0);
  expect(initial[1]).toBeCloseTo(240, 0);
  await editor.getByText('Measurement', { exact: true }).click();
  await page.keyboard.press('End');
  const appended = 'LongUnbrokenMeasurementValue'.repeat(6);
  await page.keyboard.type(appended);
  await expect(table).toContainText('Measurement' + appended);
  expect(await widths()).toEqual(initial);
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(table).not.toContainText(appended);
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(table).toContainText(appended);
  expect(await widths()).toEqual(initial);
  await editor.screenshot({ path: info.outputPath('fixed-table-edited.png') });
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const output = info.outputPath('fixed-table-export.docx');
  await (await download).saveAs(output);
  const bytes = await readFile(output);
  expect(strFromU8(unzipSync(bytes)['word/document.xml']!)).toContain('<w:tblLayout w:type="fixed"/>');
  expect(strFromU8(unzipSync(bytes)['word/document.xml']!)).not.toContain('<w:tblHeader');
  expect(strFromU8(unzipSync(bytes)['word/document.xml']!)).not.toMatch(/<w:(tblBorders|tblCellMar|tblStyle)/);
  await page.getByLabel('Choose documents').setInputFiles(output);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: fixed-table-export.docx', exact: true });
  await expect(reopened.locator('table')).toHaveCSS('table-layout', 'fixed');
  await expect(reopened.locator('table th')).toHaveCount(0);
  await expect(reopened.locator('table')).toContainText(appended);
  const reopenedWidths = await reopened.locator('tr').last().locator('td').evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().width));
  expect(reopenedWidths).toEqual(initial);
  await reopened.getByRole('textbox', { name: 'Imported document editor' }).screenshot({ path: info.outputPath('fixed-table-reopened.png') });
  const exported = await independentView(page, info, bytes, 'fixed-table-exported');
  // docx-preview reads w:val instead of the standard w:type in tblLayout.
  // Keep its unmodified rendering as evidence of this external limitation;
  // it cannot certify native fixed-layout geometry. Once corrected upstream,
  // the real rendered widths must pass the same geometry gate.
  if (exported.tableLayout === 'fixed') {
    expect(Math.abs(exported.tableWidth! - original.tableWidth!)).toBeLessThanOrEqual(2);
  } else {
    expect(exported.tableLayout).toBe('auto');
    await writeFile(info.outputPath('fixed-table-native-verification-pending.json'), JSON.stringify({
      status: 'native-visual-unverified', renderer: 'docx-preview',
      reason: 'valueOfTblLayout reads w:val; OOXML TableLayout requires w:type.',
      sourceWidth: original.tableWidth, exportedPreviewWidth: exported.tableWidth,
      nativeLayoutXML: '<w:tblLayout w:type="fixed"/>',
    }, null, 2));
  }
  expect(exported.text).toContain(appended);
});

for (const preference of [{ label: 'physical width', unit: 'pt', amount: 7200, css: '360pt' }, { label: 'percentage width', unit: 'percent', amount: 3000, css: '60%' }] as const) test(`preserves direct table borders and padding through real typing, undo, download and reopen (${preference.label})`, async ({ page }, info) => {
  test.setTimeout(120000);
  const { zipSync, strToU8, unzipSync, strFromU8 } = await import('fflate');
  const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const p = (value: string) => `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr><w:t>${value}</w:t></w:r></w:p>`;
  const tc = (value: string, properties = '') => `<w:tc><w:tcPr><w:tcW w:w="3600" w:type="dxa"/>${properties}</w:tcPr>${p(value)}</w:tc>`;
  const source = Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<w:document xmlns:w="${word}"><w:body>${p('Direct table appearance')}<w:tbl><w:tblPr><w:tblW w:w="${preference.amount}" w:type="${preference.unit === 'pt' ? 'dxa' : 'pct'}"/>
      <w:tblBorders><w:top w:val="single" w:sz="12" w:color="175B48"/><w:left w:val="single" w:sz="12" w:color="175B48"/><w:bottom w:val="single" w:sz="12" w:color="175B48"/><w:right w:val="single" w:sz="12" w:color="175B48"/><w:insideH w:val="dotted" w:sz="6" w:color="526A80"/><w:insideV w:val="single" w:sz="6" w:color="526A80"/></w:tblBorders>
      <w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="240" w:type="dxa"/></w:tblCellMar></w:tblPr>
      <w:tblGrid><w:gridCol w:w="3600"/><w:gridCol w:w="3600"/></w:tblGrid>
      <w:tr>${tc('Sample A', '<w:tcBorders><w:top w:val="nil"/></w:tcBorders><w:shd w:val="clear" w:fill="E4F2ED"/><w:tcMar><w:left w:w="40" w:type="dxa"/></w:tcMar>')}${tc('Measured temperature')}</w:tr>
      <w:tr>${tc('Sample B')}${tc('Control temperature')}</w:tr></w:tbl>${p('Source borders and cell margins are explicit.')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`),
  }));
  await writeFile(info.outputPath('appearance-source.docx'), source);
  await independentView(page, info, source, 'appearance-original');
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'appearance-source.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: source });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: appearance-source.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  expect(await editor.locator('table').evaluate(el => (el as HTMLElement).style.width)).toBe(preference.css);
  const geometry = async (target: typeof editor) => target.evaluate(el => {
    const style = getComputedStyle(el);
    const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return { available, width: el.querySelector('table')!.getBoundingClientRect().width };
  });
  const importedGeometry = await geometry(editor);
  expect(importedGeometry.width).toBeCloseTo(preference.unit === 'pt' ? 480 : importedGeometry.available * 0.6, 0);
  // Numeric CSS serialization differs slightly between engines.
  const firstCell = editor.locator('td').first();
  await expect(firstCell).toHaveCSS('border-top-style', 'hidden');
  expect(await firstCell.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))).toBeCloseTo(2 * 96 / 72, 3);
  await expect(editor.locator('td').nth(1)).toHaveCSS('border-top-width', '2px');
  expect(await editor.locator('td').nth(1).evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))).toBeCloseTo(8 * 96 / 72, 3);
  await expect(editor.locator('td').nth(2)).toHaveCSS('border-top-style', 'dotted');
  await editor.getByText('Measured temperature', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.type(' reviewed');
  await expect(editor).toContainText('Measured temperature reviewed');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor).not.toContainText('reviewed');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor).toContainText('Measured temperature reviewed');
  await editor.screenshot({ path: info.outputPath('appearance-edited.png') });
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const output = info.outputPath('appearance-export.docx'); await (await download).saveAs(output);
  const bytes = await readFile(output);
  const native = strFromU8(unzipSync(bytes)['word/document.xml']!);
  expect(native).toContain(`<w:tblW w:w="${preference.amount}" w:type="${preference.unit === 'pt' ? 'dxa' : 'pct'}"/>`);
  expect(native).toContain('<w:top w:val="nil"/>');
  expect(native).toContain('<w:top w:w="0" w:type="dxa"/>');
  expect(native).toContain('w:color="175B48"');
  expect(native).not.toContain('w:color="C9C2D8"');
  await page.getByLabel('Choose documents').setInputFiles(output);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: appearance-export.docx', exact: true }).getByRole('textbox', { name: 'Imported document editor' });
  expect(await reopened.locator('table').evaluate(el => (el as HTMLElement).style.width)).toBe(preference.css);
  const reopenedGeometry = await geometry(reopened);
  expect(reopenedGeometry.width).toBeCloseTo(preference.unit === 'pt' ? 480 : reopenedGeometry.available * 0.6, 0);
  await writeFile(info.outputPath('appearance-geometry.json'), JSON.stringify({ imported: importedGeometry, reopened: reopenedGeometry }, null, 2));
  await expect(reopened).toContainText('Measured temperature reviewed');
  await expect(reopened.locator('td').first()).toHaveCSS('border-top-style', 'hidden');
  expect(await reopened.locator('td').first().evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))).toBeCloseTo(2 * 96 / 72, 3);
  await expect(reopened.locator('td').nth(1)).toHaveCSS('border-top-color', 'rgb(23, 91, 72)');
  await expect(reopened.locator('td').nth(2)).toHaveCSS('border-top-style', 'dotted');
  await reopened.screenshot({ path: info.outputPath('appearance-reopened.png') });
  const exported = await independentView(page, info, bytes, 'appearance-exported');
  expect(exported.text).toContain('Measured temperature reviewed');
});

for (const scenario of [
  { name: 'omitted Word width', native: true, fixed: false },
  { name: 'omitted fixed Word width', native: true, fixed: true },
  { name: 'fresh full-width Fountain table', native: false, fixed: false },
  { name: 'fresh fixed-grid Fountain table', native: false, fixed: true },
]) test(`default table sizing survives real edit, export and reopen (${scenario.name})`, async ({ page }, info) => {
  test.setTimeout(120000);
  const { zipSync, strToU8, unzipSync, strFromU8 } = await import('fflate');
  const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const document: NodeJSON = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Default table sizing audit' }] },
    { type: 'table', attrs: scenario.fixed ? { layout: 'fixed' } : {}, content: [{ type: 'table_row', content: [
      { type: 'table_cell', attrs: { colwidth: [120] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sample A' }] }] },
      { type: 'table_cell', attrs: { colwidth: [180] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Temperature' }] }] },
    ] }] },
  ] };
  const source = scenario.native ? Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<w:document xmlns:w="${word}"><w:body>${p('Default table sizing audit')}<w:tbl>${scenario.fixed ? '<w:tblPr><w:tblLayout w:type="fixed"/></w:tblPr>' : ''}<w:tblGrid><w:gridCol w:w="1800"/><w:gridCol w:w="2700"/></w:tblGrid><w:tr><w:tc>${p('Sample A')}</w:tc><w:tc>${p('Temperature')}</w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>`),
  })) : Buffer.from(JSON.stringify(document));
  const filename = scenario.native ? 'default-source.docx' : 'default-source.json';
  await writeFile(info.outputPath(filename), source);
  if (scenario.native) await independentView(page, info, source, 'default-original');
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles({ name: filename, mimeType: scenario.native ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/json', buffer: source });
  const workspace = page.getByRole('region', { name: `Conversion workspace: ${filename}`, exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const geometry = async (target: typeof editor) => target.evaluate(el => {
    const style = getComputedStyle(el), table = el.querySelector('table')!;
    return { available: el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), width: table.getBoundingClientRect().width,
      preference: table.getAttribute('data-fountain-table-preferred-width'), css: (table as HTMLElement).style.width };
  });
  const before = await geometry(editor);
  if (scenario.native) {
    expect(before.preference).toBe(JSON.stringify({ unit: 'auto' }));
    expect(before.css).toBe('auto');
    expect(before.width).toBeLessThan(before.available * 0.8);
  } else {
    expect(before.preference).toBeNull();
    expect(before.width).toBeCloseTo(scenario.fixed ? 300 : before.available, 0);
  }
  await editor.getByText('Temperature', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.type(' tested');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor).not.toContainText('Temperature tested');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor).toContainText('Temperature tested');
  await editor.screenshot({ path: info.outputPath('default-edited.png') });
  const edited = await geometry(editor);
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const output = info.outputPath('default-export.docx'); await (await download).saveAs(output);
  const bytes = await readFile(output), native = strFromU8(unzipSync(bytes)['word/document.xml']!);
  expect(native).toContain(scenario.native ? '<w:tblW w:w="0" w:type="auto"/>' : scenario.fixed ? '<w:tblW w:w="4500" w:type="dxa"/>' : '<w:tblW w:w="5000" w:type="pct"/>');
  const defaultReports = importLab(source, scenario.native ? 'docx' : 'json');
  expect(defaultReports.document.child(1).attrs.preferredWidth).toEqual(scenario.native ? { unit: 'auto' } : undefined);
  await page.getByLabel('Choose documents').setInputFiles(output);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: default-export.docx', exact: true }).getByRole('textbox', { name: 'Imported document editor' });
  await expect(reopened).toContainText('Temperature tested');
  const after = await geometry(reopened);
  expect(after.width).toBeCloseTo(edited.width, 0);
  expect(after.preference).toBe(JSON.stringify(scenario.native ? { unit: 'auto' } : scenario.fixed ? { unit: 'pt', value: 225 } : { unit: 'percent', value: 100 }));
  await reopened.screenshot({ path: info.outputPath('default-reopened.png') });
  await writeFile(info.outputPath('default-geometry.json'), JSON.stringify({ before, edited, reopened: after }, null, 2));
  const exported = await independentView(page, info, bytes, 'default-exported');
  expect(exported.text).toContain('Temperature tested');
});

for (const partial of [false, true]) test(`native paragraph spacing survives real editing, HTML and DOCX reopen (${partial ? 'partial inherited spacing' : 'omitted spacing'})`, async ({ page }, info) => {
  test.setTimeout(120000);
  const { zipSync, strToU8, unzipSync, strFromU8 } = await import('fflate');
  const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const p = (content: string) => `<w:p><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="24"/></w:rPr>${content}</w:r></w:p>`;
  const source = Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' + (partial ? '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' : '') + '</Types>'),
    '_rels/.rels': strToU8(`<Relationships xmlns="${rels}"><Relationship Id="doc" Type="${office}/officeDocument" Target="word/document.xml"/></Relationships>`),
    ...(partial ? {
      'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${rels}"><Relationship Id="styles" Type="${office}/styles" Target="styles.xml"/></Relationships>`),
      'word/styles.xml': strToU8(`<w:styles xmlns:w="${word}"><w:docDefaults><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`),
    } : {}),
    'word/document.xml': strToU8(`<w:document xmlns:w="${word}"><w:body>${p('<w:t>Paragraph spacing audit</w:t>')}${p('<w:t>Source spacing remains editable.</w:t><w:br/><w:t>Second line remains attached.</w:t>')}${p('<w:t>Following paragraph.</w:t>')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`),
  }));
  await writeFile(info.outputPath('spacing-source.docx'), source);
  await independentView(page, info, source, 'spacing-original');
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'spacing-source.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: source });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: spacing-source.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const geometry = async (target: ReturnType<Page['locator']>) => target.locator('p').evaluateAll(items => items.map(el => {
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    return { layout: el.getAttribute('data-fountain-paragraph-layout'), before: style.marginTop,
      after: style.marginBottom, line: style.lineHeight, font: style.fontSize, height: rect.height };
  }));
  const sameGeometry = (actual: Awaited<ReturnType<typeof geometry>>, expected: Awaited<ReturnType<typeof geometry>>) => {
    expect(actual).toHaveLength(expected.length);
    actual.forEach(({ height, ...properties }, index) => {
      const { height: expectedHeight, ...expectedProperties } = expected[index]!;
      expect(properties).toEqual(expectedProperties);
      // Browser layout coordinates are quantized to subpixels. Keep semantic
      // CSS/data equality exact, allowing at most one 1/64px layout quantum.
      expect(Math.abs(height - expectedHeight)).toBeLessThanOrEqual(1 / 64);
    });
  };
  const clickLastLine = async () => {
    const paragraph = editor.locator('p').nth(1), box = await paragraph.boundingBox();
    expect(box).not.toBeNull();
    await paragraph.click({ position: { x: 80, y: box!.height - 4 } });
  };
  const initial = await geometry(editor);
  expect(initial).toHaveLength(3);
  for (const paragraph of initial) {
    expect(JSON.parse(paragraph.layout!)).toEqual({ unit: 'pt', spacingBefore: 0, spacingAfter: partial ? 8 : 0,
      lineHeight: partial ? 1.15 : 1, lineHeightUnit: 'multiple', lineHeightRule: 'auto',
      keepWithNext: false, keepLinesTogether: false, pageBreakBefore: false });
    expect(paragraph.before).toBe('0px');
    expect(Math.abs(parseFloat(paragraph.after) - (partial ? 8 * 4 / 3 : 0))).toBeLessThanOrEqual(1 / 64);
    expect(Math.abs(parseFloat(paragraph.line) - 16 * (partial ? 1.15 : 1))).toBeLessThanOrEqual(1 / 64);
  }
  await editor.screenshot({ path: info.outputPath('spacing-imported.png') });
  await clickLastLine();
  await page.keyboard.press('End'); await page.keyboard.type(' Reviewed.');
  await expect(editor).toContainText('Second line remains attached. Reviewed.');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor).not.toContainText('Reviewed.');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor).toContainText('Reviewed.');
  // Exercise native keyboard input with retained geometry, not only APIs.
  await clickLastLine(); await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(editor.locator('p')).toHaveCount(4);
  expect((await geometry(editor))[2]!.layout).toBe(initial[1]!.layout);
  await page.keyboard.press('Backspace');
  await expect(editor.locator('p')).toHaveCount(3);
  const edited = await geometry(editor);
  sameGeometry(edited, initial);
  await editor.screenshot({ path: info.outputPath('spacing-edited.png') });

  for (const format of ['html', 'docx']) {
    await page.getByRole('navigation', { name: 'Imported files' }).getByRole('button', { name: 'spacing-source.docx', exact: true }).click();
    await workspace.getByRole('combobox', { name: 'Export format' }).selectOption(format);
    const download = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const output = info.outputPath(`spacing-export.${format}`); await (await download).saveAs(output);
    const bytes = await readFile(output);
    if (format === 'docx') {
      const xml = strFromU8(unzipSync(bytes)['word/document.xml']!);
      expect(xml.match(/<w:spacing w:before="0" w:after="(?:0|160)" w:line="(?:240|276)" w:lineRule="auto"\/>/g)).toHaveLength(3);
      await expect(workspace.getByLabel('Round-trip result')).toContainText('paragraph-font-defaulted');
    }
    await page.getByLabel('Choose documents').setInputFiles(output);
    const reopened = page.getByRole('region', { name: `Conversion workspace: spacing-export.${format}`, exact: true }).getByRole('textbox', { name: 'Imported document editor' });
    await expect(reopened).toContainText('Second line remains attached. Reviewed.');
    const after = await geometry(reopened);
    // Preserve evidence even when physical fidelity fails. An unknown
    // paragraph baseline must not be silently relabeled "retained".
    await reopened.screenshot({ path: info.outputPath(`spacing-${format}-reopened.png`) });
    await writeFile(info.outputPath(`spacing-${format}-geometry.json`), JSON.stringify({ initial, edited, reopened: after }, null, 2));
    if (format === 'html') sameGeometry(after, edited);
    else {
      // The original source deliberately declares no paragraph font. Word's
      // generated Normal style supplies Arial 11pt on export, now exposed in
      // the model instead of silently inheriting the host's 12pt line strut.
      // Keep every known spacing property and actual line height comparison;
      // assert the newly resolved default explicitly rather than erase it.
      expect(after).toHaveLength(edited.length);
      after.forEach((item, index) => {
        const original = edited[index]!;
        expect(JSON.parse(item.layout!)).toEqual({ ...JSON.parse(original.layout!), fontFamily: 'Arial', fontSize: 11 });
        expect(item.before).toBe(original.before); expect(item.after).toBe(original.after);
        expect(Math.abs(parseFloat(item.font) - 11 * 4 / 3)).toBeLessThanOrEqual(1 / 64);
        expect(Math.abs(parseFloat(item.line) - 11 * 4 / 3 * (partial ? 1.15 : 1))).toBeLessThanOrEqual(1 / 64);
        expect(Math.abs(item.height - original.height)).toBeLessThanOrEqual(1 / 64);
      });
    }
    if (format === 'docx') await independentView(page, info, bytes, 'spacing-exported');
  }
});

test('paragraph font context survives empty-line typing, mixed fonts and HTML/DOCX reopen', async ({ page }, info) => {
  test.setTimeout(120000);
  const { zipSync, strToU8, unzipSync, strFromU8 } = await import('fflate');
  const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const font = (family: string, points: number) => `<w:rFonts w:ascii="${family}" w:hAnsi="${family}"/><w:sz w:val="${points * 2}"/>`;
  const run = (text: string, properties = '') => `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t>${text}</w:t></w:r>`;
  const base = '<w:pPr><w:pStyle w:val="Base"/></w:pPr>';
  const source = Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8(`<Relationships xmlns="${rels}"><Relationship Id="doc" Type="${office}/officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${rels}"><Relationship Id="styles" Type="${office}/styles" Target="styles.xml"/></Relationships>`),
    'word/styles.xml': strToU8(`<w:styles xmlns:w="${word}"><w:docDefaults><w:rPrDefault><w:rPr>${font('Arial', 12)}</w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Base"><w:rPr>${font('Georgia', 18)}</w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:basedOn w:val="Base"/><w:rPr><w:sz w:val="48"/></w:rPr></w:style></w:styles>`),
    'word/document.xml': strToU8(`<w:document xmlns:w="${word}"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run('Paragraph font context')}</w:p><w:p>${base}${run('Small', font('Courier New', 9))}${run(' and ')}${run('large', font('Arial', 28))}</w:p><w:p>${base}</w:p><w:p><w:pPr><w:pStyle w:val="Base"/><w:rPr>${font('Arial', 26)}</w:rPr></w:pPr>${run('Paragraph mark differs from body.')}</w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`),
  }));
  await writeFile(info.outputPath('context-source.docx'), source);
  await independentView(page, info, source, 'context-original');
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'context-source.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: source });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: context-source.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const geometry = async (target: ReturnType<Page['locator']>) => target.locator('h1,p').evaluateAll(items => items.map(el => {
    const style = getComputedStyle(el);
    return { layout: JSON.parse(el.getAttribute('data-fountain-paragraph-layout')!), font: style.fontFamily, size: style.fontSize,
      line: style.lineHeight, height: el.getBoundingClientRect().height, text: el.textContent };
  }));
  const initial = await geometry(editor);
  expect(initial.map(item => [item.layout.fontFamily, item.layout.fontSize])).toEqual([['Georgia', 24], ['Georgia', 18], ['Georgia', 18], ['Arial', 26]]);
  for (const [index, points] of [24, 18, 18, 26].entries()) {
    expect(Math.abs(parseFloat(initial[index]!.size) - points * 4 / 3)).toBeLessThanOrEqual(1 / 64);
    expect(Math.abs(parseFloat(initial[index]!.line) - points * 4 / 3)).toBeLessThanOrEqual(1 / 64);
  }
  await expect(editor.getByText('Small', { exact: true })).toHaveCSS('font-size', '12px');
  expect(await editor.getByText('large', { exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(28 * 4 / 3, 2);
  await expect(editor.getByText('Paragraph mark differs from body.', { exact: true })).toHaveCSS('font-size', '24px');
  await editor.screenshot({ path: info.outputPath('context-initial-empty.png') });
  const empty = editor.locator('p').nth(1);
  await empty.click(); await page.keyboard.type('Inserted note.');
  await expect(empty).toHaveText('Inserted note.');
  await expect(empty).toHaveCSS('font-size', '24px');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(empty).not.toContainText('Inserted note.');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(empty).toHaveText('Inserted note.');
  await empty.click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(editor.locator('p')).toHaveCount(4);
  const split = await geometry(editor);
  expect(split[3]!.layout).toEqual(initial[2]!.layout);
  await editor.screenshot({ path: info.outputPath('context-split-empty.png') });
  await page.keyboard.press('Backspace');
  await expect(editor.locator('p')).toHaveCount(3);
  await expect(empty).toHaveText('Inserted note.');
  const edited = await geometry(editor);
  edited.forEach(({ height, text, ...rest }, index) => {
    const { height: originalHeight, text: originalText, ...original } = initial[index]!;
    expect(rest).toEqual(original);
    expect(Math.abs(height - originalHeight)).toBeLessThanOrEqual(1 / 64);
    expect(text).toBe(index === 2 ? 'Inserted note.' : originalText);
  });
  await editor.screenshot({ path: info.outputPath('context-edited.png') });
  for (const format of ['html', 'docx']) {
    await page.getByRole('navigation', { name: 'Imported files' }).getByRole('button', { name: 'context-source.docx', exact: true }).click();
    await workspace.getByRole('combobox', { name: 'Export format' }).selectOption(format);
    const download = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const output = info.outputPath(`context-export.${format}`); await (await download).saveAs(output);
    const bytes = await readFile(output);
    if (format === 'docx') {
      const xml = strFromU8(unzipSync(bytes)['word/document.xml']!);
      const paragraphs = xml.match(/<w:p>[\s\S]*?<\/w:p>/g)!;
      expect(paragraphs).toHaveLength(4);
      for (const [index, [family, points]] of [['Georgia', 24], ['Georgia', 18], ['Georgia', 18], ['Arial', 26]].entries()) {
        expect(paragraphs[index]!.split('</w:pPr>')[0]).toContain(font(String(family), Number(points)));
      }
      for (const index of [2, 3]) {
        const body = paragraphs[index]!.split('</w:pPr>')[1]!;
        const properties = body.match(/^<w:r><w:rPr>(.*?)<\/w:rPr>/)![1]!;
        expect(properties).toContain(font('Georgia', 18));
        expect(properties.match(/<w:rFonts /g)).toHaveLength(1);
        expect(properties.match(/<w:sz /g)).toHaveLength(1);
        expect(body).toContain(`<w:t>${index === 2 ? 'Inserted note.' : 'Paragraph mark differs from body.'}</w:t>`);
      }
    }
    await page.getByLabel('Choose documents').setInputFiles(output);
    const reopened = page.getByRole('region', { name: `Conversion workspace: context-export.${format}`, exact: true }).getByRole('textbox', { name: 'Imported document editor' });
    const after = await geometry(reopened);
    expect(after).toHaveLength(edited.length);
    after.forEach(({ height, ...rest }, index) => {
      const { height: expectedHeight, ...expected } = edited[index]!;
      expect(rest).toEqual(expected);
      expect(Math.abs(height - expectedHeight)).toBeLessThanOrEqual(1 / 64);
    });
    await expect(reopened.getByText('Small', { exact: true })).toHaveCSS('font-size', '12px');
    await expect(reopened.getByText('Paragraph mark differs from body.', { exact: true })).toHaveCSS('font-size', '24px');
    await reopened.screenshot({ path: info.outputPath(`context-${format}-reopened.png`) });
    await writeFile(info.outputPath(`context-${format}-geometry.json`), JSON.stringify({ initial, edited, reopened: after }, null, 2));
    if (format === 'docx') await independentView(page, info, bytes, 'context-exported');
  }
});

test('line-break run formatting survives real Shift+Enter, editing and HTML/DOCX reopen', async ({ page }, info) => {
  const { zipSync, strToU8, unzipSync, strFromU8 } = await import('fflate');
  const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const source = Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8(`<Relationships xmlns="${rels}"><Relationship Id="doc" Type="${office}/officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${rels}"><Relationship Id="styles" Type="${office}/styles" Target="styles.xml"/></Relationships>`),
    'word/styles.xml': strToU8(`<w:styles xmlns:w="${word}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="28"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`),
    'word/document.xml': strToU8(`<w:document xmlns:w="${word}"><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="18"/><w:b/><w:i/></w:rPr><w:t>Before</w:t><w:br/><w:cr/><w:t>After</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`),
  }));
  await writeFile(info.outputPath('break-source.docx'), source);
  await independentView(page, info, source, 'break-original');
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'break-source.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: source });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: break-source.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const breaks = async (target: ReturnType<Page['locator']>, count: number) => {
    await expect(target.locator('p br')).toHaveCount(count);
    for (const item of await target.locator('p br').all()) {
      await expect(item).toHaveCSS('font-size', '12px');
      await expect(item).toHaveCSS('font-weight', '700');
      await expect(item).toHaveCSS('font-style', 'italic');
      expect(await item.evaluate(el => getComputedStyle(el).fontFamily)).toContain('Courier New');
    }
  };
  await breaks(editor, 2);
  await editor.screenshot({ path: info.outputPath('break-imported.png') });
  await editor.getByText('After', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.type('. Reviewed.');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor).not.toContainText('Reviewed.');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await editor.getByText('After. Reviewed.', { exact: true }).click();
  // Observe native events without substituting synthetic input for the user.
  await editor.evaluate(el => {
    const events: object[] = [];
    (el as HTMLElement & { breakAuditEvents?: object[] }).breakAuditEvents = events;
    el.addEventListener('keydown', event => {
      const key = event as KeyboardEvent;
      if (key.key === 'Enter') events.push({ event: 'keydown', key: key.key, shift: key.shiftKey, composing: key.isComposing });
    }, { capture: true });
    el.addEventListener('beforeinput', event => {
      const input = event as InputEvent;
      if (input.inputType !== 'insertText' || input.data?.includes('\n')) events.push({ event: 'beforeinput', type: input.inputType, data: input.data });
    }, { capture: true });
  });
  await page.keyboard.press('End'); await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Final line.');
  await expect(editor).toContainText('Final line.');
  await writeFile(info.outputPath('break-input-diagnostics.json'), JSON.stringify(await editor.evaluate(el => ({
    events: (el as HTMLElement & { breakAuditEvents?: object[] }).breakAuditEvents, html: el.innerHTML,
  })), null, 2));
  await breaks(editor, 3);
  const paragraph = editor.locator('p');
  const height = await paragraph.evaluate(el => el.getBoundingClientRect().height);
  await editor.screenshot({ path: info.outputPath('break-edited.png') });
  for (const format of ['html', 'docx']) {
    await page.getByRole('navigation', { name: 'Imported files' }).getByRole('button', { name: 'break-source.docx', exact: true }).click();
    await workspace.getByRole('combobox', { name: 'Export format' }).selectOption(format);
    const pending = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const path = info.outputPath(`break-export.${format}`); await (await pending).saveAs(path);
    const bytes = await readFile(path);
    if (format === 'docx') {
      const xml = strFromU8(unzipSync(bytes)['word/document.xml']!);
      const properties = [...xml.matchAll(/<w:r><w:rPr>(.*?)<\/w:rPr><w:br\/>/g)].map(match => match[1]!);
      expect(properties).toHaveLength(3);
      for (const value of properties) {
        expect(value).toContain('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>');
        expect(value).toContain('<w:sz w:val="18"/>'); expect(value).toContain('<w:b/>'); expect(value).toContain('<w:i/>');
      }
    }
    await page.getByLabel('Choose documents').setInputFiles(path);
    const reopened = page.getByRole('region', { name: `Conversion workspace: break-export.${format}`, exact: true }).getByRole('textbox', { name: 'Imported document editor' });
    await breaks(reopened, 3);
    await expect(reopened).toContainText('After. Reviewed.'); await expect(reopened).toContainText('Final line.');
    expect(Math.abs(await reopened.locator('p').evaluate(el => el.getBoundingClientRect().height) - height)).toBeLessThanOrEqual(1 / 64);
    await reopened.screenshot({ path: info.outputPath(`break-${format}-reopened.png`) });
    if (format === 'docx') await independentView(page, info, bytes, 'break-exported');
  }
});

test('character spacing survives backward toolbar editing and HTML/DOCX reopening', async ({ page }, info) => {
  test.setTimeout(120000);
  const { zipSync, strToU8, unzipSync, strFromU8 } = await import('fflate');
  const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  // Independent native source: inherited paragraph pitch, a character-style
  // override and direct zero reset. Do not use Fountain to create the input.
  const source = Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8(`<Relationships xmlns="${rels}"><Relationship Id="doc" Type="${office}/officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${rels}"><Relationship Id="styles" Type="${office}/styles" Target="styles.xml"/></Relationships>`),
    'word/styles.xml': strToU8(`<w:styles xmlns:w="${word}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Wide"><w:rPr><w:spacing w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Child"><w:basedOn w:val="Wide"/></w:style><w:style w:type="character" w:styleId="Tight"><w:rPr><w:spacing w:val="-10"/></w:rPr></w:style></w:styles>`),
    'word/document.xml': strToU8(`<w:document xmlns:w="${word}"><w:body><w:p><w:pPr><w:pStyle w:val="Child"/></w:pPr><w:r><w:t>Expanded spacing remains editable.</w:t></w:r></w:p><w:p><w:r><w:rPr><w:rStyle w:val="Tight"/></w:rPr><w:t>Condensed spacing.</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Child"/></w:pPr><w:r><w:rPr><w:spacing w:val="0"/></w:rPr><w:t>Normal spacing reset.</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`),
  }));
  await writeFile(info.outputPath('spacing-source.docx'), source);
  await independentView(page, info, source, 'spacing-original');
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles({ name: 'spacing-source.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: source });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: spacing-source.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const checkPitch = async (target: ReturnType<Page['locator']>, label: string, points: number) => {
    const text = target.getByText(label, { exact: true });
    const computed = await text.evaluate(el => getComputedStyle(el).letterSpacing);
    if (points === 0) {
      // CSSOM can serialize zero as normal. Still require the explicit zero
      // declaration so removing the mark cannot masquerade as a reset.
      expect(['normal', '0px']).toContain(computed);
      await expect(text.locator('xpath=ancestor-or-self::*[contains(@style,"letter-spacing")][1]'))
        .toHaveAttribute('style', /letter-spacing:\s*0(?:pt|px)/);
    } else expect(parseFloat(computed)).toBeCloseTo(points * 4 / 3, 4);
    await expect(text).toHaveCSS('font-size', '16px');
    expect(await text.evaluate(el => getComputedStyle(el).fontFamily)).toContain('Arial');
  };
  await checkPitch(editor, 'Expanded spacing remains editable.', 1.5);
  await checkPitch(editor, 'Condensed spacing.', -0.5);
  await checkPitch(editor, 'Normal spacing reset.', 0);
  await editor.screenshot({ path: info.outputPath('spacing-imported.png') });
  await editor.getByText('Expanded spacing remains editable.', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.type(' Reviewed.');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor).not.toContainText('Reviewed.');
  await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
  await checkPitch(editor, 'Expanded spacing remains editable. Reviewed.', 1.5);
  await editor.getByText('Condensed spacing.', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.press('Shift+Home');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Condensed spacing.');
  await workspace.getByRole('button', { name: 'Text styles', exact: true }).click();
  const spacing = workspace.getByRole('textbox', { name: 'Character spacing', exact: true });
  await expect(spacing).toHaveValue('-0.5pt');
  await spacing.fill('calc(2px)');
  await workspace.getByRole('button', { name: 'Apply spacing', exact: true }).click();
  await expect(workspace.getByText('Character spacing is invalid for this selection.', { exact: true })).toBeVisible();
  await checkPitch(editor, 'Condensed spacing.', -0.5);
  await spacing.fill('2pt');
  await workspace.getByRole('button', { name: 'Apply spacing', exact: true }).click();
  await checkPitch(editor, 'Condensed spacing.', 2);
  await workspace.locator('form.is-text-style').screenshot({ path: info.outputPath('spacing-controls.png') });
  await workspace.getByRole('button', { name: 'Remove spacing', exact: true }).click();
  await expect(editor.getByText('Condensed spacing.', { exact: true })).toHaveCSS('letter-spacing', 'normal');
  await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
  await checkPitch(editor, 'Condensed spacing.', 2);
  await workspace.getByRole('button', { name: 'Close', exact: true }).click();
  const geometry = async (target: ReturnType<Page['locator']>) => target.locator('p').evaluateAll(paragraphs => paragraphs.map(p => {
    const range = document.createRange(); range.selectNodeContents(p);
    return { text: p.textContent, width: range.getBoundingClientRect().width, height: p.getBoundingClientRect().height };
  }));
  const edited = await geometry(editor);
  await editor.screenshot({ path: info.outputPath('spacing-edited.png') });
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('json');
  const jsonDownload = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const jsonPath = info.outputPath('spacing-edited.json'); await (await jsonDownload).saveAs(jsonPath);
  const editedDocument = importLab(await readFile(jsonPath), 'json').document.toJSON();
  for (const format of ['html', 'docx'] as const) {
    await page.getByRole('navigation', { name: 'Imported files' }).getByRole('button', { name: 'spacing-source.docx', exact: true }).click();
    await workspace.getByRole('combobox', { name: 'Export format' }).selectOption(format);
    const pending = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const path = info.outputPath(`spacing-export.${format}`); await (await pending).saveAs(path);
    const bytes = await readFile(path);
    await writeFile(info.outputPath(`spacing-${format}-report.txt`), await workspace.getByLabel('Round-trip result').innerText());
    // Both formats must now retain the ENTIRE edited model, including physical
    // page settings. This does not claim source-byte or native-layout equality.
    if (format === 'html') {
      expect(editedDocument.attrs).toEqual({ pageSettings: {
        unit: 'pt', width: 612, height: 792, marginTop: 72, marginRight: 72,
        marginBottom: 72, marginLeft: 72, headerDistance: 36, footerDistance: 36, gutter: 0,
      } });
      expect(new TextDecoder().decode(bytes)).toContain('data-fountain-page-settings=');
      const browserDocument = await page.evaluate(async ({ html, moduleURL }) => {
        const { HTMLImporter, Schema, StarterKit } = await import(/* @vite-ignore */ moduleURL);
        return HTMLImporter.parse(html, new Schema(StarterKit.schema)).toJSON();
      }, { html: new TextDecoder().decode(bytes), moduleURL: '/@fs/' + resolve('dist/index.js').replaceAll('\\', '/') });
      expect(browserDocument).toEqual(editedDocument);
      const exportedPage = await page.context().newPage();
      try {
        await exportedPage.setContent(new TextDecoder().decode(bytes));
        await exportedPage.locator('body').screenshot({ path: info.outputPath('spacing-exported-html.png') });
        const projection = await exportedPage.locator('body').evaluate(body => ({
          pageSettings: JSON.parse(body.getAttribute('data-fountain-page-settings')!),
          paragraphs: Array.from(body.querySelectorAll('p')).map(paragraph => {
            const text = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode()?.parentElement ?? paragraph;
            return { text: paragraph.textContent, font: getComputedStyle(text).fontFamily,
              pitch: getComputedStyle(text).letterSpacing };
          }),
        }));
        expect(projection.pageSettings).toEqual(editedDocument.attrs?.pageSettings);
        expect(projection.paragraphs.map(paragraph => paragraph.text)).toEqual([
          'Expanded spacing remains editable. Reviewed.', 'Condensed spacing.', 'Normal spacing reset.',
        ]);
        for (const [index, pitch] of [2, 8 / 3, 0].entries()) {
          const value = projection.paragraphs[index]!.pitch;
          expect(value === 'normal' ? 0 : Number.parseFloat(value)).toBeCloseTo(pitch, 4);
        }
        await writeFile(info.outputPath('spacing-exported-html-view.json'), JSON.stringify(projection, null, 2));
      } finally { await exportedPage.close(); await page.bringToFront(); }
      await expect(workspace.getByLabel('Round-trip result')).not.toContainText('page-settings-not-exported');
    }
    await expect(workspace.getByLabel('Round-trip result')).toContainText('Exact Fountain document equality');
    expect(importLab(bytes, format).document.toJSON()).toEqual(editedDocument);
    if (format === 'docx') {
      const xml = strFromU8(unzipSync(bytes)['word/document.xml']!);
      const paragraphs = xml.match(/<w:p>[\s\S]*?<\/w:p>/g)!;
      expect(paragraphs).toHaveLength(3);
      for (const [index, twips] of [30, 40, 0].entries()) {
        expect(paragraphs[index]!).toContain(`<w:spacing w:val="${twips}"/>`);
      }
    }
    await page.getByLabel('Choose documents').setInputFiles(path);
    const reopened = page.getByRole('region', { name: `Conversion workspace: spacing-export.${format}`, exact: true }).getByRole('textbox', { name: 'Imported document editor' });
    await checkPitch(reopened, 'Expanded spacing remains editable. Reviewed.', 1.5);
    await checkPitch(reopened, 'Condensed spacing.', 2);
    await checkPitch(reopened, 'Normal spacing reset.', 0);
    const after = await geometry(reopened);
    await writeFile(info.outputPath(`spacing-${format}-geometry.json`), JSON.stringify({ edited, reopened: after }, null, 2));
    await reopened.scrollIntoViewIfNeeded();
    const paintState = await reopened.evaluate(async element => {
      await document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return { visibility: document.visibilityState, focused: document.hasFocus(),
        paragraphs: Array.from(element.querySelectorAll('p')).map(paragraph => ({
          text: paragraph.textContent, color: getComputedStyle(paragraph).color,
          visibility: getComputedStyle(paragraph).visibility, opacity: getComputedStyle(paragraph).opacity,
        })) };
    });
    await writeFile(info.outputPath(`spacing-${format}-paint-state.json`), JSON.stringify(paintState, null, 2));
    const screenshot = await reopened.screenshot({ path: info.outputPath(`spacing-${format}-reopened.png`) });
    // A DOM/style/geometry pass is insufficient: the captured user-facing text
    // must actually be painted. Empty white screenshots used to pass this audit.
    const ink = await page.evaluate(async source => {
      const image = new Image(); image.src = source; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset]! < 128 && pixels[offset + 1]! < 128 && pixels[offset + 2]! < 128 && pixels[offset + 3]! > 128) count++;
      }
      return count;
    }, 'data:image/png;base64,' + screenshot.toString('base64'));
    expect(ink, `Reopened ${format} must paint visible text, not merely contain DOM nodes`).toBeGreaterThan(100);
    expect(after).toHaveLength(edited.length);
    for (const [index, actual] of after.entries()) {
      expect(actual.text).toBe(edited[index]!.text);
      expect(Math.abs(actual.width - edited[index]!.width)).toBeLessThanOrEqual(1 / 64);
      expect(Math.abs(actual.height - edited[index]!.height)).toBeLessThanOrEqual(1 / 64);
    }
    if (format === 'docx') await independentView(page, info, bytes, 'spacing-exported');
  }
});

async function independentView(page: Page, info: TestInfo, bytes: Buffer, prefix: string) {
  await page.goto(`${viewerOrigin}/browser-tests.html`);
  const result = await page.evaluate(async ({data, viewerUrl}) => {
    // Separate viewer for original bytes; never replace them with Fountain output.
    const { renderAsync } = await import(/* @vite-ignore */ viewerUrl);
    // Do not let the editor test site's CSS style the independent document.
    Array.from(document.styleSheets).forEach(sheet => { sheet.disabled = true; });
    document.body.replaceChildren();
    const heading = document.createElement('h1'); heading.textContent = 'Independent DOCX viewer — not native Word';
    const root = document.createElement('main'); root.id = 'reference-document';
    document.body.append(heading, root);
    await renderAsync(new Uint8Array(data).buffer, root, undefined, { renderHeaders: true, renderFooters: true, renderFootnotes: true, breakPages: true, ignoreLastRenderedPageBreak: false });
    await Promise.all(Array.from(root.querySelectorAll('img')).map(image => image.decode().catch(() => undefined)));
    const cell = root.querySelector('td');
    const table = root.querySelector('table');
    const finalRowCells = Array.from(table?.querySelectorAll('tr:last-child > td, tr:last-child > th') ?? []);
    const appearance = (label: string) => {
      const target = Array.from(root.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6'))
        .find(element => element.textContent?.trim() === label);
      if (!target) return null;
      const style = getComputedStyle(target);
      return { marginTop: style.marginTop, marginBottom: style.marginBottom, lineHeight: style.lineHeight,
        borderBottomWidth: style.borderBottomWidth, borderBottomColor: style.borderBottomColor,
        paddingBottom: style.paddingBottom, breakAfter: style.breakAfter };
    };
    const geometry = Array.from(root.querySelectorAll<HTMLElement>('section.docx')).map(section => ({ width: section.style.width, minHeight: section.style.minHeight, padding: section.style.padding }));
    return { geometry, pages: root.querySelectorAll('section.docx').length, images: root.querySelectorAll('img').length, math: root.querySelectorAll('math').length, text: root.innerText,
      firstCellBackground: cell ? getComputedStyle(cell).backgroundColor : null,
      tableWidth: table?.getBoundingClientRect().width ?? null,
      tableLayout: table ? getComputedStyle(table).tableLayout : null,
      finalRowCellWidths: finalRowCells.map(item => item.getBoundingClientRect().width),
      titleAppearance: appearance('Cooling experiment report'), headingAppearance: appearance('Experimental setup') };
  }, { data: Array.from(bytes), viewerUrl: '/@fs/' + resolve('node_modules/.vite/deps/docx-preview.js').replaceAll('\\', '/') });
  await writeFile(info.outputPath(`${prefix}-viewer.json`), JSON.stringify(result, null, 2));
  const pages = page.locator('#reference-document section.docx');
  for (let index = 0; index < await pages.count(); index++) await pages.nth(index).screenshot({ path: info.outputPath(`${prefix}-page-${index + 1}.png`) });
  return result;
}

test('visually audits the extended native Word-equation subset through export and reopen', async ({ page }, info) => {
  test.setTimeout(120000);
  const { strFromU8, strToU8, unzipSync, zipSync } = await import('fflate');
  const math = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
  const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const functionOMML = '<m:oMathPara><m:oMath><m:func><m:fName><m:r><m:t>sin</m:t></m:r></m:fName><m:e><m:r><m:t>x</m:t></m:r></m:e></m:func></m:oMath></m:oMathPara>';
  const lowerLimit = '<m:oMathPara><m:oMath><m:limLow><m:e><m:r><m:t>lim</m:t></m:r></m:e><m:lim><m:r><m:t>n→∞</m:t></m:r></m:lim></m:limLow></m:oMath></m:oMathPara>';
  const upperLimit = '<m:oMathPara><m:oMath><m:limUpp><m:e><m:r><m:t>x</m:t></m:r></m:e><m:lim><m:r><m:t>2</m:t></m:r></m:lim></m:limUpp></m:oMath></m:oMathPara>';
  const equations = '<m:oMathPara><m:oMath><m:eqArr><m:e><m:r><m:t>x=1</m:t></m:r></m:e><m:e><m:r><m:t>y=2</m:t></m:r></m:e></m:eqArr></m:oMath></m:oMathPara>';
  const bytes = Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<w:document xmlns:w="${word}" xmlns:m="${math}"><w:body><w:p><w:r><w:t>Extended equation audit</w:t></w:r></w:p><w:p>${functionOMML}</w:p><w:p>${lowerLimit}</w:p><w:p>${upperLimit}</w:p><w:p>${equations}</w:p><w:sectPr/></w:body></w:document>`),
  }));
  await writeFile(info.outputPath('extended-equations-source.docx'), bytes);
  const originalIndependent = await independentView(page, info, bytes, 'extended-equations-original');
  expect(originalIndependent.math).toBe(4);

  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles({
    name: 'extended-equations.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: bytes,
  });
  const workspace = page.getByRole('region', { name: 'Conversion workspace: extended-equations.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  const rendered = editor.locator('[data-fountain-math="block"]');
  await expect(rendered).toHaveCount(4);
  await expect(rendered.locator('.katex math')).toHaveCount(4);
  await expect(rendered.nth(0)).toHaveAttribute('data-latex', '\\operatorname{sin}x');
  await expect(rendered.nth(1)).toHaveAttribute('data-latex', '\\underset{n→∞}{lim}');
  await expect(rendered.nth(2)).toHaveAttribute('data-latex', '\\overset{2}{x}');
  await expect(rendered.nth(3)).toHaveAttribute('data-latex', '\\begin{aligned}x=1 \\\\ y=2\\end{aligned}');
  await page.screenshot({ path: info.outputPath('extended-equations-imported.png'), fullPage: true });

  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const output = info.outputPath('extended-equations-export.docx');
  await (await download).saveAs(output);
  const exportedBytes = await readFile(output);
  const exportedXML = strFromU8(unzipSync(exportedBytes)['word/document.xml']!);
  for (const tag of ['func', 'limLow', 'limUpp', 'eqArr']) expect(exportedXML).toContain(`<m:${tag}>`);
  expect(exportedXML).not.toContain('\\operatorname');

  await page.getByLabel('Choose documents').setInputFiles(output);
  const reopened = page.getByRole('region', { name: 'Conversion workspace: extended-equations-export.docx', exact: true })
    .getByRole('textbox', { name: 'Imported document editor' });
  await expect(reopened.locator('[data-fountain-math="block"]')).toHaveCount(4);
  await expect(reopened.locator('[data-fountain-math="block"] .katex math')).toHaveCount(4);
  await page.screenshot({ path: info.outputPath('extended-equations-reopened.png'), fullPage: true });

  const independent = await independentView(page, info, Buffer.from(exportedBytes), 'extended-equations-exported');
  expect(independent.math).toBe(4);
});
test('visually audit an independently authored scientific DOCX in the public lab', async ({ page }, info) => {
  test.skip(!existsSync(fixture), 'Generate the independent fixture before this opt-in recorded audit.');
  test.setTimeout(120000);
  const source = await readFile(fixture);
  const original = await independentView(page, info, source, 'original');
  await page.goto(labURL);
  await page.getByLabel('Choose documents').setInputFiles(fixture);
  const workspace = page.getByRole('region', { name: 'Conversion workspace: cooling-report.docx', exact: true });
  const editor = workspace.getByRole('textbox', { name: 'Imported document editor' });
  await expect(editor).toContainText('Cooling experiment report');
  await expect(editor).toContainText('END OF REPORT');
  // Values verified from the unchanged source's actual Word style chain, not
  // inferred from the browser viewer's own built-in style defaults.
  expect(await editor.getByText('Cooling experiment report', { exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(25 * 96 / 72, 2);
  expect(await editor.getByText('Experimental setup', { exact: true }).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(16 * 96 / 72, 2);
  await expect(editor.getByText('Cooling experiment report', { exact: true })).toHaveCSS('font-weight', '400');
  if (verifyLayout) {
    const titleLayout = await editor.getByText('Cooling experiment report', { exact: true }).evaluate((element) => {
      const block = element.closest('p,h1,h2,h3,h4,h5,h6') as HTMLElement;
      const style = getComputedStyle(block);
      const model = JSON.parse(block.getAttribute('data-fountain-paragraph-layout') ?? '{}');
      return { marginBottom: parseFloat(style.marginBottom), paintedBorderBottomWidth: parseFloat(style.borderBottomWidth),
        declaredBorderBottomWidth: block.style.borderBottomWidth, modelBorderBottomWidth: model?.borders?.bottom?.width,
        borderBottomColor: style.borderBottomColor, paddingBottom: parseFloat(style.paddingBottom) };
    });
    expect(titleLayout.marginBottom).toBeCloseTo(20, 2);
    // CSS engines paint a 1pt border on the device-pixel grid and report 1px
    // here. Assert the exact model and declared CSS value separately, then only
    // require the computed presentation to remain visibly non-zero.
    expect(titleLayout.modelBorderBottomWidth).toBe(1);
    expect(titleLayout.declaredBorderBottomWidth).toBe('1pt');
    expect(titleLayout.paintedBorderBottomWidth).toBeGreaterThanOrEqual(1);
    expect(titleLayout.borderBottomColor).toBe('rgb(79, 129, 189)');
    expect(titleLayout.paddingBottom).toBeCloseTo(16 / 3, 2);
    const headingLayout = await editor.getByText('Experimental setup', { exact: true }).evaluate((element) => {
      const block = element.closest('p,h1,h2,h3,h4,h5,h6') as HTMLElement;
      const style = getComputedStyle(block);
      const model = JSON.parse(block.getAttribute('data-fountain-paragraph-layout') ?? '{}');
      return { marginTop: parseFloat(style.marginTop), marginBottom: parseFloat(style.marginBottom),
        computedBreakAfter: style.breakAfter, declaredBreakAfter: block.style.breakAfter,
        modelKeepWithNext: model?.keepWithNext, letterSpacing: getComputedStyle(element as HTMLElement).letterSpacing };
    });
    expect(headingLayout.marginTop).toBeCloseTo(32, 2);
    expect(headingLayout.marginBottom).toBe(0);
    expect(headingLayout.modelKeepWithNext).toBe(true);
    expect(['normal', '0px']).toContain(headingLayout.letterSpacing);
    expect(headingLayout.declaredBreakAfter).toBe('avoid');
    expect(headingLayout.computedBreakAfter).toBe('avoid');
    await editor.getByText('Cooling experiment report', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('imported-paragraph-layout.png') });
  }
  if (verifySettings) {
    const settings = workspace.getByLabel('Document page settings', { exact: true });
    await settings.locator('summary').click();
    await expect(settings.getByLabel('Page width (pt)', { exact: true })).toHaveValue('612');
    await expect(settings.getByLabel('Page height (pt)', { exact: true })).toHaveValue('792');
    await expect(settings.getByLabel('Left margin (pt)', { exact: true })).toHaveValue('57.6');
    const top = settings.getByLabel('Top margin (pt)', { exact: true });
    await expect(top).toHaveValue('51.85');
    await top.fill('60');
    await settings.getByRole('button', { name: 'Apply page settings', exact: true }).click();
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(top).toHaveValue('51.85');
    await workspace.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(top).toHaveValue('60');
    await settings.screenshot({ path: info.outputPath('edited-page-settings.png') });
    // Verify the saved file changes, not only the controls, then restore the
    // source geometry for the main visual comparison.
    await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
    const changedDownload = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
    const changedPath = info.outputPath('changed-margin.docx');
    await (await changedDownload).saveAs(changedPath);
    const { unzipSync, strFromU8 } = await import('fflate');
    const changedXML = strFromU8(unzipSync(await readFile(changedPath))['word/document.xml']!);
    expect(changedXML).toMatch(/<w:pgMar[^>]*w:top="1200"/);
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(top).toHaveValue('51.85');
    await settings.locator('summary').click();
  }
  if (verifyBreaks) {
    const boundaries = editor.getByRole('separator', { name: 'Page break', exact: true });
    await expect(boundaries).toHaveCount(1);
    await workspace.getByRole('button', { name: 'Select page break 1', exact: true }).click();
    await boundaries.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('selected-page-break.png') });
    await page.keyboard.press('Delete');
    await expect(boundaries).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(boundaries).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(boundaries).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(boundaries).toHaveCount(1);
    await editor.getByText('END OF REPORT', { exact: true }).click();
    await workspace.getByRole('button', { name: 'Insert page break after current block', exact: true }).click();
    await expect(boundaries).toHaveCount(2);
    await workspace.getByRole('button', { name: 'Select page break 2', exact: true }).click();
    await page.keyboard.press('Backspace');
    await expect(boundaries).toHaveCount(1);
  }
  if (verifyIntake) {
    if (!verifyFootnotes) await expect(workspace.locator('.lab-notice')).toContainText('unrepresented-note-reference');
    else await expect(workspace.locator('.lab-notice')).not.toContainText('unrepresented-note-reference');
    if (!verifyTemplates) await expect(workspace.locator('.lab-notice')).toContainText('word/header1.xml');
    else await expect(workspace.locator('.lab-notice')).not.toContainText('unrepresented-header-relationship');
    if (!verifyFootnotes) await expect(workspace.locator('.lab-notice')).toContainText('word/footnotes.xml');
    const inventory = workspace.getByLabel('Source package inventory');
    await expect(inventory.locator('summary')).toContainText(`Unrepresented media: ${verifyTemplates ? 0 : 1}`);
    await inventory.locator('summary').click();
    if (!verifyTemplates) await expect(inventory).toContainText('unrepresented-media');
    await expect(inventory).toContainText('imported-image');
    await inventory.screenshot({ path: info.outputPath('source-package-inventory.png') });
    await inventory.locator('summary').click();
  }
  const images = workspace.locator('.lab-assets img');
  const imageDetails = [];
  for (let index = 0; index < await images.count(); index++) {
    await images.nth(index).scrollIntoViewIfNeeded();
    const detail = await images.nth(index).evaluate(async (image: HTMLImageElement) => { await image.decode().catch(() => undefined); return { alt: image.alt, width: image.naturalWidth, height: image.naturalHeight }; });
    imageDetails.push(detail);
    const download = page.waitForEvent('download');
    await workspace.getByRole('button', { name: `Download image ${index + 1}`, exact: true }).click();
    await (await download).saveAs(info.outputPath(`recovered-image-${index + 1}.bin`));
  }
  await workspace.locator('.lab-assets').screenshot({ path: info.outputPath('image-inventory.png') });
  await editor.getByText('Cooling experiment report', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('imported-top.png') });
  const bodyImages = editor.locator('img');
  for (let index = 0; index < await bodyImages.count(); index++) {
    await bodyImages.nth(index).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`imported-body-image-${index + 1}.png`) });
  }
  await editor.getByText('Newton cooling model', { exact: true }).scrollIntoViewIfNeeded();
  const importedMath = editor.locator('[data-fountain-math="block"]');
  await expect(importedMath).toHaveCount(2);
  await expect(importedMath.locator('.katex math')).toHaveCount(2);
  await expect(importedMath.nth(0)).toHaveAttribute('data-latex', 'T(t) = {T}_{a} + ({T}_{0} − {T}_{a}) {e}^{−kt}');
  await expect(importedMath.nth(1)).toHaveAttribute('data-latex', '{t}_{1/2} = \\frac{ln 2}{k}');
  await page.screenshot({ path: info.outputPath('imported-equations.png') });
  await editor.locator('table').scrollIntoViewIfNeeded();
  if (verifyTableWidths) {
    const table = editor.locator('table');
    await expect(table.locator('tr').first().locator('th,td').first()).toHaveAttribute('data-colwidth', '221,221,221');
    const leafCells = table.locator('tr').last().locator('th,td');
    await expect(leafCells).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) await expect(leafCells.nth(index)).toHaveAttribute('data-colwidth', '221');
  }
  if (verifyShading) {
    const titleCell = editor.getByRole('cell', { name: /^Water temperature in degrees C/ });
    await expect(titleCell).toHaveCSS('background-color', 'rgb(23, 59, 89)');
    await titleCell.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' verified');
    await expect(titleCell).toContainText('verified');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(titleCell).not.toContainText('verified');
    await expect(titleCell).toHaveCSS('background-color', 'rgb(23, 59, 89)');
  }
  await page.screenshot({ path: info.outputPath('imported-table.png') });
  const importedText = await editor.innerText();
  await editor.getByText('END OF REPORT', { exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.keyboard.type('Reviewer note: checked the imported document.');
  await expect(editor).toContainText('Reviewer note: checked the imported document.');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('Reviewer note: checked the imported document.');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(editor).toContainText('Reviewer note: checked the imported document.');
  if (verifyFootnotes) {
    const definition = editor.locator('[data-fountain-footnote-definition]');
    await expect(definition).toContainText(noteText);
    await expect(editor.locator('[data-fountain-footnote-reference]')).toHaveCount(1);
    await workspace.getByRole('button', { name: 'Edit footnote 1', exact: true }).click();
    await page.keyboard.press('ControlOrMeta+ArrowRight');
    await page.keyboard.press('End');
    await page.keyboard.type(' Verified by reviewer.');
    await expect(definition).toContainText('Verified by reviewer.');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(definition).not.toContainText('Verified by reviewer.');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(definition).toContainText('Verified by reviewer.');
    await definition.scrollIntoViewIfNeeded();
    // The editor remounts changed node views after history reconciliation. A
    // page capture records the same visible evidence without holding a stale
    // element handle while that legitimate replacement occurs.
    await page.screenshot({ path: info.outputPath('edited-footnote.png') });
    await workspace.getByRole('button', { name: 'Remove footnote 1', exact: true }).click();
    await expect(definition).toHaveCount(0);
    await expect(editor.locator('[data-fountain-footnote-reference]')).toHaveCount(0);
    await workspace.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(definition).toContainText('Verified by reviewer.');
    await expect(editor.locator('[data-fountain-footnote-reference]')).toHaveCount(1);
    // Add a second note through the author-facing control, then remove it again.
    await editor.getByText('Reviewer note: checked the imported document.', { exact: true }).click();
    await page.keyboard.press('End');
    await workspace.getByRole('button', { name: 'Insert footnote at cursor', exact: true }).click();
    await expect(definition).toHaveCount(2);
    await page.keyboard.type('Additional observation. ');
    await expect(definition.nth(1)).toContainText('Additional observation.');
    await workspace.getByRole('button', { name: 'Remove footnote 2', exact: true }).click();
    await expect(definition).toHaveCount(1);
    await workspace.getByLabel('Footnote controls').screenshot({ path: info.outputPath('footnote-controls.png') });
  }
  if (verifyTemplates) {
    const header = editor.locator('[data-fountain-page-header]');
    const footer = editor.locator('[data-fountain-page-footer]');
    await expect(header).toContainText('Cooling study 2026');
    await expect(header.locator('img')).toHaveCount(1);
    await expect(footer).toContainText('Thermal experiments');
    await expect(footer.locator('[data-fountain-page-field="page-number"]')).toHaveCount(1);
    await workspace.getByRole('button', { name: 'Edit header (default)', exact: true }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' reviewed');
    await expect(header).toContainText('Cooling study 2026 reviewed');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(header).not.toContainText('reviewed');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(header).toContainText('reviewed');
    await header.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('edited-header.png') });
    await workspace.getByRole('button', { name: 'Edit footer (default)', exact: true }).click();
    await page.keyboard.type('Reviewed: ');
    await expect(footer).toContainText('Reviewed: Thermal experiments');
    await footer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('edited-footer.png') });
  }
  if (verifyShading) {
    await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('html');
    await workspace.getByRole('button', { name: 'Check round trip' }).click();
    const table = workspace.getByRole('textbox', { name: 'Reopened export preview' }).locator('table');
    await expect(table.locator('td').first()).toHaveCSS('background-color', 'rgb(23, 59, 89)');
    await expect(table.locator('mark')).toHaveCount(0);
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('html-reopened-table.png') });
  }
  await workspace.getByRole('combobox', { name: 'Export format' }).selectOption('docx');
  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Download export', exact: true }).click();
  const exported = info.outputPath('edited-export.docx'); await (await download).saveAs(exported);
  {
    const { unzipSync, strFromU8 } = await import('fflate');
    const exportedXML = strFromU8(unzipSync(await readFile(exported))['word/document.xml']!);
    expect(exportedXML.match(/<m:oMathPara[ >]/g)).toHaveLength(2);
    expect(exportedXML).not.toContain('\\frac');
  }
  if (verifyLayout) {
    const { unzipSync, strFromU8 } = await import('fflate');
    const exportedXML = strFromU8(unzipSync(await readFile(exported))['word/document.xml']!);
    expect(exportedXML).toContain('<w:bottom w:val="single" w:sz="8" w:space="4" w:color="4F81BD"/>');
    expect(exportedXML).toContain('<w:spacing w:before="0" w:after="300" w:line="240" w:lineRule="auto"/>');
    expect(exportedXML).toContain('<w:spacing w:before="480" w:after="0" w:line="276" w:lineRule="auto"/>');
  }
  if (verifyTableWidths) {
    const { unzipSync, strFromU8 } = await import('fflate');
    const exportedXML = strFromU8(unzipSync(await readFile(exported))['word/document.xml']!);
    expect(exportedXML).toContain('<w:tblW w:w="0" w:type="auto"/>');
    expect(exportedXML).not.toContain('<w:tblLayout w:type="fixed"/>');
    expect(exportedXML).toContain('<w:tblGrid><w:gridCol w:w="3315"/><w:gridCol w:w="3315"/><w:gridCol w:w="3315"/></w:tblGrid>');
  }
  if (verifyIntake) {
    await expect(workspace.getByLabel('Round-trip result')).toContainText('Missing original content is not restored');
    if (!verifyFootnotes) await expect(workspace.getByLabel('Round-trip result')).toContainText('Exact Fountain document equality');
    else {
      // Definitions live in a separate Word story; a trailing editable paragraph
      // can change their model position without changing note text or linkage.
      await expect(workspace.getByLabel('Round-trip result')).toContainText('footnote-definition-position-normalized');
      await expect(workspace.getByRole('textbox', { name: 'Reopened export preview' }).locator('[data-fountain-footnote-definition]')).toContainText('Verified by reviewer.');
    }
    const privateDownload = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Download diagnostic report' }).click();
    const privatePath = info.outputPath('private-lab-report.json');
    await (await privateDownload).saveAs(privatePath);
    const privateReport = JSON.parse(await readFile(privatePath, 'utf8'));
    expect(privateReport.sourcePackage.unrepresentedMedia).toBe(verifyTemplates ? 0 : 1);
    expect(privateReport.sourcePackage.parts.every((part: any) => part.path === undefined)).toBe(true);
    expect(privateReport.importIssues.every((issue: any) => issue.sourcePart === undefined)).toBe(true);
    expect(privateReport.fileName).toBeUndefined();
  }
  await workspace.getByLabel('Round-trip result').screenshot({ path: info.outputPath('export-report.png') });
  await workspace.getByRole('checkbox', { name: 'Include filename, document content and my note in the downloaded report' }).check();
  await workspace.getByLabel('What went wrong?').fill('Audit equations, image bytes, header logo, footnote, table appearance and page layout against the original document.');
  const reportDownload = page.waitForEvent('download'); await workspace.getByRole('button', { name: 'Download diagnostic report' }).click();
  await (await reportDownload).saveAs(info.outputPath('lab-report.json'));
  if (verifyIntake) {
    const report = JSON.parse(await readFile(info.outputPath('lab-report.json'), 'utf8'));
    expect(report.sourcePackage.parts.filter((part: any) => part.handling === 'imported-image')).toHaveLength(verifyTemplates ? 3 : 2);
    if (!verifyFootnotes) expect(report.importIssues.some((issue: any) => issue.sourcePart === 'word/footnotes.xml')).toBe(true);
    else {
      expect(report.sourcePackage.parts.find((part: any) => part.path === 'word/footnotes.xml').handling).toBe('adapter-input');
      const importedNote = report.importedDocument.content.find((node: any) => node.type === 'footnote_definition');
      expect(importedNote).toBeTruthy();
      expect(report.editedDocument.content.find((node: any) => node.type === 'footnote_definition').attrs.id).toBe(importedNote.attrs.id);
    }
  }
  await page.getByLabel('Choose documents').setInputFiles(exported);
  const reopenedEditor = page.getByRole('textbox', { name: 'Imported document editor' });
  await expect(reopenedEditor).toContainText('Reviewer note: checked the imported document.');
  await expect(reopenedEditor.locator('[data-fountain-math="block"]')).toHaveCount(2);
  await expect(reopenedEditor.locator('[data-fountain-math="block"] .katex math')).toHaveCount(2);
  await reopenedEditor.getByText('Newton cooling model', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('reopened-equations.png') });
  const reopenedText = await reopenedEditor.innerText();
  if (verifyLayout) {
    const title = reopenedEditor.getByText('Cooling experiment report', { exact: true });
    const titleLayout = await title.evaluate((element) => {
      const block = element.closest('p,h1,h2,h3,h4,h5,h6') as HTMLElement;
      const style = getComputedStyle(block);
      const model = JSON.parse(block.getAttribute('data-fountain-paragraph-layout') ?? '{}');
      return { marginBottom: parseFloat(style.marginBottom), paintedBorderBottomWidth: parseFloat(style.borderBottomWidth),
        declaredBorderBottomWidth: block.style.borderBottomWidth, modelBorderBottomWidth: model?.borders?.bottom?.width,
        paddingBottom: parseFloat(style.paddingBottom) };
    });
    expect(titleLayout.marginBottom).toBeCloseTo(20, 2);
    expect(titleLayout.modelBorderBottomWidth).toBe(1);
    expect(titleLayout.declaredBorderBottomWidth).toBe('1pt');
    expect(titleLayout.paintedBorderBottomWidth).toBeGreaterThanOrEqual(1);
    expect(titleLayout.paddingBottom).toBeCloseTo(16 / 3, 2);
    await title.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('reopened-paragraph-layout.png') });
  }
  if (verifySettings) {
    const settings = page.getByRole('region', { name: 'Conversion workspace: edited-export.docx', exact: true }).getByLabel('Document page settings', { exact: true });
    await settings.locator('summary').click();
    await expect(settings.getByLabel('Top margin (pt)', { exact: true })).toHaveValue('51.85');
    await expect(settings.getByLabel('Page width (pt)', { exact: true })).toHaveValue('612');
    await expect(settings.getByLabel('Page height (pt)', { exact: true })).toHaveValue('792');
    await settings.screenshot({ path: info.outputPath('reopened-page-settings.png') });
  }
  if (verifyBreaks) await expect(page.getByRole('textbox', { name: 'Imported document editor' }).getByRole('separator', { name: 'Page break', exact: true })).toHaveCount(1);
  if (verifyTableWidths) {
    const table = reopenedEditor.locator('table');
    await expect(table.locator('tr').first().locator('th,td').first()).toHaveAttribute('data-colwidth', '221,221,221');
    const leafCells = table.locator('tr').last().locator('th,td');
    for (let index = 0; index < 3; index += 1) await expect(leafCells.nth(index)).toHaveAttribute('data-colwidth', '221');
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('reopened-table-widths.png') });
  }
  const exportView = await independentView(page, info, await readFile(exported), 'exported');
  expect(exportView.math).toBe(2);
  if (verifySettings) {
    expect(original.geometry[0]?.width).toBe('612pt');
    expect(original.geometry[0]?.minHeight).toBe('792pt');
    expect(exportView.geometry).toEqual(original.geometry);
  }
  if (verifyBreaks) {
    expect(original.pages).toBe(2);
    expect(exportView.pages).toBe(2);
  }
  if (verifyTemplates) {
    expect(exportView.images).toBe(verifyBreaks ? 2 + exportView.pages : 3);
    expect(exportView.text).toContain('Cooling study 2026 reviewed');
    expect(exportView.text).toContain('Reviewed: Thermal experiments');
    expect(reopenedText).toContain('Cooling study 2026 reviewed');
    expect(reopenedText).toContain('Reviewed: Thermal experiments');
  }
  if (verifyFootnotes) {
    expect(reopenedText).toContain('Verified by reviewer.');
    expect(exportView.text).toContain('Verified by reviewer.');
    expect(exportView.text).toContain('not measured experimental data.');
  }
  if (verifyShading) expect(exportView.firstCellBackground).toBe('rgb(23, 59, 89)');
  if (verifyTableWidths) {
    expect(original.finalRowCellWidths).toHaveLength(3);
    expect(exportView.finalRowCellWidths).toHaveLength(3);
    expect(Math.abs(Number(exportView.tableWidth) - Number(original.tableWidth))).toBeLessThan(1);
    for (let index = 0; index < 3; index += 1) {
      // Word auto-fit can redistribute a few pixels between columns as edited
      // text and run formatting change. The complete table width must remain
      // stable and each column must stay within 0.5% of that source geometry.
      expect(Math.abs(exportView.finalRowCellWidths[index]! - original.finalRowCellWidths[index]!) / Number(original.tableWidth)).toBeLessThan(0.005);
    }
  }
  await writeFile(info.outputPath('observations.json'), JSON.stringify({ original, imageDetails, importedText, reopenedText, exportView, caveat: 'Workflow completion is not format fidelity. Native Word/LibreOffice unavailable.' }, null, 2));
});
