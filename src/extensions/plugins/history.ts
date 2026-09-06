import { Editor, Node, Plugin, PluginKey, type AnySelection } from '../../core';

export interface HistorySnapshot {
  doc: Node;
  selection: AnySelection;
}

export interface HistoryState {
  done: readonly HistorySnapshot[];
  undone: readonly HistorySnapshot[];
  lastAddedAt?: number;
  lastGroup?: string;
  lastSelection?: AnySelection;
}

export interface HistoryOptions {
  /** Maximum number of local undo groups retained. Defaults to 100. */
  depth?: number;
  /** Maximum pause between adjacent input events in one undo group. Defaults to 500ms. */
  newGroupDelay?: number;
}

const HISTORY_ACTION = 'fountain$historyAction';
const HISTORY_GROUP = 'fountain$historyGroup';
const HISTORY_TIME = 'fountain$historyTime';
const CLOSE_HISTORY = 'fountain$closeHistory';
const PRESERVE_HISTORY_GROUP = 'fountain$preserveHistoryGroup';
export const historyKey = new PluginKey<HistoryState>('history');

function withoutOpenGroup(value: HistoryState): HistoryState {
  if (value.lastGroup === undefined && value.lastAddedAt === undefined && value.lastSelection === undefined) return value;
  return { done: value.done, undone: value.undone };
}

export function createHistoryPlugin(options: HistoryOptions = {}): Plugin<HistoryState> {
  const depth = options.depth ?? 100;
  const newGroupDelay = options.newGroupDelay ?? 500;
  if (!Number.isInteger(depth) || depth < 1) throw new RangeError('History depth must be a positive integer.');
  if (!Number.isFinite(newGroupDelay) || newGroupDelay < 0) throw new RangeError('History newGroupDelay must be zero or greater.');

  return new Plugin<HistoryState>({
    key: historyKey,
    state: {
      init: () => ({ done: [], undone: [] }),
      apply: (transaction, value, oldState) => {
        const action = transaction.getMeta<'undo' | 'redo'>(HISTORY_ACTION);
        const current = { doc: oldState.doc, selection: oldState.selection };
        if (action === 'undo') return { done: value.done.slice(0, -1), undone: [...value.undone, current] };
        if (action === 'redo') return { done: [...value.done, current].slice(-depth), undone: value.undone.slice(0, -1) };
        if (transaction.getMeta(CLOSE_HISTORY) === true) return withoutOpenGroup(value);
        if (transaction.getMeta(PRESERVE_HISTORY_GROUP) === true) return value;
        if (!transaction.docChanged || transaction.getMeta('addToHistory') === false) {
          return transaction.selectionSet || transaction.docChanged ? withoutOpenGroup(value) : value;
        }

        const group = transaction.getMeta<string>(HISTORY_GROUP);
        const addedAt = transaction.getMeta<number>(HISTORY_TIME) ?? Date.now();
        const joinsPrevious = group !== undefined
          && group === value.lastGroup
          && value.lastAddedAt !== undefined
          && addedAt - value.lastAddedAt <= newGroupDelay
          && value.lastSelection?.eq(oldState.selection) === true;
        return {
          done: joinsPrevious ? value.done : [...value.done, current].slice(-depth),
          undone: [],
          lastAddedAt: addedAt,
          lastGroup: group,
          lastSelection: transaction.selection,
        };
      },
    },
    props: {
      handleKeyDown: (editor, event) => {
        const modifier = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (!modifier || event.altKey || (key !== 'z' && key !== 'y')) return false;
        event.preventDefault();
        return key === 'y' || event.shiftKey ? redo(editor) : undo(editor);
      },
    },
  });
}

export const historyPlugin = createHistoryPlugin();

/** Starts a new undo group for the next document change. */
export function closeHistory(editor: Editor): boolean {
  editor.dispatch(editor.state.createTransaction().setMeta(CLOSE_HISTORY, true).setMeta('force', true));
  return true;
}

/** @internal Marks browser input transactions for adjacent-event grouping. */
export function setHistoryGroup(
  transaction: ReturnType<Editor['createTransaction']>,
  group: string,
  timestamp = Date.now(),
): void {
  transaction.setMeta(HISTORY_GROUP, group).setMeta(HISTORY_TIME, timestamp);
}

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
