// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema, StarterKit, HTMLExporter, HTMLImporter, MarkdownExporter, EditorView, createEditor,
  resizeTableColumn, toggleTableHeaderRow, selectCells, undo, redo, isTableAppearance, type TableAppearance } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(StarterKit.schema);
const appearance: TableAppearance = { unit: 'pt', borders: {
  top: { style: 'solid', width: 1, color: '#102030' }, bottom: { style: 'double', width: 2, color: '#304050' },
  left: { style: 'dashed', width: 1, color: '#102030' }, right: { style: 'hidden' },
  insideH: { style: 'dotted', width: 0.5, color: '#708090' }, insideV: { style: 'solid', width: 0.75, color: '#8090a0' },
}, padding: { top: 0, right: 6, bottom: 3, left: 8 } };
function fixture(value: TableAppearance | undefined = appearance) {
  const cell = (text: string, own?: TableAppearance) => schema.node('table_cell', { colwidth: [160], appearance: own },
    [schema.node('paragraph', {}, [schema.text(text)])]);
  return schema.node('doc', {}, [schema.node('table', { appearance: value }, [
    schema.node('table_row', {}, [cell('First'), cell('Second', { unit: 'pt', borders: { top: { style: 'hidden' }, left: { style: 'none' } }, padding: { left: 0 } })]),
    schema.node('table_row', {}, [cell('Third'), cell('Fourth')]),
  ])]);
}
describe('portable table appearance', () => {
  it.each([null, [], { unit: 'px' }, { unit: 'pt', padding: { top: -1 } }, { unit: 'pt', padding: { top: Infinity } },
    { unit: 'pt', padding: { start: 1 } }, { unit: 'pt', borders: { top: { style: 'solid', width: 0, color: '#123456' } } },
    { unit: 'pt', borders: { top: { style: 'solid', width: 1, color: 'url(bad)' } } },
    { unit: 'pt', borders: { top: { style: 'none', color: '#123456' } } }, { unit: 'pt', style: 'position:absolute' },
  ])('rejects unbounded or CSS-like declarations %j', value => {
    expect(isTableAppearance(value)).toBe(false);
    expect(() => schema.node('table', { appearance: value }, fixture().child(0).content)).toThrow();
  });
  it('distinguishes omitted declarations, explicit none/hidden and zero padding', () => {
    expect(isTableAppearance({ unit: 'pt' })).toBe(true);
    expect(isTableAppearance(appearance)).toBe(true);
    expect(isTableAppearance({ unit: 'pt', borders: { insideH: { style: 'none' } } }, true)).toBe(false);
    expect(fixture({ unit: 'pt' }).child(0).attrs.appearance).toEqual({ unit: 'pt' });
  });
  it('retains exact appearance in JSON and browser/server HTML without copying table defaults into cells', () => {
    const doc = fixture();
    expect(schema.nodeFromJSON(doc.toJSON()).toJSON()).toEqual(doc.toJSON());
    const html = HTMLExporter.export(doc, { document: false });
    const host = document.createElement('div'); host.innerHTML = html;
    const cells = host.querySelectorAll('td');
    expect(cells[0]?.style.borderTop).toBe('1pt solid rgb(16, 32, 48)');
    expect(cells[0]?.style.paddingTop).toBe('0pt');
    expect(cells[1]?.style.borderTopStyle).toBe('hidden');
    expect(cells[1]?.style.borderLeft).toBe('0.75pt solid rgb(128, 144, 160)');
    expect(cells[1]?.style.paddingLeft).toBe('0pt');
    expect(cells[2]?.style.borderTopStyle).toBe('dotted');
    expect(cells[2]?.style.borderBottomStyle).toBe('double');
    for (const importer of [HTMLImporter, ServerHTMLImporter]) expect(importer.parse(html, schema).toJSON()).toEqual(doc.toJSON());
  });
  it('does not accept malformed or unsafe HTML appearance metadata', () => {
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const doc = importer.parse('<table data-fountain-table-appearance="bad"><tr><td data-fountain-table-appearance=\'{"unit":"pt","style":"url(bad)"}\'>Text</td></tr></table>', schema);
      expect(doc.child(0).attrs.appearance).toBeUndefined();
      expect(doc.child(0).child(0).child(0).attrs.appearance).toBeUndefined();
    }
  });
  it('refreshes equal cell views when only their table appearance changes, including undo/redo', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: fixture().toJSON() });
    const view = new EditorView(document.createElement('div'), editor);
    try {
      const first = view.dom.querySelector('td')!;
      expect(first.style.paddingLeft).toBe('8pt');
      const table = editor.state.doc.child(0);
      editor.dispatch(editor.state.createTransaction().setNodeAttrs([0], { ...table.attrs, appearance: { unit: 'pt' } }));
      expect(view.dom.querySelector('td')).toBe(first);
      expect(first.style.borderTopWidth).toBe('0px');
      expect(first.style.paddingLeft).toBe('0px');
      expect(first.querySelector<HTMLElement>('.fountain-table-cell__content')?.style.padding).toBe('0px');
      expect(undo(editor)).toBe(true);
      expect(first.style.paddingLeft).toBe('8pt');
      expect(redo(editor)).toBe(true);
      expect(first.style.paddingLeft).toBe('0px');
    } finally { view.destroy(); editor.destroy(); }
  });
  it('keeps appearance during resizing and header conversion and reports pipe-Markdown loss', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: fixture().toJSON() });
    try {
      expect(resizeTableColumn(editor, 180, 0, [0])).toBe(true);
      selectCells(editor, [0, 0, 0], [0, 0, 1]);
      expect(toggleTableHeaderRow(editor)).toBe(true);
      expect(editor.state.doc.child(0).attrs.appearance).toEqual(appearance);
      expect(editor.state.doc.child(0).child(0).child(1).attrs.appearance).toEqual(fixture().child(0).child(0).child(1).attrs.appearance);
      expect(MarkdownExporter.exportWithReport(editor.state.doc).losses.some(loss => loss.detail.includes('table borders'))).toBe(true);
      expect(MarkdownExporter.exportWithReport(editor.state.doc, { tableFormat: 'html' }).markdown).toContain('data-fountain-table-appearance');
    } finally { editor.destroy(); }
  });
  it('uses logical span geometry for outer edges rather than physical cell indexes', () => {
    const p = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
    const doc = schema.node('doc', {}, [schema.node('table', { appearance }, [
      schema.node('table_row', {}, [schema.node('table_cell', { colspan: 2 }, [p('Wide')]), schema.node('table_cell', { rowspan: 2 }, [p('Tall')])]),
      schema.node('table_row', {}, [schema.node('table_cell', {}, [p('Lower left')]), schema.node('table_cell', {}, [p('Lower middle')])]),
    ])]);
    const host = document.createElement('div'); host.innerHTML = HTMLExporter.export(doc, { document: false });
    const cells = host.querySelectorAll('td');
    expect(cells[0]?.style.borderRightStyle).toBe('solid');
    expect(cells[0]?.style.borderBottomStyle).toBe('dotted');
    expect(cells[1]?.style.borderBottomStyle).toBe('double');
    expect(cells[1]?.style.borderRightStyle).toBe('hidden');
    expect(cells[3]?.style.borderRightStyle).toBe('solid');
    for (const importer of [HTMLImporter, ServerHTMLImporter]) expect(importer.parse(host.innerHTML, schema).toJSON()).toEqual(doc.toJSON());
  });
});
