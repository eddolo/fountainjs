import { unzipSync, strFromU8, strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { Schema } from '../src/core';
import { exportDOCX, importDOCX } from '../src/docx';
import { StarterKit } from '../src/extensions';

const schema = new Schema(StarterKit.schema);

function documentFixture() {
  const strong = schema.marks.strong.create();
  const em = schema.marks.em.create();
  const link = schema.marks.link.create({ href: 'https://example.com/guide', title: '', target: '_blank' });
  return schema.node('doc', {}, [
    schema.node('heading', { level: 2, align: 'center' }, [schema.text('Release brief', [strong])]),
    schema.node('paragraph', { align: 'left' }, [
      schema.text('Portable '),
      schema.text('Word', [em, link]),
      schema.text(' interchange.'),
    ]),
    schema.node('bullet_list', {}, [
      schema.node('list_item', {}, [schema.node('paragraph', {}, [schema.text('First point')])]),
      schema.node('list_item', {}, [
        schema.node('paragraph', {}, [schema.text('Second point')]),
        schema.node('ordered_list', { start: 1 }, [
          schema.node('list_item', {}, [schema.node('paragraph', {}, [schema.text('Nested point')])]),
        ]),
      ]),
    ]),
    schema.node('blockquote', {}, [schema.node('paragraph', {}, [schema.text('Review this claim.')])]),
    schema.node('table', {}, [
      schema.node('table_row', {}, [
        schema.node('table_header', { colspan: 1, rowspan: 1, colwidth: null, background: '', scope: 'col' }, [schema.node('paragraph', {}, [schema.text('Name')])]),
        schema.node('table_header', { colspan: 1, rowspan: 1, colwidth: null, background: '', scope: 'col' }, [schema.node('paragraph', {}, [schema.text('State')])]),
      ]),
      schema.node('table_row', {}, [
        schema.node('table_cell', { colspan: 1, rowspan: 1, colwidth: null, background: '' }, [schema.node('paragraph', {}, [schema.text('DOCX')])]),
        schema.node('table_cell', { colspan: 1, rowspan: 1, colwidth: null, background: '' }, [schema.node('paragraph', {}, [schema.text('Ready')])]),
      ]),
    ]),
  ]);
}

describe('DOCX interchange', () => {
  it('exports a valid bounded OOXML package and imports its structure in pure JavaScript', () => {
    const original = documentFixture();
    const exported = exportDOCX(original, { title: 'Fountain release', creator: 'Test host', page: 'a4' });
    expect(exported.bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
    expect(exported.report).toEqual({ format: 'docx', fidelity: 'bounded', issues: [] });

    const archive = unzipSync(exported.bytes);
    expect(Object.keys(archive).sort()).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'docProps/app.xml', 'docProps/core.xml',
      'word/_rels/document.xml.rels', 'word/document.xml', 'word/numbering.xml', 'word/styles.xml',
    ]);
    const xml = strFromU8(archive['word/document.xml']!);
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('<w:tblGrid><w:gridCol');
    expect(xml).toContain('<w:hyperlink r:id="rId1"');
    expect(strFromU8(archive['docProps/core.xml']!)).toContain('Fountain release');

    const imported = importDOCX(exported.bytes, schema);
    expect(imported.document.textContent).toBe(original.textContent);
    expect(imported.document.content.map((node) => node.type.name)).toEqual([
      'heading', 'paragraph', 'bullet_list', 'blockquote', 'table',
    ]);
    expect(imported.document.content[0]?.attrs).toMatchObject({ level: 2, align: 'center' });
    expect(imported.document.content[1]?.content[1]?.marks.map((item) => item.type.name)).toEqual(['em', 'link']);
    expect(imported.document.content[2]?.content[1]?.content[1]?.type.name).toBe('ordered_list');
    expect(imported.document.content[4]?.content[0]?.content[0]?.type.name).toBe('table_header');
  });

  it('handles tracked changes explicitly instead of silently mixing revisions', () => {
    const documentXML = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Keep </w:t></w:r><w:ins><w:r><w:t>inserted</w:t></w:r></w:ins><w:del><w:r><w:delText> deleted</w:delText></w:r></w:del></w:p><w:sectPr/></w:body></w:document>`;
    const bytes = zipSync({ 'word/document.xml': strToU8(documentXML) });
    const imported = importDOCX(bytes, schema);
    expect(imported.document.textContent).toBe('Keep inserted');
    expect(imported.report.fidelity).toBe('lossy');
    expect(imported.report.issues.map((issue) => issue.code)).toEqual(['accepted-insertion', 'omitted-deletion']);
  });

  it('preserves hyperlink text but reports and drops an unsafe external target', () => {
    const documentXML = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:hyperlink r:id="rId9"><w:r><w:t>Readable label</w:t></w:r></w:hyperlink></w:p></w:body></w:document>`;
    const relationships = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/></Relationships>`;
    const imported = importDOCX(zipSync({
      'word/document.xml': strToU8(documentXML),
      'word/_rels/document.xml.rels': strToU8(relationships),
    }), schema);
    expect(imported.document.textContent).toBe('Readable label');
    expect(imported.document.content[0]?.content[0]?.marks).toEqual([]);
    expect(imported.report).toMatchObject({
      fidelity: 'lossy',
      issues: [{ code: 'unsafe-hyperlink-omitted', path: [0] }],
    });
  });

  it('recognizes the built-in Word list styles used by independent producers', () => {
    const documentXML = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:t>First</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:t>Second</w:t></w:r></w:p></w:body></w:document>`;
    const imported = importDOCX(zipSync({ 'word/document.xml': strToU8(documentXML) }), schema);
    expect(imported.document.content).toHaveLength(1);
    expect(imported.document.content[0]?.type.name).toBe('bullet_list');
    expect(imported.document.content[0]?.content.map((item) => item.textContent)).toEqual(['First', 'Second']);
  });

  it('rejects missing documents and bounded archive expansion', () => {
    expect(() => importDOCX(zipSync({ 'other.xml': strToU8('<x/>') }), schema)).toThrow(/document\.xml is missing/);
    const bytes = zipSync({ 'word/document.xml': strToU8(`<w:document><w:body><w:p><w:r><w:t>${'x'.repeat(200)}</w:t></w:r></w:p></w:body></w:document>`) });
    expect(() => importDOCX(bytes, schema, { maxDocumentXmlBytes: 64 })).toThrow(/exceeds 64 bytes/);
  });

  it('reports unsupported Fountain blocks instead of claiming lossless DOCX output', () => {
    const image = schema.node('image_super', { src: 'https://example.com/image.png', alt: 'Diagram', title: '', width: '100%', height: 'auto', align: 'center', loading: 'lazy', decoding: 'async', srcset: '', sizes: '', caption: 'Architecture' });
    const result = exportDOCX(schema.node('doc', {}, [image]));
    expect(result.report.fidelity).toBe('lossy');
    expect(result.report.issues[0]).toMatchObject({ code: 'block-fallback', path: [0] });
    expect(importDOCX(result.bytes, schema).document.textContent).toContain('Diagram');
  });
});
