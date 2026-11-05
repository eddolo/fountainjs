import { expect, it } from 'vitest';
import { AllSelection, CellSelection, Plugin, RangeSelection, Selection, StarterKit, canUndo, createCommandManager, createEditor, createHistoryPlugin, insertText, redo, setBlockType,
  setTextAlignment, setTextDirection, textPointToPosition, undo, type NodeJSON } from '../src';

const p = (text: string, attrs = {}): NodeJSON => ({ type: 'paragraph', attrs, content: [{ type: 'text', text }] });
const image: NodeJSON = { type: 'image_super', attrs: { src: '/figure.png', alt: 'Retained figure' } };
const source: NodeJSON = { type: 'doc', attrs: { audit: 'root' }, content: [p('Before'), p('Left'), image, p('After')] };

it('does not mark unchanged text positions deleted when changing their block type', () => {
  let mapping: ReturnType<ReturnType<typeof createEditor>['createTransaction']>['mapping'] | undefined;
  const editor = createEditor({ schema: StarterKit.schema, content: source,
    onUpdate: (_state, transaction) => { if (transaction.docChanged) mapping = transaction.mapping; } });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(before, 16, 11)));
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
    for (let position = 0; position <= before.nodeSize - 2; position++) {
      expect(mapping!.mapResult(position), `unchanged structural/text position ${position}`).toMatchObject({ position, deleted: false });
    }
  } finally { editor.destroy(); }
});

it.each([false, true])('formats only intersected text blocks and retains mixed-range direction (backward: %s)', backward => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: source });
  try {
    const before = editor.state.doc, from = textPointToPosition(before, [1, 0], 2), to = from + 5;
    const selection = new RangeSelection(before, backward ? to : from, backward ? from : to);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    expect(setTextAlignment(editor, 'center')).toBe(true);
    expect(editor.state.doc.child(0)).toBe(before.child(0));
    expect(editor.state.doc.child(1).attrs.align).toBe('center');
    expect(editor.state.doc.child(2)).toBe(before.child(2));
    expect(editor.state.doc.child(3)).toBe(before.child(3));
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(redo(editor)).toBe(true);
    expect(setTextDirection(editor, 'rtl')).toBe(true);
    expect(editor.state.doc.child(1).attrs.dir).toBe('rtl');
    expect(editor.state.doc.child(0)).toBe(before.child(0));
    expect(editor.state.doc.child(3)).toBe(before.child(3));
    expect(editor.state.doc.attrs).toEqual(before.attrs);
    expect(editor.state.selection.eq(selection)).toBe(true);
  } finally { editor.destroy(); }
});

it('uses the same exclusive end block for a legacy text range', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: source });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([1, 0], 2, [3, 0], 0)));
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('heading');
    expect(editor.state.doc.child(3)).toBe(before.child(3));
  } finally { editor.destroy(); }
});

it('supports heading conversion after Select all while preserving media and the semantic selection', () => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: source });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(before)));
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
    expect(editor.state.doc.content.map(node => node.type.name)).toEqual(['heading', 'heading', 'image_super', 'heading']);
    expect(editor.state.doc.child(2)).toBe(before.child(2));
    expect(editor.state.selection.kind).toBe('all');
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(editor.state.selection.kind).toBe('all');
  } finally { editor.destroy(); }
});

it('converts only the selected table cell rectangle and retains its direction and grid', () => {
  const cell = (text: string): NodeJSON => ({ type: 'table_cell', content: [p(text)] });
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: { type: 'doc', content: [
    p('Outside'), { type: 'table', content: [{ type: 'table_row', content: [cell('A'), cell('B'), cell('C')] }] }, p('After'),
  ] } });
  try {
    const before = editor.state.doc;
    const selection = new CellSelection(before, [1, 0, 1], [1, 0, 0]);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    expect(setBlockType(editor, 'heading', { level: 3 })).toBe(true);
    expect(editor.state.doc.child(1).child(0).content.map(node => node.child(0).type.name)).toEqual(['heading', 'heading', 'paragraph']);
    expect(editor.state.doc.child(1).child(0).child(2)).toBe(before.child(1).child(0).child(2));
    expect(editor.state.doc.child(0)).toBe(before.child(0));
    expect(editor.state.doc.child(2)).toBe(before.child(2));
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(editor.state.selection.eq(selection)).toBe(true);
  } finally { editor.destroy(); }
});

