import { expect, it } from 'vitest';
import { CellSelection, EditorState, Plugin, PluginKey, Schema, Selection, StarterKit, TableMap, createEditor,
  extractTableSelection, insertDocument, insertTable, pasteTableCells, serializeTableSelection, undo, redo, type SchemaSpec } from '../src';
import { textPointToPosition } from '../src/core/transaction/mapping';

const schema = new Schema(StarterKit.schema);
const p = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
const cell = (text: string, attrs = {}) => schema.node('table_cell', attrs, [p(text)]);
const table = (rows: ReturnType<typeof cell>[][]) => schema.node('table', {}, rows.map(cells => schema.node('table_row', {}, cells)));
const matrix = (node: ReturnType<typeof table>) => {
  const map = TableMap.create(node);
  return Array.from({ length: map.height }, (_, row) => Array.from({ length: map.width }, (_, column) => map.cellAt(row, column)?.node.textContent));
};
function editorFor(node: ReturnType<typeof table>, plugins = StarterKit.plugins) {
  return createEditor({ schema: StarterKit.schema, state: EditorState.create({ schema, plugins, doc: schema.node('doc', {}, [node]) }) });
}

it('repeats merged source tiles and clips their spans at the selected rectangle, with exact history', () => {
  const destination = table(Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, column) => cell(`${row}:${column}`))));
  const source = table([[cell('Merged source', { rowspan: 2, colspan: 2 })], []]);
  const editor = editorFor(destination);
  try {
    editor.dispatch(editor.createTransaction().setSelection(new CellSelection(editor.state.doc, [0, 0, 0], [0, 2, 2])));
    const before = editor.getJSON(); expect(pasteTableCells(editor, source)).toBe(true);
    const map = TableMap.create(editor.state.doc.child(0));
    expect(map.valid).toBe(true); expect(map.cells.map(cell => [cell.rowspan, cell.colspan])).toEqual([[2, 2], [2, 1], [1, 2], [1, 1]]);
    expect(matrix(editor.state.doc.child(0)).flat()).toEqual(Array(9).fill('Merged source'));
    const after = editor.getJSON(); expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
    expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(after);
  } finally { editor.destroy(); }
});

it('fills an existing merged target with one rich cell while retaining target merge geometry', () => {
  const editor = editorFor(table([[cell('Old', { rowspan: 2, colspan: 2, colwidth: [100, 120] })], []]));
  const source = table([[schema.node('table_header', { background: '#fff0aa' }, [schema.node('paragraph', {}, [schema.text('Rich', [schema.mark('strong')])])])]]);
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0, 0], 1)));
    expect(pasteTableCells(editor, source)).toBe(true);
    const target = editor.state.doc.child(0).child(0).child(0);
    expect(target.type.name).toBe('table_header'); expect(target.attrs.rowspan).toBe(2); expect(target.attrs.colspan).toBe(2);
    expect(target.attrs.colwidth).toEqual([100, 120]); expect(target.attrs.background).toBe('#fff0aa');
    expect(target.child(0).child(0).marks.map(mark => mark.type.name)).toEqual(['strong']);
    expect(TableMap.create(editor.state.doc.child(0)).valid).toBe(true);
  } finally { editor.destroy(); }
});

it('splits crossing target spans while retaining outside owners, text and mapped anchors', () => {
  const destination = table([[cell('Top left'), cell('Keep outside', { rowspan: 2, colspan: 2 })],
    [cell('Replace')], [cell('Old 20'), cell('Old 21'), cell('Unchanged suffix')]]);
  const position = new PluginKey<number>('outside-table-anchor');
  const plugin = new Plugin({ key: position, state: {
    init: (_config, state) => textPointToPosition(state.doc, [0, 2, 2, 0, 0], 5),
    apply: (transaction, value) => transaction.mapping.map(value),
  } });
  const editor = editorFor(destination, [...StarterKit.plugins, plugin]);
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 1, 0, 0, 0], 2)));
    const before = editor.getJSON(), oldPosition = position.get(editor.state);
    expect(pasteTableCells(editor, table([[cell('A'), cell('B')], [cell('C'), cell('D')]]))).toBe(true);
    const target = editor.state.doc.child(0);
    expect(TableMap.create(target).valid).toBe(true);
    expect(matrix(target)).toEqual([['Top left', 'Keep outside', ''], ['A', 'B', ''], ['C', 'D', 'Unchanged suffix']]);
    expect(target.child(0).child(1).child(0)).toBe(destination.child(0).child(1).child(0));
    expect(target.child(2).child(2)).toBe(destination.child(2).child(2));
    expect(position.get(editor.state)).toBe(textPointToPosition(editor.state.doc, [0, 2, 2, 0, 0], 5));
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before); expect(position.get(editor.state)).toBe(oldPosition);
  } finally { editor.destroy(); }
});

it('retains explicit nested-table insertion while document paste distributes a rich grid', () => {
  const editor = editorFor(table([[cell('Target')]]));
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0, 0], 0)));
    expect(insertDocument(editor, schema.node('doc', {}, [table([[cell('Pasted')]])]))).toBe(true);
    expect(editor.state.doc.child(0).child(0).child(0).textContent).toBe('Pasted');
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0, 0], 0)));
    expect(insertTable(editor, { rows: 1, columns: 1 })).toBe(true);
    let count = 0; editor.state.doc.descendants(node => { if (node.type.name === 'table') count++; }); expect(count).toBe(2);
  } finally { editor.destroy(); }
});

