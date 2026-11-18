import type { Editor } from './editor';
import type { AnySelection } from './selection';
import type { Transaction } from './transaction/transaction';

type ProjectSelection = (selection: AnySelection, transaction?: Transaction) => AnySelection | undefined;
const projections = new WeakMap<Editor, Set<ProjectSelection>>();

/** The DOM view supplies its directed selection for presence. Editing commands
 * continue to receive the model selection, including normalized text ranges. */
export function registerViewSelection(editor: Editor, project: ProjectSelection): () => void {
  let views = projections.get(editor);
  if (!views) {
    views = new Set();
    projections.set(editor, views);
  }
  views.add(project);
  return () => {
    views.delete(project);
    if (!views.size) projections.delete(editor);
  };
}

export function viewSelection(editor: Editor, selection = editor.state.selection, transaction?: Transaction): AnySelection {
  const views = projections.get(editor);
  if (views) {
    for (const project of views) {
      const directed = project(selection, transaction);
      if (directed) return directed;
    }
  }
  return selection;
}
