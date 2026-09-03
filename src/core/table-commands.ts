import type { Editor } from './editor';
import { HTMLExporter } from './exporters/html-exporter';
import { Node, type Attributes } from './schema';
import { CellSelection, Selection } from './selection';
import { TableMap, type TableCellInfo, type TableRect } from './table-map';
import type { EditorState } from './state';
import { comparePaths, getNodeAtPath } from './transaction/path';

const CELL_NAMES = new Set(['table_cell', 'table_header']);
const MIN_COLUMN_WIDTH = 40;
const MAX_COLUMN_WIDTH = 2_000;
const MAX_PASTE_CELLS = 10_000;

function pathKey(path: readonly number[]): string { return path.join('.'); }

function cellPathFromSelection(editor: Editor): readonly number[] | null {
  const selection = editor.state.selection;
  if (selection instanceof CellSelection) return selection.headCellPath;
  for (let length = selection.path.length; length > 0; length -= 1) {
    const path = selection.path.slice(0, length);
    try { if (CELL_NAMES.has(getNodeAtPath(editor.state.doc, path).type.name)) return path; }
    catch { return null; }
  }
  return null;
}

export interface ActiveTableCell {
  readonly tablePath: readonly number[];
  readonly table: Node;
  readonly map: TableMap;
  readonly cell: TableCellInfo;
}

export function getActiveTableCell(editor: Editor, requestedPath?: readonly number[]): ActiveTableCell | null {
  const cellPath = requestedPath ?? cellPathFromSelection(editor);
  if (!cellPath || cellPath.length < 3) return null;
  const tablePath = cellPath.slice(0, -2);
  try {
    const table = getNodeAtPath(editor.state.doc, tablePath);
    if (table.type.name !== 'table') return null;
    const map = TableMap.create(table, tablePath);
    const cell = map.cellInfo(cellPath);
    return cell ? { tablePath: Object.freeze([...tablePath]), table, map, cell } : null;
  } catch { return null; }
}

function normalizedWidths(cell: Node, colspan = Number(cell.attrs.colspan) || 1): number[] | null {
  const source = Array.isArray(cell.attrs.colwidth) ? cell.attrs.colwidth : [];
  const widths = Array.from({ length: colspan }, (_, index) => {
    const width = Number(source[index]);
    return Number.isFinite(width) && width >= MIN_COLUMN_WIDTH && width <= MAX_COLUMN_WIDTH ? Math.round(width) : 0;
  });
  return widths.some(Boolean) ? widths : null;
}

function cellAttrs(cell: Node, overrides: Attributes = {}, targetName = cell.type.name): Attributes {
  const colspan = Number(overrides.colspan ?? cell.attrs.colspan) || 1;
  const attrs: Attributes = {
    colspan,
    rowspan: Number(overrides.rowspan ?? cell.attrs.rowspan) || 1,
    colwidth: overrides.colwidth === undefined ? normalizedWidths(cell, colspan) : overrides.colwidth,
  };
  if (targetName === 'table_header') {
    attrs.scope = overrides.scope ?? cell.attrs.scope ?? 'col';
  }
  return attrs;
}

function recreateCell(cell: Node, attrs: Attributes = {}, targetName = cell.type.name, content = cell.content): Node {
  const type = cell.type.schema.nodes[targetName];
  if (!type) throw new Error(`Schema is missing ${targetName}.`);
  return type.create(cellAttrs(cell, attrs, targetName), content);
}

function emptyCell(reference: Node, targetName = reference.type.name, attrs: Attributes = {}): Node {
  const schema = reference.type.schema;
  return schema.node(targetName, cellAttrs(reference, { colspan: 1, rowspan: 1, colwidth: null, ...attrs }, targetName), [
    schema.node('paragraph', {}, [schema.text('')]),
  ]);
}

interface NextCellSelection {
  readonly anchor: readonly number[];
  readonly head?: readonly number[];
}

