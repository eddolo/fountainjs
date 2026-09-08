import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { exportDOCX, importDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const run = (text: string) => `<w:r><w:t>${text}</w:t></w:r>`;
const p = (text: string) => `<w:p>${run(text)}</w:p>`;
const sdt = (body: string) => `<w:sdt><w:sdtPr><w:alias w:val="Owner"/><w:tag w:val="private metadata"/><w:lock w:val="sdtContentLocked"/><w:dataBinding w:xpath="/private/owner"/></w:sdtPr><w:sdtContent>${body}</w:sdtContent></w:sdt>`;
const pack = (body: string, numbering?: string) => zipSync({
  'word/document.xml': strToU8(`<w:document xmlns:w="${ns}"><w:body>${body}</w:body></w:document>`),
  ...(numbering ? { 'word/numbering.xml': strToU8(numbering) } : {}),
});

describe('DOCX visible content-control projection', () => {
  it('retains nested block controls and rich runs while reporting lost control semantics', () => {
    const result = importDOCX(pack(p('Before') + sdt(p('Visible owner') + sdt('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Strong</w:t></w:r></w:p>')) + p('After')), schema);
    expect(result.document.content.map(node => node.textContent)).toEqual(['Before', 'Visible owner', 'Strong', 'After']);
    expect(result.document.child(2).child(0).marks.map(mark => mark.type.name)).toEqual(['strong']);
    expect(result.report.issues.map(issue => issue.code)).toEqual(['content-control-unwrapped', 'content-control-unwrapped']);
    expect(JSON.stringify(result.report)).not.toContain('private metadata');
    expect(importDOCX(exportDOCX(result.document).bytes, schema).document.toJSON()).toEqual(result.document.toJSON());
  });

  it('reads controls inside cells, nested tables and tables inside controls', () => {
    const table = (body: string) => `<w:tbl><w:tr><w:tc><w:tcPr/>${body}</w:tc></w:tr></w:tbl>`;
    const result = importDOCX(pack(sdt(table(sdt(p('Cell')) + sdt(table(p('Nested cell')))))), schema);
    const cell = result.document.child(0).child(0).child(0);
    expect(cell.child(0).textContent).toBe('Cell');
    expect(cell.child(1).type.name).toBe('table');
    expect(cell.child(1).textContent).toBe('Nested cell');
    expect(result.report.issues.every(issue => issue.code === 'content-control-unwrapped')).toBe(true);
  });

  it('keeps a list continuous across a content-control boundary', () => {
    const numbering = `<w:numbering xmlns:w="${ns}"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="4"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
    const item = (text: string) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>${run(text)}</w:p>`;
    const result = importDOCX(pack(item('One') + sdt(item('Two')) + item('Three'), numbering), schema);
    expect(result.document.childCount).toBe(1);
    expect(result.document.child(0).attrs.start).toBe(4);
    expect(result.document.child(0).content.map(node => node.textContent)).toEqual(['One', 'Two', 'Three']);
  });

  it('preserves inline visible values and ignores run-like content in control properties', () => {
    const control = `<w:sdt><w:sdtPr>${run('NOT VISIBLE')}<w:text/></w:sdtPr><w:sdtContent>${run('Ada')}</w:sdtContent><w:sdtEndPr>${run('ALSO HIDDEN')}</w:sdtEndPr></w:sdt>`;
    const result = importDOCX(pack(`<w:p>${run('Owner ')}${control}${run(' approved')}</w:p>`), schema);
    expect(result.document.textContent).toBe('Owner Ada approved');
    expect(result.report.issues.map(issue => issue.code)).toEqual(['content-control-unwrapped']);
  });

  it('does not fetch data bindings or substitute field instructions for displayed values', () => {
    const control = `<w:sdt><w:sdtPr><w:dataBinding w:xpath="https://example.invalid/private"/><w:date w:fullDate="1900-01-01"/></w:sdtPr><w:sdtContent>${run('8 September')}</w:sdtContent></w:sdt>`;
    const result = importDOCX(pack(`<w:p>${control}</w:p>`), schema);
    expect(result.document.textContent).toBe('8 September');
    expect(result.report.fidelity).not.toBe('lossless');
  });

  it('reports missing content without exposing properties', () => {
    const result = importDOCX(pack(`<w:sdt><w:sdtPr>${p('Secret')}</w:sdtPr></w:sdt>`), schema);
    expect(result.document.textContent).toBe('');
    expect(result.report.issues.map(issue => issue.code)).toEqual(['content-control-unwrapped', 'invalid-content-control']);
  });

  it('retains all visible containers in a malformed duplicate-content control', () => {
    const result = importDOCX(pack(`<w:sdt><w:sdtContent>${p('First')}</w:sdtContent><w:sdtContent>${p('Second')}</w:sdtContent></w:sdt>`), schema);
    expect(result.document.content.map(node => node.textContent)).toEqual(['First', 'Second']);
    expect(result.report.issues.map(issue => issue.code)).toContain('invalid-content-control');
  });

  it('accepts equivalent namespace prefixes', () => {
    const bytes = zipSync({ 'word/document.xml': strToU8(`<x:document xmlns:x="${ns}"><x:body>${sdt(p('Visible')).replaceAll('w:', 'x:')}</x:body></x:document>`) });
    expect(importDOCX(bytes, schema).document.textContent).toBe('Visible');
  });

  it.each(['block', 'inline'])('refuses a foreign-namespace %s control lookalike', kind => {
    const fake = `<f:sdt xmlns:f="urn:untrusted"><w:sdtContent>${kind === 'block' ? p('Hidden') : run('Hidden')}</w:sdtContent></f:sdt>`;
    const result = importDOCX(pack(kind === 'block' ? fake : `<w:p>${fake}</w:p>`), schema);
    expect(result.document.textContent).toBe('');
    expect(result.report.issues.map(issue => issue.code)).toContain('unsupported-content-control-namespace');
  });

  it('reports unsupported cell blocks instead of silently filtering them out', () => {
    const result = importDOCX(pack('<w:tbl><w:tr><w:tc><w:tcPr/><w:altChunk/>' + p('Visible') + '</w:tc></w:tr></w:tbl>'), schema);
    expect(result.document.textContent).toBe('Visible');
    expect(result.report.issues.map(issue => issue.code)).toEqual(['unsupported-block']);
  });

  it('keeps XML depth limits active around nested controls', () => {
    const nested = Array.from({ length: 20 }).reduce<string>(body => sdt(body), p('Deep'));
    expect(() => importDOCX(pack(nested), schema, { maxXmlDepth: 16 })).toThrow(/depth/i);
  });
});
