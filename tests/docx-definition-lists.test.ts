import { describe, expect, it, vi } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Schema } from '../src/core';
import { StarterKit } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { exportDOCX, importDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const source = '<dl><dt>Latency</dt><dt><em>Response time</em></dt><dd><p>Time to respond.</p><p>Measured in milliseconds.</p><ol start="4"><li>Sample requests</li><li>Record results</li></ol></dd><dd><p>Another definition.</p><dl><dt>Tail latency</dt><dd>Slowest responses.</dd></dl></dd></dl>';
const document = (html = source) => ServerHTMLImporter.parse(html, schema);
const exported = () => exportDOCX(document(), { page: 'letter' });
const change = (fn: (xml: string) => string, bytes = exported().bytes) => {
  const files = unzipSync(bytes);
  files['word/document.xml'] = strToU8(fn(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
};

describe('versioned Word glossary controls', () => {
  it('retains roles, repeated entries, paragraphs, rich marks, list starts and nested definitions', () => {
    const result = exported();
    expect(result.report.issues.every(issue => issue.code === 'definition-docx-experimental')).toBe(true);
    const reopened = importDOCX(result.bytes, schema);
    expect(reopened.report.issues).toEqual([]);
    expect(reopened.document.toJSON()).toEqual(document().toJSON());
  });

  it('uses visible edits and duplicate control IDs without restoring hidden source', () => {
    const bytes = change(xml => xml.replace('Time to respond.', 'Edited in Word.').replace(/w:id w:val="\d+"/g, 'w:id w:val="1"'));
    const reopened = importDOCX(bytes, schema);
    expect(reopened.document.toJSON()).toEqual(document(source.replace('Time to respond.', 'Edited in Word.')).toJSON());
    expect(reopened.report.issues).toEqual([]);
  });

  it('keeps definition lists inside table cells and tables inside descriptions', () => {
    const doc = document('<table><tr><td>' + source + '</td></tr></table><dl><dt>Results</dt><dd><table><tr><td>42</td></tr></table></dd></dl>');
    const actual = importDOCX(exportDOCX(doc).bytes, schema).document;
    expect(actual.child(0).child(0).child(0).child(0).toJSON()).toEqual(doc.child(0).child(0).child(0).child(0).toJSON());
    const table = actual.child(1).child(1).child(0);
    expect(table.type.name).toBe('table');
    expect(table.child(0).child(0).attrs).toEqual({ colspan: 1, rowspan: 1, colwidth: null, background: '' });
    expect(table.textContent).toBe('42');
  });

  it.each(['<dl></dl>', '<dl><dd>Unpaired definition</dd><dd>Second definition</dd></dl>'])('retains incomplete authoring structure: %s', html => {
    const doc = document(html);
    const actual = importDOCX(exportDOCX(doc).bytes, schema).document;
    expect(actual.toJSON()).toEqual(doc.toJSON());
  });

  it('keeps empty entries editable, using the DOCX importer empty-paragraph representation', () => {
    const actual = importDOCX(exportDOCX(document('<dl><dt></dt><dd></dd></dl>')).bytes, schema).document.child(0);
    expect(actual.content.map(node => node.type.name)).toEqual(['definition_term', 'definition_description']);
    for (const entry of actual.content) expect(entry.content.map(node => node.toJSON())).toEqual([{ type: 'paragraph', attrs: { align: 'left' } }]);
  });

  it.each([
    ['unknown version', (xml: string) => xml.replaceAll(':v1', ':v2')],
    ['removed tags', (xml: string) => xml.replace(/<w:tag[^>]*\/>/g, '')],
    ['extra behavior', (xml: string) => xml.replaceAll('<w:sdtPr>', '<w:sdtPr><w:lock w:val="sdtLocked"/>')],
    ['duplicate tags', (xml: string) => xml.replace(/(<w:tag[^>]*\/>)/g, '$1$1')],
    ['foreign tags', (xml: string) => xml.replaceAll('<w:tag ', '<f:tag xmlns:f="urn:foreign" ')],
  ])('retains visible content with warnings for %s', (_name, alter) => {
    const result = importDOCX(change(alter), schema);
    expect(result.document.textContent).toBe(document().textContent);
    expect(result.document.content.some(node => node.type.name === 'definition_list')).toBe(false);
    expect(result.report.issues.some(issue => issue.code === 'content-control-unwrapped')).toBe(true);
  });

  it('does not discard an unexpected visible paragraph between entry controls', () => {
    const result = importDOCX(change(xml => xml.replace('<w:sdtContent>', '<w:sdtContent><w:p><w:r><w:t>Added outside entries</w:t></w:r></w:p>')), schema);
    expect(result.document.textContent).toBe('Added outside entries' + document().textContent);
    expect(result.document.child(0).type.name).toBe('paragraph');
    expect(result.report.issues.length).toBeGreaterThan(0);
  });

  it('accepts equivalent namespace prefixes but not foreign structural controls', () => {
    expect(importDOCX(change(xml => xml.replaceAll('w:', 'x:').replace('xmlns:w=', 'xmlns:x=')), schema).document.toJSON()).toEqual(document().toJSON());
    const foreign = importDOCX(change(xml => xml.replace('<w:sdt>', '<f:sdt xmlns:f="urn:foreign">').replace(/<\/w:sdt>(?=<w:sectPr>)/, '</f:sdt>')), schema);
    expect(foreign.report.issues.some(issue => issue.code === 'unsupported-content-control-namespace')).toBe(true);
  });

  it('falls back when the host does not register definition roles', () => {
    const nodes = { ...StarterKit.schema.nodes };
    delete nodes.definition_list;
    delete nodes.definition_term;
    delete nodes.definition_description;
    const minimal = new Schema({ ...StarterKit.schema, nodes });
    const result = importDOCX(exported().bytes, minimal);
    expect(result.document.textContent).toBe(document().textContent);
    expect(result.report.issues.some(issue => issue.code === 'definition-schema-fallback')).toBe(true);
  });

  it('uses paragraph styles for role appearance without adding strong content marks', () => {
    const files = unzipSync(exported().bytes);
    const xml = strFromU8(files['word/document.xml']!);
    expect(xml).toContain('<w:pStyle w:val="FountainDefinitionTerm"/>');
    expect(xml).toContain('<w:ind w:left="360"/>');
    expect(xml).toContain('<w:ind w:left="720"/>');
    expect(xml).not.toContain('<w:b/>');
    expect(strFromU8(files['word/styles.xml']!)).toContain('Fountain Definition Term');
    const ids = [...xml.matchAll(/<w:id w:val="(\d+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(importDOCX(exported().bytes, schema).document.child(0).child(0).child(0).child(0).marks).toEqual([]);
  });

  it('parses deeply nested visible content once when the host roles are incompatible', () => {
    let nested = document('<dl><dt>Leaf</dt><dd>Value</dd></dl>').child(0);
    for (let index = 0; index < 12; index++) nested = schema.node('definition_list', {}, [schema.node('definition_description', {}, [nested])]);
    const incompatible = new Schema({ ...StarterKit.schema, nodes: {
      ...StarterKit.schema.nodes, definition_description: { content: 'text*' },
    } });
    const calls = vi.spyOn(incompatible, 'node');
    const result = importDOCX(exportDOCX(schema.node('doc', {}, [nested])).bytes, incompatible);
    expect(result.document.textContent).toBe('LeafValue');
    expect(result.document.content.map(node => node.type.name)).toEqual(['paragraph', 'paragraph']);
    expect(result.report.issues.filter(issue => issue.code === 'definition-schema-fallback')).toHaveLength(13);
    expect(calls.mock.calls.length).toBeLessThan(100);
  });
});
