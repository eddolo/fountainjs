import type { Editor } from './editor';
import { NodeSelection, Selection } from './selection';
import { Node, type Attributes } from './schema';
import { getActiveTableCell } from './table-commands';
import { TableMap } from './table-map';
import { getNodeAtPath, getTextLeaves, replaceNodeAtPath, replaceNodeWithNodes } from './transaction/path';

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

/** Removes the table containing the current cell or selected table node. */
export function deleteTable(editor: Editor): boolean {
  if (!editor.editable) return false;
  const selection = editor.state.selection;
  if (selection instanceof NodeSelection && selection.nodeType === 'table') {
    return removeNode(editor, selection.nodePath);
  }
  const active = getActiveTableCell(editor);
  return active ? removeNode(editor, active.tablePath) : false;
}

export interface NodeMove {
  /** Path of the node in the current document. The root document cannot move. */
  readonly fromPath: readonly number[];
  /** Path of the destination parent in the current document. Use `[]` for the document root. */
  readonly toParentPath: readonly number[];
  /** Final child index in the destination parent after the source has been removed. */
  readonly toIndex: number;
}

interface ResolvedNodeMove {
  readonly document: Node;
  readonly node: Node;
  readonly path: readonly number[];
}

function validPath(path: readonly number[]): boolean {
  return path.every((part) => Number.isInteger(part) && part >= 0);
}

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function startsWithPath(path: readonly number[], prefix: readonly number[]): boolean {
  return prefix.length <= path.length && prefix.every((part, index) => path[index] === part);
}

/** Maps an existing path through the removal of one sibling subtree. */
function pathAfterRemoval(path: readonly number[], removedPath: readonly number[]): number[] {
  const mapped = [...path];
  const removedIndex = removedPath.at(-1) as number;
  const parentPath = removedPath.slice(0, -1);
  if (path.length > parentPath.length
    && startsWithPath(path, parentPath)
    && (path[parentPath.length] as number) > removedIndex) {
    mapped[parentPath.length] = (mapped[parentPath.length] as number) - 1;
  }
  return mapped;
}

function resolveNodeMove(editor: Editor, move: NodeMove): ResolvedNodeMove | null {
  const { fromPath, toParentPath, toIndex } = move;
  if (!fromPath.length || !validPath(fromPath) || !validPath(toParentPath) || !Number.isInteger(toIndex) || toIndex < 0) return null;
  // A node cannot become a child of itself or of one of its descendants.
  if (startsWithPath(toParentPath, fromPath)) return null;
  const sourceParentPath = fromPath.slice(0, -1);
  const sourceIndex = fromPath.at(-1) as number;
  if (samePath(sourceParentPath, toParentPath) && sourceIndex === toIndex) return null;

  let node: Node;
  let targetParent: Node;
  try {
    node = getNodeAtPath(editor.state.doc, fromPath);
    targetParent = getNodeAtPath(editor.state.doc, toParentPath);
  } catch { return null; }
  if (node.isText || targetParent.isText) return null;

  const maximum = targetParent.childCount - (samePath(sourceParentPath, toParentPath) ? 1 : 0);
  if (toIndex > maximum) return null;

  try {
    const withoutSource = replaceNodeWithNodes(editor.state.doc, fromPath, []);
    const mappedParentPath = pathAfterRemoval(toParentPath, fromPath);
    const parentAfterRemoval = getNodeAtPath(withoutSource, mappedParentPath);
    const content = [...parentAfterRemoval.content];
    content.splice(toIndex, 0, node);
    const document = replaceNodeAtPath(withoutSource, mappedParentPath, parentAfterRemoval.copy(content));
    editor.state.schema.validate(document);
    return { document, node, path: Object.freeze([...mappedParentPath, toIndex]) };
  } catch { return null; }
}

/**
 * Reports whether a schema-valid node move can run without changing editor state.
 * Paths are resolved against the current document; `toIndex` is the final index.
 */
export function canMoveNode(editor: Editor, move: NodeMove): boolean {
  return editor.editable && resolveNodeMove(editor, move) !== null;
}

/**
 * Moves any non-text node, including nested blocks, in one undoable transaction.
 * Invalid paths, cycles, no-ops, and schema-invalid destinations return `false`.
 */
