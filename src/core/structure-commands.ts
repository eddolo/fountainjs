import type { Editor } from './editor';
import { Selection } from './selection';
import { Node, type Attributes } from './schema';
import { getNodeAtPath, getTextLeaves } from './transaction/path';

function ancestorPath(editor: Editor, names: readonly string[]): number[] | null {
  const path = editor.state.selection.path;
  for (let length = path.length - 1; length >= 1; length -= 1) {
    const candidate = path.slice(0, length);
    if (names.includes(getNodeAtPath(editor.state.doc, candidate).type.name)) return candidate;
  }
  return null;
}

export function isInsideNode(editor: Editor, typeName: string): boolean {
  return ancestorPath(editor, [typeName]) !== null;
}

function emptyParagraph(editor: Editor): Node {
  return editor.state.schema.node('paragraph', {}, [editor.state.schema.text('')]);
}

function selectFirstText(transaction: ReturnType<Editor['createTransaction']>, node: Node, basePath: readonly number[]): void {
  const leaf = getTextLeaves(node)[0];
  if (leaf) transaction.setSelection(Selection.cursor([...basePath, ...leaf.path], 0));
}

export function setNodeAttributes(editor: Editor, path: readonly number[], attrs: Attributes): boolean {
  if (!editor.editable) return false;
  let node: Node;
  try { node = getNodeAtPath(editor.state.doc, path); }
  catch { return false; }
  try { node.type.create({ ...node.attrs, ...attrs }, node.content, node.text, node.marks); }
  catch { return false; }
  const transaction = editor.state.createTransaction().setNodeAttrs(path, { ...node.attrs, ...attrs });
  editor.dispatch(transaction);
  return true;
}

export function removeNode(editor: Editor, path: readonly number[]): boolean {
  if (!editor.editable || !path.length) return false;
  try { getNodeAtPath(editor.state.doc, path); }
  catch { return false; }
  const transaction = editor.state.createTransaction().replaceNode(path, []);
  const leaves = getTextLeaves(transaction.doc);
  if (!leaves.length) {
    const paragraph = emptyParagraph(editor);
    transaction.replace(0, transaction.doc.childCount, [paragraph]).setSelection(Selection.cursor([0, 0], 0));
  } else {
    const next = leaves.find((leaf) => {
      for (let index = 0; index < Math.min(path.length, leaf.path.length); index += 1) {
        if (leaf.path[index] !== path[index]) return (leaf.path[index] as number) > (path[index] as number);
      }
      return false;
    }) ?? leaves.at(-1);
    if (next) transaction.setSelection(Selection.cursor(next.path, 0));
  }
  editor.dispatch(transaction);
  return true;
}

export function moveBlock(editor: Editor, from: number, to: number): boolean {
  if (!editor.editable) return false;
  const blocks = [...editor.state.doc.content];
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= blocks.length || to < 0 || to >= blocks.length || from === to) return false;
  const [block] = blocks.splice(from, 1);
  if (!block) return false;
  blocks.splice(to, 0, block);
  const transaction = editor.state.createTransaction().replace(0, editor.state.doc.childCount, blocks);
  selectFirstText(transaction, block, [to]);
  editor.dispatch(transaction);
  return true;
}

export function toggleTaskItem(editor: Editor, checked?: boolean): boolean {
  const path = ancestorPath(editor, ['task_item']);
  if (!path) return false;
  const node = getNodeAtPath(editor.state.doc, path);
  return setNodeAttributes(editor, path, { checked: checked ?? !Boolean(node.attrs.checked) });
}

export function indentListItem(editor: Editor): boolean {
  if (!editor.editable) return false;
  const itemPath = ancestorPath(editor, ['list_item', 'task_item']);
  if (!itemPath) return false;
  const listPath = itemPath.slice(0, -1);
  const list = getNodeAtPath(editor.state.doc, listPath);
  const itemIndex = itemPath.at(-1) as number;
  if (!['bullet_list', 'ordered_list', 'task_list'].includes(list.type.name) || itemIndex === 0) return false;
  const item = list.child(itemIndex);
  const previous = list.child(itemIndex - 1);
  const existingNested = previous.content.at(-1)?.type === list.type ? previous.content.at(-1) : undefined;
  const nestedIndex = existingNested?.childCount ?? 0;
  const nested = existingNested
    ? existingNested.copy([...existingNested.content, item])
    : list.type.create(list.attrs, [item]);
  const previousContent = existingNested
    ? [...previous.content.slice(0, -1), nested]
    : [...previous.content, nested];
  const updatedPrevious = previous.copy(previousContent);
  const updatedList = list.copy([
    ...list.content.slice(0, itemIndex - 1),
    updatedPrevious,
    ...list.content.slice(itemIndex + 1),
  ]);
  const relativeSelection = editor.state.selection.path.slice(itemPath.length);
  const transaction = editor.state.createTransaction()
    .replaceNode(listPath, [updatedList])
    .setSelection(Selection.cursor([
      ...listPath,
      itemIndex - 1,
      previousContent.length - 1,
      nestedIndex,
      ...relativeSelection,
    ], editor.state.selection.from));
  editor.dispatch(transaction);
  return true;
}

