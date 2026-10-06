import { zipSync, strToU8, strFromU8, unzipSync } from 'fflate';
import { describe, it, expect } from 'vitest';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { exportDOCX, importDOCX } from '../src/docx';
const schema = new Schema(StarterKit.schema);
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function source(properties = '', cellProperties = '', rowProperties = '') {
  return zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="${ns}"><w:body><w:tbl><w:tblPr>${properties}</w:tblPr><w:tr>${rowProperties}<w:tc><w:tcPr>${cellProperties}</w:tcPr><w:p><w:r><w:t>Measured value</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`) });
}
function xml(bytes: Uint8Array) { return strFromU8(unzipSync(bytes)['word/document.xml']!); }
describe('native direct table borders and margins', () => {
  it('does not invent application borders, cell padding or table style for a borderless Word import', () => {
    const imported = importDOCX(source(), schema);
    expect(imported.document.child(0).attrs.appearance).toEqual({ unit: 'pt' });
    const output = exportDOCX(imported.document);
    expect(xml(output.bytes)).not.toMatch(/<w:(tblBorders|tblCellMar|tblStyle)/);
    expect(importDOCX(output.bytes, schema).document.child(0).attrs.appearance).toEqual({ unit: 'pt' });
    expect(imported.report.issues).toEqual([]);
  });
  it('retains line types, physical lengths, explicit nil/none and zero margins independently', () => {
    const imported = importDOCX(source('<w:tblBorders><w:top w:val="single" w:sz="8" w:color="102030"/><w:bottom w:val="double" w:sz="16" w:color="304050"/><w:insideH w:val="dotted" w:sz="4" w:color="708090"/><w:insideV w:val="dashed" w:sz="6" w:color="8090A0"/><w:left w:val="none"/><w:right w:val="nil"/></w:tblBorders><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="160" w:type="dxa"/></w:tblCellMar>',
      '<w:tcBorders><w:top w:val="nil"/><w:left w:val="none"/></w:tcBorders><w:shd w:val="clear" w:fill="123456"/><w:tcMar><w:left w:w="0" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/></w:tcMar>'), schema);
    const table = imported.document.child(0);
    expect(table.attrs.appearance).toEqual({ unit: 'pt', borders: { top: { style: 'solid', width: 1, color: '#102030' },
      bottom: { style: 'double', width: 2, color: '#304050' }, insideH: { style: 'dotted', width: 0.5, color: '#708090' },
      insideV: { style: 'dashed', width: 0.75, color: '#8090a0' }, left: { style: 'none' }, right: { style: 'hidden' } }, padding: { top: 0, left: 8 } });
    expect(table.child(0).child(0).attrs.appearance).toEqual({ unit: 'pt', borders: { top: { style: 'hidden' }, left: { style: 'none' } }, padding: { left: 0, bottom: 3 } });
    const output = exportDOCX(imported.document);
    const properties = xml(output.bytes).match(/<w:tcPr>(.*?)<\/w:tcPr>/)?.[1] ?? '';
    expect(properties.indexOf('<w:tcBorders>')).toBeLessThan(properties.indexOf('<w:shd'));
    expect(properties.indexOf('<w:shd')).toBeLessThan(properties.indexOf('<w:tcMar>'));
    const reopened = importDOCX(output.bytes, schema).document.child(0);
    expect(reopened.attrs.appearance).toEqual(table.attrs.appearance);
    expect(reopened.child(0).child(0).attrs.appearance).toEqual(table.child(0).child(0).attrs.appearance);
    expect(imported.report.issues).toEqual([]);
  });
  it('keeps new Fountain tables on their existing default appearance', () => {
    const doc = schema.node('doc', {}, [schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_cell', {}, [schema.node('paragraph')])])])]);
    const output = exportDOCX(doc);
    expect(xml(output.bytes)).toContain('w:color="C9C2D8"');
    expect(xml(output.bytes)).toContain('<w:left w:w="120" w:type="dxa"/>');
    expect(importDOCX(output.bytes, schema).document.child(0).attrs.appearance).toMatchObject({ padding: { left: 6 } });
  });
  it('reports unresolved table styles, row exceptions, unsupported lines, colors and margins with paths', () => {
    const imported = importDOCX(source('<w:tblStyle w:val="Corporate"/><w:tblCellSpacing w:w="20" w:type="dxa"/><w:tblBorders><w:top w:val="wave" w:sz="8" w:color="123456"/><w:bottom w:val="single" w:sz="8" w:color="auto"/><w:start w:val="nil"/></w:tblBorders><w:tblCellMar><w:left w:w="10" w:type="pct"/></w:tblCellMar>',
      '<w:tcBorders><w:top w:val="single" w:sz="8" w:color="123456" w:themeColor="accent1" w:space="2"/></w:tcBorders>', '<w:tblPrEx><w:tblCellMar><w:left w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPrEx>'), schema);
    expect(imported.report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['table-style-appearance-unresolved', 'table-cell-spacing-not-imported',
      'unsupported-table-border', 'table-border-color-unresolved', 'unsupported-table-appearance-edge', 'unsupported-table-cell-margin',
      'unsupported-table-border-effect', 'unsupported-table-border-space', 'table-row-appearance-exception-not-imported']));
    expect(imported.report.issues.every(issue => issue.path?.[0] === 0)).toBe(true);
  });
  it('ignores foreign declarations and reports conflicting native appearance without losing text', () => {
    const foreign = importDOCX(source('<w:tblBorders xmlns:x="urn:other"><x:top x:val="nil"/></w:tblBorders>'), schema);
    expect(foreign.document.child(0).attrs.appearance).toEqual({ unit: 'pt' });
    const conflict = importDOCX(source('<w:tblBorders><w:top w:val="nil"/><w:top w:val="none"/></w:tblBorders>'), schema);
    expect(conflict.document.textContent).toBe('Measured value');
    expect(conflict.document.child(0).attrs.appearance).toEqual({ unit: 'pt' });
    expect(conflict.report.issues).toContainEqual(expect.objectContaining({ code: 'ambiguous-table-appearance-declaration', path: [0] }));
  });
  it('coalesces identical repeated border groups in independently authored documents, with an explicit report', () => {
    const borders = '<w:tcBorders><w:top w:val="single" w:sz="4" w:color="D9D9D9"/></w:tcBorders>';
    const imported = importDOCX(source('', borders + borders + borders), schema);
    expect(imported.document.child(0).child(0).child(0).attrs.appearance).toMatchObject({ borders: { top: { width: 0.5, color: '#d9d9d9' } } });
    expect(imported.report.issues).toEqual([expect.objectContaining({ code: 'duplicate-table-appearance-declaration', path: [0, 0, 0] })]);
    expect(xml(exportDOCX(imported.document).bytes).match(/<w:tcBorders>/g)).toHaveLength(1);
    const reordered = importDOCX(source('', borders + '<w:tcBorders><w:top w:color="D9D9D9" w:sz="4" w:val="single"/></w:tcBorders>'), schema);
    expect(reordered.document.child(0).child(0).child(0).attrs.appearance).toEqual(imported.document.child(0).child(0).child(0).attrs.appearance);
  });
  it('reports native precision rounding without hiding the exact reopened declaration', () => {
    const table = importDOCX(source(), schema).document.child(0);
    const doc = schema.node('doc', {}, [schema.node('table', { appearance: { unit: 'pt', borders: { top: { style: 'solid', width: 0.2, color: '#123456' } }, padding: { left: 1.123 } } }, table.content)]);
    const output = exportDOCX(doc);
    expect(output.report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['table-border-width-rounded', 'table-cell-margin-rounded']));
    expect(importDOCX(output.bytes, schema).document.child(0).attrs.appearance).toMatchObject({ borders: { top: { width: 0.25 } }, padding: { left: 1.1 } });
  });
  it('reports direct properties that the receiving schema does not declare', () => {
    const legacy = new Schema({ ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes,
      table: { ...StarterKit.schema.nodes.table!, attrs: { layout: { default: undefined } } },
      table_cell: { ...StarterKit.schema.nodes.table_cell!, attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, colwidth: { default: null }, background: { default: '' } } },
    } });
    const imported = importDOCX(source('<w:tblCellMar><w:left w:w="160" w:type="dxa"/></w:tblCellMar>', '<w:tcMar><w:left w:w="0" w:type="dxa"/></w:tcMar>'), legacy);
    expect(imported.document.child(0).attrs.appearance).toBeUndefined();
    expect(imported.document.child(0).child(0).child(0).attrs.appearance).toBeUndefined();
    expect(imported.report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['table-appearance-not-imported', 'table-cell-appearance-not-imported']));
  });
  it('reports distinct appearance on a native vertical-merge continuation instead of silently claiming retention', () => {
    const bytes = zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="${ns}"><w:body><w:tbl><w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/><w:tcMar><w:left w:w="100" w:type="dxa"/></w:tcMar></w:tcPr><w:p/></w:tc></w:tr><w:tr><w:tc><w:tcPr><w:vMerge/><w:tcMar><w:left w:w="200" w:type="dxa"/></w:tcMar></w:tcPr><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>`) });
    const imported = importDOCX(bytes, schema);
    expect(imported.document.child(0).child(0).child(0).attrs.appearance).toMatchObject({ padding: { left: 5 } });
    expect(imported.report.issues).toContainEqual(expect.objectContaining({ code: 'table-merged-continuation-appearance-not-imported', path: [0, 1, 0] }));
    const output = exportDOCX(imported.document);
    expect(output.report.issues).toContainEqual(expect.objectContaining({ code: 'table-merged-cell-appearance-projection' }));
    expect(xml(output.bytes).match(/<w:tcMar>/g)).toHaveLength(2);
  });
});
