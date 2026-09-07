import type { Node } from './schema';
import { Selection } from './selection';
import { comparePaths, getNodeAtPath } from './transaction/path';

/** Choose the first selected text run, not an equivalent preceding end boundary. */
export function textReplacementSelection(doc: Node, selection: Selection): Selection {
  if (selection.isCollapsed) return selection;
  const start = getNodeAtPath(doc, selection.path);
  if (!start.isText || !start.text?.length || selection.from !== start.text.length) return selection;
  const parentPath = selection.path.slice(0, -1);
  const parent = getNodeAtPath(doc, parentPath);
  for (let index = (selection.path.at(-1) as number) + 1; index < parent.childCount; index++) {
    const candidate = parent.child(index);
    // Moving past an atom or across a block would change the selected content.
    if (!candidate.isText) break;
    const path = [...parentPath, index];
    const order = comparePaths(path, selection.endPath);
    if (order > 0 || (order === 0 && selection.to === 0)) break;
    if (candidate.text?.length) return Selection.range(path, 0, selection.endPath, selection.to);
  }
  return selection;
}
