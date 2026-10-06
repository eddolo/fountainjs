// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync, strFromU8, unzipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { exportDOCX, importDOCX } from '../src/docx';
import { parseDOCXXML } from '../src/docx/xml-parser';
import { readWordStyleSheet } from '../src/docx/style-reader';
import { withDOCXExportStyles } from './fixtures/docx-page-defaults';

const schema = new Schema(StarterKit.schema);
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const O = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const style = (id: string, body: string, parent = '', extra = '') => `<w:style w:type="table" w:styleId="${id}" ${extra}>${parent ? `<w:basedOn w:val="${parent}"/>` : ''}${body}</w:style>`;
const border = (side: string, color: string) => `<w:${side} w:val="single" w:sz="8" w:color="${color}"/>`;
function fixture(styles: string, tablePr = '<w:tblStyle w:val="Child"/>', cellPr = '', secondTable = '') {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body><w:tbl><w:tblPr>${tablePr}</w:tblPr><w:tblGrid><w:gridCol w:w="4800"/></w:tblGrid><w:tr><w:tc><w:tcPr>${cellPr}</w:tcPr><w:p><w:r><w:t>Measured value</w:t></w:r></w:p></w:tc></w:tr></w:tbl>${secondTable}</w:body></w:document>`),
    'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="${O}/styles" Target="definitions/table-styles.xml"/></Relationships>`),
    'word/definitions/table-styles.xml': strToU8(`<w:styles xmlns:w="${W}">${styles}</w:styles>`),
  });
}

