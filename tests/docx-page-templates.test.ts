import { withDOCXExportDefaults } from './fixtures/docx-page-defaults';
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit, composeExtensions } from '../src/extensions';
import { PagesExtension, inspectPageTemplates } from '../src/pages';
import { importDOCX, exportDOCX } from '../src/docx';

const schema = new Schema(composeExtensions([...StarterKit.extensions, PagesExtension]).schema);
const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rel = 'http://schemas.openxmlformats.org/package/2006/relationships';
const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
function input({ section = '<w:headerReference w:type="default" r:id="head"/><w:footerReference w:type="default" r:id="foot"/>',
  header = p('Header'), footer = '<w:p><w:r><w:t>Page </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>9</w:t></w:r></w:fldSimple></w:p>',
  body = p('Body'), parts = {}, relationships = '' }:
  { section?: string; header?: string; footer?: string; body?: string; parts?: Record<string, Uint8Array>; relationships?: string } = {}) {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body>${body}<w:sectPr>${section}</w:sectPr></w:body></w:document>`),
    'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${rel}"><Relationship Id="head" Type="${r}/header" Target="stories/header%20one.xml"/><Relationship Id="foot" Type="${r}/footer" Target="footer1.xml"/>${relationships}</Relationships>`),
    'word/stories/header one.xml': strToU8(`<w:hdr xmlns:w="${w}" xmlns:r="${r}">${header}</w:hdr>`),
    'word/footer1.xml': strToU8(`<w:ftr xmlns:w="${w}">${footer}</w:ftr>`),
    ...parts,
  });
}
const read = (bytes: Uint8Array) => importDOCX(bytes, schema);