function replaceTable(editor: Editor, tablePath: readonly number[], table: Node, selection?: NextCellSelection): boolean {
  const transaction = editor.state.createTransaction().replaceNode(tablePath, [table]);
  if (selection) transaction.setSelection(new CellSelection(transaction.doc, selection.anchor, selection.head));
  else {
    const current = editor.state.selection;
    try {
      if (current instanceof CellSelection) {
        transaction.setSelection(new CellSelection(transaction.doc, current.anchorCellPath, current.headCellPath));
      } else if (current instanceof Selection) {
        const start = getNodeAtPath(transaction.doc, current.path);
        const end = getNodeAtPath(transaction.doc, current.endPath);
        if (start.isText && end.isText) {
          transaction.setSelection(Selection.range(
            current.path,
            Math.min(current.from, start.text?.length ?? 0),
            current.endPath,
            Math.min(current.to, end.text?.length ?? 0),
          ));
        }
      }
    } catch { /* Keep the transaction's recoverable mapped selection. */ }
  }
  try { editor.state.schema.validate(transaction.doc); }
  catch { return false; }
  editor.dispatch(transaction);
  return true;
}

function selectionContext(editor: Editor): { selection: CellSelection; tablePath: readonly number[]; table: Node; map: TableMap } | null {
  const { selection } = editor.state;
  if (!(selection instanceof CellSelection)) return null;
  const tablePath = selection.anchorCellPath.slice(0, -2);
  if (comparePaths(tablePath, selection.headCellPath.slice(0, -2)) !== 0) return null;
  const table = getNodeAtPath(editor.state.doc, tablePath);
  if (table.type.name !== 'table') return null;
  return { selection, tablePath, table, map: TableMap.create(table, tablePath) };
}

function pathForCell(tablePath: readonly number[], row: number, cellIndex: number): readonly number[] {
  return Object.freeze([...tablePath, row, cellIndex]);
}

export function mergeTableCells(editor: Editor): boolean {
  if (!editor.editable) return false;
  const context = selectionContext(editor);
  if (!context || context.selection.cellPaths.length < 2) return false;
  const { selection, tablePath, table, map } = context;
  const rect: TableRect = {
    rowFrom: selection.rowFrom,
    rowTo: selection.rowTo,
    columnFrom: selection.columnFrom,
    columnTo: selection.columnTo,
  };
  const selected = map.cellsInRect(rect);
  const selectedKeys = new Set(selected.map((cell) => pathKey(cell.path)));
  if (selected.some((cell) => cell.row < rect.rowFrom || cell.column < rect.columnFrom
    || cell.row + cell.rowspan - 1 > rect.rowTo || cell.column + cell.colspan - 1 > rect.columnTo)) return false;
  for (let row = rect.rowFrom; row <= rect.rowTo; row += 1) {
    for (let column = rect.columnFrom; column <= rect.columnTo; column += 1) {
      const cell = map.cellAt(row, column);
      if (!cell || !selectedKeys.has(pathKey(cell.path))) return false;
    }
  }
  const anchor = map.cellAt(rect.rowFrom, rect.columnFrom);
  if (!anchor || anchor.row !== rect.rowFrom || anchor.column !== rect.columnFrom) return false;
  const colwidth = Array.from({ length: rect.columnTo - rect.columnFrom + 1 }, (_, offset) => map.columnWidth(rect.columnFrom + offset) ?? 0);
  const merged = recreateCell(anchor.node, {
    colspan: rect.columnTo - rect.columnFrom + 1,
    rowspan: rect.rowTo - rect.rowFrom + 1,
    colwidth: colwidth.some(Boolean) ? colwidth : null,
  }, anchor.node.type.name, selected.flatMap((cell) => cell.node.content));
  const anchorKey = pathKey(anchor.path);
  let mergedIndex = anchor.path.at(-1) as number;
  const rows = table.content.map((row, rowIndex) => {
    const content: Node[] = [];
    row.content.forEach((cell, cellIndex) => {
      const key = pathKey(pathForCell(tablePath, rowIndex, cellIndex));
      if (!selectedKeys.has(key)) content.push(cell);
      else if (key === anchorKey) {
        mergedIndex = content.length;
        content.push(merged);
      }
    });
    return row.copy(content);
  });
  const next = table.copy(rows);
  const nextPath = [...tablePath, rect.rowFrom, mergedIndex];
  return replaceTable(editor, tablePath, next, { anchor: nextPath });
}

