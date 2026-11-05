import { expect, it } from 'vitest';
import { AllSelection, CoreSchemaSpec, GapSelection, Plugin, RangeSelection, StarterKit, createEditor, createHistoryPlugin, deleteBackward, deleteForward,
  deleteSelection, insertDocument, insertHardBreak, insertPlainText, insertText, redo, splitBlock, toggleMark, undo,
  type DOMOutputSpec, type NodeJSON } from '../src';

const p = (text: string): NodeJSON => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const image: NodeJSON = { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure' } };

it.each([false, true])('replaces a directed partial-text-to-image range in one undoable edit (backward: %s)', backward => {
  const updates: unknown[] = [];
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()],
    content: { type: 'doc', attrs: { audit: { id: 'root' } }, content: [p('Left'), image] },
    onUpdate: (_state, transaction) => { if (transaction.docChanged) updates.push(transaction); },
  });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(before, backward ? 8 : 3, backward ? 3 : 8)));
    expect(insertText(editor, 'X')).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).textContent).toBe('LeX');
    expect(editor.state.doc.attrs).toEqual(before.attrs);
    expect(editor.state.selection).toMatchObject({ kind: 'text', path: [0, 0], from: 3, to: 3 });
    expect(updates).toHaveLength(1);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(editor.state.selection).toMatchObject({ kind: 'range', anchor: backward ? 8 : 3, head: backward ? 3 : 8, backward });
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.child(0).textContent).toBe('LeX');
  } finally { editor.destroy(); }
});

it.each([deleteSelection, deleteBackward, deleteForward])('deletes a noncollapsed mixed range through %s', command => {
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [p('Left'), image] } });
  try {
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(editor.state.doc, 3, 8)));
    expect(command(editor)).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).textContent).toBe('Le');
  } finally { editor.destroy(); }
});

it.each([false, true])('pastes rich content over a whole-image range in one transaction (multi-block: %s)', multi => {
  let documentUpdates = 0;
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: { type: 'doc', content: [image, image] },
    onUpdate: (_state, transaction) => { if (transaction.docChanged) documentUpdates += 1; },
  });
  try {
    const before = editor.state.doc;
    const pasted = editor.state.schema.nodeFromJSON({ type: 'doc', content: multi
      ? [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Pasted title' }] }, p('Pasted body')]
      : [{ type: 'paragraph', content: [{ type: 'text', text: 'Rich', marks: [{ type: 'strong' }] }] }],
    });
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(before, 4, 0)));
    expect(insertDocument(editor, pasted)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(pasted.toJSON());
    expect(documentUpdates).toBe(1);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(editor.state.selection).toMatchObject({ kind: 'range', anchor: 4, head: 0 });
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(pasted.toJSON());
  } finally { editor.destroy(); }
});

it('rolls back the complete rich paste when the final batch is rejected', () => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin(), new Plugin({
    filterTransaction: transaction => !transaction.doc.textContent.includes('BLOCKED'),
  })], content: { type: 'doc', content: [image, image] } });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(before, 0, 4)));
    const pasted = editor.state.schema.nodeFromJSON({ type: 'doc', content: [p('BLOCKED')] });
    expect(insertDocument(editor, pasted)).toBe(false);
    expect(editor.state.doc).toBe(before);
    expect(editor.state.selection).toMatchObject({ kind: 'range', anchor: 0, head: 4 });
    expect(undo(editor)).toBe(false);
  } finally { editor.destroy(); }
});

const inlineSpec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
  chip: { inline: true, group: 'inline', atom: true, toDOM: (): DOMOutputSpec => ['span', { contenteditable: 'false' }, 'Chip'] },
} };

it('types at an inline structural caret with explicit stored marks', () => {
  const editor = createEditor({ schema: inlineSpec, plugins: [createHistoryPlugin()], content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'chip' }, { type: 'chip' }] }] } });
  try {
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(editor.state.doc, 3, 3)));
    expect(toggleMark(editor, 'strong')).toBe(true);
    expect(insertText(editor, 'X')).toBe(true);
    expect(editor.state.doc.child(0).content.map(node => [node.type.name, node.text, node.marks.map(mark => mark.type.name)]))
      .toEqual([['chip', undefined, []], ['text', 'X', ['strong']], ['chip', undefined, []]]);
    expect(editor.state.selection).toMatchObject({ kind: 'text', path: [0, 1], from: 1 });
  } finally { editor.destroy(); }
});

