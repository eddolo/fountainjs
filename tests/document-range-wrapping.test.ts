import { expect, it } from 'vitest';
import { AllSelection, CellSelection, NodeSelection, Plugin, RangeSelection, Selection, StarterKit,
  canUndo, createEditor, createHistoryPlugin, redo, textPointToPosition, toggleList, toggleQuote, undo, type NodeJSON } from '../src';

const p = (text: string, id = text): NodeJSON => ({ type: 'paragraph', attrs: { nodeId: id, audit: { owner: 'Ada' } }, content: [{ type: 'text', text }] });
const image: NodeJSON = { type: 'image_super', attrs: { src: '/figure.png', alt: 'Retained figure', nodeId: 'figure' } };
const source: NodeJSON = { type: 'doc', attrs: { audit: 'root' }, content: [p('Before'), p('Left'), image, p('After')] };

it.each([false, true])('wraps and unwraps a directed text/media range in a quote without changing its content (backward: %s)', backward => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: source });
  try {
    const before = editor.state.doc, selection = new RangeSelection(before, backward ? 16 : 11, backward ? 11 : 16);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    expect(toggleQuote(editor)).toBe(true);
    const wrapped = editor.state.doc;
    expect(wrapped.content.map(node => node.type.name)).toEqual(['paragraph', 'blockquote', 'paragraph']);
    expect(wrapped.child(0)).toBe(before.child(0)); expect(wrapped.child(2)).toBe(before.child(3));
    expect(wrapped.child(1).child(0)).toBe(before.child(1)); expect(wrapped.child(1).child(1)).toBe(before.child(2));
    expect(wrapped.attrs).toEqual(before.attrs);
    expect(editor.state.selection).toMatchObject({ kind: 'range', anchor: backward ? 17 : 12, head: backward ? 12 : 17 });
    expect(undo(editor)).toBe(true); expect(editor.state.doc.eq(before)).toBe(true); expect(editor.state.selection.eq(selection)).toBe(true);
    expect(redo(editor)).toBe(true); expect(editor.state.doc.eq(wrapped)).toBe(true);
    expect(toggleQuote(editor)).toBe(true); expect(editor.state.doc.eq(before)).toBe(true); expect(editor.state.selection.eq(selection)).toBe(true);
  } finally { editor.destroy(); }
});

it.each(['bullet', 'ordered', 'task'] as const)('puts all selected blocks, including media, into %s list items and can unwrap them', kind => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: source });
  try {
    const before = editor.state.doc, selection = new RangeSelection(before, 16, 11);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    expect(toggleList(editor, kind)).toBe(true);
    const wrapped = editor.state.doc, list = wrapped.child(1);
    expect(list.type.name).toBe(`${kind}_list`);
    expect(list.childCount).toBe(2);
    expect(list.child(0).child(0)).toBe(before.child(1)); expect(list.child(1).child(0)).toBe(before.child(2));
    expect(wrapped.child(0)).toBe(before.child(0)); expect(wrapped.child(2)).toBe(before.child(3));
    expect(wrapped.attrs).toEqual(before.attrs);
    expect(editor.state.selection).toMatchObject({ kind: 'range', anchor: 20, head: 13 });
    expect(undo(editor)).toBe(true); expect(editor.state.doc.eq(before)).toBe(true); expect(editor.state.selection.eq(selection)).toBe(true);
    expect(redo(editor)).toBe(true); expect(editor.state.doc.eq(wrapped)).toBe(true);
    expect(toggleList(editor, kind)).toBe(true); expect(editor.state.doc.eq(before)).toBe(true); expect(editor.state.selection.eq(selection)).toBe(true);
  } finally { editor.destroy(); }
});

it.each(['quote', 'bullet'] as const)('excludes a following paragraph at its first text offset: %s', command => {
  const editor = createEditor({ schema: StarterKit.schema, content: source });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([1, 0], 2, [3, 0], 0)));
    expect(command === 'quote' ? toggleQuote(editor) : toggleList(editor, 'bullet')).toBe(true);
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(0)).toBe(before.child(0)); expect(editor.state.doc.child(2)).toBe(before.child(3));
    const wrapper = editor.state.doc.child(1);
    expect(wrapper.textContent).toBe(before.child(1).textContent + before.child(2).textContent);
    expect(command === 'quote' ? wrapper.child(1) : wrapper.child(1).child(0)).toBe(before.child(2));
  } finally { editor.destroy(); }
});

