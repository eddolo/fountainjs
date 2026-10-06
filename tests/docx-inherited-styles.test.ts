// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { importDOCX, exportDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const O = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const style = (id: string, props: string, parent = '', kind = 'paragraph') => `<w:style w:type="${kind}" w:styleId="${id}">${parent ? `<w:basedOn w:val="${parent}"/>` : ''}<w:rPr>${props}</w:rPr></w:style>`;
const p = (id: string, runs: string) => `<w:p><w:pPr><w:pStyle w:val="${id}"/></w:pPr>${runs}</w:p>`;
const r = (text: string, props = '') => `<w:r><w:rPr>${props}</w:rPr><w:t>${text}</w:t></w:r>`;
function fixture(styles: string, body: string, relationship = `<Relationship Id="s" Type="${O}/styles" Target="definitions/run-styles.xml"/>`, defaults = '') {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`),
    'word/_rels/document.xml.rels': strToU8(`<Relationships xmlns="${R}">${relationship}</Relationships>`),
    'word/definitions/run-styles.xml': strToU8(`<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr>${defaults}</w:rPr></w:rPrDefault></w:docDefaults>${styles}</w:styles>`),
  });
}
const names = (node: ReturnType<typeof importDOCX>['document']) => node.child(0).child(0).marks.map(m => m.type.name);
const mark = (node: ReturnType<typeof importDOCX>['document'], name: string) => node.child(0).child(0).marks.find(m => m.type.name === name)?.attrs;

describe('public DOCX inherited run styles', () => {
  it('loads the relationship-owned style part and projects defaults, paragraph chains and direct overrides in pure Node', () => {
    expect(typeof document).toBe('undefined');
    const styles = style('Base', '<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="24"/>') + style('Title', '<w:sz w:val="50"/>', 'Base');
    const imported = importDOCX(fixture(styles, p('Title', r('Title')), undefined, '<w:color w:val="123456"/>'), schema);
    expect(mark(imported.document, 'font_family')).toEqual({ family: 'Georgia' });
    expect(mark(imported.document, 'font_size')).toEqual({ size: '25pt' });
    expect(mark(imported.document, 'text_color')).toEqual({ color: '#123456' });
    expect(imported.document.child(0).attrs.emphasis).toBe('explicit');
    expect(imported.packageParts.find(part => part.path === 'word/definitions/run-styles.xml')?.handling).toBe('adapter-input');
  });
  it('honours character styles, toggle cancellation and absolute direct off', () => {
    const styles = style('Heading1', '<w:b/><w:i/>') + style('Child', '<w:b/>', 'Heading1') + style('Em', '<w:i/>', '', 'character');
    const result = importDOCX(fixture(styles, p('Child', r('Normal', '<w:rStyle w:val="Em"/>')) + p('Heading1', r('Off', '<w:b w:val="off"/><w:i w:val="0"/>'))), schema);
    expect(names(result.document)).not.toContain('strong');
    expect(names(result.document)).not.toContain('em');
    expect(result.document.child(1).attrs.emphasis).toBe('explicit');
    expect(result.document.child(1).child(0).marks).toEqual([]);
  });
  it('resolves a default paragraph style and keeps direct font/size authoritative', () => {
    const styles = style('Normal', '<w:b/><w:sz w:val="40"/>').replace('w:type="paragraph"', 'w:type="paragraph" w:default="1"');
    const result = importDOCX(fixture(styles, `<w:p>${r('Text', '<w:sz w:val="22"/><w:b w:val="0"/>')}</w:p>`), schema);
    expect(mark(result.document, 'font_size')).toEqual({ size: '11pt' });
    expect(names(result.document)).not.toContain('strong');
  });
  it('keeps fallback names in the winning font declaration, without reviving an earlier font', () => {
    const result = importDOCX(fixture(style('Title', '<w:rFonts w:ascii="Georgia" w:asciiTheme="majorHAnsi"/>'), p('Title', r('Text'))), schema);
    expect(mark(result.document, 'font_family')).toEqual({ family: 'Georgia' });
    expect(result.report.issues.some(i => i.code === 'font-theme-not-resolved')).toBe(true);
  });
  it('reports used unresolved styles without reporting unused style properties as lost content', () => {
    const styles = style('Unused', '<w:shadow/>') + style('Used', '<w:smallCaps/>').replace('</w:style>', '<w:pPr><w:spacing w:after="90"/></w:pPr></w:style>');
    const result = importDOCX(fixture(styles, p('Used', r('Text'))), schema);
    expect(result.report.issues.some(i => i.message.includes('shadow'))).toBe(false);
    expect(result.report.issues.some(i => i.code === 'unrepresented-style-toggle' && i.path?.[0] === 0)).toBe(true);
    expect(result.report.issues.some(i => i.code === 'unresolved-paragraph-properties')).toBe(false);
    expect(result.document.child(0).attrs.layout).toMatchObject({ unit: 'pt', spacingAfter: 4.5 });
  });
  it('reports cycles and uncertain default toggles instead of certifying a guessed result', () => {
    const cycle = importDOCX(fixture(style('A', '', 'B') + style('B', '', 'A'), p('A', r('Text'))), schema);
    expect(cycle.report.issues.some(i => i.code === 'style-cycle')).toBe(true);
    const unresolved = importDOCX(fixture(style('A', '<w:b/>'), p('A', r('Text')), undefined, '<w:b/>'), schema);
    expect(unresolved.report.issues.some(i => i.code === 'word-default-toggle-unverified')).toBe(true);
    expect(unresolved.report.fidelity).toBe('lossy');
  });
  it('rejects missing/ambiguous style parts and does not fetch external style definitions', () => {
    const relation = `<Relationship Id="s" Type="${O}/styles" Target="missing.xml"/>`;
    expect(() => importDOCX(fixture('', '<w:p/>', relation), schema)).toThrow(/missing or invalid/);
    expect(() => importDOCX(fixture('', '<w:p/>', relation + relation.replace('Id="s"', 'Id="t"')), schema)).toThrow(/ambiguous styles/);
    const result = importDOCX(fixture('', '<w:p/>', `<Relationship Id="s" Type="${O}/styles" Target="https://example.test/styles.xml" TargetMode="External"/>`), schema);
    expect(result.report.issues.some(i => i.code === 'external-styles-not-imported')).toBe(true);
  });
  it('preserves effective emphasis, font and size through native export/reimport', () => {
    const source = importDOCX(fixture(style('Heading1', '<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="50"/><w:b/>'), p('Heading1', r('Normal', '<w:b w:val="0"/>') + r('Bold'))), schema).document;
    const reopened = importDOCX(exportDOCX(source).bytes, schema).document;
    expect(reopened.child(0).attrs.emphasis).toBe('explicit');
    expect(mark(reopened, 'font_size')).toEqual({ size: '25pt' });
    expect(mark(reopened, 'font_family')).toEqual({ family: 'Georgia' });
    expect(names(reopened)).not.toContain('strong');
    expect(reopened.child(0).child(1).marks.some(m => m.type.name === 'strong')).toBe(true);
  });
});
