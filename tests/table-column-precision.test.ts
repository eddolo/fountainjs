// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Schema, TableMap, createEditor, resizeTableColumn, selectCells, mergeTableCells, splitTableCell } from '../src/core';
import { StarterKit, createHistoryPlugin, undo } from '../src/extensions';
import { HTMLExporter } from '../src';
import { ServerHTMLImporter } from '../src/html/server';
import { importDOCX, exportDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const p = () => schema.node('paragraph', {}, [schema.text('Measurement')]);
const cell = (colwidth: number[], colspan = colwidth.length) => schema.node('table_cell', { colwidth, colspan }, [p()]);
const doc = () => schema.node('doc', {}, [schema.node('table', { layout: 'fixed' }, [
  schema.node('table_row', {}, [cell([80.2]), cell([120.6])]),
  schema.node('table_row', {}, [cell([80.2]), cell([120.6])]),
])]);

describe('portable fractional table columns', () => {
  it('retains the unchanged Word source grid in native units', () => {
    const imported = importDOCX(readFileSync('tests/fixtures/native-docx/cooling-report.docx'), schema);
    const table = imported.document.content.find(node => node.type.name === 'table')!;
    const map = TableMap.create(table);
    expect([0, 1, 2].map(index => map.columnWidth(index))).toEqual([220.8, 220.8, 220.8]);
    const exported = strFromU8(unzipSync(exportDOCX(imported.document).bytes)['word/document.xml']!);
    expect([...exported.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(match => Number(match[1]))).toEqual([3312, 3312, 3312]);
    expect(exported).toContain('<w:tcW w:w="9936" w:type="dxa"/>');
  });

  it('retains complete JSON through server HTML and an exact native grid cycle', () => {
    const original = doc();
    const before = original.toJSON();
    expect(ServerHTMLImporter.parse(HTMLExporter.export(original), schema).toJSON()).toEqual(before);
    const native = exportDOCX(original);
    const xml = strFromU8(unzipSync(native.bytes)['word/document.xml']!);
    expect(xml).toContain('<w:gridCol w:w="1203"/><w:gridCol w:w="1809"/>');
    const reopened = importDOCX(native.bytes, schema).document.child(0);
    expect(reopened.child(0).content.map(node => node.attrs.colwidth)).toEqual([[80.2], [120.6]]);
    expect(original.toJSON()).toEqual(before);
  });

  it('preserves partial unknown-column sentinels through safe HTML', () => {
    const original = schema.node('doc', {}, [schema.node('table', {}, [schema.node('table_row', {}, [cell([0, 120.6])])])]);
    expect(ServerHTMLImporter.parse(HTMLExporter.export(original), schema).toJSON()).toEqual(original.toJSON());
  });

  it('keeps unaffected fractions through resize, merge/split and complete history restoration', () => {
    const editor = createEditor({ schema: StarterKit.schema, content: doc().toJSON(), plugins: [createHistoryPlugin()] });
    try {
      const original = editor.state.doc.toJSON();
      expect(resizeTableColumn(editor, 110.4, 0, [0])).toBe(true);
      expect(editor.state.doc.child(0).child(1).content.map(node => node.attrs.colwidth)).toEqual([[110.4], [120.6]]);
      expect(undo(editor)).toBe(true);
      expect(editor.state.doc.toJSON()).toEqual(original);
      expect(selectCells(editor, [0, 0, 0], [0, 0, 1])).toBe(true);
      expect(mergeTableCells(editor)).toBe(true);
      expect(editor.state.doc.child(0).child(0).child(0).attrs.colwidth).toEqual([80.2, 120.6]);
      expect(splitTableCell(editor)).toBe(true);
      expect(editor.state.doc.child(0).child(0).content.map(node => node.attrs.colwidth)).toEqual([[80.2], [120.6]]);
    } finally { editor.destroy(); }
  });

  it('uses integer native units for recurring pixel fractions and merged totals', () => {
    const source = zipSync({ 'word/document.xml': strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblGrid><w:gridCol w:w="1201"/><w:gridCol w:w="1802"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>') });
    const imported = importDOCX(source, schema);
    expect(imported.document.child(0).child(0).child(0).attrs.colwidth).toEqual([1201 / 15, 1802 / 15]);
    const xml = strFromU8(unzipSync(exportDOCX(imported.document).bytes)['word/document.xml']!);
    expect(xml).toContain('<w:gridCol w:w="1201"/><w:gridCol w:w="1802"/>');
    expect(xml).toContain('<w:tcW w:w="3003" w:type="dxa"/>');
  });

  it('reports actual native quantization for widths below native resolution', () => {
    const original = schema.node('doc', {}, [schema.node('table', {}, [schema.node('table_row', {}, [cell([80.1234])])])]);
    expect(exportDOCX(original).report.issues).toContainEqual(expect.objectContaining({ code: 'table-column-width-rounded', path: [0, 0, 0] }));
  });

  it.each([NaN, Infinity, -1, 39.99, 2000.01])('retains the existing bounds and refuses %s', width => {
    expect(() => cell([width])).toThrow();
  });
});
