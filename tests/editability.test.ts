import { expect, it } from 'vitest';
import { CoreSchemaSpec, Plugin, Selection, createEditor, createHistoryPlugin, insertText, redo, undo } from '../src';

function setup(plugins: Plugin[] = []) {
  return createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin(), ...plugins],
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }] } });
}

it('keeps document, selection, marks and undo history across interaction-mode changes', () => {
  const editor = setup();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 5)));
  expect(insertText(editor, '!')).toBe(true);
  const { doc, selection, storedMarks } = editor.state;
  expect(editor.setEditable(false)).toBe(true);
  expect(editor.editable).toBe(false);
  expect(editor.state.doc).toBe(doc);
  expect(editor.state.selection.eq(selection)).toBe(true);
  expect(editor.state.storedMarks).toEqual(storedMarks);
  expect(insertText(editor, 'blocked')).toBe(false);
  expect(undo(editor)).toBe(false);
  expect(editor.setEditable(true)).toBe(true);
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Alpha');
  expect(redo(editor)).toBe(true);
  expect(editor.getText()).toBe('Alpha!');
  editor.destroy();
});

it('notifies subscribed views once without adding a document change or a repeated mode update', () => {
  const editor = setup();
  const changes: unknown[] = [];
  editor.subscribe((state, transaction) => changes.push({ mode: editor.editable, changed: transaction.docChanged,
    history: transaction.getMeta('addToHistory'), text: state.doc.textContent }));
  expect(editor.setEditable(false)).toBe(true);
  expect(editor.setEditable(false)).toBe(false);
  expect(changes).toEqual([{ mode: false, changed: false, history: false, text: 'Alpha' }]);
  editor.destroy();
});

it('restores the prior mode when a transaction filter refuses the change', () => {
  const editor = setup([new Plugin({ filterTransaction: transaction => transaction.getMeta('force') !== true })]);
  const before = editor.state;
  expect(editor.setEditable(false)).toBe(false);
  expect(editor.editable).toBe(true);
  expect(editor.state).toBe(before);
  editor.destroy();
});

it('rolls back a command batch rather than leaking an interaction-mode side effect', () => {
  const editor = setup();
  const before = editor.getJSON();
  expect(() => editor.runCommandBatch(() => {
    insertText(editor, 'changed');
    editor.setEditable(false);
    return true;
  })).toThrow('command batch');
  expect(editor.editable).toBe(true);
  expect(editor.getJSON()).toEqual(before);
  editor.destroy();
});

it('allows explicit host document updates in read-only mode and rejects use after destruction', () => {
  const editor = setup();
  editor.setEditable(false);
  expect(editor.dispatch(editor.createTransaction().replaceText([0, 0], 0, 5, 'Remote update').setMeta('addToHistory', false))).toBe(true);
  expect(editor.getText()).toBe('Remote update');
  expect(editor.editable).toBe(false);
  editor.destroy();
  expect(() => editor.setEditable(true)).toThrow('destroyed');
});

it('restores the mode when a filter throws before committing a state update', () => {
  const editor = setup([new Plugin({ filterTransaction: () => { throw new Error('Filter failed'); } })]);
  const before = editor.state;
  expect(() => editor.setEditable(false)).toThrow('Filter failed');
  expect(editor.editable).toBe(true);
  expect(editor.state).toBe(before);
  editor.destroy();
});

it('retains a committed mode if the host update callback throws after notification', () => {
  const editor = createEditor({ schema: CoreSchemaSpec, onUpdate: () => { throw new Error('Host observer failed'); } });
  const modes: boolean[] = [];
  editor.subscribe(() => modes.push(editor.editable));
  expect(() => editor.setEditable(false)).toThrow('Host observer failed');
  expect(editor.editable).toBe(false);
  expect(modes).toEqual([false]);
  editor.destroy();
});
