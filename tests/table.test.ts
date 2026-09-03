// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  CellSelection,
  EditorView,
  HTMLExporter,
  HTMLImporter,
  Selection,
  StarterKit,
  TableMap,
  addTableColumn,
  addTableRow,
  createEditor,
  deleteTableColumn,
  deleteTableRow,
  mergeTableCells,
  pasteTableCells,
  selectCells,
  selectTableColumn,
  selectTableRow,
  serializeTableSelection,
  splitTableCell,
  toggleTableHeaderColumn,
  toggleTableHeaderRow,
  undo,
} from '../src';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const cell = (text: string, attrs: Record<string, unknown> = {}, header = false) => ({
  type: header ? 'table_header' : 'table_cell',
  attrs,
  content: [paragraph(text)],
});
const table = (rows: readonly (readonly ReturnType<typeof cell>[])[]) => ({
  type: 'table',
  content: rows.map((content) => ({ type: 'table_row', content })),
});
const documentWith = (value: ReturnType<typeof table>) => ({ type: 'doc', content: [value] });

describe('production table editing', () => {
  it('maps merged geometry and expands rectangular cell selections around spans', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: documentWith(table([
        [cell('A', { colspan: 2 }), cell('B')],
        [cell('C'), cell('D'), cell('E')],
      ])),
    });
    const map = TableMap.create(editor.state.doc.child(0), [0]);
    expect(map.valid).toBe(true);
    expect(map.width).toBe(3);
    expect(map.cellAt(0, 1)?.node.textContent).toBe('A');

    const selection = new CellSelection(editor.state.doc, [0, 0, 0], [0, 1, 1]);
    expect(selection.cellPaths).toEqual([[0, 0, 0], [0, 1, 0], [0, 1, 1]]);
    expect(selection).toMatchObject({ rowFrom: 0, rowTo: 1, columnFrom: 0, columnTo: 1 });
  });

  it('merges, splits, and undoes cells without losing their block content', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: documentWith(table([
        [cell('A'), cell('B')],
        [cell('C'), cell('D')],
      ])),
    });
    expect(selectCells(editor, [0, 0, 0], [0, 1, 1])).toBe(true);
    expect(mergeTableCells(editor)).toBe(true);
    const merged = editor.state.doc.child(0).child(0).child(0);
    expect(merged.attrs).toMatchObject({ colspan: 2, rowspan: 2 });
    expect(merged.content.map((node) => node.textContent)).toEqual(['A', 'B', 'C', 'D']);
    expect(TableMap.create(editor.state.doc.child(0)).valid).toBe(true);

    expect(splitTableCell(editor)).toBe(true);
    expect(TableMap.create(editor.state.doc.child(0)).valid).toBe(true);
    expect(editor.state.doc.child(0).content.map((row) => row.childCount)).toEqual([2, 2]);
    expect(editor.state.doc.child(0).child(0).child(0).content.map((node) => node.textContent)).toEqual(['A', 'B', 'C', 'D']);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(0).child(0).attrs).toMatchObject({ colspan: 2, rowspan: 2 });
  });

  it('adds and removes logical rows and columns through spanning cells', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: documentWith(table([
        [cell('A', { colspan: 2, rowspan: 2 }), cell('B')],
        [cell('C')],
      ])),
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0, 0], 0)));
    expect(addTableRow(editor, 'after')).toBe(true);
    expect(TableMap.create(editor.state.doc.child(0)).valid).toBe(true);
    expect(editor.state.doc.child(0).child(0).child(0).attrs.rowspan).toBe(3);

    expect(addTableColumn(editor, 'after')).toBe(true);
    expect(TableMap.create(editor.state.doc.child(0)).valid).toBe(true);
    expect(editor.state.doc.child(0).child(0).child(0).attrs.colspan).toBe(2);
    expect(deleteTableColumn(editor)).toBe(true);
    expect(TableMap.create(editor.state.doc.child(0)).valid).toBe(true);
    expect(deleteTableRow(editor)).toBe(true);
    expect(TableMap.create(editor.state.doc.child(0)).valid).toBe(true);
  });

  it('toggles accessible headers and selects complete logical rows and columns', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: documentWith(table([
        [cell('A'), cell('B')],
        [cell('C'), cell('D')],
      ])),
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0, 0], 0)));
    expect(toggleTableHeaderRow(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(0).content.every((node) => node.type.name === 'table_header')).toBe(true);
    expect(toggleTableHeaderColumn(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(1).child(0).type.name).toBe('table_header');
    expect(editor.state.doc.child(0).child(1).child(0).attrs.scope).toBe('row');
    expect(selectTableRow(editor, 1)).toBe(true);
    expect((editor.state.selection as CellSelection).cellPaths).toEqual([[0, 1, 0], [0, 1, 1]]);
    expect(selectTableColumn(editor, 1)).toBe(true);
    expect((editor.state.selection as CellSelection).cellPaths).toEqual([[0, 0, 1], [0, 1, 1]]);
  });

  it('copies a cell range as TSV and HTML and distributes pasted spreadsheet data', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: documentWith(table([
        [cell('A'), cell('B')],
        [cell('C'), cell('D')],
      ])),
    });
    expect(selectCells(editor, [0, 0, 0], [0, 1, 1])).toBe(true);
    const copied = serializeTableSelection(editor.state.doc, editor.state.selection as CellSelection);
    expect(copied?.text).toBe('A\tB\nC\tD');
    expect(copied?.html).toContain('<table>');
    expect(copied?.html).toContain('<td');

    expect(selectCells(editor, [0, 0, 0], [0, 1, 1])).toBe(true);
    expect(pasteTableCells(editor, '1\t2')).toBe(true);
    expect(editor.state.doc.child(0).content.flatMap((row) => row.content.map((node) => node.textContent))).toEqual(['1', '2', '1', '2']);
  });

  it('repairs non-rectangular imported state on creation and after host transactions', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: documentWith(table([
        [cell('A'), cell('B')],
        [cell('C')],
      ])),
    });
    expect(TableMap.create(editor.state.doc.child(0)).valid).toBe(true);
    expect(editor.state.doc.child(0).child(1).childCount).toBe(2);

    const malformed = editor.state.doc.child(0).copy([
      editor.state.doc.child(0).child(0),
      editor.state.doc.child(0).child(1).copy([editor.state.doc.child(0).child(1).child(0)]),
    ]);
    editor.dispatch(editor.state.createTransaction().replaceNode([0], [malformed]));
    expect(TableMap.create(editor.state.doc.child(0)).valid).toBe(true);
    expect(editor.state.doc.child(0).child(1).childCount).toBe(2);
  });

  it('round-trips column widths and supports accessible keyboard resizing', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: documentWith(table([[cell('A'), cell('B')], [cell('C'), cell('D')]])),
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0, 0], 0)));
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const handle = view.dom.querySelector<HTMLElement>('[data-fountain-path="0.0.0"] .fountain-table-cell__resize-handle');
    const key = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    handle?.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(editor.state.doc.child(0).child(0).child(0).attrs.colwidth).toEqual([125]);
    expect(editor.state.doc.child(0).child(1).child(0).attrs.colwidth).toEqual([125]);

    const html = HTMLExporter.export(editor.state.doc, { document: false });
    expect(html).toContain('data-colwidth="125"');
    const imported = HTMLImporter.parse(html, editor.state.schema);
    expect(imported.child(0).child(0).child(0).attrs.colwidth).toEqual([125]);
    view.destroy();
    mount.remove();
  });
});
