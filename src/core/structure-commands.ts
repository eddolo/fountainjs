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

export type ListKind = 'bullet' | 'ordered' | 'task';

interface ListRange {
  readonly listPath: readonly number[];
  readonly list: Node;
  readonly from: number;
  readonly to: number;
  readonly startItemPath: readonly number[];
  readonly endItemPath: readonly number[];
}

function listNames(kind: ListKind): { list: string; item: string; attrs: Attributes } {
  if (kind === 'ordered') return { list: 'ordered_list', item: 'list_item', attrs: { start: 1 } };
  if (kind === 'task') return { list: 'task_list', item: 'task_item', attrs: {} };
  return { list: 'bullet_list', item: 'list_item', attrs: {} };
}

function kindForList(node: Node): ListKind | null {
  if (node.type.name === 'ordered_list') return 'ordered';
  if (node.type.name === 'task_list') return 'task';
  return node.type.name === 'bullet_list' ? 'bullet' : null;
}

function ancestorPathFrom(editor: Editor, path: readonly number[], names: readonly string[]): number[] | null {
  for (let length = path.length - 1; length >= 1; length -= 1) {
    const candidate = path.slice(0, length);
    if (names.includes(getNodeAtPath(editor.state.doc, candidate).type.name)) return candidate;
  }
  return null;
}

function selectedListRange(editor: Editor): ListRange | null {
  const selection = editor.state.selection;
  if (selection.kind !== 'text') return null;
  const startItemPath = ancestorPathFrom(editor, selection.path, ['list_item', 'task_item']);
  const endItemPath = ancestorPathFrom(editor, selection.endPath, ['list_item', 'task_item']);
  if (!startItemPath || !endItemPath) return null;
  const listPath = startItemPath.slice(0, -1);
  if (listPath.length !== endItemPath.length - 1
    || listPath.some((part, index) => part !== endItemPath[index])) return null;
  const list = getNodeAtPath(editor.state.doc, listPath);
  if (!kindForList(list)) return null;
  return {
    listPath,
    list,
    from: startItemPath.at(-1) as number,
    to: endItemPath.at(-1) as number,
    startItemPath,
    endItemPath,
  };
}

function convertListItem(editor: Editor, item: Node, targetName: string): Node | null {
  const target = editor.state.schema.nodes[targetName];
  if (!target) return null;
  try {
    return target.create(
      targetName === 'task_item'
        ? { checked: item.type.name === 'task_item' ? Boolean(item.attrs.checked) : false }
        : {},
      item.content,
    );
  } catch {
    return null;
  }
}

function copyListSlice(list: Node, content: readonly Node[], offset = 0): Node {
  return list.type.create(
    list.type.name === 'ordered_list'
      ? { ...list.attrs, start: (Number(list.attrs.start) || 1) + offset }
      : list.attrs,
    content,
  );
}

