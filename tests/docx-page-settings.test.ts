// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { createEditor, Schema, readDocumentPageSettings, isDocumentPageSettings } from '../src/core';
import { StarterKit } from '../src/extensions';
import { createHistoryPlugin, undo, redo } from '../src/extensions/plugins/history';
import { pageSettingsGeometry, setDocumentPageSettings } from '../src/pages/settings';
import { exportDOCX, importDOCX } from '../src/docx';
import { defaultDOCXPageSettings, withDOCXExportStyles } from './fixtures/docx-page-defaults';
import { exportLab, importLab, labSchema } from '../examples/react-app/src/conversion-lab';

const schema = new Schema(StarterKit.schema);
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const section = '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1037" w:right="1152" w:bottom="1037" w:left="1152" w:header="720" w:footer="720" w:gutter="0"/>';
const sourceSettings = { unit: 'pt', width: 612, height: 792, marginTop: 51.85, marginRight: 57.6, marginBottom: 51.85, marginLeft: 57.6, headerDistance: 36, footerDistance: 36, gutter: 0 } as const;
function fixture(settings = section, extraSection = '', extraParts: Record<string, Uint8Array> = {}) {
  return zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p>${extraSection}<w:sectPr>${settings}</w:sectPr></w:body></w:document>`), ...extraParts });
}
const read = (bytes: Uint8Array) => importDOCX(bytes, schema);
const xml = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)['word/document.xml']!);

describe('portable document page settings', () => {
  it('imports independent Letter dimensions and exact fractional-point margins in Node without Pages nodes', () => {
    expect(typeof document).toBe('undefined');
    expect(schema.nodes.page_header).toBeUndefined();
    const result = read(fixture());
    expect(readDocumentPageSettings(result.document)).toEqual(sourceSettings);
    expect(result.report.issues).toEqual([]);
    const exported = exportDOCX(result.document);
    expect(xml(exported.bytes)).toContain(section);
    expect(exported.report.issues).toEqual([expect.objectContaining({ code: 'paragraph-font-defaulted', severity: 'warning', path: [0] })]);
    expect(read(exported.bytes).document.toJSON()).toEqual(withDOCXExportStyles(result.document.toJSON()));
  });
  it('retains landscape dimensions once, without a second swap', () => {
    const result = read(fixture(section.replace('w:w="12240" w:h="15840"', 'w:w="15840" w:h="12240" w:orient="landscape"')));
    expect(readDocumentPageSettings(result.document)).toMatchObject({ width: 792, height: 612, orientation: 'landscape' });
    expect(xml(exportDOCX(result.document).bytes)).toContain('<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>');
  });
  it('preserves nonstandard dimensions and negative top/bottom settings as data', () => {
    const bytes = fixture(section.replace('12240', '14001').replace('w:top="1037"', 'w:top="-720"'));
    const result = read(bytes);
    expect(readDocumentPageSettings(result.document)).toMatchObject({ width: 700.05, marginTop: -36 });
    expect(xml(exportDOCX(result.document).bytes)).toContain('w:top="-720"');
    expect(() => pageSettingsGeometry(readDocumentPageSettings(result.document)!)).toThrow(/cannot yet represent/);
  });
  it('reports explicit export overrides while retaining margins and source state', () => {
    const result = read(fixture());
    const out = exportDOCX(result.document, { page: 'a4' });
    expect(xml(out.bytes)).toContain('w:w="11906" w:h="16838"');
    expect(xml(out.bytes)).toContain('w:top="1037"');
    expect(readDocumentPageSettings(result.document)).toEqual(sourceSettings);
    expect(out.report.issues.map(issue => issue.code)).toEqual(['paragraph-font-defaulted', 'page-size-overridden']);
  });
  it('exposes and reports output defaults instead of hiding added root settings', () => {
    const original = read(fixture('')).document;
    expect(readDocumentPageSettings(original)).toBeUndefined();
    const output = exportDOCX(original);
    expect(output.report.issues.map(issue => issue.code)).toEqual(['paragraph-font-defaulted', 'page-settings-defaulted']);
    expect(readDocumentPageSettings(read(output.bytes).document)).toEqual(defaultDOCXPageSettings);
  });
  it('retains partial settings and explicitly reports the remaining export defaults', () => {
    const result = read(fixture('<w:pgSz w:w="12000"/><w:pgMar w:top="1000"/>'));
    expect(readDocumentPageSettings(result.document)).toEqual({ unit: 'pt', width: 600, marginTop: 50 });
    expect(exportDOCX(result.document).report.issues.map(issue => issue.code)).toEqual(['paragraph-font-defaulted', 'page-settings-defaulted']);
  });
  it('reports multi-section settings rather than flattening different geometry', () => {
    const result = read(fixture(section, `<w:p><w:pPr><w:sectPr><w:pgSz w:w="15840" w:h="12240"/></w:sectPr></w:pPr></w:p>`));
    expect(readDocumentPageSettings(result.document)).toBeUndefined();
    expect(result.report.issues.some(issue => issue.code === 'section-page-settings-not-imported')).toBe(true);
  });
  it('reports columns and global mirrored-margin modes without claiming their layout', () => {
    const result = read(fixture(section + '<w:cols w:num="2"/>', '', { 'word/settings.xml': strToU8(`<w:settings xmlns:w="${ns}"><w:mirrorMargins/></w:settings>`) }));
    expect(readDocumentPageSettings(result.document)).toEqual(sourceSettings);
    expect(result.report.issues.map(issue => issue.code)).toEqual(['section-layout-not-imported', 'document-layout-mode-not-imported']);
  });
  it('handles equivalent namespaces, ignores foreign values and rejects ambiguous elements', () => {
    const bytes = fixture(section.replace('w:w="12240"', 'x:w="12240" xmlns:x="urn:foreign"'));
    expect(readDocumentPageSettings(read(bytes).document)?.width).toBeUndefined();
    expect(() => read(fixture(section + '<w:pgSz w:w="1" w:h="2"/>'))).toThrow(/Ambiguous/);
    const archive = unzipSync(fixture());
    archive['word/document.xml'] = strToU8(strFromU8(archive['word/document.xml']!).replaceAll('w:', 'q:').replace('xmlns:w=', 'xmlns:q='));
    expect(readDocumentPageSettings(read(zipSync(archive)).document)).toEqual(sourceSettings);
  });
  it.each(['NaN', 'Infinity', '0', '-1', '1e4', '4294967296'])('reports invalid source width %s', value => {
    const result = read(fixture(section.replace('w:w="12240"', `w:w="${value}"`)));
    expect(readDocumentPageSettings(result.document)?.width).toBeUndefined();
    expect(result.report.issues.some(issue => issue.code === 'invalid-page-setting')).toBe(true);
  });
  it('validates root JSON, rejects invalid export values, and reports sub-twip rounding', () => {
    for (const settings of [{ unit: 'px', width: 10 }, { unit: 'pt', width: 0 }, { unit: 'pt', orientation: '<xml/>' }, { unit: 'pt', gutter: -1 }, { unit: 'pt', arbitrary: 1 }]) {
      expect(isDocumentPageSettings(settings)).toBe(false);
      expect(() => schema.node('doc', { pageSettings: settings }, [schema.node('paragraph')])).toThrow();
    }
    const source = read(fixture()).document;
    expect(() => exportDOCX(source.withAttrs({ pageSettings: { ...sourceSettings, width: 2000 } }))).toThrow(/Word range/);
    expect(() => exportDOCX(source.withAttrs({ pageSettings: { ...sourceSettings, marginLeft: 600 } }))).toThrow(/body area/);
    const rounded = exportDOCX(source.withAttrs({ pageSettings: { ...sourceSettings, marginTop: 51.851 } }));
    expect(rounded.report.issues.some(issue => issue.code === 'page-setting-rounded')).toBe(true);
  });
  it('changes settings with undo/redo and keeps unrelated root metadata and prose', () => {
    const doc = read(fixture()).document.withAttrs({ ...read(fixture()).document.attrs, project: 'Cooling' });
    const editor = createEditor({ schema: StarterKit.schema, content: doc.toJSON(), plugins: [createHistoryPlugin()] });
    expect(setDocumentPageSettings(editor, { ...sourceSettings, marginTop: 60 })).toBe(true);
    expect(editor.state.doc.attrs.project).toBe('Cooling');
    expect(readDocumentPageSettings(editor.state.doc)?.marginTop).toBe(60);
    expect(undo(editor)).toBe(true);
    expect(readDocumentPageSettings(editor.state.doc)).toEqual(sourceSettings);
    expect(redo(editor)).toBe(true);
    expect(readDocumentPageSettings(editor.state.doc)?.marginTop).toBe(60);
    expect(editor.state.doc.textContent).toBe('Body');
    expect(setDocumentPageSettings(createEditor({ schema: StarterKit.schema, editable: false }), sourceSettings)).toBe(false);
  });
  it('converts supported physical values to measured Pages geometry without DOM dependencies', () => {
    const geometry = pageSettingsGeometry({ ...sourceSettings, headerDistance: 0, footerDistance: 0 }, { unitsPerMillimetre: 96 / 25.4 });
    expect(geometry.size.width).toBeCloseTo(816);
    expect(geometry.size.height).toBeCloseTo(1056);
    expect(geometry.margins.left).toBeCloseTo(76.8);
    expect(() => pageSettingsGeometry(sourceSettings)).toThrow(/distances/);
    expect(() => pageSettingsGeometry({ unit: 'pt', width: 612 })).toThrow(/explicit/);
  });
  it('retains settings in lab JSON, DOCX and HTML, reporting loss in Markdown', () => {
    const doc = labSchema.nodeFromJSON(read(fixture()).document.toJSON());
    for (const format of ['json', 'docx', 'html'] as const) expect(readDocumentPageSettings(importLab(exportLab(doc, format).bytes, format).document)).toEqual(sourceSettings);
    expect(exportLab(doc, 'html').issues.some(issue => issue.code === 'page-settings-not-exported')).toBe(false);
    expect(exportLab(doc, 'markdown').issues.some(issue => issue.message.includes('page settings'))).toBe(true);
  });
});
