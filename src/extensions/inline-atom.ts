import {
  NodeSelection,
  Selection,
  type Editor,
  type Node,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';

export interface InlineAtomRange {
  readonly path: readonly number[];
  readonly from: number;
  readonly to: number;
}

/** Inserts an atomic inline node by splitting one text leaf around it. */
export function insertInlineAtom(
  editor: Editor,
  node: Node,
  range?: InlineAtomRange,
  trailingText = '',
  selectInserted = false,
): boolean {
  const selection = range ?? (editor.state.selection instanceof Selection
    ? {
        path: editor.state.selection.path,
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      }
    : null);
  if (!editor.editable || !node.type.isInline || !node.type.spec.atom || !selection?.path.length) return false;

  let target: Node;
  try { target = getNodeAtPath(editor.state.doc, selection.path); }
  catch { return false; }
  const value = target.text ?? '';
  if (!target.isText || selection.from < 0 || selection.to < selection.from || selection.to > value.length) return false;

  const before = value.slice(0, selection.from);
  const after = `${trailingText}${value.slice(selection.to)}`;
  const index = selection.path.at(-1) as number;
  const atomIndex = index + (before ? 1 : 0);
  const atomPath = [...selection.path.slice(0, -1), atomIndex];
  const afterPath = [...selection.path.slice(0, -1), atomIndex + 1];
  try {
    const transaction = editor.state.createTransaction().replaceNode(selection.path, [
      ...(before ? [target.withText(before)] : []),
      node,
      target.withText(after),
    ]);
    transaction.setSelection(selectInserted
      ? new NodeSelection(transaction.doc, atomPath)
      : Selection.cursor(afterPath, trailingText.length));
    editor.state.schema.validate(transaction.doc);
    return editor.dispatch(transaction);
  } catch { return false; }
}

/** Removes an inline atom immediately before a text cursor. */
export function removeInlineAtomBeforeCursor(
  editor: Editor,
  accepts: (node: Node) => boolean,
  replacementText = '',
): boolean {
  const selection = editor.state.selection;
  if (!editor.editable || !(selection instanceof Selection) || !selection.isCollapsed || selection.from !== 0) return false;
  const index = selection.path.at(-1);
  if (index === undefined || index < 1) return false;
  const parentPath = selection.path.slice(0, -1);
  const atomPath = [...parentPath, index - 1];
  let atom: Node;
  let target: Node;
  try {
    atom = getNodeAtPath(editor.state.doc, atomPath);
    target = getNodeAtPath(editor.state.doc, selection.path);
  } catch { return false; }
  if (!accepts(atom) || !target.isText) return false;

  try {
    const replacement = replacementText ? [editor.state.schema.text(replacementText, target.marks)] : [];
    const transaction = editor.state.createTransaction().replaceNode(atomPath, replacement);
    transaction.setSelection(replacementText
      ? Selection.cursor(atomPath, replacementText.length)
      : Selection.cursor([...parentPath, index - 1], 0));
    editor.state.schema.validate(transaction.doc);
    return editor.dispatch(transaction);
  } catch { return false; }
}
