import { describe, expect, it } from 'vitest';
import { HTMLContainerExtension, HTMLFlowExtension, Schema, MarkdownImporter, MarkdownExporter,
  HTMLExporter, EditorState, createEditor, createHistoryPlugin, Selection, insertText, undo, redo,
  type MarkdownHTMLFlowFallback, type SchemaSpec } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

const spec: SchemaSpec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes, ...HTMLFlowExtension.nodes } };
const schema = new Schema(spec);
const table = '| Name | Result |\n| :--- | ---: |\n| **Alpha** | [Ready][r] |\n| Beta | `x` |';
const source = `<section id="results">\n\nBefore.\n\n${table}\n\nAfter.\n\n</section>\n\n[r]: /ready\n`;
const options = { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow };
const parse = (input: string, target = schema) => {
  const fallbacks: MarkdownHTMLFlowFallback[] = [];
  const parsed = MarkdownImporter.parseWithSource(input, target, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
  return { ...parsed, fallbacks };
};

describe('protected Markdown tables inside optional HTML source flow', () => {
  it.each(['\n', '\r\n'])('retains the complete table, reference marks and alignment through %j source and canonical reopening', ending => {
    const input = source.replaceAll('\n', ending);
    const parsed = parse(input);
    expect(parsed.fallbacks).toEqual([]);
    const section = parsed.document.child(0);
    expect(section.type.name).toBe('html_container');
    expect(section.attrs.id).toBe('results');
    expect(section.content.map(node => node.type.name)).toEqual(['paragraph', 'table', 'paragraph']);
    const original = MarkdownImporter.parse(`${table}\n\n[r]: /ready`, schema).child(0);
    expect(section.child(1).toJSON()).toEqual(original.toJSON());
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(input);
    expect(MarkdownImporter.parse(MarkdownExporter.export(parsed.document), schema, options).toJSON()).toEqual(parsed.document.toJSON());
    expect(ServerHTMLImporter.parse(HTMLExporter.export(parsed.document, { document: false }), schema).toJSON()).toEqual(parsed.document.toJSON());
  });
  it('keeps table identity during surrounding editing and restores cell edits through history/reopening', () => {
    const parsed = parse(source);
    expect(parsed.fallbacks).toEqual([]);
    const original = parsed.document.child(0).child(1);
    const editor = createEditor({ schema: spec, state: EditorState.create({ schema, doc: parsed.document, plugins: [createHistoryPlugin()] }) });
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 2, 0], 0)));
    expect(insertText(editor, 'Updated: ')).toBe(true);
    expect(editor.state.doc.child(0).child(1)).toBe(original);
    expect(undo(editor)).toBe(true);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 1, 2, 0, 0, 0], 0)));
    expect(insertText(editor, 'Edited: ')).toBe(true);
    const saved = MarkdownExporter.exportWithSource(editor.state.doc, parsed.source);
    expect(saved.preservation).not.toBe('exact');
    expect(MarkdownImporter.parse(saved.markdown, schema, options).toJSON()).toEqual(editor.state.doc.toJSON());
    expect(undo(editor)).toBe(true);
    expect(MarkdownExporter.exportWithSource(editor.state.doc, parsed.source).markdown).toBe(source);
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(1).textContent).toContain('Edited: Beta');
    editor.destroy();
  });
  it.each([
    '- Results\n\n  | A | B |\n  | --- | --- |\n  | x | y |',
    '> | A | B |\n> | --- | --- |\n> | x | y |',
    '- [x] Results\n\n  | A | B |\n  | --- | --- |\n  | x | y |',
  ])('preserves tables in existing recursive list/quote/task containers: %s', body => {
    const parsed = parse(`<section>\n\n${body}\n\n</section>`);
    expect(parsed.fallbacks).toEqual([]);
    expect(HTMLExporter.export(parsed.document, { document: false })).toContain('<table');
    expect(MarkdownImporter.parse(MarkdownExporter.export(parsed.document), schema, options).toJSON()).toEqual(parsed.document.toJSON());
  });
  it('distinguishes authored HTML tables from protected pipe tables', () => {
    const parsed = parse('<section>\n<table><tr><td>Raw</td></tr></table>\n\n| A |\n| --- |\n| Generated |\n\n</section>');
    expect(parsed.fallbacks).toEqual([]);
    const tables = parsed.document.child(0).content.filter(node => node.type.name === 'table');
    expect(tables).toHaveLength(2);
    expect(tables.map(node => node.textContent)).toEqual(['Raw', 'AGenerated']);
  });
  it.each(['<div><pre>', '<div><script>', '<div><style>', '<div><textarea>'])('refuses flattening or hiding the table in %s', opening => {
    const tag = opening.slice(6, -1);
    const input = `${opening}\n\n| A |\n| --- |\n| x |\n\n</${tag}></div>`;
    const parsed = parse(input);
    expect(parsed.fallbacks.length).toBeGreaterThan(0);
    expect(parsed.document.toJSON()).toEqual(MarkdownImporter.parse(input, schema).toJSON());
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(input);
  });
  it('keeps the protected subtree exactly once when HTML repair closes an empty enclosing raw table', () => {
    const input = '<table>\n\n| A |\n| --- |\n| x |\n\n</table>';
    const parsed = parse(input);
    expect(parsed.fallbacks).toEqual([]);
    expect(parsed.document.content.map(node => node.type.name)).toEqual(['table']);
    expect(parsed.document.child(0).toJSON()).toEqual(MarkdownImporter.parse('| A |\n| --- |\n| x |', schema).child(0).toJSON());
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(input);
  });
  it('keeps complete custom schema defaults instead of using host HTML table readers', () => {
    const target = new Schema({ ...spec, nodes: { ...spec.nodes,
      table: { ...spec.nodes.table, attrs: { ...spec.nodes.table.attrs, applicationId: { default: 'kept' } },
        parseHTML: [{ tag: 'table', getAttrs: () => ({ applicationId: 'wrong' }) }] },
    } });
    const parsed = parse(source, target);
    expect(parsed.fallbacks).toEqual([]);
    expect(parsed.document.child(0).child(1).attrs.applicationId).toBe('kept');
  });
  it('does not change the inert default policy', () => {
    expect(MarkdownImporter.parse(source, schema).child(0).textContent).toBe('<section id="results">');
  });
  it('refuses host-modified source cells rather than reconstructing different table data', () => {
    const fallbacks: MarkdownHTMLFlowFallback[] = [];
    const doc = MarkdownImporter.parse(source, schema, {
      parseHTMLDocument(segments, target, context) {
        const changed = context.readBlockSources!().map(part => part.kind === 'table'
          ? { ...part, rows: part.rows.map(row => ({ ...row, cells: row.cells.map(cell => ({ ...cell,
            segments: [{ kind: 'node' as const, node: target.text('Wrong') }],
          })) })) } : part);
        return ServerHTMLImporter.parseTextBlockFlow(segments, target, { ...context, readBlockSources: () => changed });
      }, onHTMLFlowFallback: issue => fallbacks.push(issue),
    });
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0].message).toContain('modified Markdown table');
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
  });
  it('retains literal inline HTML, escaped pipes, short rows, images and empty cells inside the original table', () => {
    const body = '| A | B | C |\n| --- | :---: | ---: |\n| <span>literal</span> | a\\|b | ![Alt](/img.png) |\n| short |';
    const parsed = parse(`<section>\n\n${body}\n\n</section>`);
    expect(parsed.fallbacks).toEqual([]);
    expect(parsed.document.child(0).child(0).toJSON()).toEqual(MarkdownImporter.parse(body, schema).child(0).toJSON());
    expect(MarkdownImporter.parse(MarkdownExporter.export(parsed.document), schema, options).toJSON()).toEqual(parsed.document.toJSON());
  });
  it('applies representable outer HTML formatting to cell text without losing geometry or existing marks', () => {
    const body = '| A | B |\n| --- | --- |\n| **x** | y |';
    const parsed = parse(`<div><em>\n\n${body}\n\n</em></div>`);
    expect(parsed.fallbacks).toEqual([]);
    const node = parsed.document.child(0).child(0);
    expect(node.type.name).toBe('table');
    expect(node.child(1).child(0).child(0).child(0).marks.map(mark => mark.type.name)).toEqual(['em', 'strong']);
    expect(node.child(1).child(1).child(0).child(0).marks.map(mark => mark.type.name)).toEqual(['em']);
    expect(ServerHTMLImporter.parse(HTMLExporter.export(parsed.document, { document: false }), schema).toJSON()).toEqual(parsed.document.toJSON());
  });
});
