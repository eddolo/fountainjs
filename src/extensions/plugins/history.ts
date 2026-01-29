import { Plugin, Transaction, EditorState } from '../../core';
const MAX_HISTORY_DEPTH = 100;
interface HistoryState { done: Transaction[]; undone: Transaction[]; }
function initHistoryState(): HistoryState { return { done: [], undone: [] }; }
export const historyPlugin = new Plugin({
  state: {
    init: initHistoryState,
    apply: (tr, value: HistoryState): HistoryState => { if (tr.steps.length > 0) { const newDone = [...value.done, tr]; if (newDone.length > MAX_HISTORY_DEPTH) { newDone.shift(); } return { done: newDone, undone: [] }; } return value; },
  },
});
export function undo(state: EditorState): boolean { console.log('Undo command called (not implemented)'); return false; }
export function redo(state: EditorState): boolean { console.log('Redo command called (not implemented)'); return false; }