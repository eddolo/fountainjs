// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync, unzipSync, strFromU8 } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { exportDOCX, importDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const O = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const shade = (fill: string) => `<w:shd w:val="clear" w:fill="${fill}"/>`;
const region = (type: string, properties: string) => `<w:tblStylePr w:type="${type}"><w:tcPr>${properties}</w:tcPr></w:tblStylePr>`;
const style = (id: string, contents: string, parent = '') => `<w:style w:type="table" w:styleId="${id}">${parent ? `<w:basedOn w:val="${parent}"/>` : ''}${contents}</w:style>`;
const row = (cells: readonly string[]) => `<w:tr>${cells.map((properties, index) => `<w:tc><w:tcPr>${properties}</w:tcPr><w:p><w:r><w:t>Cell ${index}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`;
const regular = (rows = 4, columns = 4) => Array.from({ length: rows }, () => row(Array.from({ length: columns }, () => ''))).join('');
function fixture(styles: string, look = '<w:tblLook w:val="01E0" w:noHBand="1" w:noVBand="1"/>', rows = regular(), extra = '', columns = 4) {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body><w:tbl><w:tblPr><w:tblStyle w:val="Child"/>${look}${extra}</w:tblPr><w:tblGrid>${Array.from({ length: columns }, () => '<w:gridCol w:w="1800"/>').join('')}</w:tblGrid>${rows}</w:tbl></w:body></w:document>`),
    'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="${O}/styles" Target="styles.xml"/></Relationships>`),
    'word/styles.xml': strToU8(`<w:styles xmlns:w="${W}">${styles}</w:styles>`),
  });
}
const fills = (bytes: Uint8Array) => importDOCX(bytes, schema).document.child(0).content.map(row => row.content.map(cell => cell.attrs.background));