it.each([deleteBackward, deleteForward])('deletes an adjacent inline atom at a structural caret using %s', command => {
  const editor = createEditor({ schema: inlineSpec, plugins: [createHistoryPlugin()], content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'chip' }, { type: 'chip' }] }] } });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(before, 3, 3)));
    expect(command(editor)).toBe(true);
    expect(editor.state.doc.child(0).content.filter(node => node.type.name === 'chip')).toHaveLength(1);
    expect(editor.state.selection.kind).toBe('text');
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(editor.state.selection).toMatchObject({ kind: 'range', anchor: 3, head: 3 });
  } finally { editor.destroy(); }
});

it.each([splitBlock, insertHardBreak])('replaces a mixed selection before inserting a line boundary using %s', command => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: { type: 'doc', content: [p('Left'), image] } });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(before, 3, 8)));
    expect(command(editor)).toBe(true);
    expect(editor.state.doc.textContent).toContain('Le');
    expect(editor.state.doc.content.some(node => node.type.name === 'image_super')).toBe(false);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
  } finally { editor.destroy(); }
});

it('replaces an image-only range with a hard break in one undoable edit', () => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: { type: 'doc', content: [image, image] } });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(before, 0, 4)));
    expect(insertHardBreak(editor)).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).type.name).toBe('paragraph');
    expect(editor.state.doc.child(0).child(0).type.name).toBe('hard_break');
    expect(editor.state.selection.kind).toBe('text');
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(editor.state.selection).toMatchObject({ kind: 'range', anchor: 0, head: 4 });
  } finally { editor.destroy(); }
});

it('inserts a hard break at a gap after media without deleting the media', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [image] } });
  try {
    const before = editor.state.doc.child(0);
    editor.dispatch(editor.createTransaction().setSelection(new GapSelection(editor.state.doc, 2)));
    expect(insertHardBreak(editor)).toBe(true);
    expect(editor.state.doc.child(0)).toBe(before);
    expect(editor.state.doc.child(1).child(0).type.name).toBe('hard_break');
  } finally { editor.destroy(); }
});

it('inserts multiline plain text over a structural range without extra empty filler blocks', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [image, image] } });
  try {
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(editor.state.doc, 0, 4)));
    expect(insertPlainText(editor, 'First\r\nSecond')).toBe(true);
    expect(editor.state.doc.content.map(node => node.textContent)).toEqual(['First', 'Second']);
  } finally { editor.destroy(); }
});

it('leaves a safe insertion gap after pasting a leaf block into an empty paragraph', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [p('')] } });
  try {
    const fragment = editor.state.schema.nodeFromJSON({ type: 'doc', content: [image] });
    expect(insertDocument(editor, fragment)).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.selection.kind).toBe('gap');
    expect(insertText(editor, 'After')).toBe(true);
    expect(editor.state.doc.content.map(node => node.type.name)).toEqual(['image_super', 'paragraph']);
    expect(editor.state.doc.child(0)).toBe(fragment.child(0));
    expect(editor.state.doc.child(1).textContent).toBe('After');
  } finally { editor.destroy(); }
});

it.each(['range', 'all', 'gap'])('keeps pasted terminal media intact when typing after a %s paste', kind => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()],
    content: { type: 'doc', content: [p('Left'), image] } });
  try {
    const doc = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(kind === 'range' ? new RangeSelection(doc, 0, 8)
      : kind === 'all' ? new AllSelection(doc) : new GapSelection(doc, 8)));
    const fragment = editor.state.schema.nodeFromJSON({ type: 'doc', content: [p('ft'), image] });
    expect(insertDocument(editor, fragment)).toBe(true);
    expect(editor.state.selection.kind).toBe('gap');
    const pasted = editor.getJSON();
    expect(insertText(editor, 'After')).toBe(true);
    expect(editor.state.doc.content.map(node => node.type.name)).toEqual(kind === 'gap'
      ? ['paragraph', 'image_super', 'paragraph', 'image_super', 'paragraph'] : ['paragraph', 'image_super', 'paragraph']);
    expect(editor.state.doc.child(editor.state.doc.childCount - 2)).toBe(fragment.child(1));
    expect(editor.state.doc.content.at(-1)?.textContent).toBe('After');
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(pasted);
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.content.at(-1)?.textContent).toBe('After');
  } finally { editor.destroy(); }
});

it('keeps a read-only structural range intact when mutation commands are attempted', () => {
  const editor = createEditor({ schema: StarterKit.schema, editable: false, content: { type: 'doc', content: [p('Left'), image] } });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(before, 3, 8)));
    expect(insertText(editor, 'X')).toBe(false);
    expect(deleteSelection(editor)).toBe(false);
    expect(insertDocument(editor, editor.state.schema.nodeFromJSON({ type: 'doc', content: [p('No')] }))).toBe(false);
    expect(editor.state.doc).toBe(before);
  } finally { editor.destroy(); }
});
