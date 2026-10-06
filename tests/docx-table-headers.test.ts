import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { exportDOCX, importDOCX } from '../src/docx';
import { withDOCXExportDefaults } from './fixtures/docx-page-defaults';

const schema = new Schema(StarterKit.schema);
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function source(flags: string[]) {
  return zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="${ns}"><w:body><w:tbl>${flags.map((flag, i) =>
    `<w:tr>${flag}<w:tc><w:p><w:r><w:t>Row ${i}</w:t></w:r></w:p></w:tc></w:tr>`).join('')}</w:tbl></w:body></w:document>`) });
}
function xml(bytes: Uint8Array) { return strFromU8(unzipSync(bytes)['word/document.xml']!); }

describe('Word row repetition is independent of semantic cell roles', () => {
  it('keeps unstyled repeated Word rows as ordinary cells without inventing fill or emphasis', () => {
    const imported = importDOCX(source(['<w:trPr><w:tblHeader/></w:trPr>', '']), schema);
    const table = imported.document.child(0);
    expect(table.content.map(row => row.attrs.repeatHeader)).toEqual([true, false]);
    expect(table.content.map(row => row.child(0).type.name)).toEqual(['table_cell', 'table_cell']);
    const output = exportDOCX(imported.document);
    expect(xml(output.bytes)).not.toContain('EDE9FE');
    expect(xml(output.bytes).match(/<w:tblHeader\/>/g)).toHaveLength(1);
    expect(importDOCX(output.bytes, schema).document.toJSON()).toEqual(withDOCXExportDefaults(imported.document.toJSON()));
  });

  it('retains non-leading repeat intent but reports that Word ignores it after a gap', () => {
    const imported = importDOCX(source(['', '<w:trPr><w:tblHeader/></w:trPr>']), schema);
    expect(imported.document.child(0).content.map(row => row.attrs.repeatHeader)).toEqual([false, true]);
    expect(imported.report.issues).toContainEqual(expect.objectContaining({ code: 'nonleading-table-repeat', path: [0, 1] }));
    const output = exportDOCX(imported.document);
    expect(output.report.issues).toContainEqual(expect.objectContaining({ code: 'nonleading-table-repeat', path: [0, 1] }));
    expect(importDOCX(output.bytes, schema).document.child(0).child(1).attrs.repeatHeader).toBe(true);
  });

  it.each(['col', 'row', 'colgroup', 'rowgroup'])('retains Fountain %s cell scope independently of an explicit no-repeat choice', scope => {
    const original = schema.node('doc', {}, [schema.node('table', {}, [schema.node('table_row', { repeatHeader: false }, [
      schema.node('table_header', { scope, background: '#ffffff' }, [schema.node('paragraph', {}, [schema.text('Semantic label')])]),
      schema.node('table_cell', {}, [schema.node('paragraph', {}, [schema.text('Ordinary value')])]),
    ])])]);
    const output = exportDOCX(original);
    expect(xml(output.bytes)).toContain('<w:tblHeader w:val="false"/>');
    expect(xml(output.bytes)).toContain(`urn:fountainjs:docx:table-header:${scope}:v1`);
    expect(output.report.issues).toContainEqual(expect.objectContaining({ code: 'table-header-role-extension', path: [0, 0, 0] }));
    const reopened = importDOCX(output.bytes, schema);
    expect(reopened.document.toJSON()).toEqual(withDOCXExportDefaults(original.toJSON()));
    expect(reopened.report.issues.some(issue => issue.code === 'content-control-unwrapped')).toBe(false);
  });

  it.each([
    '<w:lock w:val="sdtLocked"/>', '<w:dataBinding w:xpath="//secret"/>',
    '<w:tag w:val="urn:fountainjs:docx:table-header:row:v1"/>',
    '<x:tag xmlns:x="urn:foreign" x:val="urn:fountainjs:docx:table-header:row:v1"/>',
  ])('does not restore a role from an ambiguous or behavioral control %s', extra => {
    const input = strFromU8(unzipSync(source(['']))['word/document.xml']!).replace('<w:p>',
      `<w:sdt><w:sdtPr><w:tag w:val="urn:fountainjs:docx:table-header:col:v1"/>${extra}</w:sdtPr><w:sdtContent><w:p>`)
      .replace('</w:p>', '</w:p></w:sdtContent></w:sdt>');
    const result = importDOCX(zipSync({ 'word/document.xml': strToU8(input) }), schema);
    expect(result.document.child(0).child(0).child(0).type.name).toBe('table_cell');
    expect(result.document.textContent).toBe('Row 0');
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'content-control-unwrapped' }));
  });

  it('reports missing receiving row support without repurposing cells to emulate the flag', () => {
    const legacy = new Schema({ ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes,
      table_row: { ...StarterKit.schema.nodes.table_row!, attrs: {} },
    } });
    const result = importDOCX(source(['<w:trPr><w:tblHeader/></w:trPr>']), legacy);
    expect(result.document.child(0).child(0).child(0).type.name).toBe('table_cell');
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'table-row-repeat-not-imported', path: [0, 0] }));
  });
});
