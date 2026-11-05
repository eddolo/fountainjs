import { expect, it } from 'vitest';
import { CoreExtension, Plugin, ReplaceDocumentStep, Selection, StarterKit, StepMap, canRedo, canUndo,
  composeExtensions, createEditor, createHistoryPlugin, redo, splitBlock, undo, type Node } from '../src';
import { InMemoryCommentsStore, createCommentsExtension, createCommentThread, getCommentsState } from '../src/comments';

async function commentedEditor(extraPlugins: Plugin[] = []) {
  const store = new InMemoryCommentsStore();
  const kit = composeExtensions([CoreExtension, createCommentsExtension({
    adapter: () => store.createAdapter(), user: { id: 'ada', name: 'Ada' },
  })]);
  const editor = createEditor({ schema: kit.schema, plugins: [...kit.plugins, createHistoryPlugin(), ...extraPlugins],
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }] } });
  editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 1, [0, 0], 3)));
  const thread = await createCommentThread(editor, { content: 'Retain the exact range.' });
  const anchor = () => getCommentsState(editor)!.threads.find(item => item.id === thread.id)!.anchor;
  return { editor, anchor, initial: thread.anchor };
}

it('uses all maps of an indivisible step, including association at a deletion/insertion boundary', () => {
  const editor = createEditor({ schema: StarterKit.schema,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }] } });
  try {
    const before = editor.state.doc;
    const after = before.copy([before.child(0).copy([editor.state.schema.text('AZZpha')])]);
    const maps = [new StepMap([2, 1, 0]), new StepMap([2, 0, 2])];
    class CompoundStep extends ReplaceDocumentStep { override getMaps() { return maps; } }
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 1)));
    const transaction = editor.createTransaction().step(new CompoundStep(after));
    expect(transaction.mapping.maps).toEqual(maps);
    expect(transaction.mapping.map(2, -1)).toBe(2); expect(transaction.mapping.map(2, 1)).toBe(4);
    expect(transaction.selection).toEqual(Selection.cursor([0, 0], 3));
    expect(editor.dispatch(transaction)).toBe(true); expect(editor.state.doc.textContent).toBe('AZZpha');
  } finally { editor.destroy(); }
});

it('retains anchors through grouped typing and its multi-map undo/redo', async () => {
  const { editor, anchor, initial } = await commentedEditor();
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    for (let i = 0; i < 2; i++) editor.dispatch(editor.createTransaction().insertText([0, 0], i, 'Z')
      .setMeta('fountain$historyGroup', 'typing').setMeta('fountain$historyTime', i));
    await Promise.resolve();
    const typed = anchor(); expect(typed).toMatchObject({ status: 'attached', quote: 'lp' });
    expect(undo(editor)).toBe(true); await Promise.resolve();
    expect(editor.state.doc.textContent).toBe('Alpha'); expect(anchor()).toEqual(initial); expect(canUndo(editor)).toBe(false);
    expect(redo(editor)).toBe(true); await Promise.resolve();
    expect(editor.state.doc.textContent).toBe('ZZAlpha'); expect(anchor()).toEqual(typed);
  } finally { editor.destroy(); }
});

it.each([['addToHistory', true], ['fountain$preserveHistoryGroup', false]] as const)(
  'keeps the requested history ownership of a following change (%s)', async (meta, independent) => {
    const { editor, anchor, initial } = await commentedEditor();
    try {
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
      expect(splitBlock(editor)).toBe(true);
      editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'B').setMeta(meta, meta !== 'addToHistory'));
      await Promise.resolve();
      const changed = anchor(); expect(changed).toMatchObject({ status: 'attached', quote: 'l\np' });
      expect(undo(editor)).toBe(true); await Promise.resolve();
      expect(editor.state.doc.textContent).toBe(independent ? 'BAlpha' : 'Alpha');
      if (independent) expect(anchor()).toMatchObject({ status: 'attached', quote: 'lp', from: initial.from! + 1, to: initial.to! + 1 });
      else expect(anchor()).toEqual(initial);
      expect(redo(editor)).toBe(true); await Promise.resolve();
      expect(editor.state.doc.content.map(node => node.textContent)).toEqual(['BAl', 'pha']); expect(anchor()).toEqual(changed);
    } finally { editor.destroy(); }
  });

it('keeps redo maps valid after an unrecorded change to the undone document', async () => {
  const { editor, anchor } = await commentedEditor();
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(splitBlock(editor)).toBe(true); await Promise.resolve(); const split = anchor();
    expect(undo(editor)).toBe(true);
    editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'B').setMeta('addToHistory', false));
    await Promise.resolve(); const changed = anchor();
    expect(redo(editor)).toBe(true); await Promise.resolve();
    expect(editor.state.doc.content.map(node => node.textContent)).toEqual(['BAl', 'pha']);
    expect(anchor()).toMatchObject({ status: 'attached', quote: split.quote, from: split.from! + 1, to: split.to! + 1 });
    expect(undo(editor)).toBe(true); await Promise.resolve();
    expect(editor.state.doc.textContent).toBe('BAlpha'); expect(anchor()).toEqual(changed);
  } finally { editor.destroy(); }
});

