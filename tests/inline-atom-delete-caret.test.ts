import { expect, it } from 'vitest';
import { StarterKit, NodeSelection, Selection, createEditor, deleteSelection, deleteBackward, insertText, undo, redo } from '../src';

const image = { type: 'inline_image', attrs: { src: '/figure.png', alt: 'Figure' } };
const paragraph = { type: 'paragraph', content: [image] };
it.each([
  ['paragraph', paragraph, [0, 0]],
  ['heading', { type: 'heading', attrs: { level: 2 }, content: [image] }, [0, 0]],
  ['quote', { type: 'blockquote', content: [paragraph] }, [0, 0, 0]],
  ['list', { type: 'bullet_list', content: [{ type: 'list_item', content: [paragraph] }] }, [0, 0, 0, 0]],
  ['table', { type: 'table', content: [{ type: 'table_row', content: [{ type: 'table_cell', content: [paragraph] }] }] }, [0, 0, 0, 0, 0]],
] as const)('deletes the last inline atom in a %s and types in the same paragraph after undo/redo', (_name, block, path) => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: { type: 'doc', content: [block] } });
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, path)));
  const before = editor.getJSON(), rootCount = editor.state.doc.childCount;
  expect(deleteSelection(editor)).toBe(true); expect(editor.state.selection.kind).toBe('text');
  expect(editor.state.selection.path).toEqual(path);
  expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
  expect(redo(editor)).toBe(true); expect(insertText(editor, 'Replacement')).toBe(true);
  expect(editor.state.doc.childCount).toBe(rootCount); expect(editor.state.selection.path).toEqual(path);
  expect(path.slice(0, -1).reduce((node, index) => node.child(index), editor.state.doc).textContent).toBe('Replacement');
  editor.destroy();
});
it.each([0, 1])('does not consume the other atom or jump outside the parent when deleting adjacent atom %s', selected => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [image, { ...image, attrs: { src: '/second.png', alt: 'Second' } }] }] } });
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [0, selected])));
  expect(deleteSelection(editor)).toBe(true); expect(insertText(editor, 'Here')).toBe(true);
  expect(editor.state.doc.childCount).toBe(1);
  expect(editor.state.doc.child(0).content.filter(node => node.type.name === 'inline_image')).toHaveLength(1);
  expect(editor.state.doc.child(0).child(selected).textContent).toBe('Here'); editor.destroy();
});
it('keeps a caret already available next to an image when backspacing over it', () => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [image, { type: 'text', text: '' }] }] } });
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 1], 0)));
  expect(deleteBackward(editor)).toBe(true); expect(insertText(editor, 'Typed')).toBe(true);
  expect(editor.getText()).toBe('Typed'); expect(editor.state.doc.childCount).toBe(1); editor.destroy();
});
