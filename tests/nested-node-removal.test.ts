import { expect, it } from 'vitest';
import { CoreSchemaSpec, createEditor, NodeSelection, Selection, removeNode, historyPlugin, undo, redo } from '../src';

it.each(['blockquote', 'list_item', 'table_cell'])('retains a valid %s after deleting its only code block', kind => {
  const editor = createEditor({ schema: CoreSchemaSpec, plugins: [historyPlugin] });
  const { schema } = editor.state;
  const code = schema.node('code_block', { language: 'js' }, [schema.text('const x = 1;')]);
  const container = schema.node(kind, {}, [code]);
  const neighbor = schema.node('paragraph', {}, [schema.text('Neighbor')]);
  const root = kind === 'list_item' ? schema.node('bullet_list', {}, [container])
    : kind === 'table_cell' ? schema.node('table', {}, [schema.node('table_row', {}, [container])]) : container;
  const path = kind === 'list_item' ? [0, 0, 0] : kind === 'table_cell' ? [0, 0, 0, 0] : [0, 0];
  const doc = schema.node('doc', {}, [root, neighbor]);
  editor.dispatch(editor.createTransaction().replaceDocument(doc).setSelection(new NodeSelection(doc, path)).setMeta('history$reset', true));
  expect(removeNode(editor, path)).toBe(true);
  expect(() => schema.validate(editor.state.doc)).not.toThrow();
  const replaced = path.reduce((node, index) => node.child(index), editor.state.doc);
  expect(replaced.type.name).toBe('paragraph');
  expect(editor.state.selection.path).toEqual([...path, 0]);
  expect(editor.state.doc.child(1)).toBe(neighbor);
  expect(undo(editor)).toBe(true); expect(editor.state.doc.eq(doc)).toBe(true);
  expect(redo(editor)).toBe(true); expect(() => schema.validate(editor.state.doc)).not.toThrow();
  editor.destroy();
});
it('lands in the immediate following block after removing a root block', () => {
  const editor = createEditor({ schema: CoreSchemaSpec }); const { schema } = editor.state;
  const code = schema.node('code_block', {}, [schema.text('code')]);
  const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
  const doc = schema.node('doc', {}, [code, paragraph('Immediate'), paragraph('Later')]);
  editor.dispatch(editor.createTransaction().replaceDocument(doc).setSelection(new NodeSelection(doc, [0])));
  expect(removeNode(editor, [0])).toBe(true);
  expect(editor.state.selection.path).toEqual([0, 0]);
  expect(editor.state.doc.child(0).textContent).toBe('Immediate'); editor.destroy();
});

it('maps removal of a selected nested block through an empty intermediate container', () => {
  const editor = createEditor({ schema: CoreSchemaSpec }); const { schema } = editor.state;
  const code = schema.node('code_block', {}, [schema.text('code')]);
  const doc = schema.node('doc', {}, [schema.node('blockquote', {}, [code]), schema.node('paragraph', {}, [schema.text('After')])]);
  editor.dispatch(editor.createTransaction().replaceDocument(doc).setSelection(new NodeSelection(doc, [0, 0])));
  const transaction = editor.createTransaction();
  expect(() => transaction.replaceNode([0, 0], [])).not.toThrow();
  transaction.replaceNode([0], []).setSelection(Selection.cursor([0, 0], 0));
  expect(editor.dispatch(transaction)).toBe(true); expect(editor.getText()).toBe('After');
  editor.destroy();
});