export function splitTableCell(editor: Editor): boolean {
  if (!editor.editable) return false;
  const context = getActiveTableCell(editor);
  if (!context) return false;
  const { tablePath, table, map, cell } = context;
  if (cell.colspan === 1 && cell.rowspan === 1) return false;
  if (cell.row + cell.rowspan > map.height) return false;
  const widths = normalizedWidths(cell.node, cell.colspan) ?? Array(cell.colspan).fill(0);
  const generated = Array.from({ length: cell.colspan }, (_, column) => column === 0
    ? recreateCell(cell.node, { colspan: 1, rowspan: 1, colwidth: widths[column] ? [widths[column]] : null })
    : emptyCell(cell.node, cell.node.type.name, { colwidth: widths[column] ? [widths[column]] : null }));
  const targetIndex = cell.path.at(-1) as number;
  const rows = table.content.map((row, rowIndex) => {
    if (rowIndex === cell.row) {
      return row.copy([...row.content.slice(0, targetIndex), ...generated, ...row.content.slice(targetIndex + 1)]);
    }
    if (rowIndex <= cell.row || rowIndex >= cell.row + cell.rowspan) return row;
    const rowCells = map.cells.filter((candidate) => candidate.row === rowIndex).sort((left, right) => left.column - right.column);
    const nextAnchor = rowCells.find((candidate) => candidate.column > cell.column);
    const insertionIndex = nextAnchor ? nextAnchor.path.at(-1) as number : row.childCount;
    const additions = Array.from({ length: cell.colspan }, (_, column) => emptyCell(
      cell.node,
      cell.node.type.name,
      { colwidth: widths[column] ? [widths[column]] : null },
    ));
    return row.copy([...row.content.slice(0, insertionIndex), ...additions, ...row.content.slice(insertionIndex)]);
  });
  const next = table.copy(rows);
  const nextPath = [...tablePath, cell.row, targetIndex];
  return replaceTable(editor, tablePath, next, { anchor: nextPath });
}

function convertCells(editor: Editor, cells: readonly TableCellInfo[], toHeader: boolean, scope: 'col' | 'row'): boolean {
  const context = getActiveTableCell(editor, cells[0]?.path);
  if (!context || !cells.length) return false;
  const selected = new Set(cells.map((cell) => pathKey(cell.path)));
  const targetName = toHeader ? 'table_header' : 'table_cell';
  if (!editor.state.schema.nodes[targetName]) return false;
  const rows = context.table.content.map((row, rowIndex) => row.copy(row.content.map((cell, cellIndex) => {
    const key = pathKey(pathForCell(context.tablePath, rowIndex, cellIndex));
    if (!selected.has(key)) return cell;
    return recreateCell(cell, { scope: cell.attrs.colspan === 1 ? scope : scope === 'col' ? 'colgroup' : 'rowgroup' }, targetName);
  })));
  return replaceTable(editor, context.tablePath, context.table.copy(rows));
}

export function toggleTableHeaderRow(editor: Editor, requestedRow?: number): boolean {
  if (!editor.editable) return false;
  const context = getActiveTableCell(editor);
  if (!context) return false;
  const row = requestedRow ?? context.cell.row;
  if (row < 0 || row >= context.map.height) return false;
  const cells = context.map.cellsInRect({ rowFrom: row, rowTo: row, columnFrom: 0, columnTo: context.map.width - 1 });
  return convertCells(editor, cells, !cells.every((cell) => cell.node.type.name === 'table_header'), 'col');
}

export function toggleTableHeaderColumn(editor: Editor, requestedColumn?: number): boolean {
  if (!editor.editable) return false;
  const context = getActiveTableCell(editor);
  if (!context) return false;
  const column = requestedColumn ?? context.cell.column;
  if (column < 0 || column >= context.map.width) return false;
  const cells = context.map.cellsInRect({ rowFrom: 0, rowTo: context.map.height - 1, columnFrom: column, columnTo: column });
  return convertCells(editor, cells, !cells.every((cell) => cell.node.type.name === 'table_header'), 'row');
}

export function toggleTableHeaderCell(editor: Editor): boolean {
  if (!editor.editable) return false;
  const context = getActiveTableCell(editor);
  return context ? convertCells(editor, [context.cell], context.cell.node.type.name !== 'table_header', 'col') : false;
}

export function selectTableRow(editor: Editor, requestedRow?: number): boolean {
  const context = getActiveTableCell(editor);
  if (!context) return false;
  const row = requestedRow ?? context.cell.row;
  const anchor = context.map.cellAt(row, 0);
  const head = context.map.cellAt(row, context.map.width - 1);
  if (!anchor || !head) return false;
  editor.dispatch(editor.state.createTransaction().setSelection(new CellSelection(editor.state.doc, anchor.path, head.path)));
  return true;
}

