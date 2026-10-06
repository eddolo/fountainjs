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
const style = (id: string, paragraph: string, parent = '', isDefault = false) => `<w:style w:type="paragraph"${isDefault ? ' w:default="1"' : ''} w:styleId="${id}">${parent ? `<w:basedOn w:val="${parent}"/>` : ''}<w:pPr>${paragraph}</w:pPr><w:rPr/></w:style>`;
const paragraph = (styleId: string, direct = '', text = 'Text') => `<w:p><w:pPr>${styleId ? `<w:pStyle w:val="${styleId}"/>` : ''}${direct}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const singleSpaced = { unit: 'pt', spacingBefore: 0, spacingAfter: 0,
  lineHeight: 1, lineHeightUnit: 'multiple', lineHeightRule: 'auto',
  keepWithNext: false, keepLinesTogether: false, pageBreakBefore: false };
function fixture(styles: string, body: string, defaults = '') {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`),
    'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${R}"><Relationship Id="s" Type="${O}/styles" Target="styles.xml"/></Relationships>`),
    'word/styles.xml': strToU8(`<w:styles xmlns:w="${W}"><w:docDefaults><w:pPrDefault><w:pPr>${defaults}</w:pPr></w:pPrDefault></w:docDefaults>${styles}</w:styles>`),
  });
}

