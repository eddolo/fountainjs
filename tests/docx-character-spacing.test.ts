// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, zipSync, unzipSync } from 'fflate';
import { Schema, HTMLExporter, MarkdownExporter, MarkdownImporter } from '../src/headless';
import { StarterKit } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { importDOCX, exportDOCX } from '../src/docx';
import { createWordRunStyleCascade } from '../src/docx/style-cascade';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const schema = new Schema(StarterKit.schema);
function fixture(runs: string, styles?: string) {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body><w:p>${runs}</w:p><w:sectPr/></w:body></w:document>`),
    ...(styles ? {
      'word/styles.xml': strToU8(`<w:styles xmlns:w="${W}">${styles}</w:styles>`),
      'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${R}"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    } : {}),
  });
}
const run = (raw: string, text = 'Pitch') => `<w:r><w:rPr><w:spacing w:val="${raw}"/></w:rPr><w:t>${text}</w:t></w:r>`;
const spacing = (doc: ReturnType<typeof importDOCX>['document']) => doc.child(0).content.map(node => node.marks.find(mark => mark.type.name === 'letter_spacing')?.attrs.spacing);

describe('native Word character spacing', () => {
  it.each(['30', '0', '-10', 'invalid'])('reports paragraph-mark-only pitch %s without applying it to text', raw => {
    const pPr = `<w:pPr><w:rPr><w:spacing w:val="${raw}"/></w:rPr></w:pPr>`;
    for (const styles of [undefined, '<w:docDefaults/>']) {
      for (const content of ['', '<w:r><w:t>Unformatted</w:t></w:r>', run('20', 'Explicit')]) {
        const result = importDOCX(fixture(pPr + content, styles), schema);
        expect(result.report.issues).toContainEqual(expect.objectContaining({
          code: 'paragraph-mark-spacing-not-imported', severity: 'warning', path: [0],
        }));
        expect(result.report.fidelity).toBe('lossy');
        expect(spacing(result.document)).toEqual(content === '' ? [] : [content.includes('Explicit') ? '1pt' : undefined]);
        expect(result.document.textContent).toBe(content === '' ? '' : content.includes('Explicit') ? 'Explicit' : 'Unformatted');
      }
    }
  });

  it('ignores foreign paragraph-mark pitch and rejects ambiguous native declarations', () => {
    const foreign = fixture('<w:pPr><w:rPr><x:spacing xmlns:x="urn:foreign" x:val="30"/></w:rPr></w:pPr><w:r><w:t>Safe</w:t></w:r>');
    expect(importDOCX(foreign, schema).report.issues.some(issue => issue.code === 'paragraph-mark-spacing-not-imported')).toBe(false);
    expect(() => importDOCX(fixture('<w:pPr><w:rPr><w:spacing w:val="20"/><w:spacing w:val="30"/></w:rPr></w:pPr>'), schema)).toThrow(/Ambiguous/);
  });

  it.each(['30', '0', '-10'])('reports inherited empty-line pitch %s without warning on retained text-run pitch', raw => {
    const defaults = `<w:docDefaults><w:rPrDefault><w:rPr><w:spacing w:val="${raw}"/></w:rPr></w:rPrDefault></w:docDefaults>`;
    const empty = importDOCX(fixture('', defaults), schema);
    expect(empty.report.issues).toContainEqual(expect.objectContaining({ code: 'paragraph-mark-spacing-not-imported', path: [0] }));
    expect(empty.report.fidelity).toBe('lossy');
    const text = importDOCX(fixture('<w:r><w:t>Inherited</w:t></w:r>', defaults), schema);
    expect(text.report.issues).toEqual([]);
    expect(spacing(text.document)).toEqual([`${Number(raw) / 20}pt`]);
  });

  it.each([['30', '1.5pt'], ['-10', '-0.5pt'], ['0', '0pt'], ['+20', '1pt'], ['-720', '-36pt']])('imports and exports signed twips %s without a DOM', (raw, expected) => {
    expect(typeof document).toBe('undefined');
    const source = fixture(run(raw));
    const imported = importDOCX(source, schema);
    expect(spacing(imported.document)).toEqual([expected]);
    expect(imported.report.issues).toEqual([]);
    const exported = exportDOCX(imported.document);
    expect(strFromU8(unzipSync(exported.bytes)['word/document.xml']!)).toContain(`<w:spacing w:val="${Number(raw)}"/>`);
    expect(spacing(importDOCX(exported.bytes, schema).document)).toEqual([expected]);
  });

  it('resolves signed pitch through defaults, ancestry and direct zero resets', () => {
    const cascade = createWordRunStyleCascade({ defaults: { characterSpacing: 20 }, styles: [
      { id: 'Base', kind: 'paragraph', run: { characterSpacing: 40 } },
      { id: 'Child', kind: 'paragraph', basedOn: 'Base', run: {} },
      { id: 'Tight', kind: 'character', run: { characterSpacing: -10 } },
    ] });
    expect(cascade.resolve({}).formatting.characterSpacing).toBe(20);
    expect(cascade.resolve({ paragraphStyle: 'Child' }).formatting.characterSpacing).toBe(40);
    expect(cascade.resolve({ paragraphStyle: 'Child', characterStyle: 'Tight' }).formatting.characterSpacing).toBe(-10);
    expect(cascade.resolve({ paragraphStyle: 'Child', characterStyle: 'Tight', direct: { characterSpacing: 0 } }).formatting.characterSpacing).toBe(0);
    const styles = '<w:docDefaults><w:rPrDefault><w:rPr><w:spacing w:val="30"/></w:rPr></w:rPrDefault></w:docDefaults>';
    const result = importDOCX(fixture('<w:r><w:t>Inherited</w:t></w:r>' + run('0', 'Reset') + run('-10', 'Tight'), styles), schema);
    expect(spacing(result.document)).toEqual(['1.5pt', '0pt', '-0.5pt']);
    expect(result.report.issues).toEqual([]);
  });

  it.each(['bad', '10.5', '', '99999', '9007199254740992'])('reports invalid/out-of-range pitch %s while retaining text', raw => {
    const result = importDOCX(fixture(run(raw)), schema);
    expect(spacing(result.document)).toEqual([undefined]);
    expect(result.document.textContent).toBe('Pitch');
    expect(result.report.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'character-spacing-not-imported', path: [0] })]));
  });

  it('checks namespace and property identity without accepting conflicting declarations', () => {
    const source = fixture('<w:r><w:rPr><x:spacing xmlns:x="urn:foreign" x:val="30"/></w:rPr><w:t>Foreign</w:t></w:r>');
    expect(spacing(importDOCX(source, schema).document)).toEqual([undefined]);
    expect(() => importDOCX(fixture('<w:r><w:rPr><w:spacing w:val="20"/><w:spacing w:val="30"/></w:rPr><w:t>Duplicate</w:t></w:r>'), schema)).toThrow(/Ambiguous/);
  });

  it('retains spacing on text-wrapping breaks and gives schema omissions a located warning', () => {
    const source = fixture('<w:r><w:rPr><w:spacing w:val="30"/><w:b/></w:rPr><w:t>A</w:t><w:br/><w:t>B</w:t></w:r>');
    const imported = importDOCX(source, schema);
    expect(spacing(imported.document)).toEqual(['1.5pt', '1.5pt', '1.5pt']);
    const { letter_spacing: omitted, ...marks } = StarterKit.schema.marks!;
    expect(omitted).toBeDefined();
    const reduced = new Schema({ ...StarterKit.schema, marks });
    const missing = importDOCX(source, reduced);
    expect(missing.report.issues).toEqual([expect.objectContaining({ code: 'character-spacing-not-imported', path: [0] })]);
    expect(missing.document.textContent).toBe('AB');
  });

  it('shares the CSS projection with DOM-free HTML and Markdown inline HTML', () => {
    const doc = importDOCX(fixture(run('-10')), schema).document;
    const html = HTMLExporter.export(doc, { document: false });
    expect(html).toContain('letter-spacing:-0.5pt');
    expect(spacing(ServerHTMLImporter.parse(html, schema))).toEqual(['-0.5pt']);
    const canonical = MarkdownExporter.exportWithReport(doc);
    // Character pitch has no native Markdown syntax. Like the existing font
    // marks it is preserved by the bounded, inert text-style HTML projection.
    expect(canonical.markdown).toContain('letter-spacing:-0.5pt');
    expect(canonical.losses).toEqual([expect.objectContaining({ kind: 'attribute', type: 'paragraph', path: [0] })]);
    expect(MarkdownImporter.parse(canonical.markdown, schema).toJSON()).toEqual(schema.node('doc', {}, [
      schema.node('paragraph', {}, [schema.text('Pitch', [schema.mark('letter_spacing', { spacing: '-0.5pt' })])]),
    ]).toJSON());
  });

  it.each([['1px', 15, 'character-spacing-unit-normalized'], ['0.123pt', 2, 'character-spacing-rounded']])('reports native normalization for %s', (value, twips, code) => {
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Pitch', [schema.mark('letter_spacing', { spacing: value })])])]);
    const result = exportDOCX(doc);
    expect(result.report.issues.map(issue => issue.code)).toContain(code);
    expect(strFromU8(unzipSync(result.bytes)['word/document.xml']!)).toContain(`<w:spacing w:val="${twips}"/>`);
  });

  it('does not pretend relative CSS pitch or Word kerning is native character-spacing fidelity', () => {
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Relative', [schema.mark('letter_spacing', { spacing: '0.5em' })])])]);
    const result = exportDOCX(doc);
    expect(result.report.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unsupported-mark', message: expect.stringContaining('letter_spacing') })]));
    const kerning = importDOCX(fixture('<w:r><w:rPr><w:kern w:val="24"/></w:rPr><w:t>Kerning</w:t></w:r>', '<w:docDefaults/>'), schema);
    expect(kerning.report.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unsupported-run-property', message: expect.stringContaining('kern') })]));
    expect(() => schema.mark('letter_spacing', { spacing: '.5em' })).toThrow(/spacing/);
  });
});
