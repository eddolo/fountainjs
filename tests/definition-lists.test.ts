import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, HTMLExporter, MarkdownExporter, MarkdownImporter, Schema, TextExporter } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);
const source = '<dl><dt>Latency</dt><dt>Response time</dt><dd>Time to respond.</dd><dd><p>Measured in milliseconds.</p><ul><li>Lower is better.</li></ul></dd><dt>Throughput</dt><dd>Work per second.</dd></dl>';

describe('native definition-list document structure', () => {
  it('keeps multiple terms, descriptions, rich blocks and order without a DOM', () => {
    expect(typeof document).toBe('undefined');
    const result = ServerHTMLImporter.parseWithReport(source, schema);
    const list = result.document.child(0);
    expect(list.type.name).toBe('definition_list');
    expect(list.content.map(node => node.type.name)).toEqual(['definition_term', 'definition_term', 'definition_description', 'definition_description', 'definition_term', 'definition_description']);
    expect(list.content.map(node => node.textContent)).toEqual(['Latency', 'Response time', 'Time to respond.', 'Measured in milliseconds.Lower is better.', 'Throughput', 'Work per second.']);
    expect(list.child(3).content.map(node => node.type.name)).toEqual(['paragraph', 'bullet_list']);
    expect(result.issues).toEqual([]);
    expect(TextExporter.export(result.document)).toBe('Latency\nResponse time\nTime to respond.\nMeasured in milliseconds.\nLower is better.\nThroughput\nWork per second.');
    schema.validate(result.document);
    const reopened = ServerHTMLImporter.parse(HTMLExporter.export(result.document, { document: false }), schema);
    expect(reopened.toJSON()).toEqual(result.document.toJSON());
  });

  it('normalizes empty terms and descriptions to editable paragraphs', () => {
    const doc = ServerHTMLImporter.parse('<dl><dt></dt><dd></dd></dl>', schema);
    expect(doc.child(0).content.map(node => node.child(0).toJSON())).toEqual([
      { type: 'paragraph', attrs: { align: 'left' }, content: [{ type: 'text', text: '' }] },
      { type: 'paragraph', attrs: { align: 'left' }, content: [{ type: 'text', text: '' }] },
    ]);
    expect(ServerHTMLImporter.parse('<dl></dl>', schema).child(0).childCount).toBe(0);
  });

  it('preserves grouped entries while explicitly reporting wrapper removal', () => {
    const result = ServerHTMLImporter.parseWithReport('<dl><div data-private="secret"><dt>A</dt><dd>B</dd></div><div><dt>C</dt><dd>D</dd></div></dl>', schema);
    expect(result.document.child(0).content.map(node => node.textContent)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.issues).toEqual([expect.objectContaining({ code: 'unmapped-block-wrapper' })]);
    expect(JSON.stringify(result.issues)).not.toContain('secret');
  });

  it.each([
    '<dl><dt>A</dt>unexpected text<dd>B</dd></dl>',
    '<dl><dt>A</dt><p>Unexpected block</p><dd>B</dd></dl>',
    '<dt>Orphan term</dt><dd>Orphan description</dd>',
  ])('does not drop unsupported list children or escape item nodes: %s', html => {
    const result = ServerHTMLImporter.parseWithReport(html, schema);
    schema.validate(result.document);
    expect(result.document.content.every(node => node.type.name === 'paragraph')).toBe(true);
    expect(result.document.textContent).toMatch(/unexpected text|Unexpected block|Orphan termOrphan description/);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('preserves nested lists, marks and safe links in descriptions', () => {
    const doc = ServerHTMLImporter.parse('<dl><dt><em>Outer</em></dt><dd><p><a href="javascript:bad()">Safe text</a></p><dl><dt>Inner</dt><dd>Nested</dd></dl></dd></dl>', schema);
    expect(doc.child(0).child(0).child(0).child(0).marks[0].type.name).toBe('em');
    expect(doc.child(0).child(1).child(1).type.name).toBe('definition_list');
    expect(HTMLExporter.export(doc)).not.toContain('javascript:');
  });

  it('exports Markdown with an explicit HTML requirement and reopens semantically', () => {
    const original = ServerHTMLImporter.parse(source, schema);
    const result = MarkdownExporter.exportWithReport(original);
    expect(result.markdown).toContain('<dl>');
    expect(result.losses).toContainEqual(expect.objectContaining({ detail: expect.stringContaining('HTML-enabled Markdown reader') }));
    const reopened = MarkdownImporter.parse(result.markdown, schema, { parseHTMLBlock: (html, target) => ServerHTMLImporter.parseFragment(html, target) });
    expect(reopened.toJSON()).toEqual(original.toJSON());
  });

  it('does not silently create term nodes if a host removes the capability', () => {
    const { definition_list: _list, definition_term: _term, definition_description: _description, ...nodes } = CoreSchemaSpec.nodes;
    const result = ServerHTMLImporter.parseWithReport(source, new Schema({ ...CoreSchemaSpec, nodes }));
    expect(result.document.child(0).type.name).toBe('paragraph');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.document.textContent).toContain('Work per second.');
  });

  it('keeps inline mark runs together while separating nested plain-text blocks', () => {
    const doc = ServerHTMLImporter.parse('<blockquote><p>One <strong>bold</strong> line</p><p>Next line</p></blockquote>', schema);
    expect(TextExporter.export(doc)).toBe('One bold line\nNext line');
    expect(TextExporter.export(doc, '\r\n')).toBe('One bold line\r\nNext line');
  });
});
