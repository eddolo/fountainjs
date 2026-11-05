import { expect, it } from 'vitest';
import { Plugin, Selection, StarterKit, canUndo, createEditor, createHistoryPlugin, insertText,
  redo, splitBlock, textPointToPosition, undo, type Mapping, type NodeJSON } from '../src';

const p = (text: string): NodeJSON => ({ type: 'paragraph', attrs: { audit: 'retained' }, content: [{ type: 'text', text }] });

it.each([['paragraph', 0], ['paragraph', 2], ['paragraph', 5], ['heading', 2]] as const)(
  'retains every old position through a %s split at %s, with exact history', (type, offset) => {
    let mapping: Mapping | undefined;
    const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()],
      content: { type: 'doc', attrs: { audit: 'root' }, content: [p('Before'),
        { type, attrs: { level: 2, audit: 'block' }, content: [{ type: 'text', text: 'Alpha', marks: [{ type: 'strong' }] }] }, p('After')] },
      onUpdate: (_state, transaction) => { if (transaction.docChanged) mapping = transaction.mapping; } });
    try {
      const before = editor.state.doc, cut = textPointToPosition(before, [1, 0], offset);
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], offset)));
      expect(splitBlock(editor)).toBe(true);
      const after = editor.state.doc;
      expect(after.child(0)).toBe(before.child(0)); expect(after.child(3)).toBe(before.child(2));
      expect(after.child(1).textContent).toBe('Alpha'.slice(0, offset));
      expect(after.child(2).textContent).toBe('Alpha'.slice(offset));
      expect(after.child(1).child(0).marks).toEqual(before.child(1).child(0).marks);
      expect(after.child(2).child(0).marks).toEqual(before.child(1).child(0).marks);
      expect(after.child(2).type.name).toBe(type === 'heading' ? 'paragraph' : type);
      for (let position = 0; position <= before.nodeSize - 2; position++) for (const association of [-1, 1] as const) {
        expect(mapping!.mapResult(position, association)).toMatchObject({
          position: position + (position > cut || position === cut && association > 0 ? 2 : 0), deleted: false,
        });
      }
      expect(editor.state.selection).toEqual(Selection.cursor([2, 0], 0));
      expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before.toJSON());
      expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(after.toJSON());
    } finally { editor.destroy(); }
  });

it.each(['bullet', 'ordered', 'task'] as const)('retains text and following blocks when splitting a %s item', kind => {
  let mapping: Mapping | undefined;
  const item = kind === 'task' ? 'task_item' : 'list_item';
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: { type: 'doc', content: [
    { type: `${kind}_list`, content: [{ type: item, attrs: { checked: true, audit: 'item' }, content: [p('Earlier'),
      { type: 'paragraph', content: [{ type: 'text', text: 'AA' }, { type: 'text', text: 'Alpha', marks: [{ type: 'em' }] }, { type: 'text', text: 'ZZ' }] }, p('Tail')] },
    { type: item, content: [p('Outside')] }] }, p('After')],
  }, onUpdate: (_state, transaction) => { if (transaction.docChanged) mapping = transaction.mapping; } });
  try {
    const before = editor.state.doc, cut = textPointToPosition(before, [0, 0, 1, 1], 2);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 1, 1], 2)));
    expect(splitBlock(editor)).toBe(true);
    const after = editor.state.doc, list = after.child(0);
    expect(list.content.map(node => node.textContent)).toEqual(['EarlierAAAl', 'phaZZTail', 'Outside']);
    expect(list.child(0).child(0)).toBe(before.child(0).child(0).child(0));
    expect(list.child(1).child(1)).toBe(before.child(0).child(0).child(2));
    expect(list.child(2)).toBe(before.child(0).child(1)); expect(after.child(1)).toBe(before.child(1));
    expect(list.child(1).child(0).child(0).marks).toEqual(before.child(0).child(0).child(1).child(1).marks);
    if (kind === 'task') { expect(list.child(0).attrs.checked).toBe(true); expect(list.child(1).attrs.checked).toBe(false); }
    for (let position = 0; position <= before.nodeSize - 2; position++) for (const association of [-1, 1] as const) {
      expect(mapping!.mapResult(position, association)).toMatchObject({
        position: position + (position > cut || position === cut && association > 0 ? 4 : 0), deleted: false,
      });
    }
    expect(editor.state.selection).toEqual(Selection.cursor([0, 1, 0, 0], 0));
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before.toJSON());
    expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(after.toJSON());
  } finally { editor.destroy(); }
});

it('replays a split after preceding text edits as one undoable batch', () => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: { type: 'doc', content: [p('Alpha'), p('Outside')] } });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(editor.runCommandBatch(() => insertText(editor, 'X') && splitBlock(editor))).toBe(true);
    expect(editor.state.doc.content.map(node => node.textContent)).toEqual(['AlX', 'pha', 'Outside']);
    expect(editor.state.doc.child(2)).toBe(before.child(1));
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before.toJSON());
    expect(canUndo(editor)).toBe(false);
  } finally { editor.destroy(); }
});

it('returns a filtered split failure without changing the document or history', () => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin(), new Plugin({ filterTransaction: tr => !tr.docChanged })],
    content: { type: 'doc', content: [p('Alpha')] } });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(splitBlock(editor)).toBe(false); expect(editor.state.doc).toBe(before); expect(canUndo(editor)).toBe(false);
  } finally { editor.destroy(); }
});

it('rejects a split that violates its container schema', () => {
  const editor = createEditor({ schema: { ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes, doc: { content: 'paragraph' } } },
    plugins: [createHistoryPlugin()], content: { type: 'doc', content: [p('Alpha')] } });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(splitBlock(editor)).toBe(false); expect(editor.state.doc).toBe(before); expect(canUndo(editor)).toBe(false);
  } finally { editor.destroy(); }
});
