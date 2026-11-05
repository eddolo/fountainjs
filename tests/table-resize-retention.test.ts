import { expect, it } from 'vitest';
import { CellSelection, NodeSelection, Plugin, Selection, StarterKit, canUndo, createEditor,
  createHistoryPlugin, resizeTableColumn, undo, type Mapping, type NodeJSON } from '../src';

const p = (text: string): NodeJSON => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const source: NodeJSON = { type: 'doc', attrs: { audit: 'root' }, content: [{ type: 'table', content: [
  { type: 'table_row', content: [{ type: 'table_cell', attrs: { colwidth: [120] }, content: [p('Left')] },
    { type: 'table_cell', attrs: { colwidth: [140] }, content: [p('Right')] }] },
] }, p('Outside')] };

it.each(['cell', 'text', 'node'] as const)('resizes metadata without deleting positions or changing its %s selection', kind => {
  let mapping: Mapping | undefined;
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: source,
    onUpdate: (_state, tr) => { if (tr.docChanged) mapping = tr.mapping; } });
  try {
    const before = editor.state.doc;
    const selection = kind === 'cell' ? new CellSelection(before, [0, 0, 0]) : kind === 'node'
      ? new NodeSelection(before, [0, 0, 0]) : Selection.range([0, 0, 0, 0, 0], 1, [0, 0, 1, 0, 0], 3);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    expect(resizeTableColumn(editor, 155, 0, [0])).toBe(true);
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(editor.state.doc.child(0).child(0).child(0).attrs.colwidth).toEqual([155]);
    expect(editor.state.doc.child(0).child(0).child(0).child(0)).toBe(before.child(0).child(0).child(0).child(0));
    expect(editor.state.doc.child(1)).toBe(before.child(1));
    for (let position = 0; position <= before.nodeSize - 2; position++) for (const association of [-1, 1] as const) {
      expect(mapping!.mapResult(position, association)).toMatchObject({ position, deleted: false });
    }
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before.toJSON());
  } finally { editor.destroy(); }
});

it('returns a filtered resize failure without adding a history entry', () => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin(), new Plugin({ filterTransaction: tr => !tr.docChanged })], content: source });
  try {
    const before = editor.state.doc;
    expect(resizeTableColumn(editor, 155, 0, [0])).toBe(false);
    expect(editor.state.doc).toBe(before); expect(canUndo(editor)).toBe(false);
  } finally { editor.destroy(); }
});

it('replays column metadata changes in a command batch with one undo', () => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: source });
  try {
    const before = editor.state.doc;
    expect(editor.runCommandBatch(() => resizeTableColumn(editor, 155, 0, [0]) && resizeTableColumn(editor, 245, 1, [0]))).toBe(true);
    expect(editor.state.doc.child(0).child(0).content.map(cell => cell.attrs.colwidth)).toEqual([[155], [245]]);
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before.toJSON()); expect(canUndo(editor)).toBe(false);
  } finally { editor.destroy(); }
});