describe('DOCX paragraph layout', () => {
  it.each([false, true])('materializes native omitted spacing without inheriting host or export defaults (styles=%s)', hasStyles => {
    const source = hasStyles ? fixture('', paragraph('')) : zipSync({
      'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body>${paragraph('')}</w:body></w:document>`),
    });
    const imported = importDOCX(source, schema).document;
    expect(imported.child(0).attrs.layout).toEqual(singleSpaced);
    const exported = exportDOCX(imported);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);
    expect(xml).toContain('<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>');
    expect(importDOCX(exported.bytes, schema).document.child(0).attrs.layout).toEqual({ ...singleSpaced, fontFamily: 'Arial', fontSize: 11 });
  });

  it('fills only omitted spacing after resolving partial defaults, styles and direct declarations', () => {
    const imported = importDOCX(fixture(style('Base', '<w:spacing w:before="120"/>'),
      paragraph('Base', '<w:spacing w:after="0"/>'), '<w:spacing w:after="200" w:line="360"/>'), schema).document;
    const layout = { ...singleSpaced, spacingBefore: 6, lineHeight: 1.5 };
    expect(imported.child(0).attrs.layout).toEqual(layout);
    expect(importDOCX(exportDOCX(imported).bytes, schema).document.child(0).attrs.layout).toEqual({ ...layout, fontFamily: 'Arial', fontSize: 11 });
  });

  it('does not remove reports for unsupported automatic or line-unit spacing', () => {
    const result = importDOCX(fixture('', paragraph('', '<w:spacing w:beforeLines="100" w:afterAutospacing="1"/>')), schema);
    expect(result.report.issues.filter(item => item.code === 'unresolved-paragraph-properties')).toHaveLength(2);
    expect(result.document.child(0).textContent).toBe('Text');
  });

  it('retains materialized source defaults in JSON and DOM-free HTML without borrowing CSS margins', () => {
    const document = importDOCX(fixture('', paragraph('')), schema).document;
    expect(schema.nodeFromJSON(document.toJSON()).toJSON()).toEqual(document.toJSON());
    const html = HTMLExporter.export(document, { document: false });
    expect(html).toContain('margin-block-start:0pt;margin-block-end:0pt;line-height:1');
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(document.toJSON());
  });

  it('materializes defaults, inherited properties and per-attribute overrides', () => {
    const base = style('Base', '<w:spacing w:before="80" w:after="160" w:line="276" w:lineRule="auto"/><w:ind w:left="720" w:right="240" w:hanging="180"/><w:keepNext/><w:pBdr><w:left w:val="single" w:sz="18" w:space="12" w:color="7047FF"/></w:pBdr>');
    const child = style('Child', '<w:jc w:val="center"/><w:spacing w:after="200"/><w:ind w:firstLine="360"/><w:keepLines w:val="0"/><w:shd w:val="clear" w:fill="F2EFF8"/>', 'Base');
    const result = importDOCX(fixture(base + child, paragraph('Child'), '<w:pageBreakBefore w:val="0"/>'), schema);
    expect(result.document.child(0).attrs).toMatchObject({
      align: 'center',
      layout: {
        unit: 'pt', spacingBefore: 4, spacingAfter: 10, lineHeight: 1.15, lineHeightUnit: 'multiple', lineHeightRule: 'auto',
        indentStart: 36, indentEnd: 12, firstLineIndent: 18, keepWithNext: true, keepLinesTogether: false,
        pageBreakBefore: false, background: '#f2eff8',
        borders: { left: { style: 'solid', color: '#7047ff', width: 2.25, space: 12 } },
      },
    });
    expect(result.document.child(0).attrs.layout).not.toHaveProperty('hangingIndent');
    expect(result.report.issues.some(item => item.code === 'unresolved-paragraph-properties')).toBe(false);
  });

  it('lets direct paragraph properties override individual inherited attributes', () => {
    const result = importDOCX(fixture(style('Base', '<w:spacing w:before="100" w:after="200"/><w:ind w:left="720"/><w:keepNext/>'),
      paragraph('Base', '<w:spacing w:after="0"/><w:ind w:right="400"/><w:keepNext w:val="false"/><w:pageBreakBefore/>')), schema);
    expect(result.document.child(0).attrs.layout).toMatchObject({
      unit: 'pt', spacingBefore: 5, spacingAfter: 0, indentStart: 36, indentEnd: 20,
      keepWithNext: false, pageBreakBefore: true,
    });
  });

  it('exports native paragraph properties and reimports the same Fountain layout', () => {
    const layout = { unit: 'pt' as const, spacingBefore: 18, spacingAfter: 8, lineHeight: 14, lineHeightUnit: 'pt' as const,
      lineHeightRule: 'atLeast' as const, indentStart: 24, indentEnd: 12, hangingIndent: 6, keepWithNext: false,
      keepLinesTogether: true, pageBreakBefore: true, background: '#f2eff8',
      borders: { bottom: { style: 'solid' as const, color: '#7047ff', width: 1.5, space: 4 } } };
    const source = schema.node('doc', {}, [schema.node('paragraph', { align: 'right', layout }, [schema.text('Round trip')])]);
    const exported = exportDOCX(source);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);
    expect(xml).toContain('<w:keepNext w:val="0"/>');
    expect(xml).toContain('<w:pageBreakBefore w:val="1"/>');
    expect(xml).toContain('<w:bottom w:val="single" w:sz="12" w:space="4" w:color="7047FF"/>');
    expect(xml).toContain('<w:spacing w:before="360" w:after="160" w:line="280" w:lineRule="atLeast"/>');
    expect(xml).toContain('<w:ind w:left="480" w:right="240" w:hanging="120"/>');
    const reopenedDocument = importDOCX(exported.bytes, schema).document;
    const reopened = reopenedDocument.child(0);
    expect(reopened.attrs.align).toBe('right');
    expect(reopened.attrs.layout).toEqual({ ...layout, fontFamily: 'Arial', fontSize: 11 });
  });

  it('reports unsupported border styles without pretending they survived', () => {
    const result = importDOCX(fixture(style('Fancy', '<w:pBdr><w:bottom w:val="double" w:sz="12" w:color="000000"/></w:pBdr>'), paragraph('Fancy')), schema);
    expect(result.document.child(0).attrs.layout).toEqual(singleSpaced);
    expect(result.report.issues.some(item => item.code === 'paragraph-border-style-not-imported')).toBe(true);
  });
});