it('returns a filtered history restoration without consuming its undo entry', async () => {
  let rejectHistory = false;
  const { editor, anchor } = await commentedEditor([new Plugin({
    filterTransaction: transaction => !(rejectHistory && transaction.getMeta('fountain$historyAction')),
  })]);
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(splitBlock(editor)).toBe(true); await Promise.resolve();
    const before = editor.state.doc, originalAnchor = anchor(); rejectHistory = true;
    expect(undo(editor)).toBe(false); expect(editor.state.doc).toBe(before); expect(anchor()).toEqual(originalAnchor);
    expect(canUndo(editor)).toBe(true); expect(canRedo(editor)).toBe(false);
  } finally { editor.destroy(); }
});

it('undoes a long typing group without recursive map-chain traversal or losing the comment', async () => {
  const { editor, anchor, initial } = await commentedEditor();
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    for (let i = 0; i < 2000; i++) editor.dispatch(editor.createTransaction().insertText([0, 0], i, 'Z')
      .setMeta('fountain$historyGroup', 'typing').setMeta('fountain$historyTime', i));
    expect(editor.state.doc.textContent.length).toBe(2005);
    expect(undo(editor)).toBe(true); await Promise.resolve();
    expect(editor.state.doc.textContent).toBe('Alpha'); expect(anchor()).toEqual(initial); expect(canUndo(editor)).toBe(false);
  } finally { editor.destroy(); }
});

it('keeps custom steps that implement only the original apply/getMap contract compatible', () => {
  const editor = createEditor({ schema: StarterKit.schema,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }] } });
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    const transaction = editor.createTransaction().step({
      apply: (doc: Node) => doc.copy([doc.child(0).copy([editor.state.schema.text('ZAlpha')])]),
      getMap: () => new StepMap([1, 0, 1]),
    });
    expect(editor.dispatch(transaction)).toBe(true);
    expect(editor.state.doc.textContent).toBe('ZAlpha'); expect(editor.state.selection).toEqual(Selection.cursor([0, 0], 1));
  } finally { editor.destroy(); }
});

it('replays the exact history map sequence when undo and redo run in command batches', async () => {
  const { editor, anchor, initial } = await commentedEditor();
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(splitBlock(editor)).toBe(true); await Promise.resolve(); const split = anchor();
    expect(editor.runCommandBatch(() => undo(editor))).toBe(true); await Promise.resolve(); expect(anchor()).toEqual(initial);
    expect(editor.runCommandBatch(() => redo(editor))).toBe(true); await Promise.resolve(); expect(anchor()).toEqual(split);
  } finally { editor.destroy(); }
});

it.each([
  { path: [0, 0], offset: 0, undoText: 'BAlpha', redoText: ['BAl', 'pha'], quote: 'lp' },
  { path: [0, 0], offset: 2, undoText: 'AlBpha', redoText: ['AlB', 'pha'], quote: 'lBp' },
  { path: [1, 0], offset: 0, undoText: 'AlBpha', redoText: ['Al', 'Bpha'], quote: 'lBp' },
  { path: [1, 0], offset: 1, undoText: 'AlpBha', redoText: ['Al', 'pBha'], quote: 'lp' },
  { path: [1, 0], offset: 3, undoText: 'AlphaB', redoText: ['Al', 'phaB'], quote: 'lp' },
])('preserves an independent insertion at $path:$offset on its original side of the split', async entry => {
  const { editor, anchor } = await commentedEditor();
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(splitBlock(editor)).toBe(true);
    editor.dispatch(editor.createTransaction().insertText(entry.path, entry.offset, 'B').setMeta('addToHistory', false));
    await Promise.resolve(); const changed = anchor();
    expect(undo(editor)).toBe(true); await Promise.resolve();
    expect(editor.state.doc.textContent).toBe(entry.undoText); expect(anchor()).toMatchObject({ status: 'attached', quote: entry.quote });
    expect(redo(editor)).toBe(true); await Promise.resolve();
    expect(editor.state.doc.content.map(node => node.textContent)).toEqual(entry.redoText); expect(anchor()).toEqual(changed);
  } finally { editor.destroy(); }
});

