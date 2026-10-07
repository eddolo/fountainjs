// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  CellSelection,
  GapSelection,
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
  deleteTable,
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
  redo,
  setNodeAttributes,
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
  it('resizes the logical end of an RTL merged cell despite its own LTR text override', async () => {
    const value = { ...table([
      [cell('Merged', { dir: 'ltr', colspan: 2, colwidth: [150, 250] }), cell('Other', { colwidth: [90] })],
      [cell('First', { colwidth: [150] }), cell('Second', { colwidth: [250] }), cell('Third', { colwidth: [90] })],
    ]), attrs: { dir: 'rtl' } };
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: documentWith(value) });
    const mount = document.createElement('div'); document.body.append(mount);
    // jsdom does not lay out/inherit HTML dir; exercise the direction contract
    // here and verify actual computed layout in all three real browsers.
    const originalStyle = globalThis.getComputedStyle;
    const computed = vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(element => {
      const style = originalStyle(element);
      return element.tagName === 'TABLE' ? new Proxy(style, { get(target, key) {
        return key === 'direction' ? element.getAttribute('dir') ?? 'ltr' : Reflect.get(target, key);
      } }) : style;
    });
    const view = new EditorView(mount, editor);
    const handle = () => view.dom.querySelector<HTMLElement>('[data-fountain-path="0.0.0"] .fountain-table-cell__resize-handle')!;
    try {
      expect(handle().style.left).toBe('-4px');
      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
      expect(editor.state.doc.child(0).child(0).child(0).attrs.colwidth).toEqual([150, 255]);
      expect(editor.state.doc.child(0).child(0).child(0).attrs.dir).toBe('ltr');
      expect(editor.state.doc.child(0).child(1).child(1).attrs.colwidth).toEqual([255]);
      expect(undo(editor)).toBe(true);
      handle().dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 70 }));
      window.dispatchEvent(new MouseEvent('pointerup'));
      expect(editor.state.doc.child(0).child(0).child(0).attrs.colwidth).toEqual([150, 280]);
      expect(editor.state.doc.child(0).child(0).child(0).attrs.dir).toBe('ltr');
      expect(undo(editor)).toBe(true);
      handle().dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 70 }));
      setNodeAttributes(editor, [0], { dir: 'ltr' });
      window.dispatchEvent(new MouseEvent('pointerup'));
      expect(editor.state.doc.child(0).child(0).child(0).attrs.colwidth).toEqual([150, 250]);
      expect(handle().style.right).toBe('-4px');
      await Promise.resolve();
    } finally { view.destroy(); computed.mockRestore(); editor.destroy(); mount.remove(); }
  });
  it('applies only the latest selection when a cell transaction supersedes a queued gap', async () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins,
      content: documentWith(table([[cell('A'), cell('B')]])) });
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const handle = view.dom.querySelector<HTMLElement>('.fountain-table-cell__resize-handle')!;
    let ranges: ReturnType<typeof vi.spyOn> | undefined;
    try {
      handle.focus();
      await Promise.resolve();
      ranges = vi.spyOn(document.getSelection()!, 'addRange');
      editor.dispatch(editor.state.createTransaction().setSelection(new GapSelection(editor.state.doc, 0)));
      editor.dispatch(editor.state.createTransaction().setSelection(new CellSelection(editor.state.doc, [0, 0, 0])));
      await Promise.resolve();
      expect(ranges).toHaveBeenCalledTimes(1);
      const range = ranges.mock.calls[0]![0] as Range;
      expect(range.startContainer).toBe(view.dom.querySelector('[data-fountain-path="0.0"]'));
      expect(range.startOffset).toBe(0);
      expect(range.endContainer).toBe(range.startContainer);
      expect(range.endOffset).toBe(1);
      expect(editor.state.selection.kind).toBe('cell');
      expect(view.dom.querySelector('[data-fountain-path="0.0.0"]')?.getAttribute('data-fountain-selected-cell')).toBe('true');
    } finally { ranges?.mockRestore(); view.destroy(); editor.destroy(); mount.remove(); }
  });

  it('projects resize geometry once per immutable table, including movement and remote-row widths', () => {
    const rows = Array.from({ length: 30 }, (_, row) => Array.from({ length: 10 }, (_, column) =>
      cell(`${row}:${column}`, row === 29 ? { colwidth: [80 + column * 10] } : {})));
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: documentWith(table(rows)) });
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const creates = vi.spyOn(TableMap, 'create');
    const view = new EditorView(mount, editor);
    try {
      const handles = () => [...view.dom.querySelectorAll<HTMLElement>('.fountain-table-cell__resize-handle')];
      expect(handles()).toHaveLength(300);
      expect(handles().slice(0, 10).map(handle => handle.getAttribute('aria-valuenow')))
        .toEqual(Array.from({ length: 10 }, (_, column) => String(80 + column * 10)));
      // Appearance and resize each own a private projection, not 300 grid builds.
      expect(creates.mock.calls.length).toBeLessThan(10);
      creates.mockClear();
      editor.dispatch(editor.state.createTransaction().replace(0, 0, [editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Before')])]));
      expect(handles()[9]!.getAttribute('aria-valuenow')).toBe('170');
      expect(creates.mock.calls.length).toBeLessThan(10);
      handles()[9]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      expect(editor.state.doc.child(1).child(0).child(9).attrs.colwidth).toEqual([175]);
      expect(handles()[299]!.getAttribute('aria-valuenow')).toBe('175');
      expect(creates.mock.calls.length).toBeLessThan(15);
    } finally { creates.mockRestore(); view.destroy(); editor.destroy(); mount.remove(); }
  });

  it('announces column widths before interaction and tracks resize, cancellation and history', async () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins,
      content: documentWith(table([[cell('A'), cell('B')], [cell('C'), cell('D')]])) });
    const original = editor.state.doc.toJSON();
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const handles = () => [...view.dom.querySelectorAll<HTMLElement>('.fountain-table-cell__resize-handle')];
    try {
      for (const handle of handles()) {
        expect(handle.getAttribute('aria-valuemin')).toBe('40');
        expect(handle.getAttribute('aria-valuemax')).toBe('2000');
        expect(handle.getAttribute('aria-valuenow')).toBe('120');
        expect(handle.getAttribute('aria-valuetext')).toBe('120 pixels');
      }
      handles()[0]!.focus();
      await Promise.resolve();
      expect(document.activeElement).toBe(handles()[0]);
      handles()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      await Promise.resolve();
      expect(document.activeElement).toBe(handles()[0]);
      expect(handles().map(handle => handle.getAttribute('aria-valuenow'))).toEqual(['125', '120', '125', '120']);
      expect(undo(editor)).toBe(true);
      expect(editor.state.doc.toJSON()).toEqual(original);
      expect(handles().map(handle => handle.getAttribute('aria-valuenow'))).toEqual(['120', '120', '120', '120']);
      expect(redo(editor)).toBe(true);
      handles()[0]!.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 10, bubbles: true, cancelable: true }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60 }));
      expect(handles()[0]!.getAttribute('aria-valuenow')).toBe('175');
      expect(handles()[0]!.getAttribute('aria-valuetext')).toBe('175 pixels');
      window.dispatchEvent(new MouseEvent('pointercancel'));
      expect(handles()[0]!.getAttribute('aria-valuenow')).toBe('125');
      expect(handles()[0]!.getAttribute('aria-valuetext')).toBe('125 pixels');
    } finally { view.destroy(); editor.destroy(); mount.remove(); }
  });

  it('announces the logical resized column of a merged cell, not its whole span', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins,
      content: documentWith(table([
        [cell('Merged', { colspan: 2, colwidth: [150, 250] }), cell('Other', { colwidth: [90] })],
        [cell('Left', { colwidth: [150] }), cell('Right', { colwidth: [250] }), cell('Other row', { colwidth: [90] })],
      ])) });
    const original = editor.state.doc.toJSON();
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const handle = () => view.dom.querySelector<HTMLElement>('[data-fountain-path="0.0.0"] .fountain-table-cell__resize-handle')!;
    try {
      expect(handle().getAttribute('aria-valuenow')).toBe('250');
      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
      expect(handle().getAttribute('aria-valuenow')).toBe('275');
      expect(editor.state.doc.child(0).child(0).child(0).attrs.colwidth).toEqual([150, 275]);
      expect(editor.state.doc.child(0).child(1).child(1).attrs.colwidth).toEqual([275]);
      expect(editor.state.doc.child(0).child(1).child(2).attrs.colwidth).toEqual([90]);
      expect(undo(editor)).toBe(true);
      expect(editor.state.doc.toJSON()).toEqual(original);
      expect(handle().getAttribute('aria-valuenow')).toBe('250');
    } finally { view.destroy(); editor.destroy(); mount.remove(); }
  });

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

  it('deletes the entire active table as one undoable command', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: {
        type: 'doc',
        content: [paragraph('Before'), table([[cell('A'), cell('B')]]), paragraph('After')],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([1, 0, 0, 0, 0], 0)));
    expect(deleteTable(editor)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'paragraph']);
    expect(editor.state.doc.content.map((node) => node.textContent)).toEqual(['Before', 'After']);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('table');
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