export function selectTableColumn(editor: Editor, requestedColumn?: number): boolean {
  const context = getActiveTableCell(editor);
  if (!context) return false;
  const column = requestedColumn ?? context.cell.column;
  const anchor = context.map.cellAt(0, column);
  const head = context.map.cellAt(context.map.height - 1, column);
  if (!anchor || !head) return false;
  editor.dispatch(editor.state.createTransaction().setSelection(new CellSelection(editor.state.doc, anchor.path, head.path)));
  return true;
}

export function resizeTableColumn(
  editor: Editor,
  width: number,
  requestedColumn?: number,
  requestedTablePath?: readonly number[],
): boolean {
  if (!editor.editable || !Number.isFinite(width)) return false;
  const context = getActiveTableCell(editor);
  const tablePath = requestedTablePath ?? context?.tablePath;
  if (!tablePath) return false;
  let table: Node;
  try { table = getNodeAtPath(editor.state.doc, tablePath); } catch { return false; }
  if (table.type.name !== 'table') return false;
  const map = TableMap.create(table, tablePath);
  const column = requestedColumn ?? context?.cell.column;
  if (column === undefined || column < 0 || column >= map.width) return false;
  const nextWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(width)));
  const rows = table.content.map((row, rowIndex) => row.copy(row.content.map((cell, cellIndex) => {
    const info = map.cellInfo(pathForCell(tablePath, rowIndex, cellIndex));
    if (!info || column < info.column || column >= info.column + info.colspan) return cell;
    const widths = normalizedWidths(cell, info.colspan) ?? Array(info.colspan).fill(0);
    widths[column - info.column] = nextWidth;
    return recreateCell(cell, { colwidth: widths });
  })));
  const transaction = editor.state.createTransaction().replaceNode(tablePath, [table.copy(rows)]).setMeta('table$resize', true);
  editor.dispatch(transaction);
  return true;
}

function repairedTable(table: Node): Node {
  const map = TableMap.create(table);
  if (map.valid) return table;
  const schema = table.type.schema;
  const width = Math.max(1, map.width);
  const rows = table.content.map((row, rowIndex) => {
    const anchors = map.cells.filter((cell) => cell.row === rowIndex).sort((left, right) => left.column - right.column);
    const byColumn = new Map(anchors.map((cell) => [cell.column, cell]));
    const content: Node[] = [];
    const headers = row.content.length > 0 && row.content.every((cell) => cell.type.name === 'table_header');
    let column = 0;
    while (column < width) {
      const covering = map.cellAt(rowIndex, column);
      if (covering && covering.row < rowIndex) {
        column += 1;
        continue;
      }
      const anchor = byColumn.get(column);
      if (anchor) {
        const rowspan = Math.max(1, Math.min(anchor.rowspan, map.height - rowIndex));
        content.push(recreateCell(anchor.node, { rowspan }));
        column += anchor.colspan;
      } else {
        const typeName = headers && schema.nodes.table_header ? 'table_header' : 'table_cell';
        const reference = row.content[0] ?? table.content[0]?.content[0];
        if (!reference) throw new Error('Cannot repair a table without a cell type.');
        content.push(emptyCell(reference, typeName));
        column += 1;
      }
    }
    return row.copy(content);
  });
  return table.copy(rows);
}

export function repairTableNode(table: Node): Node {
  return repairedTable(table);
}

export function createTableRepairTransaction(state: EditorState): ReturnType<EditorState['createTransaction']> | null {
  const paths: number[][] = [];
  state.doc.descendants((node, path) => { if (node.type.name === 'table' && !TableMap.create(node, path).valid) paths.push(path); });
  if (!paths.length) return null;
  const transaction = state.createTransaction();
  [...paths].sort((left, right) => right.length - left.length || comparePaths(right, left)).forEach((path) => {
    const table = getNodeAtPath(transaction.doc, path);
    transaction.replaceNode(path, [repairedTable(table)]);
  });
  transaction.setMeta('addToHistory', false).setMeta('table$repair', true);
  return transaction;
}

export function repairTable(editor: Editor, requestedTablePath?: readonly number[]): boolean {
  if (!editor.editable) return false;
  const tablePath = requestedTablePath ?? getActiveTableCell(editor)?.tablePath;
  if (!tablePath) return false;
  let table: Node;
  try { table = getNodeAtPath(editor.state.doc, tablePath); } catch { return false; }
  const repaired = repairedTable(table);
  return !repaired.eq(table) && replaceTable(editor, tablePath, repaired);
}

