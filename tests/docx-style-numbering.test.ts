// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { importDOCX, exportDOCX } from '../src/docx';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const schema = new Schema(StarterKit.schema);
const level = (index: number, style: string, format = 'decimal', start = 4) =>
  `<w:lvl w:ilvl="${index}"><w:start w:val="${start}"/><w:numFmt w:val="${format}"/><w:pStyle w:val="${style}"/></w:lvl>`;
const definitions = (levels = level(0, 'Procedure'), extra = '') =>
  `<w:abstractNum w:abstractNumId="9">${levels}</w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="9"/>${extra}</w:num>`;
const style = (id: string, properties = '', parent = '') =>
  `<w:style w:styleId="${id}" w:type="paragraph">${parent ? `<w:basedOn w:val="${parent}"/>` : ''}<w:pPr>${properties}</w:pPr></w:style>`;
const reference = (id?: string, index?: number) =>
  `<w:numPr>${id === undefined ? '' : `<w:numId w:val="${id}"/>`}${index === undefined ? '' : `<w:ilvl w:val="${index}"/>`}</w:numPr>`;
const paragraph = (styleId = 'Procedure', properties = '', text = 'Check the inlet') =>
  `<w:p><w:pPr><w:pStyle w:val="${styleId}"/>${properties}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
function source(options: { styles?: string; body?: string; numbering?: string; alias?: boolean } = {}) {
  const xml = (body: string, root: string) => `<w:${root} xmlns:w="${w}">${body}</w:${root}>`;
  const files = {
    'word/document.xml': xml(`<w:body>${options.body ?? paragraph()}</w:body>`, 'document'),
    'word/styles.xml': xml(options.styles ?? style('Procedure', reference('7')), 'styles'),
    'word/numbering.xml': xml(options.numbering ?? definitions(), 'numbering'),
    'word/_rels/document.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) =>
    [path, strToU8(options.alias ? text.replaceAll('w:', 'q:').replaceAll('xmlns:w=', 'xmlns:q=') : text)])));
}
const imported = (options: Parameters<typeof source>[0] = {}) => importDOCX(source(options), schema);

describe('Word paragraph-style numbering references', () => {
  it('imports a custom-named numbered style and keeps its start through native export/reopen', () => {
    const result = imported();
    expect(result.document.child(0).type.name).toBe('ordered_list');
    expect(result.document.child(0).attrs.start).toBe(4);
    expect(result.document.textContent).toBe('Check the inlet');
    expect(importDOCX(exportDOCX(result.document).bytes, schema).document.child(0).attrs.start).toBe(4);
    expect(result.report.issues.some(issue => issue.message.includes('numPr is not fully represented'))).toBe(false);
  });
  it('uses the associated abstract level, ignoring ilvl in the paragraph style', () => {
    const result = imported({ styles: style('Procedure', reference('7', 0)),
      numbering: definitions(level(0, 'Other', 'bullet') + level(2, 'Procedure')) });
    expect(result.document.child(0).type.name).toBe('ordered_list');
    expect(result.document.child(0).attrs.start).toBe(4);
  });
  it('does not validate an ignored style-level reference as a direct level', () => {
    expect(imported({ styles: style('Procedure', reference('7', 999)) }).document.child(0).attrs.start).toBe(4);
  });
  it('inherits numbering from basedOn and resolves its associated base style', () => {
    const result = imported({ styles: style('Base', reference('7')) + style('Procedure', '', 'Base'),
      numbering: definitions(level(1, 'Base', 'decimal', 6)) });
    expect(result.document.child(0).type.name).toBe('ordered_list');
    expect(result.document.child(0).attrs.start).toBe(6);
  });
  it('does not infer ordered numbering from a misleading style name', () => {
    const result = imported({ styles: style('ListNumber', reference('7')), body: paragraph('ListNumber'),
      numbering: definitions(level(0, 'ListNumber', 'bullet')) });
    expect(result.document.child(0).type.name).toBe('bullet_list');
  });
  it.each([
    ['direct', style('ListNumber', reference('7')), reference('0')],
    ['style', style('Base', reference('7')) + style('ListNumber', reference('0'), 'Base'), ''],
  ])('honours %s numId=0 as removal instead of reviving a name-based list', (_where, styles, properties) => {
    const result = imported({ styles, body: paragraph('ListNumber', properties), numbering: definitions(level(0, 'ListNumber')) });
    expect(result.document.child(0).type.name).toBe('paragraph');
  });
  it('inherits the style numId when a direct declaration supplies only the level', () => {
    const result = imported({ body: paragraph('Procedure', reference(undefined, 1)),
      numbering: definitions(level(0, 'Procedure') + level(1, 'Other', 'bullet')) });
    expect(result.document.child(0).type.name).toBe('bullet_list');
  });
  it('lets a direct numId/ilvl override the style reference', () => {
    const result = imported({ body: paragraph('Procedure', reference('8', 0)),
      numbering: definitions() + '<w:abstractNum w:abstractNumId="10">' + level(0, 'Other', 'bullet') + '</w:abstractNum><w:num w:numId="8"><w:abstractNumId w:val="10"/></w:num>' });
    expect(result.document.child(0).type.name).toBe('bullet_list');
  });
  it('keeps per-instance overrides and adjacent instances separate', () => {
    const result = imported({ styles: style('Procedure', reference('7')) + style('Restart', reference('8')),
      body: paragraph() + paragraph('Procedure', '', 'Check the outlet') + paragraph('Restart', '', 'Restart'),
      numbering: definitions(level(0, 'Procedure'), '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="9"/></w:lvlOverride>')
        + '<w:num w:numId="8"><w:abstractNumId w:val="9"/></w:num>' });
    expect(result.document.content.map(node => [node.type.name, node.attrs.start, node.childCount])).toEqual([
      ['ordered_list', 9, 2], ['ordered_list', 4, 1],
    ]);
  });
  it('ignores foreign numbering lookalikes and accepts real namespace aliases', () => {
    expect(imported({ alias: true }).document.child(0).type.name).toBe('ordered_list');
    const result = imported({ styles: style('Procedure', '<x:numPr xmlns:x="urn:foreign"><x:numId x:val="7"/></x:numPr>') });
    expect(result.document.child(0).type.name).toBe('paragraph');
  });
  it('does not guess from a familiar name when a real stylesheet declares an ordinary paragraph', () => {
    expect(imported({ styles: style('ListNumber'), body: paragraph('ListNumber') }).document.child(0).type.name).toBe('paragraph');
  });
  it('does not select arbitrary numbering from a cyclic style chain', () => {
    const result = imported({ styles: style('Procedure', reference('7'), 'Base') + style('Base', '', 'Procedure') });
    expect(result.document.child(0).type.name).toBe('paragraph');
    expect(result.report.issues.some(issue => issue.code === 'style-cycle')).toBe(true);
  });
  it('reports a missing list definition at the paragraph instead of reviving a style-name guess', () => {
    const result = imported({ styles: style('ListNumber', reference('999')), body: paragraph('ListNumber') });
    expect(result.document.child(0).type.name).toBe('paragraph');
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'numbering-reference-not-resolved', path: [0] }));
    expect(result.document.textContent).toBe('Check the inlet');
  });
  it('does not bind foreign abstract/instance lookalikes', () => {
    const result = imported({ numbering: definitions().replaceAll('w:', 'x:').replace('<x:abstractNum ', '<x:abstractNum xmlns:x="urn:foreign" ').replace('<x:num ', '<x:num xmlns:x="urn:foreign" ') });
    expect(result.document.child(0).type.name).toBe('paragraph');
    expect(result.report.issues.some(issue => issue.code === 'numbering-reference-not-resolved')).toBe(true);
  });
  it('rejects two abstract levels claiming the same style association', () => {
    expect(() => imported({ numbering: definitions(level(0, 'Procedure') + level(1, 'Procedure')) })).toThrow(/Ambiguous Word numbering style association/);
  });
  it('rejects duplicate overrides and mismatched override levels', () => {
    expect(() => imported({ numbering: definitions(level(0, 'Procedure'), '<w:lvlOverride w:ilvl="0"/><w:lvlOverride w:ilvl="0"/>') })).toThrow(/Ambiguous Word numbering level override/);
    expect(() => imported({ numbering: definitions(level(0, 'Procedure'), '<w:lvlOverride w:ilvl="0">' + level(1, 'Procedure') + '</w:lvlOverride>') })).toThrow(/Invalid Word numbering override level/);
  });
  it.each([
    ['duplicate instance', definitions() + '<w:num w:numId="7"><w:abstractNumId w:val="9"/></w:num>'],
    ['duplicate abstract', definitions() + '<w:abstractNum w:abstractNumId="9">' + level(0, 'Procedure') + '</w:abstractNum>'],
    ['duplicate level', definitions(level(0, 'Procedure') + level(0, 'Other', 'bullet'))],
  ])('rejects %s ambiguity instead of choosing the last declaration', (_name, numbering) => {
    expect(() => imported({ numbering })).toThrow(/Ambiguous Word numbering/);
  });
});