it.each(['invalid', 'capacity', 'readonly', 'filtered'])('refuses %s rich grids without publishing a partial table', kind => {
  let blocked = false;
  const guard = new Plugin({ filterTransaction: () => !blocked });
  const editor = editorFor(table([[cell('Keep')]]), [...StarterKit.plugins, guard]);
  try {
    editor.dispatch(editor.createTransaction().setSelection(new CellSelection(editor.state.doc, [0, 0, 0])));
    if (kind === 'readonly') editor.setEditable(false);
    if (kind === 'filtered') blocked = true;
    const before = editor.state;
    const source = kind === 'invalid' ? table([[cell('A'), cell('B')], [cell('C')]])
      : kind === 'capacity' ? table([[cell('Large', { colspan: 100, rowspan: 100 }), cell('Also large', { colspan: 100, rowspan: 100 })], ...Array.from({ length: 99 }, () => [])])
      : table([[cell('New')]]);
    expect(pasteTableCells(editor, source)).toBe(false); expect(editor.state).toBe(before);
  } finally { editor.destroy(); }
});

it('extracts only complete selected geometry while retaining table, row, cell and document attributes', () => {
  const source = table([[cell('A'), cell('B', { background: '#fff0aa', colwidth: [120] })], [cell('C'), cell('D')]]);
  const editor = editorFor(source.withAttrs({ ...source.attrs, dir: 'rtl' }));
  try {
    const selected = new CellSelection(editor.state.doc, [0, 0, 1], [0, 1, 1]);
    const result = extractTableSelection(editor.state.doc, selected)!;
    expect(result.child(0).attrs.dir).toBe('rtl'); expect(matrix(result.child(0))).toEqual([['B'], ['D']]);
    expect(result.child(0).child(0).child(0).attrs.colwidth).toEqual([120]);
    expect(result.child(0).child(0).child(0).attrs.background).toBe('#fff0aa');
  } finally { editor.destroy(); }
});

it('preserves extension-defined attributes, nested blocks and widget data in a rich cell', () => {
  const spec: SchemaSpec = { ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes,
    table_cell: { ...StarterKit.schema.nodes.table_cell!, attrs: { ...StarterKit.schema.nodes.table_cell!.attrs, hostData: { default: null } } },
    host_widget: { group: 'block', atom: true, attrs: { payload: { default: null } }, toDOM: () => ['aside', {}, 'Widget'] },
  } };
  const custom = new Schema(spec), paragraph = (text: string) => custom.node('paragraph', {}, [custom.text(text)]);
  const row = (cell: ReturnType<typeof custom.node>) => custom.node('table_row', {}, [cell]);
  const sourceCell = custom.node('table_cell', { hostData: { owner: 'Ada', tags: ['keep', 'all'] } }, [
    paragraph('First'), paragraph('Second'), custom.node('blockquote', {}, [paragraph('Quote')]),
    custom.node('bullet_list', {}, [custom.node('list_item', {}, [paragraph('Nested list')])]),
    custom.node('table', {}, [row(custom.node('table_cell', {}, [paragraph('Nested table')]))]),
    custom.node('host_widget', { payload: { fields: { status: 'open' }, series: [1, 2, 3] } }),
  ]);
  const destination = custom.node('table', {}, [row(custom.node('table_cell', {}, [paragraph('Old')]))]);
  const editor = createEditor({ schema: spec, state: EditorState.create({ schema: custom, doc: custom.node('doc', {}, [destination]) }) });
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0, 0], 0)));
    expect(pasteTableCells(editor, custom.node('table', {}, [row(sourceCell)]))).toBe(true);
    expect(editor.state.doc.child(0).child(0).child(0).toJSON()).toEqual(sourceCell.toJSON());
  } finally { editor.destroy(); }
});

it('honors transaction refusal for the established TSV path', () => {
  let blocked = false;
  const editor = editorFor(table([[cell('A'), cell('B')]]), [...StarterKit.plugins, new Plugin({ filterTransaction: () => !blocked })]);
  try {
    editor.dispatch(editor.createTransaction().setSelection(new CellSelection(editor.state.doc, [0, 0, 0], [0, 0, 1])));
    blocked = true; const before = editor.state;
    expect(pasteTableCells(editor, '1\t2')).toBe(false); expect(editor.state).toBe(before);
  } finally { editor.destroy(); }
});


it('fills a grid from a text caret, grows its edges and preserves quoted spreadsheet fields and target cells', () => {
  const header = schema.node('table_header', { background: '#fedcba', scope: 'col' }, [p('old')]);
  const editor = editorFor(table([[header, cell('second')]]));
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0, 0], 1)));
    const before = editor.getJSON();
    const tsv = '"North\tRegion"\t1\r\n"He said ""yes""\nagain"\t2\r\n';
    expect(pasteTableCells(editor, tsv)).toBe(true);
    const result = editor.state.doc.child(0);
    expect(matrix(result)).toEqual([['North\tRegion', '1'], ['He said "yes"\nagain', '2']]);
    expect(result.child(0).child(0).type.name).toBe('table_header');
    expect(result.child(0).child(0).attrs).toEqual(header.attrs);
    expect(serializeTableSelection(editor.state.doc, editor.state.selection as CellSelection)?.text)
      .toBe('"North\tRegion"\t1\n"He said ""yes""\nagain"\t2');
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  } finally { editor.destroy(); }
});

it.each(['col', 'row'] as const)('grows pasted column headings only across a column-header row (%s)', scope => {
  const heading = schema.node('table_header', { scope }, [p('Category')]);
  const editor = editorFor(table([[heading], [cell('Monday')]]));
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0, 0], 0)));
    const before = editor.getJSON();
    expect(pasteTableCells(editor, 'Week\tActual\nFirst\t12')).toBe(true);
    const result = editor.state.doc.child(0);
    expect(result.child(0).child(1).type.name).toBe(scope === 'col' ? 'table_header' : 'table_cell');
    expect(result.child(1).child(1).type.name).toBe('table_cell');
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  } finally { editor.destroy(); }
});
