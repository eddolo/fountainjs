// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema, StarterKit, HTMLExporter, HTMLImporter, MarkdownExporter, createEditor, EditorView, undo, redo, resizeTableColumn, isTablePreferredWidth } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(StarterKit.schema);
const contents = [schema.node('table_row', {}, [schema.node('table_cell', { colwidth: [80] }, [schema.node('paragraph', {}, [schema.text('Sample')])])])];

describe('portable preferred table width', () => {
  it.each([{ unit: 'pt', value: 180 }, { unit: 'percent', value: 60 }, { unit: 'auto' }, { unit: 'nil' }])('retains $unit through JSON, browser HTML and DOM-free HTML', preferredWidth => {
    const doc = schema.node('doc', {}, [schema.node('table', { preferredWidth }, contents)]);
    expect(schema.nodeFromJSON(doc.toJSON()).toJSON()).toEqual(doc.toJSON());
    const html = HTMLExporter.export(doc, { document: false });
    expect(html).toContain('data-fountain-table-preferred-width');
    for (const importer of [HTMLImporter, ServerHTMLImporter]) expect(importer.parse(html, schema).toJSON()).toEqual(doc.toJSON());
  });

  it.each([null, [], { unit: 'px', value: 20 }, { unit: 'pt', value: -1 }, { unit: 'pt', value: Infinity },
    { unit: 'percent', value: 1001 }, { unit: 'auto', value: 0 }, { unit: 'nil', extra: 'bad' }, { unit: 'pt', value: '20' }])('rejects unsafe or ambiguous width %j', value => {
    expect(isTablePreferredWidth(value)).toBe(false);
    expect(() => schema.node('table', { preferredWidth: value }, contents)).toThrow();
  });

  it('changes the existing table view transactionally without changing its column grid', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins,
      content: schema.node('doc', {}, [schema.node('table', { layout: 'fixed', preferredWidth: { unit: 'pt', value: 180 } }, contents)]).toJSON() });
    const view = new EditorView(document.createElement('div'), editor);
    const table = () => view.dom.querySelector('table')!;
    expect(table().style.width).toBe('180pt');
    const node = editor.state.doc.child(0);
    editor.dispatch(editor.state.createTransaction().setNodeAttrs([0], { ...node.attrs, preferredWidth: { unit: 'percent', value: 60 } }));
    expect(table().style.width).toBe('60%');
    expect(undo(editor)).toBe(true); expect(table().style.width).toBe('180pt');
    expect(redo(editor)).toBe(true); expect(table().style.width).toBe('60%');
    expect(resizeTableColumn(editor, 100, 0, [0])).toBe(true);
    expect(table().style.width).toBe('60%');
    expect(editor.state.doc.child(0).child(0).child(0).attrs.colwidth).toEqual([100]);
    view.destroy(); editor.destroy();
  });

  it('does not trust malformed HTML metadata and reports pipe-Markdown width loss', () => {
    for (const importer of [HTMLImporter, ServerHTMLImporter]) expect(importer.parse('<table data-fountain-table-preferred-width="bad"><tr><td>A</td></tr></table>', schema).child(0).attrs.preferredWidth).toBeUndefined();
    const doc = schema.node('doc', {}, [schema.node('table', { preferredWidth: { unit: 'pt', value: 180 } }, contents)]);
    expect(MarkdownExporter.exportWithReport(doc).losses.some(item => item.detail.includes('preferred table width'))).toBe(true);
    expect(MarkdownExporter.exportWithReport(doc, { tableFormat: 'html' }).markdown).toContain('data-fountain-table-preferred-width');
  });
});
