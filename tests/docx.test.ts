import { unzipSync, strFromU8, strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { Schema } from '../src/core';
import { exportDOCX, importDOCX } from '../src/docx';
import { StarterKit } from '../src/extensions';

const schema = new Schema(StarterKit.schema);
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const ONE_PIXEL_DATA_URL = `data:image/png;base64,${ONE_PIXEL_PNG}`;

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
    expect(result.report.issues[0]).toMatchObject({ code: 'image-source-unavailable', path: [0] });
    expect(importDOCX(result.bytes, schema).document.textContent).toContain('Diagram');
  });

  it('embeds verified raster images and round-trips block and inline image semantics', () => {
    const block = schema.node('image_super', {
      src: ONE_PIXEL_DATA_URL, alt: 'Architecture diagram', title: 'System map', width: '320px', height: '180px',
      align: 'center', loading: 'lazy', decoding: 'async', srcset: '', sizes: '', caption: 'Portable architecture',
    });
    const inline = schema.node('inline_image', {
      src: ONE_PIXEL_DATA_URL, alt: 'Status', title: '', width: '24px', height: '24px',
      align: 'center', loading: 'lazy', decoding: 'async', srcset: '', sizes: '',
    });
    const original = schema.node('doc', {}, [
      block,
      schema.node('paragraph', {}, [schema.text('State '), inline, schema.text(' ready')]),
    ]);

    const exported = exportDOCX(original);
    expect(exported.report).toEqual({ format: 'docx', fidelity: 'bounded', issues: [] });
    const archive = unzipSync(exported.bytes);
    expect(archive['word/media/image1.png']).toEqual(new Uint8Array(Buffer.from(ONE_PIXEL_PNG, 'base64')));
    expect(strFromU8(archive['[Content_Types].xml']!)).toContain('Extension="png" ContentType="image/png"');
    expect(strFromU8(archive['word/_rels/document.xml.rels']!)).toContain('Id="rIdImage1"');
    const xml = strFromU8(archive['word/document.xml']!);
    expect(xml.match(/r:embed="rIdImage1"/g)).toHaveLength(2);
    expect(xml).toContain('descr="Architecture diagram"');
    expect(xml).toContain('<w:pStyle w:val="Caption"/>');

    const imported = importDOCX(exported.bytes, schema);
    expect(imported.report).toEqual({ format: 'docx', fidelity: 'bounded', issues: [] });
    expect(imported.document.content.map((node) => node.type.name)).toEqual(['image_super', 'paragraph']);
    expect(imported.document.child(0).attrs).toMatchObject({
      src: ONE_PIXEL_DATA_URL, alt: 'Architecture diagram', title: 'System map', width: '320px', height: '180px',
      caption: 'Portable architecture',
    });
    expect(imported.document.child(1).content.map((node) => node.type.name)).toEqual(['text', 'inline_image', 'text']);
    expect(imported.document.child(1).content[1]?.attrs).toMatchObject({ src: ONE_PIXEL_DATA_URL, alt: 'Status', width: '24px', height: '24px' });
  });

  it('requires explicit host resolution for non-data images and validates the returned bytes', () => {
    const remote = schema.node('image_super', {
      src: 'https://cdn.example.com/diagram.png', alt: 'Remote diagram', title: '', width: '100px', height: '80px',
      align: 'center', loading: 'lazy', decoding: 'async', srcset: '', sizes: '', caption: '',
    });
    const document = schema.node('doc', {}, [remote]);
    const exported = exportDOCX(document, {
      resolveImage: (source) => source.includes('diagram')
        ? { bytes: new Uint8Array(Buffer.from(ONE_PIXEL_PNG, 'base64')), contentType: 'image/png' }
        : undefined,
    });
    expect(exported.report.fidelity).toBe('bounded');
    expect(unzipSync(exported.bytes)['word/media/image1.png']).toBeDefined();

    const mismatched = exportDOCX(document, {
      resolveImage: () => ({ bytes: new Uint8Array(Buffer.from(ONE_PIXEL_PNG, 'base64')), contentType: 'image/jpeg' }),
    });
    expect(mismatched.report).toMatchObject({ fidelity: 'lossy', issues: [{ code: 'image-type-mismatch', path: [0] }] });
    expect(unzipSync(mismatched.bytes)['word/media/image1.png']).toBeUndefined();
  });

  it('does not fetch linked Word images and enforces media resource limits', () => {
    const documentXML = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body><w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="1" descr="External diagram"/><a:graphic><a:graphicData><a:blip r:embed="rId9"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>`;
    const relationships = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.com/image.png" TargetMode="External"/></Relationships>`;
    const linked = importDOCX(zipSync({
      'word/document.xml': strToU8(documentXML),
      'word/_rels/document.xml.rels': strToU8(relationships),
    }), schema);
    expect(linked.document.textContent).toContain('External diagram');
    expect(linked.report.issues[0]).toMatchObject({ code: 'external-image-omitted', path: [0] });

    const withMedia = zipSync({
      'word/document.xml': strToU8('<w:document><w:body><w:p/></w:body></w:document>'),
      'word/media/image1.png': new Uint8Array(Buffer.from(ONE_PIXEL_PNG, 'base64')),
    });
    expect(() => importDOCX(withMedia, schema, { maxMediaBytes: 16 })).toThrow(/media exceeds 16/);
    const image = schema.node('image_super', { src: ONE_PIXEL_DATA_URL, alt: '', title: '', width: '10px', height: '10px', align: 'center', loading: 'lazy', decoding: 'async', srcset: '', sizes: '', caption: '' });
    expect(() => exportDOCX(schema.node('doc', {}, [image]), { maxMediaBytes: 16 })).toThrow(/media exceeds 16/);
  });

  it('lets hosts map copied embedded bytes without trusting unsafe or escaping targets', () => {
    const documentXML = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body><w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="95250" cy="190500"/><wp:docPr id="1" descr="Mapped image" title="Trusted upload"/><a:graphic><a:graphicData><a:blip r:embed="rIdImage"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>`;
    const relationships = (target: string) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/></Relationships>`;
    const packageWith = (target: string) => zipSync({
      'word/document.xml': strToU8(documentXML),
      'word/_rels/document.xml.rels': strToU8(relationships(target)),
      'word/media/pixel.png': new Uint8Array(Buffer.from(ONE_PIXEL_PNG, 'base64')),
    });
    let receivedBytes = 0;
    const mapped = importDOCX(packageWith('media/pixel.png'), schema, {
      createImageSource: (image) => {
        receivedBytes = image.bytes.byteLength;
        expect(image).toMatchObject({ contentType: 'image/png', fileName: 'pixel.png', alt: 'Mapped image', title: 'Trusted upload', width: '10px', height: '20px' });
        return '/authorized/media/pixel.png';
      },
    });
    expect(receivedBytes).toBeGreaterThan(8);
    expect(mapped.document.child(0).attrs.src).toBe('/authorized/media/pixel.png');

    const unsafe = importDOCX(packageWith('media/pixel.png'), schema, { createImageSource: () => 'javascript:alert(1)' });
    expect(unsafe.document.textContent).toContain('Mapped image');
    expect(unsafe.report.issues[0]?.code).toBe('unsafe-image-source');

    const escaping = importDOCX(packageWith('../../word/media/pixel.png'), schema);
    expect(escaping.document.textContent).toContain('Mapped image');
    expect(escaping.report.issues[0]?.code).toBe('missing-image-part');
  });
});
