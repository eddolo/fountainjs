// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { paragraphSpacingAt, Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { importDOCX } from '../src/docx';
import { parseDOCXXML } from '../src/docx/xml-parser';
import type { XMLElement } from '../src/docx/xml-types';
import { readWordParagraphFormatting } from '../src/docx/style-reader';
import { createWordRunStyleCascade } from '../src/docx/style-cascade';

const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const properties = (content = '') => parseDOCXXML(`<a:pPr xmlns:a="${namespace}">${content}</a:pPr>`, { maxXmlNodes: 1000, maxXmlDepth: 32 }).children[0] as XMLElement;
const schema = new Schema(StarterKit.schema);
function source(style = '<w:contextualSpacing/>', direct = '') {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${namespace}"><w:body><w:p><w:pPr><w:pStyle w:val="Body"/>${direct}</w:pPr><w:r><w:t>First</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Body"/></w:pPr><w:r><w:t>Second</w:t></w:r></w:p></w:body></w:document>`),
    'word/styles.xml': strToU8(`<w:styles xmlns:w="${namespace}"><w:style w:type="paragraph" w:styleId="Body"><w:pPr><w:spacing w:after="140"/>${style}</w:pPr></w:style><w:style w:type="paragraph" w:styleId="Unused"><w:pPr><w:contextualSpacing/></w:pPr></w:style></w:styles>`),
    'word/_rels/document.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
  });
}

describe('Word contextual-spacing declaration ownership', () => {
  it.each([
    ['', true], [' a:val="1"', true], [' a:val="true"', true], [' a:val="on"', true],
    [' a:val="0"', false], [' a:val="false"', false], [' a:val="off"', false],
  ])('reads namespaced on/off %s without a DOM', (attribute, value) => {
    expect(typeof document).toBe('undefined');
    const issues: Parameters<typeof readWordParagraphFormatting>[1] = [];
    expect(readWordParagraphFormatting(properties(`<a:contextualSpacing${attribute}/>`), issues)).toEqual({ contextualSpacing: value });
    expect(issues).toEqual([]);
  });

  it.each(['yes', 'True', '2', ''])('reports invalid on/off value %j without inventing a declaration', value => {
    const issues: Parameters<typeof readWordParagraphFormatting>[1] = [];
    expect(readWordParagraphFormatting(properties(`<a:contextualSpacing a:val="${value}"/>`), issues)).toEqual({});
    expect(issues).toEqual([{ code: 'invalid-paragraph-property', property: 'contextualSpacing' }]);
  });

  it('keeps omission distinct from false and rejects duplicate expanded declarations', () => {
    expect(readWordParagraphFormatting(properties(), [])).toEqual({});
    expect(() => readWordParagraphFormatting(properties(`<a:contextualSpacing/><x:contextualSpacing xmlns:x="${namespace}" x:val="false"/>`), [])).toThrow(/Ambiguous Word paragraph property/);
  });

  it('reports foreign attributes/content instead of accepting them as Word values', () => {
    const issues: Parameters<typeof readWordParagraphFormatting>[1] = [];
    expect(readWordParagraphFormatting(properties('<a:contextualSpacing xmlns:x="urn:foreign" x:val="false"><x:child/></a:contextualSpacing>'), issues)).toEqual({ contextualSpacing: true });
    expect(issues.map(issue => issue.property)).toEqual(['contextualSpacing/urn:foreign|val', 'contextualSpacing/nested-content']);
  });

  it('inherits absolute on/off values through defaults, tables, styles, numbering and direct declarations', () => {
    const cascade = createWordRunStyleCascade({ paragraphDefaults: { contextualSpacing: true }, styles: [
      { id: 'Base', kind: 'paragraph', paragraph: { contextualSpacing: false } },
      { id: 'Child', kind: 'paragraph', basedOn: 'Base', paragraph: { contextualSpacing: true } },
    ] });
    expect(cascade.resolveParagraph().formatting.contextualSpacing).toBe(true);
    expect(cascade.resolveParagraph({ table: { runs: [], paragraphs: [{ contextualSpacing: false }] } }).formatting.contextualSpacing).toBe(false);
    expect(cascade.resolveParagraph({ paragraphStyle: 'Base' }).formatting.contextualSpacing).toBe(false);
    expect(cascade.resolveParagraph({ paragraphStyle: 'Child' }).formatting.contextualSpacing).toBe(true);
    expect(cascade.resolveParagraph({ paragraphStyle: 'Child', numbering: { contextualSpacing: false } }).formatting.contextualSpacing).toBe(false);
    expect(cascade.resolveParagraph({ paragraphStyle: 'Child', numbering: { contextualSpacing: false }, direct: { contextualSpacing: true } }).formatting.contextualSpacing).toBe(true);
  });

  it.each([0, 1, 'true', null])('rejects invalid programmatic contextual-spacing declaration %j', value => {
    expect(() => createWordRunStyleCascade({ styles: [], paragraphDefaults: { contextualSpacing: value as unknown as boolean } })).toThrow(/contextualSpacing/);
  });

  it('retains the effective adjacency rule and actual style identity without rewriting declared spacing', () => {
    const result = importDOCX(source(), schema);
    expect(result.document.textContent).toBe('FirstSecond');
    const issues = result.report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-imported');
    expect(issues).toEqual([]);
    expect(result.document.child(0).attrs.layout).toMatchObject({ spacingAfter: 7, contextualSpacing: true, spacingGroup: 'word:style:Body' });
    expect(result.document.child(1).attrs.layout).toMatchObject({ spacingAfter: 7, contextualSpacing: true, spacingGroup: 'word:style:Body' });
    expect(paragraphSpacingAt(result.document, [1])?.spacingBefore).toBe(0);
    expect(result.report.issues.some(issue => issue.code === 'unresolved-paragraph-properties' && issue.message.includes('contextualSpacing'))).toBe(false);
  });

  it('does not issue an adjacency-loss warning for an unused style or an effective false override', () => {
    const result = importDOCX(source('<w:contextualSpacing w:val="false"/>'), schema);
    expect(result.report.issues.some(issue => issue.code === 'paragraph-contextual-spacing-not-imported')).toBe(false);
    const direct = importDOCX(source('<w:contextualSpacing/>', '<w:contextualSpacing w:val="false"/>'), schema);
    expect(direct.report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-imported')).toEqual([]);
    expect(direct.document.child(0).attrs.layout).toMatchObject({ contextualSpacing: false, spacingGroup: 'word:style:Body' });
    expect(direct.document.child(1).attrs.layout).toMatchObject({ contextualSpacing: true, spacingGroup: 'word:style:Body' });
    expect(paragraphSpacingAt(direct.document, [1])?.spacingBefore).toBe(7);
  });

  it('represents the retained scientific source rule without changing its fixture or claiming native export is fixed', () => {
    const result = importDOCX(readFileSync('tests/fixtures/native-docx/cooling-report.docx'), schema);
    // The retained source enables the rule on its title as well as the three
    // numbered paragraphs; original declarations remain independent of gaps.
    expect(result.document.child(0).attrs.layout).toMatchObject({ contextualSpacing: true, spacingGroup: 'word:style:Title' });
    expect(result.report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-imported')).toEqual([]);
    const list = result.document.content.find(node => node.type.name === 'ordered_list')!;
    expect(list.child(0).child(0).attrs.layout).toMatchObject({ spacingAfter: 7, contextualSpacing: true, spacingGroup: 'word:style:ListNumber' });
  });
});
