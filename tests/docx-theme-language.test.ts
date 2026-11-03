// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { importDOCX, exportDOCX } from '../src/docx';
import { parseDOCXXML } from '../src/docx/xml-parser';
import { readWordThemeFonts } from '../src/docx/theme-fonts';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const a = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const schema = new Schema(StarterKit.schema);
const xml = (source: string) => parseDOCXXML(source, { maxXmlNodes: 1000, maxXmlDepth: 20 });
const theme = (major = '', minor = '') => `<a:theme xmlns:a="${a}"><a:themeElements><a:fontScheme name="Test"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface="Regional East Asian"/><a:cs typeface="Regional Complex"/>${major}</a:majorFont><a:minorFont><a:latin typeface="Cambria"/>${minor}</a:minorFont></a:fontScheme></a:themeElements></a:theme>`;
const settings = (attrs: string) => `<w:settings xmlns:w="${w}"><w:themeFontLang ${attrs}/></w:settings>`;
const family = (document: ReturnType<typeof importDOCX>['document']) => document.child(0).child(0).marks.find(mark => mark.type.name === 'font_family')?.attrs.family;
function source(attrs: string, fonts = '', themeXML = theme()) {
  return zipSync(Object.fromEntries(Object.entries({
    'word/document.xml': `<w:document xmlns:w="${w}"><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="Arial" w:asciiTheme="majorHAnsi" w:hAnsi="Arial" w:hAnsiTheme="majorHAnsi"${fonts}/></w:rPr><w:t>Preserved technical prose</w:t></w:r></w:p></w:body></w:document>`,
    'word/_rels/document.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="t" Type="${rel}/theme" Target="theme.xml"/><Relationship Id="s" Type="${rel}/settings" Target="settings.xml"/></Relationships>`,
    'word/theme.xml': themeXML, 'word/settings.xml': settings(attrs),
  }).map(([path, text]) => [path, strToU8(text)])));
}
afterEach(() => vi.restoreAllMocks());

describe('declared Word theme languages', () => {
  it.each(['en-US', 'fr-FR', 'de-DE', 'it-IT'])('uses the embedded Latin default for %s and keeps it through native export', language => {
    expect(typeof document).toBe('undefined');
    const result = importDOCX(source(`w:val="${language}"`), schema);
    expect(family(result.document)).toBe('Calibri');
    expect(result.report.issues.map(issue => issue.code)).toEqual(['theme-font-materialized']);
    expect(family(importDOCX(exportDOCX(result.document).bytes, schema).document)).toBe('Calibri');
  });

  // Expected script tags come from the DrawingML theme contract, not a
  // comparison with a second call to the implementation's Intl resolver.
  it.each([
    ['ja-JP', 'Jpan'], ['ko-KR', 'Hang'], ['zh-CN', 'Hans'], ['zh-TW', 'Hant'],
    ['sr-Cyrl-RS', 'Cyrl'], ['sr-Latn-RS', 'Latn'], ['ar-SA', 'Arab'], ['he-IL', 'Hebr'],
  ])('selects %s supplemental fonts through the public import boundary', (language, script) => {
    const result = importDOCX(source(`w:val="${language}"`, '', theme(`<a:font script="${script}" typeface="Georgia"/>`)), schema);
    expect(family(result.document)).toBe('Georgia');
    expect(result.document.textContent).toBe('Preserved technical prose');
    expect(family(importDOCX(exportDOCX(result.document).bytes, schema).document)).toBe('Georgia');
  });

  it('keeps major/minor groups and all three language roles independent', () => {
    const resolver = readWordThemeFonts(xml(theme('<a:font script="Jpan" typeface="Japanese"/><a:font script="Arab" typeface="Arabic"/>',
      '<a:font script="Jpan" typeface="Minor Japanese"/>')), xml(settings('w:val="en-US" w:eastAsia="ja-JP" w:bidi="ar-SA"')));
    expect(resolver.resolve('majorAscii')).toEqual({ name: 'Calibri' });
    expect(resolver.resolve('minorHAnsi')).toEqual({ name: 'Cambria' });
    expect(resolver.resolve('majorEastAsia')).toEqual({ name: 'Japanese' });
    expect(resolver.resolve('minorEastAsia')).toEqual({ name: 'Minor Japanese' });
    expect(resolver.resolve('majorBidi')).toEqual({ name: 'Arabic' });
  });

  it('uses a regional default when the declared script has no supplemental entry', () => {
    expect(family(importDOCX(source('w:val="ja-JP"'), schema).document)).toBe('Calibri');
  });

  it.each(['zz-ZZ', 'not_a_tag', '', 'und', 'x'.repeat(129)])('reports an unresolved language rather than silently claiming its fallback (%s)', language => {
    const result = importDOCX(source(`w:val="${language}"`), schema);
    expect(family(result.document)).toBe('Arial');
    expect(result.report.issues.filter(issue => issue.code === 'font-theme-not-resolved')).toHaveLength(2);
    expect(result.report.issues.some(issue => issue.code === 'theme-font-materialized')).toBe(false);
  });

  it('honours an explicit script even when it differs from the language default', () => {
    expect(family(importDOCX(source('w:val="en-Cyrl-US"', '', theme('<a:font script="Cyrl" typeface="Georgia"/>')), schema).document)).toBe('Georgia');
  });

  it('falls back with a located warning if Intl.Locale is unavailable', () => {
    vi.spyOn(Intl, 'Locale').mockImplementation(function () { throw new Error('Unavailable'); });
    const result = importDOCX(source('w:val="en-US"'), schema);
    expect(family(result.document)).toBe('Arial');
    expect(result.report.issues[0]).toMatchObject({ code: 'font-theme-not-resolved', path: [0] });
  });

  it('does not choose one of two declarations for the same supplemental script', () => {
    expect(() => importDOCX(source('w:val="ja-JP"', '', theme('<a:font script="Jpan" typeface="Georgia"/><a:font script="Jpan" typeface="Arial"/>')), schema))
      .toThrow(/Ambiguous Word theme script Jpan/);
  });

  it('honours namespace aliases and ignores foreign font and attribute lookalikes', () => {
    const contents = theme('<x:font xmlns:x="urn:foreign" script="Jpan" typeface="Wrong"/><a:font xmlns:x="urn:foreign" x:script="Jpan" typeface="Wrong"/>')
      .replaceAll('a:', 'd:').replace('xmlns:a=', 'xmlns:d=');
    expect(family(importDOCX(source('w:val="en-US"', '', contents), schema).document)).toBe('Calibri');
  });

  it('reports an empty matching font instead of reviving a regional or named face as a theme match', () => {
    const result = importDOCX(source('w:val="ja-JP"', '', theme('<a:font script="Jpan" typeface=""/>')), schema);
    expect(family(result.document)).toBe('Arial');
    expect(result.report.issues[0].message).toContain('missing-theme-font');
  });

  it('repairs font selection in the unchanged independently produced scientific document', () => {
    const result = importDOCX(readFileSync(new URL('./fixtures/native-docx/cooling-report.docx', import.meta.url)), schema);
    expect(family(result.document)).toBe('Calibri');
    expect(result.document.child(0).attrs.layout).toMatchObject({ fontFamily: 'Calibri' });
    expect(family(importDOCX(exportDOCX(result.document).bytes, schema).document)).toBe('Calibri');
  });
});