function parseTabularText(text: string): readonly (readonly string[])[] | null {
  const normalized = text.replace(/\r\n?/g, '\n');
  if (!normalized.includes('\t') && !normalized.includes('\n')) return null;
  const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n');
  const matrix = lines.map((line) => line.split('\t'));
  const width = Math.max(0, ...matrix.map((row) => row.length));
  if (!matrix.length || !width || matrix.length * width > MAX_PASTE_CELLS) return null;
  return matrix.map((row) => Object.freeze(Array.from({ length: width }, (_, column) => row[column] ?? '')));
}

export function pasteTableCells(editor: Editor, text: string): boolean {
  if (!editor.editable) return false;
  const context = selectionContext(editor);
  const matrix = parseTabularText(text);
  if (!context || !matrix) return false;
  const selected = context.selection;
  const pasteHeight = matrix.length;
  const pasteWidth = matrix[0]?.length ?? 0;
  const single = selected.rowFrom === selected.rowTo && selected.columnFrom === selected.columnTo;
  const rect: TableRect = single
    ? {
      rowFrom: selected.rowFrom,
      rowTo: selected.rowFrom + pasteHeight - 1,
      columnFrom: selected.columnFrom,
      columnTo: selected.columnFrom + pasteWidth - 1,
    }
    : { rowFrom: selected.rowFrom, rowTo: selected.rowTo, columnFrom: selected.columnFrom, columnTo: selected.columnTo };
  if (rect.rowTo >= context.map.height || rect.columnTo >= context.map.width) return false;
  const targets = context.map.cellsInRect(rect);
  if (targets.some((cell) => cell.rowspan !== 1 || cell.colspan !== 1)) return false;
  const paragraph = editor.state.schema.nodes.paragraph;
  if (!paragraph) return false;
  const transaction = editor.state.createTransaction();
  for (let row = rect.rowFrom; row <= rect.rowTo; row += 1) {
    for (let column = rect.columnFrom; column <= rect.columnTo; column += 1) {
      const cell = context.map.cellAt(row, column);
      if (!cell) return false;
      const value = matrix[(row - rect.rowFrom) % pasteHeight]?.[(column - rect.columnFrom) % pasteWidth] ?? '';
      transaction.replaceNode(cell.path, [cell.node.copy([paragraph.create({}, [editor.state.schema.text(value)])])]);
    }
  }
  const anchor = context.map.cellAt(rect.rowFrom, rect.columnFrom);
  const head = context.map.cellAt(rect.rowTo, rect.columnTo);
  if (!anchor || !head) return false;
  transaction.setSelection(new CellSelection(transaction.doc, anchor.path, head.path));
  editor.dispatch(transaction);
  return true;
}

export interface SerializedTableSelection {
  readonly text: string;
  readonly html: string;
}

export function serializeTableSelection(doc: Node, selection: CellSelection): SerializedTableSelection | null {
  const tablePath = selection.anchorCellPath.slice(0, -2);
  let table: Node;
  try { table = getNodeAtPath(doc, tablePath); } catch { return null; }
  if (table.type.name !== 'table') return null;
  const map = TableMap.create(table, tablePath);
  const textRows: string[] = [];
  const htmlRows: string[] = [];
  for (let row = selection.rowFrom; row <= selection.rowTo; row += 1) {
    const textCells: string[] = [];
    const htmlCells: string[] = [];
    for (let column = selection.columnFrom; column <= selection.columnTo; column += 1) {
      const cell = map.cellAt(row, column);
      if (!cell) {
        textCells.push('');
        continue;
      }
      const isAnchor = cell.row === row && cell.column === column;
      textCells.push(isAnchor ? cell.node.textContent.replace(/[\t\r\n]+/g, ' ') : '');
      if (isAnchor) htmlCells.push(HTMLExporter.export(cell.node, { document: false }));
    }
    textRows.push(textCells.join('\t'));
    htmlRows.push(`<tr>${htmlCells.join('')}</tr>`);
  }
  return Object.freeze({
    text: textRows.join('\n'),
    html: `<table><tbody>${htmlRows.join('')}</tbody></table>`,
  });
}
