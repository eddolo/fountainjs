// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Schema } from '../src/core';
import { HTMLExporter } from '../src/core/exporters/html-exporter';
import { ServerHTMLImporter } from '../src/html/server';
import { StarterKit } from '../src/extensions';
import { exportDOCX, importDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const O = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const fonts = (family: string, size: number) => `<w:rFonts w:ascii="${family}" w:hAnsi="${family}"/><w:sz w:val="${size * 2}"/>`;
const r = (text: string, properties = '') => `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t>${text}</w:t></w:r>`;
function fixture(body: string, styles = '', defaults = fonts('Arial', 14)) {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`),
    'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${R}"><Relationship Id="s" Type="${O}/styles" Target="styles.xml"/></Relationships>`),
    'word/styles.xml': strToU8(`<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr>${defaults}</w:rPr></w:rPrDefault></w:docDefaults>${styles}</w:styles>`),
  });
}
const paraFont = (node: ReturnType<typeof importDOCX>['document'], index = 0) => node.child(index).attrs.layout;

describe('DOCX paragraph font context', () => {
  it('retains line-break run fonts and emphasis through DOM-free HTML and native DOCX', () => {
    const properties = fonts('Courier New', 9) + '<w:b/><w:i/>';
    const body = `<w:p><w:pPr><w:rPr>${fonts('Georgia', 24)}</w:rPr></w:pPr><w:r><w:rPr>${properties}</w:rPr><w:t>Before</w:t><w:br/><w:cr/><w:t>After</w:t></w:r></w:p>`;
    const doc = importDOCX(fixture(body), schema).document;
    const paragraph = doc.child(0);
    expect(paragraph.content.map(node => node.type.name)).toEqual(['text', 'hard_break', 'hard_break', 'text']);
    for (const node of paragraph.content) expect(node.marks).toEqual(paragraph.child(0).marks);
    expect(paraFont(doc)).toMatchObject({ fontFamily: 'Georgia', fontSize: 24 });
    expect(ServerHTMLImporter.parse(HTMLExporter.export(doc, { document: false }), schema).toJSON()).toEqual(doc.toJSON());
    const output = exportDOCX(doc);
    const xml = strFromU8(unzipSync(output.bytes)['word/document.xml']!);
    expect(xml.match(/<w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"\/><w:sz w:val="18"\/><w:b\/><w:i\/><\/w:rPr><w:br\/>/g)).toHaveLength(2);
    const reopened = importDOCX(output.bytes, schema).document;
    expect(reopened.child(0).toJSON()).toEqual(paragraph.toJSON());
    // This fixture has no native section; export supplies the documented
    // A4/one-inch-margin default independently of run retention.
    expect(reopened.attrs.pageSettings).toMatchObject({ unit: 'pt', width: 595.3, height: 841.9, marginTop: 72 });
  });

  it('does not apply paragraph-mark fonts to a break with unresolved run fonts', () => {
    const body = `<w:p><w:pPr><w:rPr>${fonts('Georgia', 24)}</w:rPr></w:pPr>${r('Known', fonts('Arial', 12))}<w:r><w:br/></w:r></w:p>`;
    const result = importDOCX(fixture(body, '', ''), schema);
    expect(result.document.child(0).child(1).marks).toEqual([]);
    expect(paraFont(result.document)).not.toHaveProperty('fontFamily');
    expect(paraFont(result.document)).not.toHaveProperty('fontSize');
    expect(result.report.issues.filter(issue => issue.code === 'paragraph-font-context-not-imported')).toHaveLength(2);
  });

  it('reports generated paragraph defaults without guessing from explicitly formatted text', () => {
    const result = importDOCX(fixture(`<w:p>${r('Known', fonts('Arial', 12))}</w:p>`, '', ''), schema);
    expect(paraFont(result.document)).not.toHaveProperty('fontSize');
    const original = result.document.toJSON(), exported = exportDOCX(result.document);
    expect(result.document.toJSON()).toEqual(original);
    expect(exported.report.fidelity).toBe('lossy');
    expect(exported.report.issues).toContainEqual(expect.objectContaining({ code: 'paragraph-font-defaulted', severity: 'warning', path: [0] }));
    const reopened = importDOCX(exported.bytes, schema).document;
    expect(paraFont(reopened)).toMatchObject({ fontFamily: 'Arial', fontSize: 11 });
    expect(reopened.child(0).child(0).marks.find(mark => mark.type.name === 'font_size')?.attrs.size).toBe('12pt');
    const known = importDOCX(fixture(`<w:p>${r('Known', fonts('Arial', 12))}</w:p>`), schema).document;
    expect(exportDOCX(known).report.issues.some(issue => issue.code === 'paragraph-font-defaulted')).toBe(false);
  });

  it('does not acquire generated heading keep flags when the native source resolves them off', () => {
    const styles = '<w:style w:type="paragraph" w:styleId="Heading1"><w:rPr/></w:style>';
    const doc = importDOCX(fixture(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${r('Heading')}</w:p>`, styles), schema).document;
    expect(paraFont(doc)).toMatchObject({ keepWithNext: false, keepLinesTogether: false, pageBreakBefore: false });
    const exported = exportDOCX(doc), xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);
    expect(xml).toContain('<w:keepNext w:val="0"/>');
    expect(xml).toContain('<w:keepLines w:val="0"/>');
    expect(paraFont(importDOCX(exported.bytes, schema).document)).toEqual(paraFont(doc));
  });

  it('retains document/style font context for empty and mixed-size paragraphs, not the first run font', () => {
    expect(typeof document).toBe('undefined');
    const styles = `<w:style w:type="paragraph" w:styleId="Base"><w:rPr>${fonts('Georgia', 18)}</w:rPr></w:style>`
      + '<w:style w:type="paragraph" w:styleId="Child"><w:basedOn w:val="Base"/><w:rPr><w:sz w:val="40"/></w:rPr></w:style>';
    const pPr = '<w:pPr><w:pStyle w:val="Child"/></w:pPr>';
    const doc = importDOCX(fixture(`<w:p>${pPr}</w:p><w:p>${pPr}${r('Small', fonts('Courier New', 8))}${r(' Large', fonts('Arial', 30))}</w:p>` , styles), schema).document;
    for (const index of [0, 1]) expect(paraFont(doc, index)).toMatchObject({ fontFamily: 'Georgia', fontSize: 20 });
    const html = HTMLExporter.export(doc, { document: false });
    expect(html).toContain('font-family:Georgia;font-size:20pt');
    // The writer now distinguishes childless paragraphs from empty caret text.
    // Preserve complete native shape and paragraph context, with no exception.
    expect(html).toContain('data-fountain-empty="block"');
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(doc.toJSON());
    const reopened = importDOCX(exportDOCX(doc).bytes, schema).document;
    for (const index of [0, 1]) expect(paraFont(reopened, index)).toEqual(paraFont(doc, index));
    expect(reopened.child(1).content.map(run => run.marks.find(mark => mark.type.name === 'font_size')?.attrs.size)).toEqual(['8pt', '30pt']);
  });

  it('keeps paragraph-mark-only font formatting separate from actual text-run fonts', () => {
    const doc = importDOCX(fixture(`<w:p><w:pPr><w:rPr>${fonts('Georgia', 24)}</w:rPr></w:pPr>${r('Body')}</w:p><w:p><w:pPr><w:rPr>${fonts('Courier New', 32)}</w:rPr></w:pPr></w:p>`), schema).document;
    expect(paraFont(doc)).toMatchObject({ fontFamily: 'Georgia', fontSize: 24 });
    expect(doc.child(0).child(0).marks.find(mark => mark.type.name === 'font_family')?.attrs.family).toBe('Arial');
    expect(doc.child(0).child(0).marks.find(mark => mark.type.name === 'font_size')?.attrs.size).toBe('14pt');
    expect(paraFont(doc, 1)).toMatchObject({ fontFamily: 'Courier New', fontSize: 32 });
    const exported = exportDOCX(doc), xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);
    expect(xml).toContain(`<w:rPr><w:b w:val="0"/><w:i w:val="0"/>${fonts('Georgia', 24)}</w:rPr></w:pPr><w:r><w:rPr><w:b w:val="0"/><w:i w:val="0"/>${fonts('Arial', 14)}`);
    const reopened = importDOCX(exported.bytes, schema).document;
    expect(paraFont(reopened)).toEqual(paraFont(doc));
    expect(paraFont(reopened, 1)).toEqual(paraFont(doc, 1));
  });

  it.each([false, true])('retains an explicit empty text run independently of a childless paragraph (marked: %s)', marked => {
    const marks = marked ? [schema.marks.font_family.create({ family: 'Georgia' }), schema.marks.font_size.create({ size: '18pt' }), schema.marks.strong.create()] : [];
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('', marks)]), schema.node('paragraph')]);
    const exported = exportDOCX(doc);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);
    expect(xml.match(/<w:t\/>/g)).toHaveLength(1);
    const reopened = importDOCX(exported.bytes, schema).document;
    expect(reopened.child(0).childCount).toBe(1);
    expect(reopened.child(0).child(0).text).toBe('');
    expect(reopened.child(0).child(0).marks.map(mark => mark.toJSON())).toEqual([
      { type: 'font_family', attrs: { family: marked ? 'Georgia' : 'Arial' } },
      { type: 'font_size', attrs: { size: marked ? '18pt' : '11pt' } },
      ...(marked ? [{ type: 'strong' }] : []),
    ]);
    expect(reopened.child(1).childCount).toBe(0);
  });

  it('imports only explicit native empty text, not property-only, deleted or field-instruction runs', () => {
    const body = `<w:p>${r('', fonts('Georgia', 18))}</w:p><w:p><w:r><w:rPr>${fonts('Georgia', 18)}</w:rPr></w:r></w:p>`
      + '<w:p><w:del><w:r><w:t/></w:r></w:del></w:p><w:p><w:r><w:instrText/></w:r></w:p>'
      + '<w:p><w:r><x:t xmlns:x="urn:not-word"/></w:r></w:p>';
    const doc = importDOCX(fixture(body), schema).document;
    expect(doc.child(0).child(0).toJSON()).toEqual({ type: 'text', text: '', marks: [
      { type: 'font_family', attrs: { family: 'Georgia' } }, { type: 'font_size', attrs: { size: '18pt' } },
    ] });
    for (let index = 1; index < 5; index++) expect(doc.child(index).childCount).toBe(0);
  });

  it('reports unknown text-run fonts instead of wrongly inheriting paragraph-mark-only formatting', () => {
    const source = fixture(`<w:p><w:pPr><w:rPr>${fonts('Georgia', 24)}</w:rPr></w:pPr>${r('Unknown')}</w:p>`, '', '');
    const result = importDOCX(source, schema);
    expect(paraFont(result.document)).not.toHaveProperty('fontFamily');
    expect(paraFont(result.document)).not.toHaveProperty('fontSize');
    expect(result.document.child(0).child(0).marks).toEqual([]);
    expect(result.report.issues.filter(issue => issue.code === 'paragraph-font-context-not-imported')).toHaveLength(2);
    expect(result.report.issues.every(issue => issue.path?.[0] === 0)).toBe(true);
  });

  it('exports explicit paragraph defaults on unmarked text but preserves inline overrides', () => {
    const layout = { unit: 'pt' as const, fontFamily: 'Georgia', fontSize: 18, spacingBefore: 0, spacingAfter: 0,
      lineHeight: 1, lineHeightUnit: 'multiple' as const, lineHeightRule: 'auto' as const,
      keepWithNext: false, keepLinesTogether: false, pageBreakBefore: false };
    const doc = schema.node('doc', {}, [schema.node('paragraph', { layout }, [schema.text('Default'), schema.node('hard_break'),
      schema.text('Override', [schema.mark('font_family', { family: 'Courier New' }), schema.mark('font_size', { size: '9pt' })])]),
      schema.node('paragraph', { layout })]);
    const original = doc.toJSON(), exported = exportDOCX(doc);
    expect(doc.toJSON()).toEqual(original);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);
    expect(xml.match(/<w:rPr>/g)).toHaveLength(5);
    expect(xml).toContain(`<w:rPr>${fonts('Georgia', 18)}</w:rPr><w:t>Default</w:t>`);
    expect(xml).toContain(`<w:rPr>${fonts('Georgia', 18)}</w:rPr><w:br/>`);
    expect(xml).toContain(`<w:rPr>${fonts('Courier New', 9)}</w:rPr><w:t>Override</w:t>`);
    const reopened = importDOCX(exported.bytes, schema).document;
    expect(paraFont(reopened)).toEqual(layout);
    expect(paraFont(reopened, 1)).toEqual(layout);
    expect(reopened.child(0).child(0).marks.find(mark => mark.type.name === 'font_size')?.attrs.size).toBe('18pt');
    expect(reopened.child(0).child(2).marks.find(mark => mark.type.name === 'font_size')?.attrs.size).toBe('9pt');
  });

  it('reports generic-font and half-point limitations rather than certifying appearance', () => {
    const doc = schema.node('doc', {}, [schema.node('paragraph', { layout: { unit: 'pt', fontFamily: 'Arial, serif', fontSize: 12.1 } }, [schema.text('Keep')])]);
    const result = exportDOCX(doc);
    expect(result.report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['paragraph-font-family-not-exported', 'paragraph-font-size-rounded']));
    expect(importDOCX(result.bytes, schema).document.textContent).toBe('Keep');
  });
});
