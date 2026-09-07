// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CoreExtension, HTMLExporter, HTMLImporter, MarkdownExporter, MarkdownImporter, Schema, composeExtensions } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(composeExtensions([CoreExtension]).schema);
const rows = '<tr><th>Sample</th><th>Result</th></tr><tr><td>A</td><td>42</td></tr>';
const caption = 'Trial <strong>results</strong> <a href="/method">method</a>';

describe('HTML table caption retention', () => {
  it.each([`<caption>${caption}</caption>${rows}`, `${rows}<caption>${caption}</caption>`])('retains rich caption content instead of discarding it: %s', body => {
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const document = importer.parse(`<table>${body}</table>`, schema);
      expect(document.content.map(node => node.type.name)).toEqual(['paragraph', 'table']);
      expect(document.child(0).textContent).toBe('Trial results method');
      expect(document.child(0).content.find(node => node.text === 'results')?.marks[0].type.name).toBe('strong');
      expect(document.child(0).content.find(node => node.text === 'method')?.marks[0].attrs.href).toBe('/method');
      expect(document.child(1).childCount).toBe(2);
      expect(importer.parse(HTMLExporter.export(document, { document: false }), schema).toJSON()).toEqual(document.toJSON());
    }
  });

  it('preserves multiple caption blocks including empty paragraphs', () => {
    const html = `<table><caption><p>First</p><p></p><p><em>Second</em></p></caption>${rows}</table>`;
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const document = importer.parse(html, schema);
      expect(document.content.map(node => node.type.name)).toEqual(['paragraph', 'paragraph', 'paragraph', 'table']);
      expect(document.content.slice(0, 3).map(node => node.textContent)).toEqual(['First', '', 'Second']);
    }
  });

  it.each(['', '<p>Only caption</p>', '\u00a0'])('does not lose a caption when a table has no rows: %j', value => {
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const document = importer.parse(`<p>Before</p><table><caption>${value}</caption></table><p>After</p>`, schema);
      expect(document.content.map(node => node.textContent)).toEqual(['Before', value === '<p>Only caption</p>' ? 'Only caption' : value, 'After']);
    }
  });

  it('keeps nested captions inside their table cell without duplicating them outside', () => {
    const html = `<table><caption>Outer</caption><tr><td><table><caption><em>Inner</em></caption>${rows}</table></td></tr></table>`;
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const document = importer.parse(html, schema);
      expect(document.child(0).textContent).toBe('Outer');
      expect(document.childCount).toBe(2);
      const cell = document.child(1).child(0).child(0);
      expect(cell.content.map(node => node.type.name)).toEqual(['paragraph', 'table']);
      expect(cell.child(0).textContent).toBe('Inner');
      expect(cell.child(0).child(0).marks[0].type.name).toBe('em');
    }
  });

  it('reports the lost caption association without embedding source text or attributes in the diagnostic', () => {
    const result = ServerHTMLImporter.parseWithReport(`<table><caption id="private-id" style="caption-side:bottom">Private title</caption>${rows}</table>`, schema);
    expect(result.issues).toEqual([expect.objectContaining({ code: 'unmapped-block-wrapper', message: expect.stringContaining('caption association') })]);
    expect(JSON.stringify(result.issues)).not.toMatch(/private-id|Private title/);
    expect(Object.isFrozen(result.issues[0])).toBe(true);
  });

  it('keeps exact source separately from the canonical Markdown projection', () => {
    const source = `<table><caption>${caption}</caption>${rows}</table>\r\n`;
    const issues: string[] = [];
    const parsed = MarkdownImporter.parseWithSource(source, schema, { parseHTMLBlock(html, target) {
      const result = ServerHTMLImporter.parseWithReport(html, target);
      issues.push(...result.issues.map(issue => issue.code));
      return result.document;
    } });
    expect(parsed.document.child(0).textContent).toBe('Trial results method');
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
    expect(MarkdownImporter.parse(MarkdownExporter.export(parsed.document), schema).toJSON()).toEqual(parsed.document.toJSON());
    expect(issues).toContain('unmapped-block-wrapper');
  });

  it('does not report caption loss for ordinary tables without captions', () => {
    expect(ServerHTMLImporter.parseWithReport(`<table>${rows}</table>`, schema).issues).toEqual([]);
  });
});
