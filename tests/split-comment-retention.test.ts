import { expect, it } from 'vitest';
import { CoreExtension, Selection, composeExtensions, createEditor, createHistoryPlugin,
  redo, splitBlock, undo } from '../src';
import { InMemoryCommentsStore, createCommentsExtension, createCommentThread, getCommentsState } from '../src/comments';

it.each([[1, 3, 'l\np'], [2, 4, 'ph'], [0, 2, 'Al'], [3, 5, 'ha']] as const)(
  'retains a comment over offsets %s..%s through split and history', async (from, to, splitQuote) => {
    const store = new InMemoryCommentsStore();
    const kit = composeExtensions([CoreExtension, createCommentsExtension({
      adapter: () => store.createAdapter(), user: { id: 'ada', name: 'Ada' },
    })]);
    const editor = createEditor({ schema: kit.schema, plugins: [...kit.plugins, createHistoryPlugin()],
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }] } });
    try {
      editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], from, [0, 0], to)));
      const thread = await createCommentThread(editor, { content: 'Keep this exact text.' });
      const initial = thread.anchor;
      const anchor = () => getCommentsState(editor)!.threads.find(item => item.id === thread.id)!.anchor;
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
      expect(splitBlock(editor)).toBe(true);
      await Promise.resolve();
      expect(anchor()).toMatchObject({ status: 'attached', quote: splitQuote });
      const splitAnchor = anchor();
      expect(undo(editor)).toBe(true);
      await Promise.resolve();
      expect(anchor()).toEqual(initial);
      expect(redo(editor)).toBe(true);
      await Promise.resolve();
      expect(anchor()).toEqual(splitAnchor);
    } finally { editor.destroy(); }
  });