describe('inherited Word table style appearance', () => {
  it('retains letter-spacing marks and attributes in full expected native font/mark order', () => {
    const source = { type: 'paragraph', attrs: { emphasis: 'explicit' }, content: [{ type: 'text', text: 'Title', marks: [
      { type: 'font_family', attrs: { family: 'Arial' } }, { type: 'font_size', attrs: { size: '20pt' } },
      { type: 'letter_spacing', attrs: { spacing: '0.25pt' } }, { type: 'text_color', attrs: { color: '#000000' } },
    ] }] };
    expect(withDOCXExportStyles(source).content![0]!.marks).toEqual(source.content[0]!.marks);
  });
  it('resolves parent/child physical edges independently, then direct zero/nil overrides without a DOM', () => {
    expect(typeof document).toBe('undefined');
    const styles = style('Base', `<w:tblPr><w:tblBorders>${border('top', '123456')}${border('bottom', '345678')}</w:tblBorders><w:tblCellMar><w:left w:w="160" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar><w:tblW w:w="4800" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>`)
      + style('Child', `<w:tblPr><w:tblBorders>${border('top', '654321')}</w:tblBorders><w:tblCellMar><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>`, 'Base');
    const result = importDOCX(fixture(styles, '<w:tblStyle w:val="Child"/><w:tblBorders><w:top w:val="nil"/></w:tblBorders><w:tblCellMar><w:left w:w="0" w:type="dxa"/></w:tblCellMar>'), schema);
    expect(result.document.child(0).attrs).toMatchObject({ layout: 'fixed', preferredWidth: { unit: 'pt', value: 240 }, appearance: { unit: 'pt',
      borders: { top: { style: 'hidden' }, bottom: { style: 'solid', width: 1, color: '#345678' } }, padding: { left: 0, right: 4 } } });
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'table-style-materialized', severity: 'info', path: [0] }));
    expect(result.report.issues.some(issue => issue.code === 'table-style-appearance-unresolved')).toBe(false);
  });

  it('retains inherited default cell fill, margins and borders, with direct per-cell reset taking precedence', () => {
    const styles = style('Base', `<w:tcPr><w:shd w:val="clear" w:fill="112233"/><w:tcBorders>${border('left', '556677')}${border('bottom', '778899')}</w:tcBorders><w:tcMar><w:left w:w="80" w:type="dxa"/><w:top w:w="40" w:type="dxa"/></w:tcMar></w:tcPr>`)
      + style('Child', '<w:tcPr><w:shd w:val="clear" w:fill="AABBCC"/></w:tcPr>', 'Base');
    const result = importDOCX(fixture(styles, undefined, '<w:tcBorders><w:left w:val="none"/></w:tcBorders><w:tcMar><w:top w:w="0" w:type="dxa"/></w:tcMar>'), schema);
    expect(result.document.child(0).child(0).child(0).attrs).toMatchObject({ background: '#aabbcc', appearance: { unit: 'pt',
      borders: { left: { style: 'none' }, bottom: { style: 'solid', width: 1, color: '#778899' } }, padding: { left: 4, top: 0 } } });
    const cleared = importDOCX(fixture(styles, undefined, '<w:shd w:val="clear" w:fill="auto"/>'), schema);
    expect(cleared.document.child(0).child(0).child(0).attrs.background).toBe('');
  });

  it('uses the declared default table style without guessing a built-in style by name', () => {
    const defaults = style('ActualDefault', '<w:tcPr><w:shd w:fill="CCDDFF" w:val="clear"/></w:tcPr>', '', 'w:default="1"');
    const result = importDOCX(fixture(defaults, ''), schema);
    expect(result.document.child(0).child(0).child(0).attrs.background).toBe('#ccddff');
    expect(importDOCX(fixture(style('TableNormal', '<w:tcPr><w:shd w:fill="CCDDFF"/></w:tcPr>'), ''), schema).document.child(0).child(0).child(0).attrs.background).toBe('');
  });

  it('writes materialized appearance as native direct properties and reopens the same supported values', () => {
    const styles = style('Base', `<w:tblPr><w:tblBorders>${border('insideH', '223344')}</w:tblBorders><w:tblCellMar><w:left w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tcPr><w:shd w:fill="DDEEFF" w:val="clear"/></w:tcPr>`)
      + style('Child', '', 'Base');
    const document = importDOCX(fixture(styles), schema).document;
    const exported = exportDOCX(document);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);
    expect(xml).toContain('<w:insideH w:val="single" w:sz="8" w:color="223344"/>');
    expect(xml).toContain('w:fill="DDEEFF"');
    expect(xml).not.toContain('<w:tblStyle ');
    const reopened = importDOCX(exported.bytes, schema).document.child(0);
    expect(reopened.attrs.appearance).toEqual(document.child(0).attrs.appearance);
    expect(reopened.child(0).child(0).attrs.background).toBe('#ddeeff');
  });

  it('resolves conditional appearance and supported text while reporting unimplemented row properties', () => {
    const styles = style('Child', '<w:tcPr><w:shd w:fill="DDEEFF" w:val="clear"/></w:tcPr><w:rPr><w:b/></w:rPr><w:pPr><w:jc w:val="center"/></w:pPr><w:trPr><w:trHeight w:val="500"/></w:trPr><w:tblStylePr w:type="firstRow"><w:tcPr><w:shd w:fill="AA0000"/></w:tcPr></w:tblStylePr>');
    const result = importDOCX(fixture(styles), schema);
    expect(result.document.child(0).child(0).child(0).attrs.background).toBe('#aa0000');
    const paragraph = result.document.child(0).child(0).child(0).child(0);
    expect(paragraph.attrs.align).toBe('center');
    expect(paragraph.child(0).marks.some(mark => mark.type.name === 'strong')).toBe(true);
    expect(result.report.issues.map(issue => issue.code)).toContain('table-style-property-not-imported');
    expect(result.report.issues.some(issue => issue.code === 'table-style-text-not-imported')).toBe(false);
    expect(result.report.issues.some(issue => issue.code === 'table-style-conditional-not-imported')).toBe(false);
    expect(result.report.issues.every(issue => issue.path?.[0] === 0)).toBe(true);
    expect(result.report.fidelity).toBe('lossy');
  });

  it('retains content and direct properties on cycles, missing parents and wrong-kind parents, with located diagnostics', () => {
    for (const [styles, code] of [
      [style('Child', '', 'Base') + style('Base', '', 'Child'), 'table-style-cycle'],
      [style('Child', '', 'Missing'), 'table-style-missing'],
      [style('Child', '', 'Base') + '<w:style w:type="paragraph" w:styleId="Base"/>', 'table-style-kind-mismatch'],
    ]) {
      const result = importDOCX(fixture(styles!, undefined, '<w:shd w:val="clear" w:fill="ABCDEF"/>'), schema);
      expect(result.document.textContent).toBe('Measured value');
      expect(result.document.child(0).child(0).child(0).attrs.background).toBe('#abcdef');
      expect(result.report.issues).toContainEqual(expect.objectContaining({ code, path: [0] }));
    }
  });

  it('does not report unused table style declarations as losses in ordinary body paragraphs', () => {
    const second = '<w:p><w:r><w:t>Body</w:t></w:r></w:p>';
    const result = importDOCX(fixture(style('Unused', '<w:rPr><w:shadow/></w:rPr><w:tblStylePr w:type="firstRow"/>'), '', '', second), schema);
    expect(result.report.issues).toEqual([]);
  });

  it('ignores foreign lookalike style properties and rejects duplicate style identities/defaults', () => {
    const foreign = style('Child', '<x:tcPr xmlns:x="urn:foreign"><x:shd x:fill="FF0000"/></x:tcPr>');
    expect(importDOCX(fixture(foreign), schema).document.child(0).child(0).child(0).attrs.background).toBe('');
    expect(() => importDOCX(fixture(style('Child', '') + style('Child', '')), schema)).toThrow(/Duplicate/);
    expect(() => importDOCX(fixture(style('A', '', '', 'w:default="1"') + style('B', '', '', 'w:default="true"'), ''), schema)).toThrow(/default table/i);
  });

  it('retains the established direct cell → row → table shading precedence over inherited defaults', () => {
    const styles = style('Child', '<w:tblPr><w:shd w:fill="112233"/></w:tblPr><w:tcPr><w:shd w:fill="334455"/></w:tcPr>');
    const direct = importDOCX(fixture(styles, '<w:tblStyle w:val="Child"/><w:shd w:fill="556677"/>', '<w:shd w:fill="778899"/>'), schema);
    expect(direct.document.child(0).child(0).child(0).attrs.background).toBe('#778899');
    const table = importDOCX(fixture(styles, '<w:tblStyle w:val="Child"/><w:shd w:fill="556677"/>'), schema);
    expect(table.document.child(0).child(0).child(0).attrs.background).toBe('#556677');
    const archive = unzipSync(fixture(styles, '<w:tblStyle w:val="Child"/><w:shd w:fill="556677"/>'));
    archive['word/document.xml'] = strToU8(strFromU8(archive['word/document.xml']!).replace('<w:tr>', '<w:tr><w:tblPrEx><w:shd w:fill="99AABB"/></w:tblPrEx>'));
    expect(importDOCX(zipSync(archive), schema).document.child(0).child(0).child(0).attrs.background).toBe('#99aabb');
  });

  it('resolves namespace aliases without accepting a foreign override or mutating original declarations', () => {
    const raw = `<q:styles xmlns:q="${W}" xmlns:z="${W}" xmlns:x="urn:foreign"><q:style z:type="table" z:styleId="Base"><q:tblPr><q:tblBorders><q:top z:val="single" z:sz="8" z:color="123456"/></q:tblBorders><q:tblLayout x:type="fixed"/></q:tblPr></q:style><q:style z:type="table" z:styleId="Child"><q:basedOn z:val="Base"/><q:tblPr><q:tblBorders><x:top x:val="nil"/><q:bottom z:val="nil"/></q:tblBorders></q:tblPr></q:style></q:styles>`;
    const tree = parseDOCXXML(raw, { maxXmlDepth: 64, maxXmlNodes: 10000 });
    const before = JSON.stringify(tree);
    const reader = readWordStyleSheet(tree);
    expect(reader.resolveTable('Child', () => {}).ids).toEqual(['Base', 'Child']);
    expect(JSON.stringify(tree)).toBe(before);
    const archive = unzipSync(fixture(''));
    archive['word/definitions/table-styles.xml'] = strToU8(raw);
    const table = importDOCX(zipSync(archive), schema).document.child(0);
    expect(table.attrs.appearance).toMatchObject({ borders: { top: { color: '#123456' }, bottom: { style: 'hidden' } } });
    expect(table.attrs.layout).toBeUndefined();
  });

  it('bounds table ancestry and rejects ambiguous references instead of choosing an arbitrary declaration', () => {
    const tree = parseDOCXXML(`<w:styles xmlns:w="${W}">${style('Base', '')}${style('Child', '', 'Base')}</w:styles>`, { maxXmlDepth: 64, maxXmlNodes: 10000 });
    const warnings: string[] = [];
    expect(readWordStyleSheet(tree, { maxDepth: 1 }).resolveTable('Child', code => warnings.push(code)).ids).toEqual([]);
    expect(warnings).toEqual(['table-style-depth-limit']);
    expect(() => importDOCX(fixture(style('Child', '<w:basedOn w:val="A"/><w:basedOn w:val="B"/>')), schema)).toThrow(/Ambiguous/);
    expect(() => importDOCX(fixture(style('Child', ''), '<w:tblStyle w:val="Child"/><w:tblStyle w:val="Other"/>'), schema)).toThrow(/Ambiguous/);
  });

  it('keeps within-layer duplicate border diagnostics after an ancestor group is merged', () => {
    const result = importDOCX(fixture(style('Base', `<w:tblPr><w:tblBorders>${border('bottom', '123456')}</w:tblBorders></w:tblPr>`) + style('Child', '', 'Base'),
      '<w:tblStyle w:val="Child"/><w:tblBorders><w:top w:val="nil"/><w:top w:val="none"/></w:tblBorders>'), schema);
    expect(result.document.child(0).attrs.appearance).toEqual({ unit: 'pt', borders: { bottom: { style: 'solid', width: 1, color: '#123456' } } });
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'ambiguous-table-appearance-declaration', path: [0] }));
  });

  it('reports unsupported used table/cell style properties and obeys the receiving schema boundary', () => {
    const styles = style('Child', '<w:tblPr><w:tblInd w:w="300" w:type="dxa"/><w:tblCellMar><w:left w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tcPr><w:vAlign w:val="center"/><w:tcMar><w:top w:w="40" w:type="dxa"/></w:tcMar></w:tcPr>');
    const legacy = new Schema({ ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes,
      table: { ...StarterKit.schema.nodes.table!, attrs: {} }, table_cell: { ...StarterKit.schema.nodes.table_cell!, attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, background: { default: '' }, colwidth: { default: null } } } },
    });
    const result = importDOCX(fixture(styles), legacy);
    expect(result.document.textContent).toBe('Measured value');
    expect(result.report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['table-style-property-not-imported', 'table-appearance-not-imported', 'table-cell-appearance-not-imported']));
    expect(result.document.child(0).attrs.appearance).toBeUndefined();
    expect(result.document.child(0).child(0).child(0).attrs.appearance).toBeUndefined();
  });
});
