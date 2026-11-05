import { AllSelection, GapSelection, NodeSelection, type AnySelection } from './selection';
import type { Node } from './schema';
import { textPointToPosition } from './transaction/mapping';
import { getNodeAtPath } from './transaction/path';

export interface BlockRange { readonly parentPath: readonly number[]; readonly from: number; readonly to: number }

/** Actual selected block owners, never a nearest-text projection of media. */
export function selectedBlockPaths(doc: Node, selection: AnySelection): readonly number[][] {
  if (selection instanceof GapSelection) return [];
  if (selection instanceof AllSelection) return doc.content.map((_, index) => [index]);
  if (selection instanceof NodeSelection) {
    const path = [...selection.nodePath];
    while (path.length && !getNodeAtPath(doc, path).type.isBlock) path.pop();
    return path.length ? [path] : [];
  }
  const from = selection.kind === 'range' ? selection.structuralFrom : textPointToPosition(doc, selection.path, selection.from);
  const to = selection.kind === 'range' ? selection.structuralTo : textPointToPosition(doc, selection.endPath, selection.to);
  const collapsed = from === to, paths: number[][] = [];
  const visit = (node: Node, path: number[], before: number, root = false): void => {
    const after = before + node.nodeSize - (root ? 2 : 0);
    if (collapsed ? from < before || from > after : from >= after || to <= before) return;
    if (!root && node.type.isBlock && (node.type.spec.atom || !node.childCount || node.content.every(child => child.type.isInline))) {
      if (node.type.spec.atom ? !collapsed : collapsed ? from >= before + 1 && from <= after - 1 : from <= after - 1 && to > before + 1) paths.push(path);
      return;
    }
    let position = before + (root ? 0 : 1);
    node.content.forEach((child, index) => { visit(child, [...path, index], position); position += child.nodeSize; });
  };
  visit(doc, [], 0, true);
  return paths;
}

export function blockRangeFromPaths(paths: readonly (readonly number[])[]): BlockRange | null {
  const first = paths[0], last = paths.at(-1);
  if (!first || !last) return null;
  let depth = 0;
  while (depth < Math.min(first.length, last.length) && first[depth] === last[depth]) depth++;
  if (depth === first.length) depth--;
  return { parentPath: first.slice(0, depth), from: first[depth]!, to: last[depth]! + 1 };
}

export function blockSelectionRange(doc: Node, selection: AnySelection): BlockRange | null {
  if (selection instanceof AllSelection) return doc.childCount ? { parentPath: [], from: 0, to: doc.childCount } : null;
  return blockRangeFromPaths(selectedBlockPaths(doc, selection));
}
