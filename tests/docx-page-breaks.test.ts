import { withDOCXExportDefaults } from './fixtures/docx-page-defaults';
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit, composeExtensions } from '../src/extensions';
import { PagesExtension } from '../src/pages';
import { exportDOCX, importDOCX } from '../src/docx';

const schema = new Schema(composeExtensions([...StarterKit.extensions, PagesExtension]).schema);
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const fixture = (body: string) => zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="${ns}"><w:body>${body}</w:body></w:document>`) });
const paragraph = (content: string, properties = '') => `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}<w:r>${content}</w:r></w:p>`;
const read = (body: string) => importDOCX(fixture(body), schema);
const breaks = (count = 1) => '<w:br w:type="page"/>'.repeat(count);

describe('DOCX explicit page breaks', () => {
  it('retains a standalone native break without manufacturing an empty paragraph', () => {
    expect(typeof document).toBe('undefined');
    const result = read(paragraph('<w:t>Before</w:t>') + paragraph(breaks()) + paragraph('<w:t>After</w:t>'));
    expect(result.document.content.map(node => node.type.name)).toEqual(['paragraph', 'page_break', 'paragraph']);
    expect(result.report.issues).toEqual([]);
    const exported = exportDOCX(result.document);
    expect(strFromU8(unzipSync(exported.bytes)['word/document.xml']!)).toContain('<w:br w:type="page"/>');
    expect(exported.report.issues).toEqual([
      expect.objectContaining({ code: 'paragraph-font-defaulted', severity: 'warning', path: [0] }),
      expect.objectContaining({ code: 'paragraph-font-defaulted', severity: 'warning', path: [2] }),
      expect.objectContaining({ code: 'page-settings-defaulted', severity: 'info' }),
    ]);
    expect(importDOCX(exported.bytes, schema).document.toJSON()).toEqual(withDOCXExportDefaults(result.document.toJSON()));
  });
  it.each([
    [breaks() + '<w:t>After</w:t>', ['page_break', 'paragraph']],
    ['<w:t>Before</w:t>' + breaks(), ['paragraph', 'page_break']],
    ['<w:t>Before</w:t>' + breaks(2) + '<w:t>After</w:t>', ['paragraph', 'page_break', 'page_break', 'paragraph']],
    [breaks(3), ['page_break', 'page_break', 'page_break']],
  ])('retains order and repeated breaks for %s', (content, names) => {
    const result = read(paragraph(content as string));
    expect(result.document.content.map(node => node.type.name)).toEqual(names);
    expect(result.report.issues.map(issue => issue.code)).toContain('page-break-paragraph-split');
    expect(importDOCX(exportDOCX(result.document).bytes, schema).document.toJSON()).toEqual(withDOCXExportDefaults(result.document.toJSON()));
  });
  it('keeps marks and headings on either side and distinguishes a normal line break', () => {
    const result = read(paragraph('<w:rPr><w:b/></w:rPr><w:t>Before</w:t><w:br/>' + breaks() + '<w:t>After</w:t>', '<w:pStyle w:val="Heading2"/>'));
    expect(result.document.content.map(node => node.type.name)).toEqual(['heading', 'page_break', 'heading']);
    expect(result.document.child(0).child(1).type.name).toBe('hard_break');
    for (const index of [0, 2]) {
      expect(result.document.child(index).attrs.level).toBe(2);
      expect(result.document.child(index).child(0).marks[0].type.name).toBe('strong');
    }
  });
  it('splits code-styled content without making invalid inline content', () => {
    const result = read(paragraph('<w:t>first()</w:t>' + breaks() + '<w:t>second()</w:t>', '<w:pStyle w:val="Code"/>'));
    expect(result.document.content.map(node => node.type.name)).toEqual(['code_block', 'page_break', 'code_block']);
    expect(() => schema.validate(result.document)).not.toThrow();
  });
  it('retains nested breaks and reports nested export limitations', () => {
    const run = '<w:t>Before</w:t>' + breaks() + '<w:t>After</w:t>';
    const result = read(paragraph(run, '<w:pStyle w:val="ListBullet"/>') + paragraph(run, '<w:pStyle w:val="Quote"/>') + `<w:tbl><w:tr><w:tc>${paragraph(run)}</w:tc></w:tr></w:tbl>`);
    expect(result.document.child(0).child(0).child(1).type.name).toBe('page_break');
    expect(result.document.child(1).child(1).type.name).toBe('page_break');
    expect(result.document.child(2).child(0).child(0).child(1).type.name).toBe('page_break');
    const exported = exportDOCX(result.document);
    expect(exported.report.issues.filter(issue => issue.code === 'nested-page-break-projection')).toHaveLength(3);
    expect(strFromU8(unzipSync(exported.bytes)['word/document.xml']!).match(/<w:br w:type="page"\/>/g)).toHaveLength(3);
  });
  it('uses a visible reported fallback without page-break support', () => {
    const result = importDOCX(fixture(paragraph(breaks())), new Schema(StarterKit.schema));
    expect(result.document.textContent).toBe('[Page break]');
    expect(result.report.issues[0].code).toBe('missing-page-break-node');
  });
  it('reports column and clear loss, and does not invent a break from rendered pagination', () => {
    const result = read(paragraph('<w:t>Start</w:t><w:br w:type="column"/><w:br w:clear="all"/><w:lastRenderedPageBreak/><w:t>End</w:t>'));
    expect(result.document.childCount).toBe(1);
    expect(result.document.child(0).content.map(node => node.type.name)).toEqual(['text', 'hard_break', 'hard_break', 'text']);
    expect(result.report.issues.map(issue => issue.code)).toEqual(['unsupported-break-type', 'break-clear-not-imported']);
  });
  it('retains page-break-before as paragraph layout rather than an inline break', () => {
    const enabled = read(paragraph('<w:t>Chapter</w:t>', '<w:pageBreakBefore/>'));
    expect(enabled.report.issues).toEqual([]);
    const spacing = { unit: 'pt', spacingBefore: 0, spacingAfter: 0,
      lineHeight: 1, lineHeightUnit: 'multiple', lineHeightRule: 'auto', keepWithNext: false, keepLinesTogether: false };
    expect(enabled.document.child(0).attrs.layout).toEqual({ ...spacing, pageBreakBefore: true });
    const disabled = read(paragraph('<w:t>Chapter</w:t>', '<w:pageBreakBefore w:val="0"/>'));
    expect(disabled.report.issues).toEqual([]);
    expect(disabled.document.child(0).attrs.layout).toEqual({ ...spacing, pageBreakBefore: false });
  });
});
