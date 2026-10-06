// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createEditor, EditorView, StarterKit, HTMLExporter, HTMLImporter, selectCells, toggleTableHeaderRow, undo } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

it.each(['td', 'th'])('keeps %s cell shading separate from an explicit text highlight', tag => {
  const editor = createEditor({ schema: StarterKit.schema });
  try {
    const html = `<table><tr><${tag} style="background-color:#173b59;color:#ffffff">Plain <mark style="background-color:#ffff00">Highlighted</mark></${tag}></tr></table>`;
    for (const imported of [HTMLImporter.parse(html, editor.state.schema), ServerHTMLImporter.parse(html, editor.state.schema)]) {
      const cell = imported.child(0).child(0).child(0);
      expect(cell.attrs.background).toBe('#173b59');
      expect(cell.child(0).child(0).marks.map(mark => mark.type.name)).toEqual(['text_color']);
      expect(cell.child(0).child(1).marks.find(mark => mark.type.name === 'highlight')?.attrs.color).toBe('#ffff00');
      const reopened = ServerHTMLImporter.parse(HTMLExporter.export(imported), editor.state.schema);
      const reopenedCell = reopened.child(0).child(0).child(0);
      expect(reopenedCell.attrs).toEqual(cell.attrs);
      expect(reopenedCell.textContent).toBe(cell.textContent);
      // HTML nesting may reorder independent mark types. Check the full mark
      // sets, including attributes, without claiming byte-identical mark order.
      for (let index = 0; index < cell.child(0).childCount; index++) {
        const marks = (node: typeof cell) => node.marks.map(mark => ({ type: mark.type.name, attrs: mark.attrs })).sort((a, b) => a.type.localeCompare(b.type));
        expect(marks(reopenedCell.child(0).child(index))).toEqual(marks(cell.child(0).child(index)));
      }
    }
  } finally { editor.destroy(); }
});

it('renders fills with column widths, preserves them through header conversion and both HTML importers', () => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: {
    type: 'doc', content: [{ type: 'table', content: [{ type: 'table_row', content: [{ type: 'table_cell', attrs: { background: '#173b59', colwidth: [240] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Readable heading', marks: [{ type: 'text_color', attrs: { color: '#ffffff' } }] }] }] }] }] }],
  } });
  const mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, editor);
  try {
    expect(mount.querySelector('td')?.style.backgroundColor).toBe('rgb(23, 59, 89)');
    expect(mount.querySelector('td')?.style.width).toBe('240px');
    selectCells(editor, [0, 0, 0], [0, 0, 0]);
    expect(toggleTableHeaderRow(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(0).child(0).attrs.background).toBe('#173b59');
    expect(mount.querySelector('th')?.style.backgroundColor).toBe('rgb(23, 59, 89)');
    expect(undo(editor)).toBe(true);
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    expect(html).toContain('background-color:#173b59');
    for (const imported of [HTMLImporter.parse(html, editor.state.schema), ServerHTMLImporter.parse(html, editor.state.schema)]) {
      expect(imported.child(0).child(0).child(0).attrs).toMatchObject({ background: '#173b59', colwidth: [240] });
      expect(imported.toJSON()).toEqual(editor.state.doc.toJSON());
    }
    const cell = editor.state.doc.child(0).child(0).child(0);
    editor.dispatch(editor.state.createTransaction().setNodeAttrs([0, 0, 0], { ...cell.attrs, background: '' }));
    expect(mount.querySelector('td')?.style.backgroundColor).toBe('');
    expect(mount.querySelector('td')?.style.width).toBe('240px');
  } finally { view.destroy(); editor.destroy(); mount.remove(); }
});
