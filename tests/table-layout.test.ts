// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema, StarterKit, HTMLExporter, HTMLImporter, MarkdownExporter, EditorView, createEditor, resizeTableColumn, undo, redo } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(StarterKit.schema);
function documentWithLayout(layout: 'fixed' | 'auto') {
  const cell = (width: number, text: string, colspan = 1, colwidth = [width]) => schema.node('table_cell', { colwidth, colspan }, [schema.node('paragraph', {}, [schema.text(text)])]);
  return schema.node('doc', {}, [schema.node('table', { layout }, [
    schema.node('table_row', {}, [cell(200, 'Merged heading', 2, [80, 120])]),
    schema.node('table_row', {}, [cell(80, 'LongContent'.repeat(10)), cell(120, 'Stable')]),
  ])]);
}

describe('portable table layout', () => {
  it.each(['fixed', 'auto'] as const)('retains %s mode through browser and DOM-free HTML', layout => {
    const doc = documentWithLayout(layout);
    const html = HTMLExporter.export(doc, { document: false });
    expect(html).toContain(`table-layout:${layout}`);
    if (layout === 'fixed') {
      expect(html).toContain('width:200px');
      expect(html).toContain('<colgroup>');
    }
    for (const importer of [HTMLImporter, ServerHTMLImporter]) expect(importer.parse(html, schema).toJSON()).toEqual(doc.toJSON());
  });

  it('uses the same grid in the live editor and updates the projection after resizing', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: documentWithLayout('fixed').toJSON() });
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    expect(view.dom.querySelector('table')?.style.tableLayout).toBe('fixed');
    expect(view.dom.querySelector('table')?.style.boxSizing).toBe('border-box');
    expect(view.dom.querySelector('table')?.style.width).toBe('200px');
    expect(resizeTableColumn(editor, 100, 0, [0])).toBe(true);
    expect(editor.state.doc.child(0).attrs.layout).toBe('fixed');
    expect(view.dom.querySelector('table')?.style.width).toBe('220px');
    expect(parseFloat(view.dom.querySelector('col')!.style.width)).toBeCloseTo(100 / 220 * 100);
    expect(view.dom.querySelector('col')!.style.width).toMatch(/%$/);
    expect(undo(editor)).toBe(true);
    expect(view.dom.querySelector('table')?.style.width).toBe('200px');
    expect(redo(editor)).toBe(true);
    expect(view.dom.querySelector('table')?.style.width).toBe('220px');
    view.destroy();
    editor.destroy();
  });

  it('imports explicit external CSS and rejects invalid schema layout values', () => {
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      expect(importer.parse('<table style="table-layout:fixed"><tr><td>A</td></tr></table>', schema).child(0).attrs.layout).toBe('fixed');
    }
    expect(() => schema.node('table', { layout: 'anything' }, documentWithLayout('fixed').child(0).content)).toThrow();
  });

  it.each([150, 300])('keeps a %s pt preference independent unless it equals the physical grid', value => {
    const table = documentWithLayout('fixed').child(0);
    const doc = schema.node('doc', {}, [schema.node('table', { ...table.attrs, preferredWidth: { unit: 'pt', value } }, table.content)]);
    const root = document.createElement('div'); root.innerHTML = HTMLExporter.export(doc, { document: false });
    expect(root.querySelector('table')!.style.width).toBe(`${value}pt`);
    expect(root.querySelector('col')!.style.width).toBe(value === 150 ? '40%' : '80px');
    for (const importer of [HTMLImporter, ServerHTMLImporter]) expect(importer.parse(root.innerHTML, schema).toJSON()).toEqual(doc.toJSON());
  });

  it('reports pipe-Markdown layout loss while HTML table projection retains it', () => {
    const doc = documentWithLayout('fixed');
    const pipe = MarkdownExporter.exportWithReport(doc);
    expect(pipe.losses.some(loss => loss.detail.includes('table layout'))).toBe(true);
    const html = MarkdownExporter.exportWithReport(doc, { tableFormat: 'html' });
    expect(html.markdown).toContain('data-fountain-table-layout="fixed"');
  });
});
