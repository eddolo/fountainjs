// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readWordRunFormatting, readWordStyleSheet, type WordStyleReadIssue } from '../src/docx/style-reader';
import { parseDOCXXML } from '../src/docx/xml-parser';
import type { XMLElement } from '../src/docx/xml-types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const limits = { maxXmlNodes: 10000, maxXmlDepth: 64 };
const xml = (source: string) => parseDOCXXML(source, limits);
const sheet = (body: string) => xml(`<w:styles xmlns:w="${W}">${body}</w:styles>`);
const style = (id: string, body: string, attrs = 'w:type="paragraph"') => `<w:style w:styleId="${id}" ${attrs}>${body}</w:style>`;
function run(body: string) {
  const issues: WordStyleReadIssue[] = [];
  const root = xml(`<w:rPr xmlns:w="${W}">${body}</w:rPr>`).children[0] as XMLElement;
  return { formatting: readWordRunFormatting(root, issues), issues };
}

describe('Word style XML reader', () => {
  it('resolves inherited signed character spacing with an explicit zero reset', () => {
    const reader = readWordStyleSheet(sheet(
      '<w:docDefaults><w:rPrDefault><w:rPr><w:spacing w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults>'
      + style('Base', '<w:rPr><w:spacing w:val="30"/></w:rPr>')
      + style('Child', '<w:basedOn w:val="Base"/>')
      + style('Tight', '<w:rPr><w:spacing w:val="-10"/></w:rPr>', 'w:type="character"'),
    ));
    expect(reader.resolve({}).formatting.characterSpacing).toBe(20);
    expect(reader.resolve({ paragraphStyle: 'Child' }).formatting.characterSpacing).toBe(30);
    expect(reader.resolve({ paragraphStyle: 'Child', characterStyle: 'Tight' }).formatting.characterSpacing).toBe(-10);
    expect(reader.resolve({ paragraphStyle: 'Child', characterStyle: 'Tight', direct: run('<w:spacing w:val="0"/>').formatting }).formatting.characterSpacing).toBe(0);
    expect(reader.issues).toEqual([]);
  });

  it('reads character spacing through namespace aliases but rejects invalid declarations', () => {
    const alias = xml(`<q:rPr xmlns:q="${W}" xmlns:z="${W}"><q:spacing z:val="-20"/></q:rPr>`).children[0] as XMLElement;
    const issues: WordStyleReadIssue[] = [];
    expect(readWordRunFormatting(alias, issues).characterSpacing).toBe(-20);
    expect(issues).toEqual([]);
    for (const raw of ['1.5', '', 'NaN', '9007199254740992']) {
      const invalid = run(`<w:spacing w:val="${raw}"/>`);
      expect(invalid.formatting.characterSpacing).toBeUndefined();
      expect(invalid.issues).toEqual([expect.objectContaining({ code: 'invalid-run-property', property: 'spacing' })]);
    }
  });

  it('decodes real XML declarations through defaults, paragraph and character ancestors, then direct formatting without a DOM', () => {
    expect(typeof document).toBe('undefined');
    const reader = readWordStyleSheet(sheet(`
      <w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/><w:color w:val="000000"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:rPrDefault></w:docDefaults>
      ${style('Title', '<w:basedOn w:val="Body"/><w:rPr><w:sz w:val="48"/><w:color w:val="123456"/></w:rPr>')}
      ${style('Body', '<w:rPr><w:sz w:val="24"/></w:rPr>', 'w:type="paragraph" w:default="1"')}
      ${style('Emphasis', '<w:rPr><w:i/><w:color w:val="654321"/></w:rPr>', 'w:type="character"')}
      ${style('Special', '<w:basedOn w:val="Emphasis"/><w:rPr><w:sz w:val="30"/></w:rPr>', 'w:type="character"')}`));
    const value = reader.resolve({ paragraphStyle: 'Title', characterStyle: 'Special', direct: run('<w:sz w:val="25"/>').formatting });
    expect(value).toEqual({ paragraphChain: ['Body', 'Title'], characterChain: ['Emphasis', 'Special'], issues: [],
      formatting: { size: 25, color: '654321', toggles: { italic: true }, fonts: { ascii: { name: 'Times New Roman' }, hAnsi: { name: 'Times New Roman' } } } });
    expect(reader.issues).toEqual([]);
    expect(reader.resolve().paragraphChain).toEqual(['Body']);
  });

  it('keeps style toggle semantics distinct from absolute direct-run off declarations', () => {
    const reader = readWordStyleSheet(sheet(
      style('On', '<w:rPr><w:b/><w:i w:val="on"/></w:rPr>') +
      style('Inherited', '<w:basedOn w:val="On"/><w:rPr><w:b w:val="false"/><w:i w:val="0"/></w:rPr>') +
      style('Twice', '<w:basedOn w:val="Inherited"/><w:rPr><w:b w:val="true"/></w:rPr>')));
    expect(reader.resolve({ paragraphStyle: 'Inherited' }).formatting.toggles).toEqual({ bold: true, italic: true });
    expect(reader.resolve({ paragraphStyle: 'Twice' }).formatting.toggles.bold).toBe(false);
    expect(reader.resolve({ paragraphStyle: 'On', direct: run('<w:b w:val="off"/><w:i w:val="false"/>').formatting }).formatting.toggles).toEqual({ bold: false, italic: false });
  });

  it('preserves half-points, complex-script declarations and explicit reset values', () => {
    const value = run('<w:sz w:val="25"/><w:szCs w:val="29"/><w:bCs/><w:iCs w:val="0"/><w:u w:val="none"/><w:color w:val="auto"/><w:highlight w:val="none"/><w:vertAlign w:val="baseline"/>');
    expect(value).toEqual({ issues: [], formatting: { size: 25, sizeCS: 29, underline: 'none', color: 'auto', highlight: 'none', verticalAlign: 'baseline', toggles: { boldCS: true, italicCS: false }, fonts: {} } });
    expect(run('<w:u/>').formatting.underline).toBe('single');
  });

  it('retains source font pairs but resolves nearest declarations separately for each script slot', () => {
    const reader = readWordStyleSheet(sheet(style('Fonts', '<w:rPr><w:rFonts w:ascii="Arial" w:asciiTheme="majorAscii" w:hAnsi="Georgia" w:eastAsiaTheme="minorEastAsia" w:cs="Amiri" w:cstheme="minorBidi"/></w:rPr>')));
    expect(reader.styles[0].run?.fonts?.ascii).toEqual({ name: 'Arial', theme: 'majorAscii' });
    expect(reader.resolve({ paragraphStyle: 'Fonts', direct: run('<w:rFonts w:ascii="Courier New"/>').formatting }).formatting.fonts).toEqual({
      ascii: { name: 'Courier New' }, hAnsi: { name: 'Georgia' }, eastAsia: { theme: 'minorEastAsia' }, cs: { theme: 'minorBidi', name: 'Amiri' },
    });
  });

  it('uses namespace URIs rather than prescribed prefixes, including attribute aliases', () => {
    const original = `<w:styles xmlns:w="${W}" xmlns:z="${W}">${style('A', '<w:rPr><w:sz z:val="36"/></w:rPr>')}</w:styles>`;
    expect(readWordStyleSheet(xml(original.replaceAll('w:', 'q:').replace('xmlns:w=', 'xmlns:q='))).resolve({ paragraphStyle: 'A' }).formatting.size).toBe(36);
    expect(() => readWordStyleSheet(xml(original.replaceAll(W, 'urn:not-word')))).toThrow(/root/);
    const foreign = readWordStyleSheet(sheet(style('A', '<w:rPr><x:sz xmlns:x="urn:other" x:val="80"/></w:rPr>')));
    expect(foreign.resolve({ paragraphStyle: 'A' }).formatting.size).toBeUndefined();
    expect(foreign.issues[0]).toMatchObject({ code: 'unsupported-run-property', property: 'urn:other|sz' });
  });

  it('does not mistake unqualified or foreign size attributes for Word formatting', () => {
    for (const property of ['<w:sz val="80"/>', '<w:sz xmlns:x="urn:other" x:val="80"/>']) {
      const value = run(property);
      expect(value.formatting.size).toBeUndefined();
      expect(value.issues.map(issue => issue.code)).toEqual(['unsupported-run-attribute', 'invalid-run-property']);
    }
  });

  it('rejects a foreign run-properties container rather than reading Word children out of it', () => {
    const foreign = xml(`<x:rPr xmlns:x="urn:foreign" xmlns:w="${W}"><w:b/></x:rPr>`).children[0] as XMLElement;
    expect(() => readWordRunFormatting(foreign, [])).toThrow(/run-properties root/);
    expect(readWordRunFormatting(undefined, [])).toEqual({ toggles: {}, fonts: {} });
  });

  it.each([
    [style('A', '') + style('A', '', 'w:type="character"'), /Duplicate Word style/],
    [style('A', '<w:rPr/><w:rPr/>'), /Ambiguous/],
    [style('A', '<w:basedOn w:val="B"/><w:basedOn w:val="C"/>'), /Ambiguous/],
    [style('A', '<w:rPr><w:b/><w:b w:val="false"/></w:rPr>'), /Ambiguous/],
    [style('A', '', 'w:type="paragraph" w:default="1"') + style('B', '', 'w:type="paragraph" w:default="true"'), /Ambiguous default/],
    [style('A', '', 'w:type="paragraph" w:default="maybe"'), /default-style/],
    [style('A', '<w:basedOn/>'), /parent-style/],
  ])('rejects ambiguous or invalid style definitions: %s', (body, error) => {
    expect(() => readWordStyleSheet(sheet(body as string))).toThrow(error as RegExp);
  });

  it('rejects duplicate expanded names and unbound namespaces rather than using XML order', () => {
    expect(() => run(`<w:sz xmlns:z="${W}" w:val="22" z:val="48"/>`)).toThrow(/Duplicate expanded/);
    expect(() => run(`<w:b/><z:b xmlns:z="${W}"/>`)).toThrow(/Ambiguous/);
    expect(() => run('<x:b/>')).toThrow(/Unbound/);
  });

  it('decodes paragraph layout and indexes table styles separately while retaining theme-colour diagnostics', () => {
    const reader = readWordStyleSheet(sheet('<w:docDefaults><w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      style('Title', '<w:pPr><w:pBdr/><w:ind w:left="120"/></w:pPr><w:rPr><w:color w:val="123456" w:themeColor="accent1"/><w:spacing w:val="20"/></w:rPr>') + style('Grid', '<w:tblPr/>', 'w:type="table"')));
    expect(reader.issues).toEqual([
      { code: 'theme-color-not-resolved', property: `color/${W}|themeColor`, styleId: 'Title' },
    ]);
    expect(reader.paragraphDefaults).toEqual({ spacingAfter: 120 });
    expect(reader.styles[0]?.run?.characterSpacing).toBe(20);
    expect(reader.styles[0]?.paragraph).toEqual({ indentLeft: 120 });
    expect(reader.styles.map(value => value.id)).toEqual(['Title']);
    const warnings: string[] = [];
    expect(reader.resolveTable('Grid', (code) => warnings.push(code)).ids).toEqual(['Grid']);
    expect(warnings).toEqual([]);
    expect(() => readWordStyleSheet(sheet(style('Grid', '', 'w:type="table"') + style('Grid', '')))).toThrow(/Duplicate/);
  });

  it('reports invalid values without activating them or dropping valid siblings', () => {
    const value = run('<w:sz w:val="1.5"/><w:szCs w:val="0"/><w:b w:val="maybe"/><w:color w:val="#bad"/><w:rFonts w:ascii="" w:hAnsi="Arial"/><w:i/>');
    expect(value.formatting).toEqual({ toggles: { italic: true }, fonts: { hAnsi: { name: 'Arial' } } });
    expect(value.issues).toHaveLength(5);
    expect(value.issues.every(issue => issue.code === 'invalid-run-property')).toBe(true);
    for (const size of ['-1', 'Infinity', '9007199254740992']) expect(run(`<w:sz w:val="${size}"/>`).formatting.size).toBeUndefined();
  });

  it('bounds style count, ancestry, XML depth and XML node count', () => {
    const source = sheet(style('A', '<w:basedOn w:val="B"/>') + style('B', '<w:rPr><w:sz w:val="40"/></w:rPr>'));
    expect(() => readWordStyleSheet(source, { maxStyles: 1 })).toThrow(/exceed/);
    expect(readWordStyleSheet(source, { maxDepth: 1 }).resolve({ paragraphStyle: 'A' }).issues[0].code).toBe('style-depth-limit');
    expect(() => parseDOCXXML('<a><b><c/></b></a>', { ...limits, maxXmlNodes: 3 })).toThrow(/nodes/);
    expect(() => parseDOCXXML('<a><b><c></c></b></a>', { ...limits, maxXmlDepth: 3 })).toThrow(/depth/);
  });

  it('carries missing, wrong-kind and cyclic ancestry reports from actual XML', () => {
    const reader = readWordStyleSheet(sheet(style('A', '<w:basedOn w:val="B"/>') + style('B', '<w:basedOn w:val="A"/>') +
      style('Missing', '<w:basedOn w:val="Gone"/>') + style('Char', '', 'w:type="character"') + style('Wrong', '<w:basedOn w:val="Char"/>')));
    expect(reader.resolve({ paragraphStyle: 'A' }).issues[0].code).toBe('style-cycle');
    expect(reader.resolve({ paragraphStyle: 'Missing' }).issues[0].code).toBe('missing-style');
    expect(reader.resolve({ paragraphStyle: 'Wrong' }).issues[0].code).toBe('wrong-style-kind');
  });

  it('does not guess a heading or built-in role from display names or linked styles', () => {
    const reader = readWordStyleSheet(sheet(style('__proto__', '<w:name w:val="Heading 1"/><w:link w:val="Bold"/><w:rPr><w:sz w:val="26"/></w:rPr>') +
      style('Bold', '<w:rPr><w:b/></w:rPr>', 'w:type="character" w:default="1"')));
    expect(reader.resolve({ paragraphStyle: '__proto__' }).formatting).toEqual({ size: 26, toggles: {}, fonts: {} });
    expect(reader.resolve().characterChain).toEqual([]);
  });

  it('owns immutable decoded declarations and is unaffected by later source-tree mutation', () => {
    const source = sheet(style('A', '<w:rPr><w:sz w:val="48"/></w:rPr>'));
    const before = JSON.stringify(source);
    const reader = readWordStyleSheet(source);
    expect(JSON.stringify(source)).toBe(before);
    source.children.length = 0;
    expect(reader.resolve({ paragraphStyle: 'A' }).formatting.size).toBe(48);
    expect(Object.isFrozen(reader.styles)).toBe(true);
    expect(Object.isFrozen(reader.styles[0].run?.fonts)).toBe(true);
    expect(() => Object.assign(reader.styles[0].run!, { size: 80 })).toThrow();
  });
});