describe('native DOCX page templates', () => {
  it('imports independent header/footer parts and page fields without a DOM', () => {
    expect(typeof document).toBe('undefined');
    const result = read(input());
    expect(result.document.content.map(node => node.type.name)).toEqual(['paragraph', 'page_header', 'page_footer']);
    expect(result.document.child(1).textContent).toBe('Header');
    expect(result.document.child(2).child(0).child(1).toJSON()).toEqual({ type: 'page_field', attrs: { kind: 'page-number' } });
    expect(inspectPageTemplates(result.document).valid).toBe(true);
    expect(result.report.issues).toEqual([]);
    expect(result.packageParts.find(part => part.path === 'word/stories/header one.xml')?.handling).toBe('adapter-input');
  });

  it('writes native parts, reference relationships and fields and reimports linked content', () => {
    const doc = read(input()).document;
    const result = exportDOCX(doc);
    const parts = unzipSync(result.bytes);
    expect(strFromU8(parts['word/document.xml']!)).toContain('headerReference');
    expect(strFromU8(parts['word/document.xml']!)).not.toContain('Header</w:t>');
    expect(strFromU8(parts['word/header1.xml']!)).toContain('Header');
    expect(strFromU8(parts['word/footer2.xml']!)).toContain('w:instr="PAGE"');
    expect(strFromU8(parts['[Content_Types].xml']!)).toContain('wordprocessingml.header+xml');
    expect(read(result.bytes).document.toJSON()).toEqual(withDOCXExportDefaults(doc.toJSON()));
    expect(result.report.issues.some(issue => issue.code === 'page-field-recalculation-required')).toBe(true);
  });

  it('extracts a header image and hyperlink via local relationships and retains the bytes', () => {
    const result = read(input({ header: `<w:p><w:hyperlink r:id="link"><w:r><w:t>Lab</w:t></w:r></w:hyperlink><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="1143000" cy="238125"/><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="logo"/></wp:inline></w:drawing></w:r></w:p>`, parts: {
      'word/stories/_rels/header one.xml.rels': strToU8(`<Relationships xmlns="${rel}"><Relationship Id="logo" Type="${r}/image" Target="../media/logo.png"/><Relationship Id="link" Type="${r}/hyperlink" Target="https://example.test/lab" TargetMode="External"/></Relationships>`),
      'word/media/logo.png': Uint8Array.from(Buffer.from(png, 'base64')),
    } }));
    const paragraph = result.document.child(1).child(0);
    expect(paragraph.child(0).marks[0].attrs.href).toBe('https://example.test/lab');
    expect(paragraph.child(1).attrs.src).toBe(`data:image/png;base64,${png}`);
    expect(result.packageParts.find(part => part.path === 'word/media/logo.png')?.handling).toBe('imported-image');
    expect(read(exportDOCX(result.document).bytes).document.toJSON()).toEqual(withDOCXExportDefaults(result.document.toJSON()));
  });

  it('preserves enabled first/even variants and blank fallbacks rather than substituting defaults', () => {
    const result = read(input({ section: '<w:headerReference w:type="default" r:id="head"/><w:titlePg/>', parts: {
      'word/settings.xml': strToU8(`<w:settings xmlns:w="${w}"><w:evenAndOddHeaders/></w:settings>`),
    } }));
    const templates = inspectPageTemplates(result.document).templates;
    expect(templates.map(item => `${item.kind}:${item.variant}`)).toEqual(['header:default', 'header:first', 'header:even', 'footer:first', 'footer:even']);
    expect(result.document.child(2).textContent).toBe('');
    const exported = exportDOCX(result.document);
    const zip = unzipSync(exported.bytes);
    expect(strFromU8(zip['word/settings.xml']!)).toContain('evenAndOddHeaders');
    expect(strFromU8(zip['word/document.xml']!)).toContain('titlePg');
    expect(inspectPageTemplates(read(exported.bytes).document).valid).toBe(true);
  });

  it('does not activate disabled templates, flatten multiple sections, or parse schema-opted-out stories', () => {
    const inactive = read(input({ section: '<w:headerReference w:type="first" r:id="head"/>' }));
    expect(inactive.document.textContent).toBe('Body');
    expect(inactive.report.issues.some(issue => issue.code === 'inactive-page-template-not-imported')).toBe(true);
    const multiple = read(input({ body: '<w:p><w:pPr><w:sectPr/></w:pPr></w:p>' }));
    expect(multiple.report.issues.some(issue => issue.code === 'section-templates-not-imported')).toBe(true);
    expect(inspectPageTemplates(multiple.document).templates).toHaveLength(0);
    const absent = importDOCX(input({ parts: { 'word/footer1.xml': strToU8('invalid XML') } }), new Schema(StarterKit.schema));
    expect(absent.document.textContent).toBe('Body');
  });

  it('keeps unsupported fields as cached text and never executes their instructions', () => {
    const result = read(input({ footer: '<w:p><w:fldSimple w:instr="INCLUDETEXT secret.txt"><w:r><w:t>Cached</w:t></w:r></w:fldSimple></w:p>' }));
    expect(result.document.child(2).textContent).toBe('Cached');
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'unsupported-word-field', sourcePart: 'word/footer1.xml' }));
  });

  it('rejects duplicate variants, missing/ambiguous relationships, wrong roots and oversized stories', () => {
    expect(() => read(input({ section: '<w:headerReference w:type="default" r:id="head"/><w:headerReference w:type="default" r:id="head"/>' }))).toThrow('duplicate');
    expect(() => read(input({ relationships: `<Relationship Id="head" Type="${r}/header" Target="footer1.xml"/>` }))).toThrow('invalid relationship');
    expect(() => read(input({ parts: { 'word/footer1.xml': strToU8(`<w:hdr xmlns:w="${w}"/>`) } }))).toThrow('header/footer root');
    expect(() => importDOCX(input({ header: p('x'.repeat(3000)) }), schema, { maxDocumentXmlBytes: 1200 })).toThrow('expanded byte limit');
  });

  it('rejects malformed model ownership and duplicate template identities before export', () => {
    const doc = read(input()).document;
    expect(() => exportDOCX(schema.node('doc', {}, [...doc.content, doc.child(1)]))).toThrow('unique top-level');
    expect(() => exportDOCX(schema.node('doc', {}, [schema.node('blockquote', {}, [doc.child(1)])]))).toThrow('unique top-level');
    expect(() => exportDOCX(schema.node('doc', {}, [doc.child(2).child(0)]))).toThrow('require a header/footer');
  });
});
