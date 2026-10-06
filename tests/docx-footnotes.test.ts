import { withDOCXExportDefaults } from './fixtures/docx-page-defaults';
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit, composeExtensions } from '../src/extensions';
import { PagesExtension, inspectFootnotes, computeFootnoteNumbering } from '../src/pages';
import { importDOCX, exportDOCX } from '../src/docx';

const schema = new Schema(composeExtensions([...StarterKit.extensions, PagesExtension]).schema);
const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rel = 'http://schemas.openxmlformats.org/package/2006/relationships';
const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
function input({ body = '<w:p><w:r><w:t>Body</w:t><w:footnoteReference w:id="7"/></w:r></w:p>',
  notes = '<w:footnote w:id="7"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Retained note</w:t></w:r></w:p></w:footnote>',
  target = 'footnotes.xml', parts = {}, relationships = '' }:
  { body?: string; notes?: string; target?: string; parts?: Record<string, Uint8Array>; relationships?: string } = {}) {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${w}"><w:body>${body}</w:body></w:document>`),
    'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${rel}"><Relationship Id="notes" Type="${r}/footnotes" Target="${target}"/>${relationships}</Relationships>`),
    [`word/${decodeURIComponent(target)}`]: strToU8(`<w:footnotes xmlns:w="${w}" xmlns:r="${r}">${notes}</w:footnotes>`),
    ...parts,
  });
}
const read = (bytes: Uint8Array) => importDOCX(bytes, schema);

