import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { exportDOCX, importDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function source(width: string, extra = '') {
  return zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body><w:tbl><w:tblPr>${width}</w:tblPr><w:tblGrid><w:gridCol w:w="1800"/></w:tblGrid><w:tr>${extra}<w:tc><w:p><w:r><w:t>Source content</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`) });
}
describe('native preferred table width bridge', () => {
  it.each([
    ['dxa', '3600', { unit: 'pt', value: 180 }],
    ['dxa', '0', { unit: 'pt', value: 0 }],
    ['pct', '3000', { unit: 'percent', value: 60 }],
    ['pct', '33.3%', { unit: 'percent', value: 33.3 }],
    ['auto', '0', { unit: 'auto' }], ['nil', '0', { unit: 'nil' }],
  ])('retains %s/%s independently of the grid', (type, amount, expected) => {
    const imported = importDOCX(source(`<w:tblW w:w="${amount}" w:type="${type}"/>`), schema);
    expect(imported.document.child(0).attrs.preferredWidth).toEqual(expected);
    expect(imported.document.child(0).child(0).child(0).attrs.colwidth).toEqual([120]);
    expect(imported.report.issues).toEqual([]);
    const output = exportDOCX(imported.document);
    expect(importDOCX(output.bytes, schema).document.child(0).attrs.preferredWidth).toEqual(expected);
    const native = strFromU8(unzipSync(output.bytes)['word/document.xml']!);
    expect(native).toContain(`w:type="${type}"`);
    expect(native).toContain('<w:gridCol w:w="1800"/>');
  });

  it.each(['<w:tblW w:w="-1" w:type="dxa"/>', '<w:tblW w:w="bad" w:type="pct"/>', '<w:tblW w:w="50001" w:type="pct"/>', '<w:tblW w:w="100" w:type="unknown"/>'])('reports unsupported declarations without losing text', declaration => {
    const imported = importDOCX(source(declaration), schema);
    expect(imported.document.textContent).toBe('Source content');
    expect(imported.document.child(0).attrs.preferredWidth).toBeUndefined();
    expect(imported.report.issues).toContainEqual(expect.objectContaining({ code: 'unsupported-table-preferred-width', path: [0] }));
  });

  it('reports schema and row boundaries and ignores foreign namespace lookalikes', () => {
    const table = { ...StarterKit.schema.nodes.table!, attrs: { ...StarterKit.schema.nodes.table!.attrs } };
    delete table.attrs.preferredWidth;
    const limited = new Schema({ ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes, table } });
    const imported = importDOCX(source('<w:tblW w:w="3600" w:type="dxa"/>', '<w:tblPrEx><w:tblW w:w="2400" w:type="dxa"/></w:tblPrEx>'), limited);
    expect(imported.report.issues).toContainEqual(expect.objectContaining({ code: 'table-preferred-width-not-imported', path: [0] }));
    expect(imported.report.issues).toContainEqual(expect.objectContaining({ code: 'table-row-width-exception-not-imported', path: [0, 0] }));
    expect(importDOCX(source('<x:tblW xmlns:x="urn:foreign" x:w="3600" x:type="dxa"/>'), schema).document.child(0).attrs.preferredWidth).toEqual({ unit: 'auto' });
  });

  it('keeps explicit preferences instead of replacing them with a fixed-grid sum and reports rounding', () => {
    const imported = importDOCX(source('<w:tblW w:w="3600" w:type="dxa"/><w:tblLayout w:type="fixed"/>'), schema);
    const output = exportDOCX(imported.document);
    expect(strFromU8(unzipSync(output.bytes)['word/document.xml']!)).toContain('<w:tblW w:w="3600" w:type="dxa"/>');
    const node = imported.document.child(0);
    const rounded = schema.node('doc', {}, [schema.node('table', { ...node.attrs, preferredWidth: { unit: 'pt', value: 180.023 } }, node.content)]);
    expect(exportDOCX(rounded).report.issues).toContainEqual(expect.objectContaining({ code: 'table-preferred-width-rounded', path: [0] }));
  });

  it.each(['', '<w:tblLayout w:type="fixed"/>'])('imports omitted native width as automatic even with %s', layout => {
    const imported = importDOCX(source(layout), schema);
    const table = imported.document.child(0);
    expect(table.attrs.preferredWidth).toEqual({ unit: 'auto' });
    expect(imported.report.issues).toEqual([]);
    const output = exportDOCX(imported.document);
    expect(strFromU8(unzipSync(output.bytes)['word/document.xml']!)).toContain('<w:tblW w:w="0" w:type="auto"/>');
    expect(output.report.issues.some(issue => issue.code === 'table-width-defaulted')).toBe(false);
    expect(importDOCX(output.bytes, schema).document.child(0).attrs.preferredWidth).toEqual({ unit: 'auto' });
  });

  it.each([undefined, 'auto', 'fixed'])('projects fresh %s tables without a complete fixed grid to full width', layout => {
    const cells = [schema.node('table_cell', {}, [schema.node('paragraph', {}, [schema.text('New content')])])];
    const document = schema.node('doc', {}, [schema.node('table', { layout }, [schema.node('table_row', {}, cells)])]);
    const output = exportDOCX(document);
    expect(strFromU8(unzipSync(output.bytes)['word/document.xml']!)).toContain('<w:tblW w:w="5000" w:type="pct"/>');
    expect(output.report.issues).toContainEqual(expect.objectContaining({ code: 'table-width-defaulted', severity: 'info', path: [0] }));
    expect(document.child(0).attrs.preferredWidth).toBeUndefined();
    expect(importDOCX(output.bytes, schema).document.child(0).attrs.preferredWidth).toEqual({ unit: 'percent', value: 100 });
  });

  it('projects only a complete fresh fixed grid to its physical width', () => {
    const cells = [schema.node('table_cell', { colwidth: [120] }, [schema.node('paragraph')])];
    const document = schema.node('doc', {}, [schema.node('table', { layout: 'fixed' }, [schema.node('table_row', {}, cells)])]);
    const output = exportDOCX(document);
    expect(strFromU8(unzipSync(output.bytes)['word/document.xml']!)).toContain('<w:tblW w:w="1800" w:type="dxa"/>');
    expect(output.report.issues).toContainEqual(expect.objectContaining({ code: 'table-width-defaulted', severity: 'info', path: [0] }));
    expect(importDOCX(output.bytes, schema).document.child(0).attrs.preferredWidth).toEqual({ unit: 'pt', value: 90 });
  });
});