export function moveNode(editor: Editor, move: NodeMove): boolean {
  if (!editor.editable) return false;
  const resolved = resolveNodeMove(editor, move);
  if (!resolved) return false;
  const transaction = editor.state.createTransaction()
    .replace(0, editor.state.doc.childCount, resolved.document.content);
  const leaf = getTextLeaves(resolved.node)[0];
  if (leaf) transaction.setSelection(Selection.cursor([...resolved.path, ...leaf.path], 0));
  else transaction.setSelection(new NodeSelection(transaction.doc, resolved.path));
  return editor.dispatch(transaction);
}

/** Backwards-compatible top-level block move. */
export function moveBlock(editor: Editor, from: number, to: number): boolean {
  return moveNode(editor, { fromPath: [from], toParentPath: [], toIndex: to });
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
  const context = getActiveTableCell(editor);
  if (!context) return false;
  const { tablePath, table, map, cell: active } = context;
  const insertionIndex = active.row + (position === 'after' ? 1 : 0);
  const crossing = new Set(map.cells
    .filter((cell) => cell.row < insertionIndex && cell.row + cell.rowspan > insertionIndex)
    .map((cell) => cell.path.join('.')));
  const rows = table.content.map((row, rowIndex) => row.copy(row.content.map((cell, cellIndex) => {
    const path = [...tablePath, rowIndex, cellIndex];
    return crossing.has(path.join('.')) ? cell.withAttrs({ ...cell.attrs, rowspan: Number(cell.attrs.rowspan) + 1 }) : cell;
  })));
  const cells: Node[] = [];
  for (let column = 0; column < map.width; column += 1) {
    const covered = map.cells.some((cell) => crossing.has(cell.path.join('.'))
      && column >= cell.column && column < cell.column + cell.colspan);
    if (covered) continue;
    const reference = map.cellAt(Math.min(insertionIndex, map.height - 1), column)
      ?? map.cellAt(Math.max(0, insertionIndex - 1), column)
      ?? map.cells[0];
    const typeName = insertionIndex === 0 && reference?.node.type.name === 'table_header' ? 'table_header' : 'table_cell';
    const width = map.columnWidth(column);
    cells.push(editor.state.schema.node(typeName, {
      ...(typeName === 'table_header' ? { scope: 'col' } : {}),
      colwidth: width ? [width] : null,
    }, [emptyParagraph(editor)]));
  }
  const next = table.copy([
    ...rows.slice(0, insertionIndex),
    editor.state.schema.node('table_row', {}, cells),
    ...rows.slice(insertionIndex),
  ]);
  const transaction = editor.state.createTransaction().replaceNode(tablePath, [next]);
  const nextMap = TableMap.create(next, tablePath);
  const selected = nextMap.cellAt(insertionIndex, 0);
  if (selected) selectFirstText(transaction, selected.node, selected.path);
  editor.dispatch(transaction);
  return true;
}

export function deleteTableRow(editor: Editor): boolean {
  if (!editor.editable) return false;
  const context = getActiveTableCell(editor);
  if (!context) return false;
  const { tablePath, table, map, cell: active } = context;
  if (table.childCount <= 1) return removeNode(editor, tablePath);
  const rowIndex = active.row;
  const moved = map.cells
    .filter((cell) => cell.row === rowIndex && cell.rowspan > 1)
    .map((cell) => ({ column: cell.column, node: cell.node.withAttrs({ ...cell.node.attrs, rowspan: cell.rowspan - 1 }) }));
  const rows: Node[] = [];
  table.content.forEach((row, oldRowIndex) => {
    if (oldRowIndex === rowIndex) return;
    const own = row.content.map((cell, cellIndex) => {
      const info = map.cellInfo([...tablePath, oldRowIndex, cellIndex]);
      const crossesDeleted = Boolean(info && info.row < rowIndex && info.row + info.rowspan > rowIndex);
      return {
        column: info?.column ?? cellIndex,
        node: crossesDeleted ? cell.withAttrs({ ...cell.attrs, rowspan: Number(cell.attrs.rowspan) - 1 }) : cell,
      };
    });
    if (oldRowIndex === rowIndex + 1) own.push(...moved);
    own.sort((left, right) => left.column - right.column);
    rows.push(row.copy(own.map(({ node }) => node)));
  });
  const next = table.copy(rows);
  const selectedRow = Math.min(rowIndex, next.childCount - 1);
  const transaction = editor.state.createTransaction().replaceNode(tablePath, [next]);
  const nextMap = TableMap.create(next, tablePath);
  const selected = nextMap.cellAt(selectedRow, Math.min(active.column, nextMap.width - 1));
  if (selected) selectFirstText(transaction, selected.node, selected.path);
  editor.dispatch(transaction);
  return true;
}