describe('native DOCX footnote bridge', () => {
  it('imports a reference plus editable rich definition and derives numbering independently of the Word ID', () => {
    expect(typeof document).toBe('undefined');
    const result = read(input());
    expect(result.document.child(0).child(1).toJSON()).toEqual({ type: 'footnote_reference', attrs: { id: '7' } });
    const note = result.document.child(1);
    expect(note.type.name).toBe('footnote_definition');
    expect(note.attrs.id).toBe('7');
    expect(note.textContent).toBe('Retained note');
    expect(note.child(0).child(0).marks[0].type.name).toBe('strong');
    expect(inspectFootnotes(result.document).valid).toBe(true);
    expect(computeFootnoteNumbering(result.document)[0].label).toBe('1');
    expect(result.report.issues).toEqual([]);
    expect(result.packageParts.find(part => part.path === 'word/footnotes.xml')?.handling).toBe('adapter-input');
  });

  it('exports native notes, separators, relationship and content type then reimports the same structured content', () => {
    const original = read(input()).document;
    const exported = exportDOCX(original);
    const parts = unzipSync(exported.bytes);
    expect(strFromU8(parts['word/document.xml']!)).toContain('<w:footnoteReference w:id="7"/>');
    expect(strFromU8(parts['word/document.xml']!)).not.toContain('Retained note');
    expect(strFromU8(parts['word/footnotes.xml']!)).toContain('<w:footnoteRef/>');
    expect(strFromU8(parts['word/footnotes.xml']!)).toContain('w:type="separator"');
    expect(strFromU8(parts['word/footnotes.xml']!)).toContain('w:type="continuationSeparator"');
    expect(strFromU8(parts['[Content_Types].xml']!)).toContain('wordprocessingml.footnotes+xml');
    expect(strFromU8(parts['word/_rels/document.xml.rels']!)).toContain(`${r}/footnotes`);
    expect(read(exported.bytes).document.toJSON()).toEqual(withDOCXExportDefaults(original.toJSON()));
  });

  it('keeps absent-schema behaviour explicit and does not parse notes without their schema', () => {
    const bytes = input({ parts: { 'word/footnotes.xml': strToU8('not XML') } });
    const result = importDOCX(bytes, new Schema(StarterKit.schema));
    expect(result.document.textContent).toBe('Body');
    expect(result.report.issues.some(issue => issue.code === 'unrepresented-note-reference')).toBe(true);
    expect(() => read(bytes)).toThrow('footnotes root');
  });

  it('resolves encoded custom part names with part-local image and hyperlink relationships', () => {
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    const result = read(input({ target: 'notes/lab%20notes.xml', notes: `<w:footnote w:id="7"><w:p><w:hyperlink r:id="link"><w:r><w:t>Reference</w:t></w:r></w:hyperlink><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="1524000" cy="1143000"/><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="image"/></wp:inline></w:drawing></w:r></w:p></w:footnote>`, parts: {
      'word/notes/_rels/lab notes.xml.rels': strToU8(`<Relationships xmlns="${rel}"><Relationship Id="image" Type="${r}/image" Target="../media/note.png"/><Relationship Id="link" Type="${r}/hyperlink" Target="https://example.test/reference" TargetMode="External"/></Relationships>`),
      'word/media/note.png': png,
    } }));
    const content = result.document.child(1).child(0);
    expect(content.child(0).marks.find(mark => mark.type.name === 'link')?.attrs.href).toBe('https://example.test/reference');
    expect(content.child(1).type.name).toBe('inline_image');
    expect(result.packageParts.find(part => part.path === 'word/media/note.png')?.handling).toBe('imported-image');
    expect(read(exportDOCX(result.document).bytes).document.toJSON()).toEqual(withDOCXExportDefaults(result.document.toJSON()));
  });

  it('normalizes non-native IDs without changing which note a reference points to', () => {
    const original = read(input()).document;
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.node('footnote_reference', { id: 'experiment' })]), schema.node('footnote_definition', { id: 'experiment' }, original.child(1).content)]);
    const exported = exportDOCX(doc);
    expect(exported.report.issues.some(issue => issue.code === 'footnote-id-normalized')).toBe(true);
    const reopened = read(exported.bytes).document;
    expect(inspectFootnotes(reopened).valid).toBe(true);
    expect(reopened.child(1).textContent).toBe('Retained note');
  });

  it('preserves unknown/missing references as visible placeholders with a located warning', () => {
    const result = read(input({ notes: '' }));
    expect(result.document.textContent).toContain('[Footnote unavailable]');
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'unresolved-footnote-reference', path: [0], sourcePart: 'word/document.xml' }));
  });

  it('reports custom numbering and separator content instead of claiming default numbering is identical', () => {
    const result = read(input({ notes: '<w:footnote w:id="-1" w:type="separator">' + p('Custom separator') + '</w:footnote><w:footnote w:id="7">' + p('Note') + '</w:footnote>', parts: {
      'word/settings.xml': strToU8(`<w:settings xmlns:w="${w}"><w:footnotePr><w:numStart w:val="4"/></w:footnotePr></w:settings>`),
    } }));
    expect(result.report.issues.map(issue => issue.code)).toEqual(['footnote-separator-not-preserved', 'footnote-numbering-normalized']);
  });

  it('rejects ambiguous definitions, relationships, malformed parts and exhausted expansion limits', () => {
    expect(() => read(input({ notes: '<w:footnote w:id="7"/><w:footnote w:id="7"/>' }))).toThrow('duplicate footnote IDs');
    expect(() => read(input({ relationships: `<Relationship Id="other" Type="${r}/footnotes" Target="footnotes.xml"/>` }))).toThrow('ambiguous footnotes');
    expect(() => read(input({ notes: '<w:footnote w:id="7">' }))).toThrow();
    expect(() => read(input({ parts: { 'word/footnotes.xml': strToU8('<x:footnotes xmlns:x="urn:fake"/>') } }))).toThrow('footnotes root');
    expect(() => importDOCX(input({ notes: '<w:footnote w:id="7">' + p('x'.repeat(3000)) + '</w:footnote>' }), schema, { maxDocumentXmlBytes: 1000 })).toThrow('expanded byte limit');
  });

  it('recovers only recognizable reserved separators that omit their type', () => {
    const result = read(input({ notes: '<w:footnote w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote><w:footnote w:id="7">' + p('Note') + '</w:footnote>' }));
    expect(result.document.childCount).toBe(2);
    expect(result.document.child(1).textContent).toBe('Note');
    expect(result.report.issues.map(issue => issue.code)).toEqual(['footnote-separator-type-inferred']);
    expect(() => read(input({ notes: '<w:footnote w:id="-1">' + p('Not a separator') + '</w:footnote>' }))).toThrow('invalid or duplicate');
  });

  it('retains orphan note content with an actionable import warning', () => {
    const result = read(input({ body: p('No reference') }));
    expect(result.document.child(1).textContent).toBe('Retained note');
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'unreferenced-footnote-definition', path: [1], sourcePart: 'word/footnotes.xml' }));
    expect(() => exportDOCX(result.document)).toThrow('no reference');
  });

  it('rejects export of dangling, duplicate, unreferenced or nested notes instead of dropping text', () => {
    const doc = read(input()).document;
    expect(() => exportDOCX(schema.node('doc', {}, [doc.child(0)]))).toThrow('no definition');
    expect(() => exportDOCX(schema.node('doc', {}, [doc.child(1)]))).toThrow('no reference');
    expect(() => exportDOCX(schema.node('doc', {}, [...doc.content, doc.child(1)]))).toThrow('unique top-level');
    const nested = schema.node('footnote_definition', { id: '7' }, [schema.node('paragraph', {}, [schema.node('footnote_reference', { id: '7' })])]);
    expect(() => exportDOCX(schema.node('doc', {}, [doc.child(0), nested]))).toThrow('inside a footnote');
  });
});