function rangeSelection(
  editor: Editor,
  startPath: readonly number[],
  endPath: readonly number[],
): Selection {
  const selection = editor.state.selection;
  return new Selection(startPath, selection.from, selection.to, endPath);
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

export function indentListItem(editor: Editor, nestedKind?: ListKind): boolean {
  if (!editor.editable) return false;
  const range = selectedListRange(editor);
  if (!range || range.from === 0) return false;
  const sourceKind = kindForList(range.list);
  if (!sourceKind) return false;
  const target = listNames(nestedKind ?? sourceKind);
  const nestedType = editor.state.schema.nodes[target.list];
  if (!nestedType) return false;
  const moved = range.list.content.slice(range.from, range.to + 1)
    .map((item) => convertListItem(editor, item, target.item));
  if (moved.some((item) => !item)) return false;
  const items = moved as Node[];
  const previous = range.list.child(range.from - 1);
  const existingNested = previous.content.at(-1)?.type === nestedType ? previous.content.at(-1) : undefined;
  const nestedIndex = existingNested?.childCount ?? 0;
  const nested = existingNested
    ? existingNested.copy([...existingNested.content, ...items])
    : nestedType.create(target.attrs, items);
  const previousContent = existingNested
    ? [...previous.content.slice(0, -1), nested]
    : [...previous.content, nested];
  const updatedPrevious = previous.copy(previousContent);
  const updatedList = range.list.copy([
    ...range.list.content.slice(0, range.from - 1),
    updatedPrevious,
    ...range.list.content.slice(range.to + 1),
  ]);
  const startRelative = editor.state.selection.path.slice(range.startItemPath.length);
  const endRelative = editor.state.selection.endPath.slice(range.endItemPath.length);
  const nestedPath = [...range.listPath, range.from - 1, previousContent.length - 1];
  const transaction = editor.state.createTransaction()
    .replaceNode(range.listPath, [updatedList])
    .setSelection(rangeSelection(editor, [
      ...nestedPath,
      nestedIndex,
      ...startRelative,
    ], [
      ...nestedPath,
      nestedIndex + items.length - 1,
      ...endRelative,
    ]));
  editor.dispatch(transaction);
  return true;
}

export function outdentListItem(editor: Editor): boolean {
  if (!editor.editable) return false;
  const range = selectedListRange(editor);
  if (!range) return false;
  const startRelative = editor.state.selection.path.slice(range.startItemPath.length);
  const endRelative = editor.state.selection.endPath.slice(range.endItemPath.length);

  if (range.listPath.length === 1) {
    const before = range.list.content.slice(0, range.from);
    const selected = range.list.content.slice(range.from, range.to + 1);
    const after = range.list.content.slice(range.to + 1);
    const replacements = [
      ...(before.length ? [copyListSlice(range.list, before)] : []),
      ...selected.flatMap((item) => item.content),
      ...(after.length ? [copyListSlice(range.list, after, range.to + 1)] : []),
    ];
    const blockIndex = range.listPath[0] as number;
    const firstBlockIndex = blockIndex + (before.length ? 1 : 0);
    const selectedBlockPrefix = (itemIndex: number) => selected
      .slice(0, itemIndex)
      .reduce((total, item) => total + item.childCount, 0);
    const startBlock = firstBlockIndex + selectedBlockPrefix(0) + (startRelative[0] ?? 0);
    const endBlock = firstBlockIndex + selectedBlockPrefix(selected.length - 1) + (endRelative[0] ?? 0);
    const transaction = editor.state.createTransaction()
      .replaceNode(range.listPath, replacements)
      .setSelection(rangeSelection(editor,
        [startBlock, ...startRelative.slice(1)],
        [endBlock, ...endRelative.slice(1)],
      ));
    editor.dispatch(transaction);
    return true;
  }

  const parentItemPath = range.listPath.slice(0, -1);
  const parentItem = getNodeAtPath(editor.state.doc, parentItemPath);
  if (!['list_item', 'task_item'].includes(parentItem.type.name)) return false;
  const outerListPath = parentItemPath.slice(0, -1);
  const outerList = getNodeAtPath(editor.state.doc, outerListPath);
  const parentItemIndex = parentItemPath.at(-1) as number;
  const nestedListIndex = range.listPath.at(-1) as number;
  const targetItemName = outerList.type.name === 'task_list' ? 'task_item' : 'list_item';
  const lifted = range.list.content.slice(range.from, range.to + 1)
    .map((item) => convertListItem(editor, item, targetItemName));
  if (lifted.some((item) => !item)) return false;
  const liftedItems = lifted as Node[];
  const before = range.list.content.slice(0, range.from);
  const after = range.list.content.slice(range.to + 1);
  const updatedParent = parentItem.copy([
    ...parentItem.content.slice(0, nestedListIndex),
    ...(before.length ? [copyListSlice(range.list, before)] : []),
    ...parentItem.content.slice(nestedListIndex + 1),
  ]);
  if (after.length) {
    const last = liftedItems.at(-1) as Node;
    liftedItems[liftedItems.length - 1] = last.copy([
      ...last.content,
      copyListSlice(range.list, after, range.to + 1),
    ]);
  }
  const updatedOuter = outerList.copy([
    ...outerList.content.slice(0, parentItemIndex),
    updatedParent,
    ...liftedItems,
    ...outerList.content.slice(parentItemIndex + 1),
  ]);
  const transaction = editor.state.createTransaction()
    .replaceNode(outerListPath, [updatedOuter])
    .setSelection(rangeSelection(editor,
      [...outerListPath, parentItemIndex + 1, ...startRelative],
      [...outerListPath, parentItemIndex + liftedItems.length, ...endRelative],
    ));
  editor.dispatch(transaction);
  return true;
}

/** Wraps selected top-level text blocks, converts a selected list range, or toggles it off. */
export function toggleList(editor: Editor, kind: ListKind): boolean {
  if (!editor.editable || editor.state.selection.kind !== 'text') return false;
  const target = listNames(kind);
  const targetListType = editor.state.schema.nodes[target.list];
  if (!targetListType || !editor.state.schema.nodes[target.item]) return false;
  const range = selectedListRange(editor);
  if (range) {
    if (range.list.type.name === target.list) return outdentListItem(editor);
    const selected = range.list.content.slice(range.from, range.to + 1)
      .map((item) => convertListItem(editor, item, target.item));
    if (selected.some((item) => !item)) return false;
    const before = range.list.content.slice(0, range.from);
    const after = range.list.content.slice(range.to + 1);
    const converted = targetListType.create(target.attrs, selected as Node[]);
    const replacements = [
      ...(before.length ? [copyListSlice(range.list, before)] : []),
      converted,
      ...(after.length ? [copyListSlice(range.list, after, range.to + 1)] : []),
    ];
    const convertedPath = [
      ...range.listPath.slice(0, -1),
      (range.listPath.at(-1) as number) + (before.length ? 1 : 0),
    ];
    const startRelative = editor.state.selection.path.slice(range.startItemPath.length);
    const endRelative = editor.state.selection.endPath.slice(range.endItemPath.length);
    const transaction = editor.state.createTransaction()
      .replaceNode(range.listPath, replacements)
      .setSelection(rangeSelection(editor,
        [...convertedPath, 0, ...startRelative],
        [...convertedPath, (selected as Node[]).length - 1, ...endRelative],
      ));
    editor.dispatch(transaction);
    return true;
  }

  const { selection, doc, schema } = editor.state;
  const from = selection.path[0];
  const to = selection.endPath[0];
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
  const blocks = doc.content.slice(from, (to as number) + 1);
  if (!blocks.length || blocks.some((block) => !['paragraph', 'heading'].includes(block.type.name))) return false;
  const items = blocks.map((block) => {
    const paragraph = block.type.name === 'paragraph'
      ? block
      : schema.node('paragraph', { align: block.attrs.align ?? 'left' }, block.content);
    return schema.node(target.item, target.item === 'task_item' ? { checked: false } : {}, [paragraph]);
  });
  const list = targetListType.create(target.attrs, items);
  const startRelative = selection.path.slice(1);
  const endRelative = selection.endPath.slice(1);
  const transaction = editor.state.createTransaction()
    .replace(from as number, (to as number) + 1, [list])
    .setSelection(rangeSelection(editor,
      [from as number, 0, 0, ...startRelative],
      [from as number, items.length - 1, 0, ...endRelative],
    ));
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
