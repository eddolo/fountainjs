import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { Schema } from '../src/core';
import { exportDOCX, importDOCX } from '../src/docx';
import { StarterKit } from '../src/extensions';

const schema = new Schema(StarterKit.schema);
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function packageWithTable(table: string): Uint8Array {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${ns}"><w:body>${table}</w:body></w:document>`),
  });
}

function paragraph(text: string) {
  return schema.node('paragraph', {}, [schema.text(text)]);
}

function cell(type: 'table_header' | 'table_cell', text: string, colwidth: number[], colspan = colwidth.length) {
  return schema.node(type, {
    colspan,
    rowspan: 1,
    colwidth,
    background: '',
    ...(type === 'table_header' ? { scope: 'col' } : {}),
  }, [paragraph(text)]);
}

describe('DOCX table column geometry', () => {
  it.each(['0', 'false', 'off'])('does not turn an explicitly disabled header (%s) into header cells', value => {
    const imported = importDOCX(packageWithTable(`<w:tbl><w:tr><w:trPr><w:tblHeader w:val="${value}"/></w:trPr><w:tc><w:p><w:r><w:t>Ordinary measurement</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`), schema);
    expect(imported.document.child(0).child(0).child(0).type.name).toBe('table_cell');
    expect(imported.report.issues).toEqual([]);
    const exported = exportDOCX(imported.document);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);
    expect(xml).toContain('<w:tblHeader w:val="false"/>');
    expect(xml).not.toContain('EDE9FE');
    expect(importDOCX(exported.bytes, schema).document.child(0).child(0).child(0).type.name).toBe('table_cell');
  });

  it.each(['', ' w:val="1"', ' w:val="true"', ' w:val="on"'])('retains a supported enabled header declaration%s', attributes => {
    const imported = importDOCX(packageWithTable(`<w:tbl><w:tr><w:trPr><w:tblHeader${attributes}/></w:trPr><w:tc><w:p/></w:tc></w:tr></w:tbl>`), schema);
    expect(imported.document.child(0).child(0).attrs.repeatHeader).toBe(true);
    expect(imported.document.child(0).child(0).child(0).type.name).toBe('table_cell');
    expect(imported.report.issues).toEqual([]);
  });

  it('reports invalid flags and does not trust foreign header elements or attribute namespaces', () => {
    const imported = importDOCX(packageWithTable('<w:tbl><w:tr><w:trPr><w:tblHeader w:val="maybe"/></w:trPr><w:tc><w:p/></w:tc></w:tr></w:tbl>'), schema);
    expect(imported.document.child(0).child(0).child(0).type.name).toBe('table_cell');
    expect(imported.report.issues).toContainEqual(expect.objectContaining({ code: 'invalid-table-header', path: [0, 0] }));
    const foreign = importDOCX(packageWithTable('<w:tbl xmlns:x="urn:foreign"><w:tr><w:trPr><x:tblHeader/></w:trPr><w:tc><w:p/></w:tc></w:tr><w:tr><w:trPr><w:tblHeader w:val="false" x:val="true"/></w:trPr><w:tc><w:p/></w:tc></w:tr></w:tbl>'), schema);
    expect(foreign.document.child(0).content.map(row => row.child(0).type.name)).toEqual(['table_cell', 'table_cell']);
  });

  it('rejects ambiguous repeated-header declarations rather than choosing one', () => {
    expect(() => importDOCX(packageWithTable('<w:tbl><w:tr><w:trPr><w:tblHeader w:val="false"/><w:tblHeader/></w:trPr><w:tc><w:p/></w:tc></w:tr></w:tbl>'), schema)).toThrow(/Ambiguous/);
  });

  it('imports an independent Word grid into every ordinary and spanning cell', () => {
    const table = '<w:tbl>'
      + '<w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr>'
      + '<w:tblGrid><w:gridCol w:w="1200"/><w:gridCol w:w="1800"/><w:gridCol w:w="2400"/></w:tblGrid>'
      + '<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:tcPr><w:tcW w:w="5400" w:type="dxa"/><w:gridSpan w:val="3"/></w:tcPr><w:p><w:r><w:t>Measurements</w:t></w:r></w:p></w:tc></w:tr>'
      + '<w:tr>'
      + '<w:tc><w:tcPr><w:tcW w:w="1200" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc>'
      + '<w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc>'
      + '<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>C</w:t></w:r></w:p></w:tc>'
      + '</w:tr></w:tbl>';
    const imported = importDOCX(packageWithTable(table), schema);
    const result = imported.document.child(0);

    expect(result.child(0).child(0).attrs.colwidth).toEqual([80, 120, 160]);
    expect(result.child(1).content.map(item => item.attrs.colwidth)).toEqual([[80], [120], [160]]);
    expect(imported.report.fidelity).toBe('lossy');
    expect(imported.report.issues).toEqual([expect.objectContaining({ code: 'table-style-appearance-unresolved', path: [0] })]);
  });

  it('reports harmless whole-pixel normalization without turning it into semantic loss', () => {
    const cells = ['A', 'B', 'C'].map(text => `<w:tc><w:tcPr><w:tcW w:w="3312" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`).join('');
    const table = '<w:tbl><w:tblGrid><w:gridCol w:w="3312"/><w:gridCol w:w="3312"/><w:gridCol w:w="3312"/></w:tblGrid>'
      + `<w:tr>${cells}</w:tr></w:tbl>`;
    const imported = importDOCX(packageWithTable(table), schema);

    expect(imported.document.child(0).child(0).content.map(item => item.attrs.colwidth)).toEqual([[221], [221], [221]]);
    expect(imported.report.fidelity).toBe('bounded');
    expect(imported.report.issues.map(issue => issue.code)).toEqual([
      'table-column-width-rounded', 'table-column-width-rounded', 'table-column-width-rounded',
    ]);
  });

  it('retains independent fixed table layout through native export and reopen', () => {
    const table = '<w:tbl>'
      + '<w:tblPr><w:tblLayout w:type="fixed"/></w:tblPr>'
      + '<w:tblGrid><w:gridCol w:w="1200"/><w:gridCol w:w="1800"/></w:tblGrid>'
      + '<w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr>'
      + '</w:tbl>';
    const imported = importDOCX(packageWithTable(table), schema);

    expect(imported.document.child(0).child(0).content.map(item => item.attrs.colwidth)).toEqual([[80], [120]]);
    expect(imported.document.child(0).attrs.layout).toBe('fixed');
    expect(imported.report).toEqual({ format: 'docx', fidelity: 'bounded', issues: [] });
    const exported = exportDOCX(imported.document);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>');
    expect(xml).toContain('<w:tblW w:w="0" w:type="auto"/>');
    expect(importDOCX(exported.bytes, schema).document.child(0).attrs.layout).toBe('fixed');
  });

  it('exports explicit geometry as native grid and cell widths and reopens it', () => {
    const original = schema.node('doc', {}, [schema.node('table', {}, [
      schema.node('table_row', {}, [cell('table_header', 'Measurements', [80, 120, 160], 3)]),
      schema.node('table_row', {}, [cell('table_cell', 'A', [80]), cell('table_cell', 'B', [120]), cell('table_cell', 'C', [160])]),
    ])]);
    const exported = exportDOCX(original);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);

    expect(xml).toContain('<w:tblW w:w="5000" w:type="pct"/>');
    expect(xml).not.toContain('<w:tblLayout w:type="fixed"/>');
    expect(xml).toContain('<w:tblGrid><w:gridCol w:w="1200"/><w:gridCol w:w="1800"/><w:gridCol w:w="2400"/></w:tblGrid>');
    expect(xml).toContain('<w:tcW w:w="5400" w:type="dxa"/><w:gridSpan w:val="3"/>');
    expect(exported.report.issues.some(issue => issue.code === 'table-column-width-conflict')).toBe(false);

    const reopened = importDOCX(exported.bytes, schema).document.child(0);
    expect(reopened.child(0).child(0).attrs.colwidth).toEqual([80, 120, 160]);
    expect(reopened.child(1).content.map(item => item.attrs.colwidth)).toEqual([[80], [120], [160]]);
  });

  it('chooses the first document-order width and reports conflicting cell geometry', () => {
    const original = schema.node('doc', {}, [schema.node('table', {}, [
      schema.node('table_row', {}, [cell('table_cell', 'First', [80]), cell('table_cell', 'Stable', [120])]),
      schema.node('table_row', {}, [cell('table_cell', 'Conflict', [90]), cell('table_cell', 'Same', [120])]),
    ])]);
    const exported = exportDOCX(original);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);

    expect(exported.report.fidelity).toBe('lossy');
    expect(exported.report.issues).toContainEqual(expect.objectContaining({
      code: 'table-column-width-conflict', path: [0, 1, 0],
    }));
    expect(xml).toContain('<w:tblGrid><w:gridCol w:w="1200"/><w:gridCol w:w="1800"/></w:tblGrid>');
    const reopened = importDOCX(exported.bytes, schema).document.child(0);
    expect(reopened.child(0).content.map(item => item.attrs.colwidth)).toEqual([[80], [120]]);
    expect(reopened.child(1).content.map(item => item.attrs.colwidth)).toEqual([[80], [120]]);
  });

  it('does not invent columns from an ambiguous spanning preferred width', () => {
    const table = '<w:tbl><w:tr><w:tc><w:tcPr><w:tcW w:w="3600" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Wide</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    const imported = importDOCX(packageWithTable(table), schema);

    expect(imported.document.child(0).child(0).child(0).attrs.colwidth).toBeNull();
    expect(imported.report).toMatchObject({
      fidelity: 'lossy',
      issues: [expect.objectContaining({ code: 'ambiguous-spanned-cell-width', path: [0, 0, 0] })],
    });
  });

  it('retains an explicit autofit choice and reports invalid or unavailable layout', () => {
    const body = '<w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc></w:tr>';
    const source = (mode: string) => packageWithTable(`<w:tbl><w:tblPr><w:tblLayout w:type="${mode}"/></w:tblPr>${body}</w:tbl>`);
    const auto = importDOCX(source('autofit'), schema);
    expect(auto.document.child(0).attrs.layout).toBe('auto');
    expect(strFromU8(unzipSync(exportDOCX(auto.document).bytes)['word/document.xml']!)).toContain('<w:tblLayout w:type="autofit"/>');
    expect(importDOCX(source('unexpected'), schema).report.issues).toContainEqual(expect.objectContaining({ code: 'unsupported-table-layout', path: [0] }));
    const legacy = new Schema({ ...schema.spec, nodes: { ...schema.spec.nodes, table: { ...schema.spec.nodes.table, attrs: {} } } });
    expect(importDOCX(source('fixed'), legacy).report.issues).toContainEqual(expect.objectContaining({ code: 'table-layout-not-imported', path: [0] }));
  });

  it('reports row-level layout exceptions instead of claiming whole-table equivalence', () => {
    const source = packageWithTable('<w:tbl><w:tblPr><w:tblLayout w:type="fixed"/></w:tblPr><w:tr><w:tblPrEx><w:tblLayout w:type="autofit"/></w:tblPrEx><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc></w:tr></w:tbl>');
    const imported = importDOCX(source, schema);
    expect(imported.document.child(0).attrs.layout).toBe('fixed');
    expect(imported.report.issues).toContainEqual(expect.objectContaining({ code: 'table-row-layout-exception-not-imported', path: [0, 0] }));
  });

  it('reports missing fixed geometry on both import and export', () => {
    const imported = importDOCX(packageWithTable('<w:tbl><w:tblPr><w:tblLayout w:type="fixed"/></w:tblPr><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'), schema);
    expect(imported.report.issues).toContainEqual(expect.objectContaining({ code: 'fixed-table-grid-incomplete', path: [0] }));
    const exported = exportDOCX(imported.document);
    expect(exported.report.issues).toContainEqual(expect.objectContaining({ code: 'fixed-table-column-width-defaulted', path: [0] }));
  });
});
