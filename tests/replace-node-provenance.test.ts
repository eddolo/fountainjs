import { expect, it } from 'vitest';
import { CoreExtension, GapSelection, composeExtensions, createEditor, createHistoryPlugin, undo, redo } from '../src';

function fixture() {
  const kit = composeExtensions([CoreExtension]);
  return createEditor({ schema: kit.schema, plugins: [createHistoryPlugin()], content: { type: 'doc', content: [
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }] },
  ] } });
}

it('retains the copied container and every old position when appending a child, with exact undo and redo', () => {
  const editor = fixture();
  try {
    const before = editor.getJSON(), owner = editor.state.doc.child(0), cut = owner.nodeSize - 1;
    editor.dispatch(editor.createTransaction().setSelection(new GapSelection(editor.state.doc, cut, -1)));
    const tail = editor.state.schema.nodeFromJSON({ type: 'paragraph', content: [{ type: 'text', text: 'Tail' }] });
    const transaction = editor.createTransaction().replaceNode([0], [owner.copy([...owner.content, tail])]);
    for (let position = 0; position <= editor.state.doc.nodeSize - 2; position++) for (const association of [-1, 1] as const) {
      expect(transaction.mapping.mapResult(position, association)).toMatchObject({ position: position + (position > cut || position === cut && association > 0 ? tail.nodeSize : 0), deleted: false });
    }
    expect(editor.dispatch(transaction)).toBe(true); expect(editor.state.selection).toMatchObject({ kind: 'gap', position: cut, parentPath: [0] });
    const after = editor.getJSON(); expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
    expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(after);
  } finally { editor.destroy(); }
});

it('retains a copied owner during an attribute change without inserting positional changes', () => {
  const editor = fixture();
  try {
    const owner = editor.state.doc.child(0), transaction = editor.createTransaction().replaceNode([0], [owner.withAttrs({ custom: 'kept owner' })]);
    expect(transaction.mapping.maps.every(map => map.ranges.length === 0)).toBe(true);
  } finally { editor.destroy(); }
});

it('does not assign provenance to a separately created equal-looking replacement', () => {
  const editor = fixture();
  try {
    const fresh = editor.state.schema.nodeFromJSON(editor.state.doc.child(0).toJSON());
    const transaction = editor.createTransaction().replaceNode([0], [fresh.withAttrs({ custom: 'new owner' })]);
    expect(transaction.mapping.mapResult(2).deleted).toBe(true);
  } finally { editor.destroy(); }
});

it('does not claim newly created equal-looking child text was retained inside a copied owner', () => {
  const editor = fixture();
  try {
    const owner = editor.state.doc.child(0), fresh = editor.state.schema.nodeFromJSON(owner.child(0).toJSON()).withAttrs({ id: 'new-child' });
    const transaction = editor.createTransaction().replaceNode([0], [owner.copy([fresh])]);
    expect(transaction.mapping.mapResult(0).deleted).toBe(false); expect(transaction.mapping.mapResult(2).deleted).toBe(true);
  } finally { editor.destroy(); }
});
