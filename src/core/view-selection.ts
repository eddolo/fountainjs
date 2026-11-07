import type { Editor } from './editor';
import type { AnySelection } from './selection';
import type { Transaction } from './transaction/transaction';

type ProjectSelection = (selection: AnySelection, transaction?: Transaction) => AnySelection;
const projections = new WeakMap<Editor, ProjectSelection>();

/** The DOM view supplies its directed selection for presence. Editing commands
 * continue to receive the model selection, including normalized text ranges. */
export function registerViewSelection(editor: Editor, project: ProjectSelection): () => void {
  projections.set(editor, project);
  return () => { if (projections.get(editor) === project) projections.delete(editor); };
}

export function viewSelection(editor: Editor, selection = editor.state.selection, transaction?: Transaction): AnySelection {
  return projections.get(editor)?.(selection, transaction) ?? selection;
}
