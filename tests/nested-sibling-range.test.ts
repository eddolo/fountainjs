import { expect, it } from 'vitest';
import { CoreExtension, HTMLAnchorExtension, ReplaceTextRangeStep, Selection, StarterKit, composeExtensions,
  createEditor, createHistoryPlugin, deleteSelection, insertText, redo, textPointToPosition, undo, type NodeJSON } from '../src';
import { getNodeAtPath } from '../src/core/transaction/path';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const children = () => [paragraph('Left'), { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure' } }, paragraph('Right')];
const cases = [
  { name: 'quote', path: [0], wrap: (content: readonly NodeJSON[]) => ({ type: 'blockquote', content }) },
  { name: 'list item', path: [0, 0], wrap: (content: readonly NodeJSON[]) => ({ type: 'bullet_list', content: [{ type: 'list_item', content }] }) },
  { name: 'table cell', path: [0, 0, 0], wrap: (content: readonly NodeJSON[]) => ({ type: 'table', content: [{ type: 'table_row', content: [{ type: 'table_cell', content }] }] }) },
];

it.each(cases)('replaces a sibling paragraph range in a $name, including a fully selected image', item => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: {
    type: 'doc', content: [item.wrap(children()), paragraph('After.')],
  } });
  try {
    const before = editor.state.doc;
    const start = [...item.path, 0, 0], end = [...item.path, 2, 0];
    const step = new ReplaceTextRangeStep(start, 2, end, 3, 'X');
    const projected = step.apply(before);
    // Mapping must agree with actual structural removal, including outside text.
    const mapping = step.getMap(before);
    expect(mapping.map(before.nodeSize - 2)).toBe(projected.nodeSize - 2);
    expect(mapping.map(textPointToPosition(before, [1, 0], 3))).toBe(textPointToPosition(projected, [1, 0], 3));
    editor.dispatch(editor.createTransaction().setSelection(Selection.range(start, 2, end, 3)));
    expect(insertText(editor, 'X')).toBe(true);
    expect(editor.state.doc.eq(projected)).toBe(true);
    const parent = getNodeAtPath(editor.state.doc, item.path);
    expect(parent.childCount).toBe(1);
    expect(parent.child(0).textContent).toBe('LeXht');
    expect(editor.state.doc.child(1)).toBe(before.child(1));
    expect(editor.state.selection).toMatchObject({ path: start, from: 3, to: 3 });
    const edited = editor.state.doc;
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.eq(edited)).toBe(true);
  } finally { editor.destroy(); }
});

it('deletes the structural interval at paragraph edges without removing adjacent text', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [cases[0].wrap(children())] } });
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 0], 4, [0, 2, 0], 0)));
    expect(deleteSelection(editor)).toBe(true);
    expect(editor.state.doc.child(0).childCount).toBe(1);
    expect(editor.state.doc.child(0).textContent).toBe('LeftRight');
  } finally { editor.destroy(); }
});

it('retains the first paragraph attributes and the unselected marked suffix', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [{ type: 'blockquote', content: [
    { type: 'paragraph', attrs: { align: 'right' }, content: [{ type: 'text', text: 'Left', marks: [{ type: 'strong' }] }] },
    { type: 'image_super', attrs: { src: '/figure.png' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'Right', marks: [{ type: 'em' }] }] },
  ] }] } });
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 0], 2, [0, 2, 0], 3)));
    expect(insertText(editor, 'X')).toBe(true);
    const block = editor.state.doc.child(0).child(0);
    expect(block.attrs.align).toBe('right');
    expect(block.child(0).text).toBe('LeX');
    expect(block.child(0).marks.map(mark => mark.type.name)).toEqual(['strong']);
    expect(block.child(1).text).toBe('ht');
    expect(block.child(1).marks.map(mark => mark.type.name)).toEqual(['em']);
  } finally { editor.destroy(); }
});

it('does not merge partially selected inline bookmarks as if they were sibling blocks', () => {
  const kit = composeExtensions([CoreExtension, HTMLAnchorExtension]);
  const editor = createEditor({ schema: kit.schema, content: { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'html_anchor', attrs: { id: 'left' }, content: [{ type: 'text', text: 'Left' }] },
    { type: 'html_anchor', attrs: { id: 'right' }, content: [{ type: 'text', text: 'Right' }] },
  ] }] } });
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 0], 2, [0, 1, 0], 3)));
    expect(insertText(editor, 'X')).toBe(true);
    const block = editor.state.doc.child(0);
    expect(block.content.map(node => node.attrs.id)).toEqual(['left', 'right']);
    expect(block.textContent).toBe('LeXht');
  } finally { editor.destroy(); }
});