export function addTableColumn(editor: Editor, position: 'before' | 'after' = 'after'): boolean {
  if (!editor.editable) return false;
  const context = getActiveTableCell(editor);
  if (!context) return false;
  const { tablePath, table, map, cell: active } = context;
  const insertionColumn = position === 'after' ? active.column + active.colspan : active.column;
  const rows = table.content.map((row, rowIndex) => {
    const left = insertionColumn > 0 ? map.cellAt(rowIndex, insertionColumn - 1) : null;
    const right = insertionColumn < map.width ? map.cellAt(rowIndex, insertionColumn) : null;
    if (left && right && left.path.join('.') === right.path.join('.')) {
      return row.copy(row.content.map((cell, cellIndex) => {
        const info = map.cellInfo([...tablePath, rowIndex, cellIndex]);
        if (!info || info.path.join('.') !== left.path.join('.')) return cell;
        const widths = Array.isArray(cell.attrs.colwidth) ? [...cell.attrs.colwidth] : Array(info.colspan).fill(0);
        widths.splice(insertionColumn - info.column, 0, 0);
        return cell.withAttrs({ ...cell.attrs, colspan: info.colspan + 1, colwidth: widths.some(Boolean) ? widths : null });
      }));
    }
    const anchors = map.cells.filter((cell) => cell.row === rowIndex).sort((a, b) => a.column - b.column);
    const insertionIndex = anchors.filter((cell) => cell.column < insertionColumn).length;
    const reference = right ?? left ?? anchors[0];
    const cellType = reference?.node.type.name === 'table_header' ? 'table_header' : 'table_cell';
    const width = map.columnWidth(Math.min(insertionColumn, map.width - 1));
    const cell = editor.state.schema.node(cellType, {
      ...(cellType === 'table_header' ? { scope: reference?.node.attrs.scope ?? 'col' } : {}),
      colwidth: width ? [width] : null,
    }, [emptyParagraph(editor)]);
    return row.copy([...row.content.slice(0, insertionIndex), cell, ...row.content.slice(insertionIndex)]);
  });
  const next = table.copy(rows);
  const transaction = editor.state.createTransaction().replaceNode(tablePath, [next]);
  const nextMap = TableMap.create(next, tablePath);
  const selected = nextMap.cellAt(active.row, insertionColumn);
  if (selected) selectFirstText(transaction, selected.node, selected.path);
  editor.dispatch(transaction);
  return true;
}

export function deleteTableColumn(editor: Editor): boolean {
  if (!editor.editable) return false;
  const context = getActiveTableCell(editor);
  if (!context) return false;
  const { tablePath, table, map, cell: active } = context;
  const column = active.column;
  if (map.width <= 1) return removeNode(editor, tablePath);
  const rows = table.content.map((row, rowIndex) => row.copy(row.content.flatMap((cell, cellIndex) => {
    const info = map.cellInfo([...tablePath, rowIndex, cellIndex]);
    if (!info || column < info.column || column >= info.column + info.colspan) return [cell];
    if (info.colspan === 1) return [];
    const widths = Array.isArray(cell.attrs.colwidth) ? [...cell.attrs.colwidth] : Array(info.colspan).fill(0);
    widths.splice(column - info.column, 1);
    return [cell.withAttrs({ ...cell.attrs, colspan: info.colspan - 1, colwidth: widths.some(Boolean) ? widths : null })];
  })));
  const next = table.copy(rows);
  const transaction = editor.state.createTransaction().replaceNode(tablePath, [next]);
  const nextMap = TableMap.create(next, tablePath);
  const selected = nextMap.cellAt(active.row, Math.min(column, nextMap.width - 1));
  if (selected) selectFirstText(transaction, selected.node, selected.path);
  editor.dispatch(transaction);
  return true;
}

/** Moves through table cells with spreadsheet-style Tab navigation. */
export function moveTableCell(editor: Editor, direction: 'next' | 'previous' = 'next'): boolean {
  if (!editor.editable) return false;
  const context = getActiveTableCell(editor);
  if (!context) return false;
  const cells = [...context.map.cells].sort((left, right) => left.row - right.row || left.column - right.column);
  const index = cells.findIndex((cell) => cell.path.join('.') === context.cell.path.join('.'));
  const target = cells[index + (direction === 'next' ? 1 : -1)];
  if (!target && direction === 'next') return addTableRow(editor, 'after');
  if (!target) return false;
  const transaction = editor.state.createTransaction();
  selectFirstText(transaction, target.node, target.path);
  editor.dispatch(transaction);
  return true;
}