export function outdentListItem(editor: Editor): boolean {
  if (!editor.editable) return false;
  const itemPath = ancestorPath(editor, ['list_item', 'task_item']);
  if (!itemPath) return false;
  const listPath = itemPath.slice(0, -1);
  const list = getNodeAtPath(editor.state.doc, listPath);
  const itemIndex = itemPath.at(-1) as number;
  const item = list.child(itemIndex);
  const relativeSelection = editor.state.selection.path.slice(itemPath.length);

  if (listPath.length === 1) {
    const before = list.content.slice(0, itemIndex);
    const after = list.content.slice(itemIndex + 1);
    const replacements = [
      ...(before.length ? [list.copy(before)] : []),
      ...item.content,
      ...(after.length ? [list.copy(after)] : []),
    ];
    const blockIndex = listPath[0] as number;
    const itemBlockIndex = blockIndex + (before.length ? 1 : 0);
    const relativeBlockIndex = relativeSelection[0] ?? 0;
    const transaction = editor.state.createTransaction()
      .replaceNode(listPath, replacements)
      .setSelection(Selection.cursor([
        itemBlockIndex + relativeBlockIndex,
        ...relativeSelection.slice(1),
      ], editor.state.selection.from));
    editor.dispatch(transaction);
    return true;
  }

  const parentItemPath = listPath.slice(0, -1);
  const parentItem = getNodeAtPath(editor.state.doc, parentItemPath);
  if (!['list_item', 'task_item'].includes(parentItem.type.name)) return false;
  const outerListPath = parentItemPath.slice(0, -1);
  const outerList = getNodeAtPath(editor.state.doc, outerListPath);
  const parentItemIndex = parentItemPath.at(-1) as number;
  const nestedListIndex = listPath.at(-1) as number;
  const remaining = list.content.filter((_, index) => index !== itemIndex);
  const updatedParent = parentItem.copy([
    ...parentItem.content.slice(0, nestedListIndex),
    ...(remaining.length ? [list.copy(remaining)] : []),
    ...parentItem.content.slice(nestedListIndex + 1),
  ]);
  const updatedOuter = outerList.copy([
    ...outerList.content.slice(0, parentItemIndex),
    updatedParent,
    item,
    ...outerList.content.slice(parentItemIndex + 1),
  ]);
  const transaction = editor.state.createTransaction()
    .replaceNode(outerListPath, [updatedOuter])
    .setSelection(Selection.cursor([
      ...outerListPath,
      parentItemIndex + 1,
      ...relativeSelection,
    ], editor.state.selection.from));
  editor.dispatch(transaction);
  return true;
}

export function addTableRow(editor: Editor, position: 'before' | 'after' = 'after'): boolean {
  if (!editor.editable) return false;
  const rowPath = ancestorPath(editor, ['table_row']);
  if (!rowPath) return false;
  const tablePath = rowPath.slice(0, -1);
  const table = getNodeAtPath(editor.state.doc, tablePath);
  const row = getNodeAtPath(editor.state.doc, rowPath);
  const rowIndex = rowPath.at(-1) as number;
  const insertionIndex = rowIndex + (position === 'after' ? 1 : 0);
  const cells = row.content.map((cell) => editor.state.schema.node(
    cell.type.name === 'table_header' && insertionIndex === 0 ? 'table_header' : 'table_cell',
    {},
    [emptyParagraph(editor)],
  ));
  const next = table.copy([
    ...table.content.slice(0, insertionIndex),
    editor.state.schema.node('table_row', {}, cells),
    ...table.content.slice(insertionIndex),
  ]);
  const transaction = editor.state.createTransaction().replaceNode(tablePath, [next]);
  selectFirstText(transaction, next.child(insertionIndex), [...tablePath, insertionIndex]);
  editor.dispatch(transaction);
  return true;
}