describe('conditional Word table appearance', () => {
  it('uses Office region precedence independently of source order and style ancestry', () => {
    const parent = style('Base', region('firstRow', shade('334455')) + region('nwCell', shade('667788')));
    const child = style('Child', region('lastCol', shade('0000AA')) + region('firstCol', shade('0000FF')) + '<w:tcPr>' + shade('EEEEEE') + '</w:tcPr>', 'Base');
    expect(fills(fixture(parent + child))).toEqual([
      ['#667788', '#334455', '#334455', '#334455'],
      ['#0000ff', '#eeeeee', '#eeeeee', '#0000aa'],
      ['#0000ff', '#eeeeee', '#eeeeee', '#0000aa'],
      ['#0000ff', '#eeeeee', '#eeeeee', '#0000aa'],
    ]);
  });
  it('retains all four corner rules and does not equate first-row formatting with semantic headers or repetition', () => {
    const source = style('Child', region('nwCell', shade('111111')) + region('neCell', shade('222222')) + region('swCell', shade('333333')) + region('seCell', shade('444444')));
    const result = importDOCX(fixture(source), schema);
    expect(fills(fixture(source))).toEqual([['#111111', '', '', '#222222'], ['', '', '', ''], ['', '', '', ''], ['#333333', '', '', '#444444']]);
    expect(result.document.child(0).content.every(row => row.attrs.repeatHeader === false && row.content.every(cell => cell.type.name === 'table_cell'))).toBe(true);
  });
  it('inherits band sizes, offsets bands after enabled first row/column, and lets columns override row bands', () => {
    const source = style('Base', '<w:tblPr><w:tblStyleRowBandSize w:val="2"/><w:tblStyleColBandSize w:val="1"/></w:tblPr>' + region('band1Horz', shade('AAAAAA')) + region('band2Horz', shade('BBBBBB')))
      + style('Child', region('band1Vert', shade('CCCCCC')) + region('band2Vert', shade('DDDDDD')), 'Base');
    const look = '<w:tblLook w:val="00A0"/>';
    expect(fills(fixture(source, look))).toEqual([
      ['', '#cccccc', '#dddddd', '#cccccc'],
      ['#aaaaaa', '#cccccc', '#dddddd', '#cccccc'],
      ['#aaaaaa', '#cccccc', '#dddddd', '#cccccc'],
      ['#bbbbbb', '#cccccc', '#dddddd', '#cccccc'],
    ]);
  });
  it('uses Word omitted-look and row-band defaults, while explicit zero/off flags disable formatting', () => {
    const source = style('Child', region('firstRow', shade('112233')) + region('firstCol', shade('445566')) + region('band1Horz', shade('AABBCC')));
    expect(fills(fixture(source, ''))[0]).toEqual(['#112233', '#112233', '#112233', '#112233']);
    expect(fills(fixture(source, ''))[1]).toEqual(['#445566', '', '', '']);
    expect(fills(fixture(source, '<w:tblLook w:val="0000" w:firstRow="0" w:firstColumn="0"/>', regular(), '<w:tblStyleRowBandSize w:val="0"/>'))).toEqual(Array.from({ length: 4 }, () => ['', '', '', '']));
  });
  it('overrides individual inherited conditional edges and keeps direct nil/zero/clear choices strongest', () => {
    const edge = (side: string, color: string) => `<w:${side} w:val="single" w:sz="8" w:color="${color}"/>`;
    const source = style('Base', region('firstRow', shade('ABCDEF') + `<w:tcBorders>${edge('top', '112233')}${edge('bottom', '445566')}</w:tcBorders>`))
      + style('Child', region('firstRow', `<w:tcBorders>${edge('top', '778899')}</w:tcBorders>`), 'Base');
    const direct = '<w:shd w:fill="auto" w:val="clear"/><w:tcBorders><w:top w:val="nil"/></w:tcBorders><w:tcMar><w:left w:w="0" w:type="dxa"/></w:tcMar>';
    const result = importDOCX(fixture(source, undefined, row([direct, '', '', '']) + regular(3)), schema);
    expect(result.document.child(0).child(0).child(0).attrs).toMatchObject({ background: '', appearance: { borders: { top: { style: 'hidden' }, bottom: { color: '#445566' } }, padding: { left: 0 } } });
  });
  it('materializes supported region appearance as direct native declarations, not live conditional bindings', () => {
    const source = style('Child', region('firstRow', shade('ABCDEF')) + region('lastRow', shade('112233')));
    const document = importDOCX(fixture(source), schema).document;
    const output = exportDOCX(document);
    expect(fills(output.bytes)).toEqual(document.content[0]!.content.map(row => row.content.map(cell => cell.attrs.background)));
    const xml = strFromU8(unzipSync(output.bytes)['word/document.xml']!);
    expect(xml).toContain('w:fill="ABCDEF"');
    expect(xml).not.toContain('<w:tblStyle ');
  });
  it('applies conditional corner/column margins to their entire Word row, not just the matching cell', () => {
    const margin = (width: number) => `<w:tcMar><w:left w:w="${width}" w:type="dxa"/></w:tcMar>`;
    const source = style('Child', region('firstCol', margin(120)) + region('nwCell', margin(240)));
    const result = importDOCX(fixture(source, undefined, row(['', '<w:tcMar><w:left w:w="0" w:type="dxa"/></w:tcMar>', '', '']) + regular(3)), schema).document.child(0);
    expect(result.child(0).content.map(cell => cell.attrs.appearance)).toEqual([
      { unit: 'pt', padding: { left: 12 } }, { unit: 'pt', padding: { left: 0 } }, { unit: 'pt', padding: { left: 12 } }, { unit: 'pt', padding: { left: 12 } },
    ]);
    expect(result.child(1).content.every(cell => (cell.attrs.appearance as { padding: { left: number } }).padding.left === 6)).toBe(true);
  });
  it('uses grid spans for last-column membership rather than physical cell index', () => {
    const source = style('Child', region('lastCol', shade('AA1122')) + region('neCell', shade('BB3344')));
    const rows = row(['<w:gridSpan w:val="3"/>', '']) + regular(1);
    expect(fills(fixture(source, undefined, rows))).toEqual([['', '#bb3344'], ['', '', '', '#aa1122']]);
  });
  it('uses the same deterministic precedence for single-row/single-column tables', () => {
    const source = style('Child', region('firstRow', shade('111111')) + region('lastRow', shade('222222')) + region('nwCell', shade('333333')) + region('seCell', shade('444444')));
    expect(fills(fixture(source, undefined, row(['']), '', 1))).toEqual([['#444444']]);
  });
  it('honors a row-specific table-look exception without changing adjacent rows', () => {
    const source = style('Child', region('firstCol', shade('ABCDEF')));
    const special = row(['', '', '', '']).replace('<w:tr>', '<w:tr><w:tblPrEx><w:tblLook w:val="0000" w:noHBand="1" w:noVBand="1"/></w:tblPrEx>');
    expect(fills(fixture(source, undefined, regular(1) + special + regular(1)))).toEqual([['#abcdef', '', '', ''], ['', '', '', ''], ['#abcdef', '', '', '']]);
  });
  it('does not let stale optimization annotations override current geometric membership', () => {
    const source = style('Child', region('firstRow', shade('123456')));
    const stale = row(['<w:cnfStyle w:val="100000000000"/>', '', '', '']);
    expect(fills(fixture(source, undefined, regular(1) + stale))).toEqual([['#123456', '#123456', '#123456', '#123456'], ['', '', '', '']]);
  });
  it('reports unsupported regions, text and geometry instead of applying a wholeTable override Word ignores', () => {
    const source = style('Child', region('wholeTable', shade('FF0000')) + region('FutureThing', shade('00FF00'))
      + '<w:tblStylePr w:type="firstRow"><w:rPr><w:b/></w:rPr><w:tcPr><w:noWrap/><w:shd w:fill="112233"/></w:tcPr></w:tblStylePr>');
    const result = importDOCX(fixture(source), schema);
    expect(result.document.child(0).child(0).child(0).attrs.background).toBe('#112233');
    expect(result.document.child(0).child(0).child(0).child(0).child(0).marks.some(mark => mark.type.name === 'strong')).toBe(true);
    expect(result.report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['table-style-conditional-not-imported', 'table-style-conditional-property-not-imported']));
    expect(result.report.fidelity).toBe('lossy');
  });
  it('rejects duplicate regional declarations and ambiguous look/band roots', () => {
    expect(() => importDOCX(fixture(style('Child', region('firstRow', shade('112233')) + region('firstRow', shade('445566')))), schema)).toThrow(/Ambiguous.*region/);
    const source = style('Child', region('firstRow', shade('112233')));
    expect(() => importDOCX(fixture(source, '<w:tblLook/><w:tblLook/>'), schema)).toThrow(/Ambiguous/);
    expect(() => importDOCX(fixture(source, undefined, regular(), '<w:tblStyleRowBandSize w:val="1"/><w:tblStyleRowBandSize w:val="2"/>'), schema)).toThrow(/Ambiguous/);
  });
  it('reports invalid band sizes/look flags and leaves editable content intact', () => {
    const source = style('Child', region('band1Horz', shade('112233')));
    const result = importDOCX(fixture(source, '<w:tblLook w:val="oops" w:firstRow="maybe"/>', regular(), '<w:tblStyleRowBandSize w:val="999999999"/>'), schema);
    expect(result.document.child(0).childCount).toBe(4);
    expect(result.document.child(0).content.every(row => row.content.every(cell => cell.attrs.background === ''))).toBe(true);
    expect(result.report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['invalid-table-style-look', 'invalid-table-style-band-size']));
  });
  it('does not silently assign first-column/corner styling to rows with unsupported grid offsets', () => {
    const source = style('Child', region('firstCol', shade('112233')));
    const offset = row(['', '', '']).replace('<w:tr>', '<w:tr><w:trPr><w:gridBefore w:val="1"/></w:trPr>');
    const result = importDOCX(fixture(source, undefined, offset + regular(1)), schema);
    expect(result.document.child(0).child(0).child(0).attrs.background).toBe('');
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'table-style-grid-offset-not-imported', path: [0, 0] }));
  });
  it('reports distinct conditional fill on a vertically merged continuation instead of silently discarding it', () => {
    const source = style('Child', region('firstRow', shade('112233')) + region('lastRow', shade('445566')));
    const rows = row(['<w:vMerge w:val="restart"/>', '', '', '']) + row(['<w:vMerge/>', '', '', '']);
    const result = importDOCX(fixture(source, undefined, rows), schema);
    expect(result.document.child(0).child(0).child(0).attrs).toMatchObject({ rowspan: 2, background: '#112233' });
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'table-merged-continuation-shading-not-imported', path: [0, 1, 0] }));
  });
  it('does not treat foreign namespace lookalikes as regional rules or look flags', () => {
    const source = style('Child', '<x:tblStylePr xmlns:x="urn:foreign" x:type="firstRow"><x:tcPr><x:shd x:fill="FF0000"/></x:tcPr></x:tblStylePr>' + region('firstRow', shade('112233')));
    const result = fills(fixture(source, '<w:tblLook xmlns:x="urn:foreign" w:val="0000" x:firstRow="1"/>'));
    expect(result).toEqual(Array.from({ length: 4 }, () => ['', '', '', '']));
  });
  it('maps XML namespace aliases and named false overrides without depending on w prefix spelling', () => {
    const bytes = fixture(style('Child', region('firstRow', shade('112233')) + region('lastRow', shade('445566'))), '<w:tblLook w:val="01E0" w:firstRow="off" w:lastRow="true"/>');
    const archive = unzipSync(bytes);
    for (const part of ['word/document.xml', 'word/styles.xml']) archive[part] = strToU8(strFromU8(archive[part]!).replaceAll('w:', 'q:').replaceAll('xmlns:w=', 'xmlns:q='));
    expect(fills(zipSync(archive))[0]).toEqual(['', '', '', '']);
    expect(fills(zipSync(archive))[3]).toEqual(['#445566', '#445566', '#445566', '#445566']);
  });
});
