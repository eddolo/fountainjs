import { describe, expect, it } from 'vitest';
import { AllSelection, CellSelection, CoreSchemaSpec, GapSelection, NodeSelection, Selection,
  createEditor, historyPlugin, undo, redo, insertText, positionToTextPoint } from '../src';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
function setup() {
  return createEditor({ schema: CoreSchemaSpec, plugins: [historyPlugin],
    content: { type: 'doc', content: [paragraph('Before')] } });
}

describe('selection mapping when no text leaves remain', () => {
  it.each(['caret', 'range'] as const)('replaces a %s with atoms, retains a usable gap and supports history', kind => {
    const editor = setup();
    editor.dispatch(editor.state.createTransaction().setSelection(kind === 'caret'
      ? Selection.cursor([0, 0], 3) : Selection.range([0, 0], 1, [0, 0], 5)));
    const before = editor.state.doc.toJSON();
    const selection = editor.state.selection;
    const atom = editor.state.schema.node('horizontal_rule');
    const transaction = editor.state.createTransaction().replace(0, 1, [atom, atom]);
    expect(transaction.selection).toBeInstanceOf(GapSelection);
    expect((transaction.selection as GapSelection).index).toBe(2);
    editor.dispatch(transaction);
    expect(editor.state.doc.content.map(node => node.type.name)).toEqual(['horizontal_rule', 'horizontal_rule']);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(before);
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(redo(editor)).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(GapSelection);
    expect(insertText(editor, 'After')).toBe(true);
    expect(editor.getText()).toContain('After');
    editor.destroy();
  });

  it('permits a childless paragraph replacement followed by an explicit selection in one transaction', () => {
    const editor = setup();
    const empty = editor.state.schema.node('paragraph');
    const transaction = editor.state.createTransaction().replace(0, 1, [empty]);
    expect(transaction.selection).toBeInstanceOf(GapSelection);
    transaction.setSelection(new NodeSelection(transaction.doc, [0]));
    editor.dispatch(transaction);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    editor.destroy();
  });

  it('allows a temporarily empty document during a multi-step transaction', () => {
    const editor = setup();
    const transaction = editor.state.createTransaction().replace(0, 1, []);
    expect(transaction.selection).toBeInstanceOf(AllSelection);
    const next = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Next')]);
    transaction.replace(0, 0, [next]).setSelection(Selection.cursor([0, 0], 4));
    editor.dispatch(transaction);
    expect(editor.getText()).toBe('Next');
    expect(editor.state.selection.eq(Selection.cursor([0, 0], 4))).toBe(true);
    editor.destroy();
  });

  it.each(['gap', 'node', 'cell'] as const)('recovers a deleted %s selection in an empty intermediate document', kind => {
    const editor = setup();
    const schema = editor.state.schema;
    const table = schema.node('table', {}, [schema.node('table_row', {}, [
      schema.node('table_cell', {}, [schema.node('paragraph', {}, [schema.text('Cell')])]),
    ])]);
    const initial = editor.state.createTransaction().replace(0, 1, [table]);
    initial.setSelection(kind === 'gap' ? new GapSelection(initial.doc, 0)
      : kind === 'node' ? new NodeSelection(initial.doc, [0]) : new CellSelection(initial.doc, [0, 0, 0]));
    editor.dispatch(initial);
    const transaction = editor.state.createTransaction().replace(0, 1, []);
    expect(transaction.selection).toBeInstanceOf(AllSelection);
    expect(() => positionToTextPoint(transaction.doc, 0)).toThrow('does not contain an editable text');
    editor.destroy();
  });

  it('keeps a recovered gap inside the nearest nested block container', () => {
    const editor = setup();
    const schema = editor.state.schema;
    const nested = schema.node('blockquote', {}, [schema.node('paragraph', {}, [schema.text('Nested')])]);
    editor.dispatch(editor.state.createTransaction().replace(0, 1, [nested])
      .setSelection(Selection.cursor([0, 0, 0], 3)));
    const transaction = editor.state.createTransaction().replaceNode([0, 0], [schema.node('horizontal_rule')]);
    expect(transaction.selection).toBeInstanceOf(GapSelection);
    expect((transaction.selection as GapSelection).parentPath).toEqual([0]);
    expect((transaction.selection as GapSelection).index).toBe(1);
    editor.dispatch(transaction);
    expect(insertText(editor, 'Nested again')).toBe(true);
    expect(editor.state.doc.child(0).child(1).textContent).toBe('Nested again');
    editor.destroy();
  });

  it('recovers when a selected inline atom is replaced and no text exists anywhere', () => {
    const editor = setup();
    const schema = editor.state.schema;
    const inline = schema.node('hard_break');
    const initial = editor.state.createTransaction().replace(0, 1, [schema.node('paragraph', {}, [inline])]);
    editor.dispatch(initial.setSelection(new NodeSelection(initial.doc, [0, 0])));
    const transaction = editor.state.createTransaction().replaceNode([0, 0], []);
    expect(transaction.selection).toBeInstanceOf(GapSelection);
    editor.dispatch(transaction);
    expect(editor.state.doc.child(0).childCount).toBe(0);
    editor.destroy();
  });
});