export function deleteTableRow(editor: Editor): boolean {
  if (!editor.editable) return false;
  const rowPath = ancestorPath(editor, ['table_row']);
  if (!rowPath) return false;
  const tablePath = rowPath.slice(0, -1);
  const table = getNodeAtPath(editor.state.doc, tablePath);
  if (table.childCount <= 1) return removeNode(editor, tablePath);
  const rowIndex = rowPath.at(-1) as number;
  const next = table.copy(table.content.filter((_, index) => index !== rowIndex));
  const selectedRow = Math.min(rowIndex, next.childCount - 1);
  const transaction = editor.state.createTransaction().replaceNode(tablePath, [next]);
  selectFirstText(transaction, next.child(selectedRow), [...tablePath, selectedRow]);
  editor.dispatch(transaction);
  return true;
}

export function addTableColumn(editor: Editor, position: 'before' | 'after' = 'after'): boolean {
  if (!editor.editable) return false;
  const rowPath = ancestorPath(editor, ['table_row']);
  if (!rowPath) return false;
  const tablePath = rowPath.slice(0, -1);
  const rowIndex = rowPath.at(-1) as number;
  const cellIndex = editor.state.selection.path[tablePath.length + 1];
  if (!Number.isInteger(cellIndex)) return false;
  const insertionIndex = (cellIndex as number) + (position === 'after' ? 1 : 0);
  const table = getNodeAtPath(editor.state.doc, tablePath);
  const rows = table.content.map((row) => {
    const reference = row.content[Math.min(cellIndex as number, row.childCount - 1)];
    const cellType = reference?.type.name === 'table_header' ? 'table_header' : 'table_cell';
    const cell = editor.state.schema.node(cellType, {}, [emptyParagraph(editor)]);
    return row.copy([...row.content.slice(0, insertionIndex), cell, ...row.content.slice(insertionIndex)]);
  });
  const next = table.copy(rows);
  const transaction = editor.state.createTransaction().replaceNode(tablePath, [next]);
  selectFirstText(transaction, next.child(rowIndex).child(insertionIndex), [...tablePath, rowIndex, insertionIndex]);
  editor.dispatch(transaction);
  return true;
}

export function deleteTableColumn(editor: Editor): boolean {
  if (!editor.editable) return false;
  const rowPath = ancestorPath(editor, ['table_row']);
  if (!rowPath) return false;
  const tablePath = rowPath.slice(0, -1);
  const rowIndex = rowPath.at(-1) as number;
  const cellIndex = editor.state.selection.path[tablePath.length + 1];
  if (!Number.isInteger(cellIndex)) return false;
  const table = getNodeAtPath(editor.state.doc, tablePath);
  if (table.content.every((row) => row.childCount <= 1)) return removeNode(editor, tablePath);
  const rows = table.content.map((row) => row.copy(row.content.filter((_, index) => index !== cellIndex)));
  const next = table.copy(rows);
  const selectedCell = Math.min(cellIndex as number, next.child(rowIndex).childCount - 1);
  const transaction = editor.state.createTransaction().replaceNode(tablePath, [next]);
  selectFirstText(transaction, next.child(rowIndex).child(selectedCell), [...tablePath, rowIndex, selectedCell]);
  editor.dispatch(transaction);
  return true;
}

/** Moves through table cells with spreadsheet-style Tab navigation. */
export function moveTableCell(editor: Editor, direction: 'next' | 'previous' = 'next'): boolean {
  if (!editor.editable) return false;
  const cellPath = ancestorPath(editor, ['table_cell', 'table_header']);
  if (!cellPath) return false;
  const rowPath = cellPath.slice(0, -1);
  const tablePath = rowPath.slice(0, -1);
  const table = getNodeAtPath(editor.state.doc, tablePath);
  const rowIndex = rowPath.at(-1) as number;
  const cellIndex = cellPath.at(-1) as number;
  let targetRow = rowIndex;
  let targetCell = cellIndex + (direction === 'next' ? 1 : -1);
  if (direction === 'next' && targetCell >= table.child(rowIndex).childCount) {
    targetRow += 1;
    targetCell = 0;
  } else if (direction === 'previous' && targetCell < 0) {
    targetRow -= 1;
    targetCell = targetRow >= 0 ? table.child(targetRow).childCount - 1 : -1;
  }
  if (direction === 'next' && targetRow >= table.childCount) return addTableRow(editor, 'after');
  if (targetRow < 0 || targetCell < 0) return false;
  const target = table.child(targetRow).child(targetCell);
  const transaction = editor.state.createTransaction();
  selectFirstText(transaction, target, [...tablePath, targetRow, targetCell]);
  editor.dispatch(transaction);
  return true;
}
