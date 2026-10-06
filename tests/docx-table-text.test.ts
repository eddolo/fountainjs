// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { exportDOCX, importDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const style = (id: string, contents: string, parent = '') => `<w:style w:type="table" w:styleId="${id}">${parent ? `<w:basedOn w:val="${parent}"/>` : ''}${contents}</w:style>`;
const region = (kind: string, contents: string) => `<w:tblStylePr w:type="${kind}">${contents}</w:tblStylePr>`;
const p = (text = 'Cell', properties = '', run = '') => `<w:p><w:pPr>${properties}</w:pPr><w:r><w:rPr>${run}</w:rPr><w:t>${text}</w:t></w:r></w:p>`;
const table = (cells: readonly string[], styleId = 'Child') => `<w:tbl><w:tblPr><w:tblStyle w:val="${styleId}"/><w:tblLook w:val="00A0" w:noHBand="1" w:noVBand="1"/></w:tblPr><w:tblGrid>${cells.map(() => '<w:gridCol w:w="2400"/>').join('')}</w:tblGrid><w:tr>${cells.map(text => `<w:tc>${text}</w:tc>`).join('')}</w:tr></w:tbl>`;
function fixture(styles: string, body = table([p(), p()]), defaults = '') {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`),
    'word/styles.xml': strToU8(`<w:styles xmlns:w="${W}">${defaults}${styles}</w:styles>`),
    'word/_rels/document.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
  });
}
const cell = (result: ReturnType<typeof importDOCX>, index = 0) => result.document.child(0).child(0).child(index).child(0);
const marks = (result: ReturnType<typeof importDOCX>, index = 0) => cell(result, index).child(0).marks.map(mark => ({ type: mark.type.name, ...mark.attrs }));

describe('Word table-owned text formatting', () => {
  it('imports inherited base text font, size and colour in pure Node', () => {
    expect(typeof document).toBe('undefined');
    const source = style('Base', '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:color w:val="112233"/></w:rPr>') + style('Child', '<w:rPr><w:sz w:val="25"/></w:rPr>', 'Base');
    expect(marks(importDOCX(fixture(source), schema))).toEqual(expect.arrayContaining([
      { type: 'font_family', family: 'Arial' }, { type: 'font_size', size: '12.5pt' }, { type: 'text_color', color: '#112233' },
    ]));
  });
  it('applies Word table toggles absolutely, including repeated true and conditional false', () => {
    const source = style('Base', '<w:rPr><w:b/><w:i/></w:rPr>') + style('Child', '<w:rPr><w:b/></w:rPr>' + region('firstCol', '<w:rPr><w:i w:val="0"/></w:rPr>'), 'Base');
    const result = importDOCX(fixture(source), schema);
    expect(marks(result, 0)).toEqual([{ type: 'strong' }]);
    expect(marks(result, 1)).toEqual([{ type: 'strong' }, { type: 'em' }]);
  });
  it('resolves conditional text in Office region order, not XML order', () => {
    const source = style('Base', region('firstRow', '<w:rPr><w:color w:val="334455"/></w:rPr>'))
      + style('Child', region('firstCol', '<w:rPr><w:color w:val="667788"/></w:rPr>') + region('nwCell', '<w:rPr><w:color w:val="AABBCC"/></w:rPr>'), 'Base');
    expect(marks(importDOCX(fixture(source), schema), 0)).toContainEqual({ type: 'text_color', color: '#aabbcc' });
    expect(marks(importDOCX(fixture(source), schema), 1)).toContainEqual({ type: 'text_color', color: '#334455' });
  });
  it('keeps paragraph/character style and direct declarations above table text', () => {
    const source = style('Child', '<w:rPr><w:b/><w:color w:val="112233"/><w:sz w:val="20"/></w:rPr>')
      + '<w:style w:type="paragraph" w:styleId="Body"><w:rPr><w:b/><w:color w:val="445566"/></w:rPr></w:style>'
      + '<w:style w:type="character" w:styleId="Accent"><w:rPr><w:color w:val="778899"/></w:rPr></w:style>';
    const result = importDOCX(fixture(source, table([p('Styled', '<w:pStyle w:val="Body"/>', '<w:rStyle w:val="Accent"/><w:sz w:val="30"/>'), p('Direct', '', '<w:b w:val="0"/><w:color w:val="auto"/>')])), schema);
    expect(marks(result)).toEqual(expect.arrayContaining([{ type: 'font_size', size: '15pt' }, { type: 'text_color', color: '#778899' }]));
    expect(marks(result).some(mark => mark.type === 'strong')).toBe(false);
    expect(marks(result, 1)).toEqual([{ type: 'font_size', size: '10pt' }]);
  });
  it('inherits paragraph attributes individually and preserves explicit zero/off resets', () => {
    const source = style('Base', '<w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="80" w:line="360"/><w:keepNext/></w:pPr>')
      + style('Child', region('firstCol', '<w:pPr><w:spacing w:after="40"/></w:pPr>'), 'Base');
    const result = importDOCX(fixture(source, table([p(), p('Direct', '<w:jc w:val="left"/><w:spacing w:before="0"/><w:keepNext w:val="0"/>')])), schema);
    expect(cell(result).attrs).toMatchObject({ align: 'center', layout: { spacingBefore: 6, spacingAfter: 2, lineHeight: 1.5, keepWithNext: true } });
    expect(cell(result, 1).attrs).toMatchObject({ align: 'left', layout: { spacingBefore: 0, spacingAfter: 4, lineHeight: 1.5, keepWithNext: false } });
  });
  it('does not leak an outer table style into nested tables or later body paragraphs', () => {
    const source = style('Child', '<w:rPr><w:b/></w:rPr>') + style('Inner', '<w:rPr><w:i/></w:rPr>');
    const result = importDOCX(fixture(source, table([p('Outer') + table([p('Inner')], 'Inner')]) + p('Body')), schema);
    expect(marks(result)).toEqual([{ type: 'strong' }]);
    const inner = cell(result).type.name === 'paragraph' && result.document.child(0).child(0).child(0).child(1).child(0).child(0).child(0).child(0);
    expect(inner && inner.marks.map(mark => mark.type.name)).toEqual(['em']);
    expect(result.document.child(1).child(0).marks).toEqual([]);
  });
  it('materializes supported text through native DOCX export and reopen', () => {
    const source = style('Child', '<w:rPr><w:b/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:color w:val="123456"/></w:rPr><w:pPr><w:spacing w:after="60"/></w:pPr>');
    const first = importDOCX(fixture(source), schema);
    const reopened = importDOCX(exportDOCX(first.document).bytes, schema);
    expect(marks(reopened)).toEqual(marks(first));
    expect(cell(reopened).attrs).toEqual(cell(first).attrs);
  });
  it('keeps unsupported used text properties located and leaves unused styles quiet', () => {
    const source = style('Child', '<w:rPr><w:shadow/><w:kern w:val="24"/></w:rPr><w:pPr><w:tabs/></w:pPr>') + style('Unused', '<w:rPr><w:effect w:val="sparkle"/></w:rPr>');
    const result = importDOCX(fixture(source), schema);
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'unrepresented-style-toggle', path: [0, 0, 0, 0] }));
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'unsupported-run-property', message: expect.stringContaining('kern') }));
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'unresolved-paragraph-properties', message: expect.stringContaining('tabs') }));
    expect(result.report.issues.some(issue => issue.message.includes('sparkle'))).toBe(false);
  });
  it('ignores reserved TableNormal child declarations, including cyclic inheritance', () => {
    const source = style('TableNormal', '<w:rPr><w:b/></w:rPr><w:pPr><w:jc w:val="center"/></w:pPr>', 'TableNormal') + style('Child', '<w:rPr><w:i/></w:rPr>', 'TableNormal');
    const result = importDOCX(fixture(source), schema);
    expect(marks(result)).toEqual([{ type: 'em' }]);
    expect(cell(result).attrs.align).toBe('left');
    expect(result.report.issues.some(issue => issue.code === 'table-style-cycle')).toBe(false);
  });
  it('keeps the native Normal/default equivalence uncertainty visible instead of guessing a heuristic', () => {
    const source = style('Child', '<w:rPr><w:sz w:val="20"/></w:rPr><w:pPr><w:spacing w:after="0"/></w:pPr>')
      + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:rPr><w:sz w:val="22"/></w:rPr></w:style>';
    const result = importDOCX(fixture(source), schema);
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'table-normal-style-precedence-unverified', path: [0, 0, 0, 0] }));
    expect(marks(result)).toEqual([{ type: 'font_size', size: '11pt' }]);
    expect(result.report.fidelity).toBe('lossy');
  });
  it('does not guess conditional text for an unsupported omitted-grid row', () => {
    const source = style('Child', '<w:rPr><w:i/></w:rPr>' + region('firstRow', '<w:rPr><w:b/></w:rPr>'));
    const body = table([p()]).replace('<w:tr>', '<w:tr><w:trPr><w:gridBefore w:val="1"/></w:trPr>');
    const result = importDOCX(fixture(source, body), schema);
    expect(marks(result)).toEqual([{ type: 'em' }]);
    expect(result.report.issues.map(issue => issue.code)).toContain('table-style-grid-offset-not-imported');
  });
  it('keeps table off resets absolute over true document defaults before paragraph toggles', () => {
    const defaults = '<w:docDefaults><w:rPrDefault><w:rPr><w:b/><w:i/></w:rPr></w:rPrDefault></w:docDefaults>';
    const source = style('Child', '<w:rPr><w:b w:val="0"/><w:i w:val="0"/></w:rPr>')
      + '<w:style w:type="paragraph" w:styleId="Accent"><w:rPr><w:b/></w:rPr></w:style>';
    const result = importDOCX(fixture(source, table([p('Plain'), p('Accent', '<w:pStyle w:val="Accent"/>')]), defaults), schema);
    expect(marks(result)).toEqual([]);
    expect(marks(result, 1)).toEqual([{ type: 'strong' }]);
    expect(result.report.issues.some(issue => issue.code === 'word-default-toggle-unverified')).toBe(false);
  });
  it('reports unavailable receiving marks instead of silently dropping table-owned fonts', () => {
    const target = new Schema({ ...StarterKit.schema, marks: { strong: StarterKit.schema.marks!.strong! } });
    const source = style('Child', '<w:rPr><w:b/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr>');
    const result = importDOCX(fixture(source), target);
    expect(marks(result)).toEqual([{ type: 'strong' }]);
    expect(result.report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['font-family-not-imported', 'font-size-not-imported']));
    expect(result.document.textContent).toBe('CellCell');
  });
  it('keeps foreign text lookalikes inert and rejects ambiguous used text roots/properties', () => {
    const source = style('Child', '<x:rPr xmlns:x="urn:foreign"><x:b/></x:rPr><w:rPr><w:i/></w:rPr>');
    expect(marks(importDOCX(fixture(source), schema))).toEqual([{ type: 'em' }]);
    expect(() => importDOCX(fixture(style('Child', '<w:rPr/><w:rPr/>')), schema)).toThrow(/Ambiguous/);
    expect(() => importDOCX(fixture(style('Child', '<w:rPr><w:b/><w:b w:val="0"/></w:rPr>')), schema)).toThrow(/Ambiguous/);
    expect(() => importDOCX(fixture(style('Child', region('firstRow', '<w:pPr/><w:pPr/>'))), schema)).toThrow(/Ambiguous/);
  });
  it('does not project invalid table text values or decode an unused malformed region', () => {
    const source = style('Child', '<w:rPr><w:sz w:val="NaN"/></w:rPr>' + region('lastRow', '<w:rPr><w:b/><w:b/></w:rPr>'));
    const result = importDOCX(fixture(source), schema);
    expect(marks(result)).toEqual([]);
    expect(result.report.issues.map(issue => issue.code)).toContain('invalid-run-property');
  });
  it('carries effective table run marks into hard breaks without reinterpreting their order', () => {
    const source = style('Child', '<w:rPr><w:i/><w:spacing w:val="20"/></w:rPr>');
    const body = table([p().replace('<w:t>Cell</w:t>', '<w:t>Before</w:t><w:br/><w:t>After</w:t>')]);
    const paragraph = cell(importDOCX(fixture(source, body), schema));
    expect(paragraph.content.map(node => node.type.name)).toEqual(['text', 'hard_break', 'text']);
    for (const node of paragraph.content) expect(node.marks.map(mark => ({ type: mark.type.name, ...mark.attrs }))).toEqual([{ type: 'letter_spacing', spacing: '1pt' }, { type: 'em' }]);
  });
});
