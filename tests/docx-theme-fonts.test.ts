// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { importDOCX, exportDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const a = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const theme = `<a:theme xmlns:a="${a}"><a:themeElements><a:fontScheme name="Research"><a:majorFont><a:latin typeface="Times New Roman"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Courier New"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;
function fixture(options: { fonts?: string; theme?: string; target?: string; extraRels?: string; external?: boolean; parts?: Record<string, string> } = {}) {
  const content: Record<string, string> = {
    'word/document.xml': `<w:document xmlns:w="${w}"><w:body><w:p><w:r><w:rPr><w:rFonts ${options.fonts ?? 'w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"'}/></w:rPr><w:t>Theme text</w:t></w:r></w:p></w:body></w:document>`,
    'word/_rels/document.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="theme" Type="${r}/theme" Target="${options.target ?? 'themes/research.xml'}"${options.external ? ' TargetMode="External"' : ''}/>${options.extraRels ?? ''}</Relationships>`,
    'word/themes/research.xml': options.theme ?? theme,
    ...options.parts,
  };
  return zipSync(Object.fromEntries(Object.entries(content).map(([name, value]) => [name, strToU8(value)])));
}
const family = (result: ReturnType<typeof importDOCX>) => result.document.content[0].content[0].marks.find(mark => mark.type.name === 'font_family')?.attrs.family;

describe('DOCX embedded theme fonts', () => {
  it.each(['majorAscii', 'majorHAnsi', 'minorAscii', 'minorHAnsi'])('resolves %s from the related embedded theme in pure Node and exports a native named face', token => {
    expect(typeof document).toBe('undefined');
    const imported = importDOCX(fixture({ fonts: `w:asciiTheme="${token}" w:hAnsiTheme="${token}"` }), schema);
    const expected = token.startsWith('major') ? 'Times New Roman' : 'Courier New';
    expect(family(imported)).toBe(expected);
    expect(imported.report.issues).toHaveLength(1);
    expect(imported.report.issues[0]).toMatchObject({ code: 'theme-font-materialized', severity: 'info' });
    expect(imported.packageParts.find(part => part.path === 'word/themes/research.xml')?.handling).toBe('adapter-input');
    const exported = exportDOCX(imported.document);
    expect(strFromU8(unzipSync(exported.bytes)['word/document.xml'])).toContain(`w:ascii="${expected}"`);
    expect(family(importDOCX(exported.bytes, schema))).toBe(expected);
  });
  it('uses theme precedence over a conflicting same-slot named fallback', () => {
    expect(family(importDOCX(fixture({ fonts: 'w:ascii="Arial" w:asciiTheme="majorHAnsi" w:hAnsi="Arial" w:hAnsiTheme="majorHAnsi"' }), schema))).toBe('Times New Roman');
  });
  it('does not fetch an external theme and reports fallback use', () => {
    const value = importDOCX(fixture({ target: 'https://example.invalid/fonts.xml', external: true, fonts: 'w:ascii="Arial" w:asciiTheme="majorHAnsi"' }), schema);
    expect(family(value)).toBe('Arial');
    expect(value.report.issues.map(issue => issue.code)).toEqual(['external-theme-not-imported', 'font-theme-not-resolved']);
    expect(value.packageParts.find(part => part.path === 'word/themes/research.xml')?.handling).toBe('not-interpreted');
  });
  it('does not substitute a default regional font for a language-dependent theme font', () => {
    const value = importDOCX(fixture({ extraRels: `<Relationship Id="settings" Type="${r}/settings" Target="settings-custom.xml"/>`,
      parts: { 'word/settings-custom.xml': `<w:settings xmlns:w="${w}"><w:themeFontLang w:val="ja-JP"/></w:settings>` } }), schema);
    expect(family(value)).toBeUndefined();
    expect(value.report.issues.every(issue => issue.message.includes('language-dependent-theme-font'))).toBe(true);
    expect(value.report.issues).toHaveLength(2);
  });
  it('does not trust orphan settings or foreign language attributes', () => {
    const value = importDOCX(fixture({ parts: { 'word/settings.xml': `<w:settings xmlns:w="${w}"><w:themeFontLang w:val="ja-JP"/></w:settings>` } }), schema);
    expect(family(value)).toBe('Times New Roman');
    const foreign = importDOCX(fixture({ extraRels: `<Relationship Id="settings" Type="${r}/settings" Target="settings.xml"/>`,
      parts: { 'word/settings.xml': `<w:settings xmlns:w="${w}" xmlns:x="urn:foreign"><w:themeFontLang x:val="ja-JP"/></w:settings>` } }), schema);
    expect(family(foreign)).toBe('Times New Roman');
  });
  it.each(['../missing.xml', '../../escape.xml', 'https://example.invalid/theme.xml'])('rejects invalid or missing internal theme targets %s', target => {
    expect(() => importDOCX(fixture({ target }), schema)).toThrow(/missing or invalid target/);
  });
  it('rejects duplicate relationships and ambiguous theme elements', () => {
    expect(() => importDOCX(fixture({ extraRels: `<Relationship Id="other" Type="${r}/theme" Target="themes/research.xml"/>` }), schema)).toThrow(/ambiguous theme relationships/);
    expect(() => importDOCX(fixture({ theme: theme.replace('<a:latin typeface="Times New Roman"/>', '<a:latin typeface="Arial"/><a:latin typeface="Georgia"/>') }), schema)).toThrow(/Ambiguous Word theme element latin/);
  });
  it('honours expanded names and unqualified DrawingML attributes', () => {
    expect(family(importDOCX(fixture({ theme: theme.replaceAll('a:', 'z:').replace('xmlns:a=', 'xmlns:z=') }), schema))).toBe('Times New Roman');
    expect(() => importDOCX(fixture({ theme: theme.replace(a, 'urn:foreign') }), schema)).toThrow(/Invalid Word theme root/);
    const value = importDOCX(fixture({ theme: theme.replace('typeface="Times New Roman"', 'x:typeface="Arial" xmlns:x="urn:foreign"') }), schema);
    expect(family(value)).toBeUndefined();
    expect(value.report.issues[0].message).toContain('missing-theme-font');
  });
  it('reports unknown tokens and rejects unsafe resolved face names at the mark boundary', () => {
    expect(importDOCX(fixture({ fonts: 'w:asciiTheme="madeUp"' }), schema).report.issues[0].message).toContain('unknown-theme-font');
    const value = importDOCX(fixture({ theme: theme.replace('Times New Roman', 'Arial; color:red') }), schema);
    expect(family(value)).toBeUndefined();
    expect(value.report.issues[0].code).toBe('font-family-not-imported');
  });
  it('applies XML byte, depth and expansion bounds to the theme part too', () => {
    expect(() => importDOCX(fixture({ theme: theme.replace('Research', 'X'.repeat(3000)) }), schema, { maxDocumentXmlBytes: 2000 })).toThrow(/byte limit/);
    expect(() => importDOCX(fixture(), schema, { maxXmlDepth: 4 })).toThrow(/depth/);
    expect(() => importDOCX(fixture(), schema, { maxExpandedBytes: 800 })).toThrow(/expanded byte limit|expanded bytes/);
  });
});
