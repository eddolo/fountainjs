// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { importDOCX, exportDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const indent = (left = 360, hanging = 360) => `<w:tabs><w:tab w:val="num" w:pos="${left}"/></w:tabs><w:ind w:left="${left}" w:hanging="${hanging}"/>`;
const level = (index: number, left: number, format = 'decimal', marker = `%${index + 1}.`) => `<w:lvl w:ilvl="${index}"><w:start w:val="3"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${marker}"/><w:lvlJc w:val="left"/><w:pPr>${indent(left)}</w:pPr></w:lvl>`;
const p = (index = 0, properties = '', text = 'Instruction') => `<w:p><w:pPr><w:pStyle w:val="Steps"/><w:numPr><w:numId w:val="7"/><w:ilvl w:val="${index}"/></w:numPr>${properties}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
function source(body = p(), levels = level(0, 360), styleProperties = '') {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${w}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`),
    'word/numbering.xml': strToU8(`<w:numbering xmlns:w="${w}"><w:abstractNum w:abstractNumId="9">${levels}</w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="9"/></w:num></w:numbering>`),
    'word/styles.xml': strToU8(`<w:styles xmlns:w="${w}"><w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Steps"><w:basedOn w:val="Normal"/><w:pPr>${styleProperties}</w:pPr></w:style></w:styles>`),
    'word/_rels/document.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
  });
}
const roundTrip = (bytes: Uint8Array) => {
  const imported = importDOCX(bytes, schema);
  const exported = exportDOCX(imported.document);
  return { imported, exported, reopened: importDOCX(exported.bytes, schema) };
};

describe('Word list geometry ownership', () => {
  it('owns the source 18pt text/marker geometry on the list and keeps paragraph layout local', () => {
    const { imported, exported, reopened } = roundTrip(source());
    const list = imported.document.child(0);
    expect(list.attrs.layout).toMatchObject({ unit: 'pt', indentStart: 18, markerOffset: -18, firstLineIndent: 0, markerStyle: 'decimal' });
    expect(list.child(0).child(0).attrs.layout).not.toHaveProperty('indentStart');
    expect(list.child(0).child(0).attrs.layout).not.toHaveProperty('hangingIndent');
    expect(reopened.document.toJSON()).toEqual(imported.document.toJSON());
    const parts = unzipSync(exported.bytes);
    expect(strFromU8(parts['word/numbering.xml']!)).toContain('<w:ind w:left="360" w:right="0" w:hanging="360"/>');
    expect(strFromU8(parts['word/document.xml']!)).not.toContain('w:left="720"');
  });
  it('applies the documented Word order: styles, numbering, then direct paragraph declarations', () => {
    expect(roundTrip(source(p(), level(0, 360), '<w:ind w:left="1440"/>')).imported.document.child(0).attrs.layout).toMatchObject({ indentStart: 18 });
    expect(roundTrip(source(p(0, indent(540)), level(0, 360), '<w:ind w:left="1440"/>')).imported.document.child(0).attrs.layout).toMatchObject({ indentStart: 27 });
  });
  it('keeps per-item indentation relative to the shared list origin without duplicating it on the paragraph', () => {
    const { imported, reopened } = roundTrip(source(p() + p(0, indent(720), 'Override')));
    expect(imported.document.child(0).attrs.layout).toMatchObject({ indentStart: 18 });
    expect(imported.document.child(0).child(1).attrs.layout).toMatchObject({ indentStart: 18 });
    expect(imported.document.child(0).child(1).child(0).attrs.layout).not.toHaveProperty('indentStart');
    expect(reopened.document.toJSON()).toEqual(imported.document.toJSON());
  });
  it('converts absolute Word nesting to parent-relative geometry and reverses it on native export', () => {
    const { imported, exported, reopened } = roundTrip(source(p() + p(1, '', 'Nested') + p(0, '', 'Parent again'), level(0, 360) + level(1, 1080)));
    expect(imported.document.child(0).child(0).child(1).attrs.layout).toMatchObject({ indentStart: 36, markerOffset: -18 });
    expect(strFromU8(unzipSync(exported.bytes)['word/numbering.xml']!)).toContain('w:left="1080"');
    expect(reopened.document.toJSON()).toEqual(imported.document.toJSON());
  });
  it.each([
    ['lowerLetter', '%1)', 'lower-alpha', '', ')'], ['upperRoman', 'Part %1.', 'upper-roman', 'Part ', '.'],
    ['bullet', '→', 'literal', '→', ''], ['none', '', 'none', '', ''],
  ])('keeps supported %s marker declarations through native reopening', (format, marker, markerStyle, markerPrefix, markerSuffix) => {
    const { imported, exported, reopened } = roundTrip(source(p(), level(0, 360, format, marker)));
    expect(imported.document.child(0).attrs.layout).toMatchObject({ markerStyle, markerPrefix, markerSuffix });
    expect(strFromU8(unzipSync(exported.bytes)['word/numbering.xml']!)).toContain(`w:numFmt w:val="${format}"`);
    expect(reopened.document.toJSON()).toEqual(imported.document.toJSON());
  });
  it('reports unsupported templates and suffix behavior instead of claiming they were preserved', () => {
    const result = importDOCX(source(p(), level(0, 360, 'decimal', '%1.%2').replace('<w:lvlJc', '<w:suff w:val="space"/><w:lvlJc')), schema);
    expect(result.report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['list-marker-template-not-imported', 'list-marker-separator-not-imported']));
    expect(result.document.textContent).toBe('Instruction');
  });
  it('keeps the original scientific fixture and fixes its explicit numbering geometry', () => {
    const { imported, reopened, exported } = roundTrip(readFileSync('tests/fixtures/native-docx/cooling-report.docx'));
    const list = imported.document.content.find(node => node.type.name === 'ordered_list')!;
    expect(list.attrs.layout).toMatchObject({ indentStart: 18, markerOffset: -18 });
    expect(reopened.document.content.find(node => node.type.name === 'ordered_list')?.attrs.layout).toEqual(list.attrs.layout);
    expect(strFromU8(unzipSync(exported.bytes)['word/numbering.xml']!)).toContain('w:left="360"');
  });
});
