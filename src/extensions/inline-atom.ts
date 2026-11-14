import {
  NodeSelection,
  Selection,
  Step,
  StepMap,
  textPointToPosition,
  type Editor,
  type Node,
} from '../core';
import { getNodeAtPath, replaceNodeAtPath } from '../core/transaction/path';

export interface InlineAtomRange {
  readonly path: readonly number[];
  readonly from: number;
  readonly to: number;
  /** Optional final text leaf in the same inline parent. */
  readonly endPath?: readonly number[];
}

class InsertInlineAtomStep extends Step {
  constructor(private readonly range: InlineAtomRange, private readonly atom: Node, private readonly trailingText: string) { super(); }
  apply(doc: Node): Node {
    const { path, from, to } = this.range, endPath = this.range.endPath ?? path;
    const parentPath = path.slice(0, -1), index = path.at(-1)!, endIndex = endPath.at(-1)!;
    if (path.length !== endPath.length || !path.length || parentPath.some((value, position) => value !== endPath[position])
      || index > endIndex) throw new RangeError('Inline atom ranges must stay within one inline parent.');
    const parent = getNodeAtPath(doc, parentPath), first = parent.child(index), last = parent.child(endIndex);
    if (!first.isText || !last.isText || !Number.isInteger(from) || !Number.isInteger(to)
      || from < 0 || from > first.text!.length || to < 0 || to > last.text!.length
      || index === endIndex && from > to || parent.content.slice(index, endIndex + 1).some(node => !node.isText))
      throw new RangeError('Inline atom ranges must select contiguous text.');
    const prefix = first.text!.slice(0, from), suffix = this.trailingText + last.text!.slice(to);
    return replaceNodeAtPath(doc, parentPath, parent.copy([
      ...parent.content.slice(0, index), ...(prefix ? [first.withText(prefix)] : []), this.atom,
      last.withText(suffix), ...parent.content.slice(endIndex + 1),
    ]));
  }
  override getMap(doc: Node): StepMap {
    const start = textPointToPosition(doc, this.range.path, this.range.from);
    const end = textPointToPosition(doc, this.range.endPath ?? this.range.path, this.range.to);
    return new StepMap([start, end - start, this.atom.nodeSize + this.trailingText.length]);
  }
}

/** Inserts an atomic inline node across contiguous text leaves, retaining outside marks and exact maps. */
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
        ...(editor.state.selection.isSingleText ? {} : { endPath: editor.state.selection.endPath }),
      }
    : null);
  if (!editor.editable || !node.type.isInline || !node.type.spec.atom || !selection?.path.length) return false;

  if (typeof trailingText !== 'string') return false;
  const index = selection.path.at(-1) as number;
  const atomIndex = index + (selection.from ? 1 : 0);
  const atomPath = [...selection.path.slice(0, -1), atomIndex];
  const afterPath = [...selection.path.slice(0, -1), atomIndex + 1];
  try {
    const transaction = editor.state.createTransaction().step(new InsertInlineAtomStep(selection, node, trailingText));
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