it('retains independent text through every entry of a multi-command undo/redo history', async () => {
  const { editor, anchor } = await commentedEditor();
  try {
    editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'T'));
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
    expect(splitBlock(editor)).toBe(true);
    editor.dispatch(editor.createTransaction().insertText([1, 0], 1, 'B').setMeta('addToHistory', false));
    expect(undo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('TAlpBha');
    expect(undo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('AlpBha');
    expect(redo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('TAlpBha');
    expect(redo(editor)).toBe(true); await Promise.resolve();
    expect(editor.state.doc.content.map(node => node.textContent)).toEqual(['TAl', 'pBha']);
    expect(anchor()).toMatchObject({ status: 'attached' });
  } finally { editor.destroy(); }
});

it('keeps independent text inserted inside the original command insertion when that command is undone', async () => {
  const { editor } = await commentedEditor();
  try {
    editor.dispatch(editor.createTransaction().insertText([0, 0], 2, 'ZZ'));
    editor.dispatch(editor.createTransaction().insertText([0, 0], 3, 'B').setMeta('addToHistory', false));
    expect(undo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('AlBpha');
    expect(redo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('AlZBZpha');
  } finally { editor.destroy(); }
});

it('rebases every independent insertion in one transaction without mixing their coordinates', async () => {
  const { editor } = await commentedEditor();
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(splitBlock(editor)).toBe(true);
    editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'B').insertText([1, 0], 1, 'C').setMeta('addToHistory', false));
    expect(undo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('BAlpCha');
    expect(redo(editor)).toBe(true); expect(editor.state.doc.content.map(node => node.textContent)).toEqual(['BAl', 'pCha']);
  } finally { editor.destroy(); }
});

it('preserves an independent deletion when undoing an earlier split', async () => {
  const { editor } = await commentedEditor();
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(splitBlock(editor)).toBe(true);
    editor.dispatch(editor.createTransaction().replaceText([1, 0], 0, 1, '').setMeta('addToHistory', false));
    expect(undo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('Alha');
    expect(redo(editor)).toBe(true); expect(editor.state.doc.content.map(node => node.textContent)).toEqual(['Al', 'ha']);
  } finally { editor.destroy(); }
});

it.each([
  { from: 0, to: 1, replacement: '', expected: 'Alha', split: ['Al', 'ha'] },
  { from: 1, to: 3, replacement: '', expected: 'Alp', split: ['Al', 'p'] },
  { from: 0, to: 3, replacement: '', expected: 'Al', split: ['Al', ''] },
  { from: 0, to: 1, replacement: 'BB', expected: 'AlBBha', split: ['Al', 'BBha'] },
  { from: 0, to: 3, replacement: 'BB', expected: 'AlBB', split: ['Al', 'BB'] },
])('retains independent replacement $from:$to:$replacement through split undo and redo', async entry => {
  const { editor } = await commentedEditor();
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(splitBlock(editor)).toBe(true);
    editor.dispatch(editor.createTransaction().replaceText([1, 0], entry.from, entry.to, entry.replacement).setMeta('addToHistory', false));
    expect(undo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe(entry.expected);
    expect(redo(editor)).toBe(true); expect(editor.state.doc.content.map(node => node.textContent)).toEqual(entry.split);
  } finally { editor.destroy(); }
});

it('keeps independent deletion on the correct side of a split when it occurs after undo', async () => {
  const { editor } = await commentedEditor();
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(splitBlock(editor)).toBe(true); expect(undo(editor)).toBe(true);
    editor.dispatch(editor.createTransaction().replaceText([0, 0], 1, 4, '').setMeta('addToHistory', false));
    expect(redo(editor)).toBe(true); expect(editor.state.doc.content.map(node => node.textContent)).toEqual(['A', 'a']);
    expect(undo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('Aa');
  } finally { editor.destroy(); }
});

it('retains independent replacements through multiple history entries and mixed-step coordinates', async () => {
  const { editor } = await commentedEditor();
  try {
    editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'T'));
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
    expect(splitBlock(editor)).toBe(true);
    editor.dispatch(editor.createTransaction().replaceText([1, 0], 0, 1, 'BB').replaceText([0, 0], 0, 1, '').setMeta('addToHistory', false));
    expect(undo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('AlBBha');
    expect(undo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('AlBBha');
    expect(redo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('AlBBha');
    expect(redo(editor)).toBe(true); expect(editor.state.doc.content.map(node => node.textContent)).toEqual(['Al', 'BBha']);
  } finally { editor.destroy(); }
});

it('retains original identity for every small independent deletion overlapping an earlier text replacement', () => {
  const original = ['a', 'b', 'c', 'd', 'e'];
  for (let from = 0; from <= original.length; from++) for (let to = from; to <= original.length; to++) {
    for (const insertion of ['', 'P', 'PQ']) {
      if (from === to && !insertion) continue;
      const local = [...original.slice(0, from), ...insertion, ...original.slice(to)];
      for (let left = 0; left < local.length; left++) for (let right = left + 1; right <= local.length; right++) {
        const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: {
          type: 'doc', attrs: { audit: 'root retained' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: original.join('') }] }],
        } });
        try {
          editor.dispatch(editor.createTransaction().replaceText([0, 0], from, to, insertion));
          editor.dispatch(editor.createTransaction().replaceText([0, 0], left, right, '').setMeta('addToHistory', false));
          const erased = new Set(local.slice(left, right));
          expect(undo(editor)).toBe(true);
          expect(editor.state.doc.textContent).toBe(original.filter(token => !erased.has(token)).join(''));
          expect(editor.state.doc.attrs.audit).toBe('root retained');
          expect(redo(editor)).toBe(true);
          expect(editor.state.doc.textContent).toBe([...local.slice(0, left), ...local.slice(right)].join(''));
        } finally { editor.destroy(); }
      }
    }
  }
});
