import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec } from '../src/extensions';
import { MarkdownExporter, MarkdownImporter, Schema } from '../src/headless';
import { ServerHTMLImporter } from '../src/html/server';

describe('HTML table projection in Markdown', () => {
  const schema = new Schema(CoreSchemaSpec);
  const p = (value: string) => schema.node('paragraph', {}, [schema.text(value)]);
  const nested = schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_cell', {}, [p('Nested')])])]);
  const table = schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_header', {
    colspan: 2, rowspan: 2, colwidth: [120, 160], scope: 'rowgroup',
  }, [
    p('First'), p(''),
    schema.node('heading', { level: 3, align: 'right' }, [schema.text('Heading')]),
    schema.node('bullet_list', {}, [schema.node('list_item', {}, [p('Action'), p('Details')])]),
    schema.node('code_block', { language: 'js', lineNumbers: true }, [schema.text('one()\n\n\r\ntwo()')]),
    nested,
  ])])]);

  it('preserves supported rich cell semantics without physical HTML-block terminators', () => {
    const doc = schema.node('doc', {}, [p('Before'), table, p('After')]);
    const output = MarkdownExporter.exportWithReport(doc, { tableFormat: 'html' });
    expect(output.markdown).toContain('colspan="2"');
    expect(output.markdown).toContain('data-colwidth="120,160"');
    expect(output.markdown).toContain('one()&#10;&#10;&#13;&#10;two()');
    expect(output.markdown.split('\n').filter(line => line.startsWith('<table>'))).toHaveLength(1);
    const imported = MarkdownImporter.parse(output.markdown, schema, { parseHTMLBlock: ServerHTMLImporter.parse });
    expect(imported.toJSON()).toEqual(doc.toJSON());
    expect(output.losses).toEqual([expect.objectContaining({ kind: 'node', type: 'table', path: [1] })]);
    expect(output.losses[0].detail).toContain('HTML-enabled');
  });

  it.each(['quote', 'list'])('works in a %s without breaking container boundaries', container => {
    const block = container === 'quote' ? schema.node('blockquote', {}, [p('Intro'), table])
      : schema.node('ordered_list', { start: 10 }, [schema.node('list_item', {}, [p('Intro'), table])]);
    const doc = schema.node('doc', {}, [block, p('After')]);
    const output = MarkdownExporter.export(doc, { tableFormat: 'html' });
    expect(MarkdownImporter.parse(output, schema, { parseHTMLBlock: ServerHTMLImporter.parse }).toJSON()).toEqual(doc.toJSON());
  });

  it('keeps the existing pipe default and reports its actual structural losses', () => {
    const doc = schema.node('doc', {}, [table]);
    const output = MarkdownExporter.exportWithReport(doc);
    expect(output.markdown).not.toContain('<table>');
    expect(output.losses.some(loss => loss.detail.includes('flattened'))).toBe(true);
    expect(output.losses.some(loss => loss.detail.includes('merged cells'))).toBe(true);
  });

  it('keeps reference definitions outside opaque HTML tables and resolves surrounding links', () => {
    const linked = schema.node('paragraph', {}, [schema.text('Shared reference', [schema.marks.link.create({ href: 'https://example.com/shared', title: 'Shared' })])]);
    const linkedTable = schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_cell', {}, [linked])])]);
    const doc = schema.node('doc', {}, [linked, linkedTable, linked]);
    const output = MarkdownExporter.export(doc, { tableFormat: 'html', linkStyle: 'reference' });
    expect(output.match(/^\[ref-\d+\]:/gm)).toHaveLength(1);
    expect(output).toContain('<a href="https://example.com/shared"');
    expect(MarkdownImporter.parse(output, schema, { parseHTMLBlock: ServerHTMLImporter.parse }).toJSON()).toEqual(doc.toJSON());
  });

  it('keeps HTML inert when the receiving Markdown importer has not opted in', () => {
    const output = MarkdownExporter.export(table, { tableFormat: 'html' });
    const imported = MarkdownImporter.parse(output, schema);
    expect(imported.child(0).type.name).toBe('paragraph');
    expect(imported.textContent).toBe(output);
  });

  it('reports the compatibility boundary rather than claiming arbitrary metadata is lossless', () => {
    const tagged = schema.node('table', { applicationId: 'external-123' }, table.content);
    const notes: string[] = [];
    const output = MarkdownExporter.exportWithReport(tagged, { tableFormat: 'html', onLoss: loss => notes.push(loss.detail) });
    const imported = MarkdownImporter.parse(output.markdown, schema, { parseHTMLBlock: ServerHTMLImporter.parse });
    expect(imported.child(0).attrs.applicationId).toBeUndefined();
    expect(tagged.attrs.applicationId).toBe('external-123');
    expect(notes).toEqual([expect.stringContaining('Arbitrary schema metadata')]);
  });

  it('preserves captured pipe source until a real edit, then honors the HTML policy', () => {
    const source = '| A |\n| --- |\n| B |\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source, { tableFormat: 'html' }).markdown).toBe(source);
    const edited = imported.document.copy([table]);
    const output = MarkdownExporter.exportWithSource(edited, imported.source, { tableFormat: 'html' });
    expect(output.markdown).toContain('<table>');
    expect(MarkdownImporter.parse(output.markdown, schema, { parseHTMLBlock: ServerHTMLImporter.parse }).toJSON()).toEqual(edited.toJSON());
  });

  it('does not execute or emit raw text and attribute payloads as HTML', () => {
    const unsafe = schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_cell', {}, [p('<script>alert(1)</script> & text')])])]);
    const output = MarkdownExporter.export(unsafe, { tableFormat: 'html' });
    expect(output).not.toContain('<script>');
    expect(output).toContain('&lt;script&gt;');
    expect(MarkdownImporter.parse(output, schema, { parseHTMLBlock: ServerHTMLImporter.parse }).child(0).toJSON()).toEqual(unsafe.toJSON());
  });
});
