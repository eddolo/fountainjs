// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { strFromU8, strToU8, zipSync, unzipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { importDOCX, exportDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function fixture(properties: string) {
  return zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:rPr>${properties}</w:rPr><w:t>Scientific text</w:t></w:r></w:p></w:body></w:document>`) });
}
const fonts = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="25"/>';
const read = (properties: string, target = schema) => importDOCX(fixture(properties), target);
const sizes = (result: ReturnType<typeof read>) => result.document.content[0].content[0].marks.map(mark => ({ type: mark.type.name, ...mark.attrs }));

describe('DOCX explicit run typography', () => {
  it('retains named fonts and half-point sizes in pure Node and native export', () => {
    expect(typeof document).toBe('undefined');
    const imported = read(fonts);
    expect(sizes(imported)).toEqual(expect.arrayContaining([{ type: 'font_family', family: 'Times New Roman' }, { type: 'font_size', size: '12.5pt' }]));
    const exported = exportDOCX(imported.document);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']);
    expect(xml).toContain('<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>');
    expect(xml).toContain('<w:sz w:val="25"/>');
    expect(sizes(importDOCX(exported.bytes, schema))).toEqual(sizes(imported));
  });
  it('keeps bold and italic alongside fonts and does not duplicate sizes', () => {
    const result = read(fonts + '<w:b/><w:i/><w:szCs w:val="25"/>');
    expect(sizes(result).map(mark => mark.type)).toEqual(expect.arrayContaining(['strong', 'em', 'font_family', 'font_size']));
    expect(result.report.issues).toEqual([]);
  });
  it('honours namespace identity and detects duplicate explicit properties', () => {
    expect(sizes(read('<x:sz xmlns:x="urn:foreign" x:val="40"/>'))).toEqual([]);
    expect(sizes(read(`<x:sz xmlns:x="${ns}" x:val="40"/>`))).toEqual([{ type: 'font_size', size: '20pt' }]);
    expect(() => read('<w:sz w:val="20"/><w:sz w:val="40"/>')).toThrow(/Ambiguous/);
  });
  it.each(['0', '1', '769', 'NaN', '20.5', '-20'])('reports unrepresentable source half-points %s', raw => {
    const result = read(`<w:sz w:val="${raw}"/>`);
    expect(sizes(result)).toEqual([]);
    expect(result.report.issues[0].code).toBe('font-size-not-imported');
    expect(result.document.textContent).toBe('Scientific text');
  });
  it('reports missing schema marks instead of silently discarding typography', () => {
    const target = new Schema({ nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*' }, text: {} } });
    expect(read(fonts, target).report.issues.map(issue => issue.code)).toEqual(['font-family-not-imported', 'font-size-not-imported']);
  });
  it('rejects unsafe/list font names and distinguishes theme/script decisions', () => {
    expect(read('<w:rFonts w:ascii="x; color:red"/>').report.issues[0].code).toBe('font-family-not-imported');
    const result = read('<w:rFonts w:ascii="Arial" w:hAnsi="Calibri" w:asciiTheme="majorHAnsi" w:eastAsia="SimSun"/><w:szCs w:val="22"/>');
    expect(sizes(result)).toEqual([{ type: 'font_family', family: 'Arial' }]);
    expect(result.report.issues.map(issue => issue.code)).toEqual(['font-theme-not-resolved', 'script-fonts-not-imported', 'script-font-size-not-imported']);
  });
  it('converts absolute pixels with explicit normalization and rounding reports', () => {
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Size', [schema.mark('font_size', { size: '15px' })])])]);
    const original = doc.toJSON();
    const result = exportDOCX(doc);
    expect(result.report.issues.map(issue => issue.code)).toEqual(['font-size-rounded', 'font-size-unit-normalized', 'page-settings-defaulted']);
    expect(sizes(importDOCX(result.bytes, schema))).toEqual([{ type: 'font_family', family: 'Arial' }, { type: 'font_size', size: '11.5pt' }]);
    expect(doc.toJSON()).toEqual(original);
  });
  it.each([['font_size', { size: '2em' }], ['font_family', { family: 'serif' }], ['font_family', { family: 'Arial, sans-serif' }]] as const)('reports unsupported CSS %s values instead of guessing a Word face/size', (name, attrs) => {
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Keep text', [schema.mark(name, attrs)])])]);
    const result = exportDOCX(doc);
    expect(result.report.issues.some(issue => issue.code === 'unsupported-mark' && issue.message.includes(name))).toBe(true);
    expect(importDOCX(result.bytes, schema).document.textContent).toBe('Keep text');
  });
});