it('quotes a selected image while retaining its node selection, not a neighboring text projection', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: source });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(before, [2])));
    expect(toggleQuote(editor)).toBe(true);
    expect(editor.state.doc.child(2).type.name).toBe('blockquote');
    expect(editor.state.doc.child(2).child(0)).toBe(before.child(2));
    expect(editor.state.doc.child(1)).toBe(before.child(1)); expect(editor.state.doc.child(3)).toBe(before.child(3));
    expect(editor.state.selection).toMatchObject({ kind: 'node', nodePath: [2, 0] });
  } finally { editor.destroy(); }
});

it.each(['quote', 'bullet'] as const)('wraps an image-only structural range without formatting neighboring paragraphs: %s', command => {
  const editor = createEditor({ schema: StarterKit.schema, content: source });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(before, 14, 16)));
    expect(command === 'quote' ? toggleQuote(editor) : toggleList(editor, 'bullet')).toBe(true);
    const wrapper = editor.state.doc.child(2);
    expect(command === 'quote' ? wrapper.child(0) : wrapper.child(0).child(0)).toBe(before.child(2));
    expect(editor.state.doc.child(1)).toBe(before.child(1)); expect(editor.state.doc.child(3)).toBe(before.child(3));
    expect(editor.state.selection.kind).toBe('range');
  } finally { editor.destroy(); }
});

it.each(['quote', 'bullet'] as const)('supports Select all and preserves its selection kind: %s', command => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: source });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(before)));
    expect(command === 'quote' ? toggleQuote(editor) : toggleList(editor, 'bullet')).toBe(true);
    expect(editor.state.doc.childCount).toBe(1); expect(editor.state.selection.kind).toBe('all');
    expect(editor.state.doc.child(0).textContent).toBe(before.textContent);
    expect(undo(editor)).toBe(true); expect(editor.state.doc.eq(before)).toBe(true); expect(editor.state.selection.kind).toBe('all');
  } finally { editor.destroy(); }
});

it('quotes selected cell contents independently without changing the table rectangle', () => {
  const cell = (text: string): NodeJSON => ({ type: 'table_cell', content: [p(text)] });
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [p('Outside'),
    { type: 'table', content: [{ type: 'table_row', content: [cell('A'), cell('B'), cell('C')] }] }, p('After')] } });
  try {
    const before = editor.state.doc, selection = new CellSelection(before, [1, 0, 1], [1, 0, 0]);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    expect(toggleQuote(editor)).toBe(true);
    expect(editor.state.doc.child(1).child(0).content.map(node => node.child(0).type.name)).toEqual(['blockquote', 'blockquote', 'paragraph']);
    expect(editor.state.doc.child(1).child(0).child(2)).toBe(before.child(1).child(0).child(2));
    expect(editor.state.doc.child(0)).toBe(before.child(0)); expect(editor.state.doc.child(2)).toBe(before.child(2));
    expect(editor.state.selection.eq(selection)).toBe(true);
  } finally { editor.destroy(); }
});

it('preserves text positions instead of marking retained quote contents deleted', () => {
  let mapping: ReturnType<ReturnType<typeof createEditor>['createTransaction']>['mapping'] | undefined;
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [p('Before'), p('Left'), p('After')] },
    onUpdate: (_state, transaction) => { if (transaction.docChanged) mapping = transaction.mapping; } });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 2)));
    expect(toggleQuote(editor)).toBe(true);
    for (let index = 0; index < 3; index++) for (let offset = 0; offset <= before.child(index).textContent.length; offset++) {
      const oldPosition = textPointToPosition(before, [index, 0], offset);
      const path = index === 1 ? [1, 0, 0] : [index, 0];
      expect(mapping!.mapResult(oldPosition)).toMatchObject({ position: textPointToPosition(editor.state.doc, path, offset), deleted: false });
    }
  } finally { editor.destroy(); }
});

it.each(['quote', 'bullet'] as const)('returns a transaction-filter rejection without adding history: %s', command => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin(), new Plugin({ filterTransaction: transaction => !transaction.docChanged })], content: source });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 2)));
    expect(command === 'quote' ? toggleQuote(editor) : toggleList(editor, 'bullet')).toBe(false);
    expect(editor.state.doc).toBe(before); expect(canUndo(editor)).toBe(false);
  } finally { editor.destroy(); }
});
