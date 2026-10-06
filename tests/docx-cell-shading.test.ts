import { withDOCXExportDefaults } from './fixtures/docx-page-defaults';
import { describe, expect, it } from 'vitest';
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { importDOCX, exportDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function source(shading: string) {
  return zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="${ns}"><w:body><w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="3"/>${shading}</w:tcPr><w:p><w:r><w:rPr><w:color w:val="FFFFFF"/></w:rPr><w:t>Visible heading</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`) });
}

describe('independent DOCX cell shading', () => {
  it.each([
    ['<w:shd w:fill="173B59"/>', '#173b59'],
    ['<w:shd w:val="solid" w:color="112233" w:fill="FFFFFF"/>', '#112233'],
    ['<w:shd w:val="nil" w:fill="173B59"/>', ''],
    ['<w:shd w:val="clear" w:fill="auto"/>', ''],
  ])('interprets explicit shading %s', (shading, background) => {
    expect(importDOCX(source(shading), schema).document.child(0).child(0).child(0).attrs.background).toBe(background);
  });

  it('reports unresolved theme/pattern semantics without losing explicit RGB fallback', () => {
    const imported = importDOCX(source('<w:shd w:val="pct20" w:themeFill="accent1" w:fill="173B59"/>'), schema);
    expect(imported.document.child(0).child(0).child(0).attrs.background).toBe('#173b59');
    expect(imported.report.issues.map(issue => issue.code)).toEqual(['unresolved-table-shading-theme', 'unsupported-table-shading-pattern']);
    expect(imported.report.issues.every(issue => issue.path?.join('.') === '0.0.0')).toBe(true);
  });

  it('applies cell over row over table shading and respects explicit nil', () => {
    const xml = `<w:document xmlns:w="${ns}"><w:body><w:tbl><w:tblPr><w:shd w:fill="111111"/></w:tblPr><w:tr><w:tblPrEx><w:shd w:fill="222222"/></w:tblPrEx>${['', '<w:shd w:fill="333333"/>', '<w:shd w:val="nil"/>'].map(shd => `<w:tc><w:tcPr>${shd}</w:tcPr><w:p/></w:tc>`).join('')}</w:tr><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>`;
    const table = importDOCX(zipSync({ 'word/document.xml': strToU8(xml) }), schema).document.child(0);
    expect(table.child(0).content.map(cell => cell.attrs.background)).toEqual(['#222222', '#333333', '']);
    expect(table.child(1).child(0).attrs.background).toBe('#111111');
  });

  it('exports custom header backgrounds and shades vertical-merge continuation cells', () => {
    const cell = schema.node('table_header', { background: '#123', rowspan: 2 }, [schema.node('paragraph', {}, [schema.text('Merged')])]);
    const doc = schema.node('doc', {}, [schema.node('table', {}, [schema.node('table_row', {}, [cell]), schema.node('table_row', {}, [])])]);
    const exported = exportDOCX(doc);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);
    expect(xml.match(/w:fill="112233"/g)).toHaveLength(2);
    expect(xml).not.toContain('EDE9FE');
    expect(importDOCX(exported.bytes, schema).document.child(0).child(0).child(0).attrs).toMatchObject({ background: '#112233', rowspan: 2 });
  });

  it('reports invalid fills and never emits background XML injection', () => {
    expect(importDOCX(source('<w:shd w:fill="not-a-color"/>'), schema).report.issues[0]?.code).toBe('invalid-table-shading-color');
    const doc = schema.node('doc', {}, [schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_cell', { background: 'url(https://invalid.test)' }, [schema.node('paragraph')])])])]);
    const exported = exportDOCX(doc);
    expect(exported.report.issues[0]?.code).toBe('unsupported-table-background');
    expect(strFromU8(unzipSync(exported.bytes)['word/document.xml']!)).not.toContain('invalid.test');
  });

  it('keeps the dark fill with white text through import and export', () => {
    const imported = importDOCX(source('<w:shd w:val="clear" w:fill="173B59"/>'), schema);
    const cell = imported.document.child(0).child(0).child(0);
    expect(cell.attrs).toMatchObject({ colspan: 3, background: '#173b59' });
    expect(cell.child(0).child(0).marks[0]?.attrs.color).toBe('#ffffff');
    const reopened = importDOCX(exportDOCX(imported.document).bytes, schema);
    expect(reopened.document.toJSON()).toEqual(withDOCXExportDefaults(imported.document.toJSON()));
  });
});