it('retains portable identity and compatible custom attributes through legacy block conversion', () => {
  const spec = { ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes,
    paragraph: { ...StarterKit.schema.nodes.paragraph!, attrs: { ...StarterKit.schema.nodes.paragraph!.attrs, owner: { default: '' } } },
    heading: { ...StarterKit.schema.nodes.heading!, attrs: { ...StarterKit.schema.nodes.heading!.attrs, owner: { default: '' } } },
  } };
  const editor = createEditor({ schema: spec, content: { type: 'doc', content: [p('Identified', {
    nodeId: 'stable-default', customIdentity: 'stable-host', owner: 'Ada', audit: { tag: 'preserve' },
  })] } });
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
    expect(setBlockType(editor, 'heading', { level: 3 })).toBe(true);
    expect(editor.state.doc.child(0).attrs).toMatchObject({ nodeId: 'stable-default', customIdentity: 'stable-host', owner: 'Ada', audit: { tag: 'preserve' } });
    expect(setBlockType(editor, 'paragraph')).toBe(true);
    expect(editor.state.doc.child(0).attrs).not.toHaveProperty('level');
    expect(editor.state.doc.child(0).attrs).toMatchObject({ nodeId: 'stable-default', customIdentity: 'stable-host', owner: 'Ada', audit: { tag: 'preserve' } });
  } finally { editor.destroy(); }
});

it('supports a dry run and one undoable chain without modifying outside blocks or the directed range', () => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: source });
  try {
    const before = editor.state.doc, selection = new RangeSelection(before, 16, 11);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    const commands = createCommandManager(editor, { setBlockType, setTextAlignment, setTextDirection });
    expect(commands.can().chain().setBlockType('heading', { level: 2 }).setTextAlignment('center').setTextDirection('rtl').run()).toBe(true);
    expect(editor.state.doc).toBe(before);
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(commands.chain().setBlockType('heading', { level: 2 }).setTextAlignment('center').setTextDirection('rtl').run()).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('heading');
    expect(editor.state.doc.child(1).attrs).toMatchObject({ level: 2, align: 'center', dir: 'rtl' });
    expect(editor.state.doc.child(0)).toBe(before.child(0));
    expect(editor.state.doc.child(3)).toBe(before.child(3));
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(editor.state.selection.eq(selection)).toBe(true);
  } finally { editor.destroy(); }
});

it('does not format neighboring text through an image-only range', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: source });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(before, 14, 16)));
    expect(setTextAlignment(editor, 'center')).toBe(false);
    expect(setTextDirection(editor, 'rtl')).toBe(false);
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(false);
    expect(editor.state.doc).toBe(before);
  } finally { editor.destroy(); }
});

it.each([false, true])('changes selected text blocks to headings without converting media or outside text (backward: %s)', backward => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: source });
  try {
    const before = editor.state.doc, from = textPointToPosition(before, [1, 0], 2), to = 16;
    const selection = new RangeSelection(before, backward ? to : from, backward ? from : to);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('heading');
    expect(editor.state.doc.child(1).attrs.level).toBe(2);
    expect(editor.state.doc.child(1).textContent).toBe('Left');
    expect(editor.state.doc.child(0)).toBe(before.child(0));
    expect(editor.state.doc.child(2)).toBe(before.child(2));
    expect(editor.state.doc.child(3)).toBe(before.child(3));
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(editor.state.selection.eq(selection)).toBe(true);
  } finally { editor.destroy(); }
});

it('formats selected empty paragraphs even when the range has no text projection', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [p('Before'),
    { type: 'paragraph', attrs: { id: 'empty', align: 'right' } }, image, p('After')] } });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(before, 8, 12)));
    expect((editor.state.selection as RangeSelection).textSelection).toBeNull();
    expect(setBlockType(editor, 'heading', { level: 3 })).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('heading');
    expect(editor.state.doc.child(1).attrs.id).toBe('empty');
    expect(editor.state.doc.child(1).childCount).toBe(0);
    expect(setTextAlignment(editor, 'center')).toBe(true);
    expect(editor.state.doc.child(1).attrs.align).toBe('center');
    expect(editor.state.doc.child(0)).toBe(before.child(0));
    expect(editor.state.doc.child(2)).toBe(before.child(2));
    expect(editor.state.doc.child(3)).toBe(before.child(3));
  } finally { editor.destroy(); }
});

