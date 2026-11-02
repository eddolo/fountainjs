import type { Node } from './schema';
import { Selection } from './selection';
import { comparePaths, getNodeAtPath } from './transaction/path';

function leadingInlineText(node: Node, path: readonly number[]): readonly number[] | null {
  if (node.isText) return node.text?.length ? path : null;
  if (!node.type.isInline || node.type.spec.atom) return null;
  for (let index = 0; index < node.childCount; index++) {
    const child = node.child(index);
    if (child.isText && !child.text?.length) continue;
    // An atom or empty structural node is not an equivalent text boundary.
    return leadingInlineText(child, [...path, index]);
  }
  return null;
}

/** Choose the first selected text run, not an equivalent preceding end boundary. */
export function textReplacementSelection(doc: Node, selection: Selection): Selection {
  if (selection.isCollapsed) return selection;
  const start = getNodeAtPath(doc, selection.path);
  if (!start.isText || !start.text?.length || selection.from !== start.text.length) return selection;
  const parentPath = selection.path.slice(0, -1);
  const parent = getNodeAtPath(doc, parentPath);
  for (let index = (selection.path.at(-1) as number) + 1; index < parent.childCount; index++) {
    const candidate = parent.child(index);
    const path = [...parentPath, index];
    if (!candidate.isText) {
      // Firefox can start a word selection at the preceding sibling's end,
      // even when all selected text belongs to an inline content container.
      // Enter only that container, with the selection end still inside it;
      // never skip an atom, empty bookmark, or whole selected wrapper.
      if (path.every((part, depth) => selection.endPath[depth] === part)) {
        const first = leadingInlineText(candidate, path);
        if (first && (comparePaths(first, selection.endPath) < 0
          || comparePaths(first, selection.endPath) === 0 && selection.to > 0)) {
          return Selection.range(first, 0, selection.endPath, selection.to);
        }
      }
      break;
    }
    const order = comparePaths(path, selection.endPath);
    if (order > 0 || (order === 0 && selection.to === 0)) break;
    if (candidate.text?.length) return Selection.range(path, 0, selection.endPath, selection.to);
  }
  return selection;
}
