import { Editor, Node, Plugin, PluginKey, type AnySelection } from '../../core';

export interface HistorySnapshot {
  doc: Node;
  selection: AnySelection;
}

export interface HistoryState {
  done: readonly HistorySnapshot[];
  undone: readonly HistorySnapshot[];
}

const MAX_HISTORY_DEPTH = 100;
const HISTORY_ACTION = 'fountain$historyAction';
export const historyKey = new PluginKey<HistoryState>('history');

export const historyPlugin = new Plugin<HistoryState>({
  key: historyKey,
  state: {
    init: () => ({ done: [], undone: [] }),
    apply: (transaction, value, oldState) => {
      const action = transaction.getMeta<'undo' | 'redo'>(HISTORY_ACTION);
      const current = { doc: oldState.doc, selection: oldState.selection };
      if (action === 'undo') return { done: value.done.slice(0, -1), undone: [...value.undone, current] };
      if (action === 'redo') return { done: [...value.done, current].slice(-MAX_HISTORY_DEPTH), undone: value.undone.slice(0, -1) };
      if (!transaction.docChanged || transaction.getMeta('addToHistory') === false) return value;
      return { done: [...value.done, current].slice(-MAX_HISTORY_DEPTH), undone: [] };
    },
  },
  props: {
    handleKeyDown: (editor, event) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier || event.altKey || event.key.toLowerCase() !== 'z') return false;
      event.preventDefault();
      return event.shiftKey ? redo(editor) : undo(editor);
    },
  },
});

function restore(editor: Editor, snapshot: HistorySnapshot, action: 'undo' | 'redo'): boolean {
  const transaction = editor.state.createTransaction()
    .replace(0, editor.state.doc.childCount, snapshot.doc.content)
    .setSelection(snapshot.selection)
    .setMeta(HISTORY_ACTION, action)
    .setMeta('addToHistory', false);
  editor.dispatch(transaction);
  return true;
}

export function canUndo(editor: Editor): boolean { return (historyKey.get(editor.state)?.done.length ?? 0) > 0; }
export function canRedo(editor: Editor): boolean { return (historyKey.get(editor.state)?.undone.length ?? 0) > 0; }

export function undo(editor: Editor): boolean {
  const snapshot = historyKey.get(editor.state)?.done.at(-1);
  return snapshot ? restore(editor, snapshot, 'undo') : false;
}

export function redo(editor: Editor): boolean {
  const snapshot = historyKey.get(editor.state)?.undone.at(-1);
  return snapshot ? restore(editor, snapshot, 'redo') : false;
}