it('does not include the next paragraph when the range ends at its first text offset', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: source });
  try {
    const before = editor.state.doc, to = textPointToPosition(before, [3, 0], 0);
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(before, 8, to)));
    expect(setTextAlignment(editor, 'right')).toBe(true);
    expect(editor.state.doc.child(1).attrs.align).toBe('right');
    expect(editor.state.doc.child(3)).toBe(before.child(3));
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('heading');
    expect(editor.state.doc.child(3)).toBe(before.child(3));
  } finally { editor.destroy(); }
});

it.each(['readonly', 'filtered'] as const)('rejects a heading conversion without changing selection, document or history: %s', mode => {
  const editor = createEditor({ schema: StarterKit.schema, content: source, editable: mode !== 'readonly',
    plugins: [createHistoryPlugin(), ...(mode === 'filtered' ? [new Plugin({ filterTransaction: transaction => !transaction.docChanged })] : [])] });
  try {
    const before = editor.state.doc, selection = new RangeSelection(before, 16, 11);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(false);
    expect(editor.state.doc).toBe(before);
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(canUndo(editor)).toBe(false);
  } finally { editor.destroy(); }
});

it('rolls back all selected conversions when a later parent requires paragraphs', () => {
  const spec = { ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes,
    pair: { group: 'block', content: 'paragraph paragraph' },
  } };
  const editor = createEditor({ schema: spec, plugins: [createHistoryPlugin()], content: { type: 'doc', content: [
    p('First'), { type: 'pair', content: [p('Required one'), p('Required two')] }, p('Last'),
  ] } });
  try {
    const before = editor.state.doc, selection = new AllSelection(before);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(false);
    expect(editor.state.doc).toBe(before);
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(canUndo(editor)).toBe(false);
  } finally { editor.destroy(); }
});

it('validates the completed conversion rather than rejecting a temporary mixed container', () => {
  const spec = { ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes,
    homogeneous: { group: 'block', content: 'paragraph+ | heading+' },
  } };
  const editor = createEditor({ schema: spec, content: { type: 'doc', content: [
    { type: 'homogeneous', content: [p('One'), p('Two')] },
  ] } });
  try {
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
    expect(editor.state.doc.child(0).content.map(node => node.type.name)).toEqual(['heading', 'heading']);
    editor.state.schema.validate(editor.state.doc);
  } finally { editor.destroy(); }
});

it('replays heading conversion after a text edit in one command batch', () => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: source });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 2)));
    expect(editor.runCommandBatch(() => insertText(editor, 'X') && setBlockType(editor, 'heading', { level: 2 }))).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('heading');
    expect(editor.state.doc.child(1).textContent).toBe('LeXft');
    expect(editor.state.doc.child(1).attrs).toEqual({ ...before.child(1).attrs, level: 2 });
    expect(editor.state.doc.child(0)).toBe(before.child(0));
    expect(editor.state.doc.child(2)).toBe(before.child(2));
    expect(editor.state.doc.child(3)).toBe(before.child(3));
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
  } finally { editor.destroy(); }
});

it('keeps code and media while converting nested list and quote paragraphs', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [
    { type: 'bullet_list', content: [{ type: 'list_item', content: [p('Item')] }] },
    { type: 'blockquote', content: [p('Quoted'), image] },
    { type: 'code_block', attrs: { language: 'python' }, content: [{ type: 'text', text: 'x = 1' }] },
  ] } });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(before)));
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
    expect(editor.state.doc.child(0).child(0).child(0).type.name).toBe('heading');
    expect(editor.state.doc.child(1).child(0).type.name).toBe('heading');
    expect(editor.state.doc.child(1).child(1)).toBe(before.child(1).child(1));
    expect(editor.state.doc.child(2)).toBe(before.child(2));
    editor.state.schema.validate(editor.state.doc);
  } finally { editor.destroy(); }
});
