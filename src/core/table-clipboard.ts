import type { Editor } from './editor';
import type { Attributes, Node } from './schema';
import { CellSelection, Selection } from './selection';
import { TableMap, type TableRect } from './table-map';
import { RestructureChildrenStep } from './transaction/restructure-children-step';
import { getNodeAtPath } from './transaction/path';

const MAX_CELLS = 10_000;
const key = (row: number, column: number) => row + ':' + column;
const clone = (node: Node): Node => node.type.create(node.attrs, node.content.map(clone), node.text, node.marks);
const inside = (rect: TableRect, row: number, column: number) => row >= rect.rowFrom && row <= rect.rowTo
  && column >= rect.columnFrom && column <= rect.columnTo;
function geometry(node: Node, rowspan: number, colspan: number, content: readonly Node[], columnOffset = 0): Node {
  const widths = Array.isArray(node.attrs.colwidth) ? node.attrs.colwidth.slice(columnOffset, columnOffset + colspan) : node.attrs.colwidth;
  return node.type.create({ ...node.attrs, rowspan, colspan, colwidth: widths }, content, node.text, node.marks);
}

/** Model-only rich grid placement. Incoming spans are retained; crossing target
 * spans are split without discarding content anchored outside the paste. */
export function pasteRichTableCells(editor: Editor, source: Node): boolean {
  if (!editor.editable || source.type.schema !== editor.state.schema || source.type.name !== 'table') return false;
  const { selection, doc, schema } = editor.state;
  let cellPath: readonly number[] | undefined;
  if (selection instanceof CellSelection) cellPath = selection.anchorCellPath;
  else if (selection instanceof Selection && selection.isCollapsed) {
    for (let size = selection.path.length; size > 0; size--) {
      const path = selection.path.slice(0, size), node = getNodeAtPath(doc, path);
      if (node.type.name === 'table_cell' || node.type.name === 'table_header') { cellPath = path; break; }
    }
  }
  if (!cellPath || !schema.nodes.paragraph || !schema.nodes.table_row) return false;
  const tablePath = cellPath.slice(0, -2), table = getNodeAtPath(doc, tablePath);
  if (table.type.name !== 'table') return false;
  try {
    schema.validate(source);
    let footprint = 0;
    for (const row of source.content) for (const cell of row.content) {
      const width = Number(cell.attrs.colspan ?? 1), height = Number(cell.attrs.rowspan ?? 1);
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return false;
      footprint += width * height;
      if (footprint > MAX_CELLS) return false;
    }
    const incoming = TableMap.create(source), current = TableMap.create(table, tablePath), anchor = current.cellInfo(cellPath);
    if (!anchor || !incoming.valid || !current.valid || !incoming.width || !incoming.height) return false;
    const single = !(selection instanceof CellSelection) || selection.cellPaths.length === 1;
    let rect: TableRect = single ? { rowFrom: anchor.row, columnFrom: anchor.column,
      rowTo: anchor.row + incoming.height - 1, columnTo: anchor.column + incoming.width - 1 }
      : { rowFrom: selection.rowFrom, rowTo: selection.rowTo, columnFrom: selection.columnFrom, columnTo: selection.columnTo };
    // A single copied cell fills selected cells without changing their existing
    // merge geometry. Larger copied grids carry their own span arrangement.
    const fill = incoming.width === 1 && incoming.height === 1;
    if (fill && selection instanceof CellSelection) {
      rect = { rowFrom: selection.rowFrom, rowTo: selection.rowTo,
        columnFrom: selection.columnFrom, columnTo: selection.columnTo };
    } else if (fill) rect = { ...rect, rowTo: anchor.row + anchor.rowspan - 1, columnTo: anchor.column + anchor.colspan - 1 };
    const height = Math.max(current.height, rect.rowTo + 1), width = Math.max(current.width, rect.columnTo + 1);
    const area = height * width, pastedArea = (rect.rowTo - rect.rowFrom + 1) * (rect.columnTo - rect.columnFrom + 1);
    if (!Number.isSafeInteger(area) || area - current.height * current.width > MAX_CELLS || pastedArea > MAX_CELLS) return false;
    const anchors = new Map<string, Node>(), covered = new Set<string>();
    const place = (node: Node, row: number, column: number, rowspan: number, colspan: number) => {
      for (let y = row; y < row + rowspan; y++) for (let x = column; x < column + colspan; x++) {
        const address = key(y, x);
        if (covered.has(address)) throw new Error('Overlapping clipboard cells');
        covered.add(address);
      }
      anchors.set(key(row, column), node);
    };
    const empty = (reference: Node, offset = 0) => geometry(reference, 1, 1,
      [schema.nodes.paragraph!.create({}, [schema.text('')])], offset);
    for (const cell of current.cells) {
      const intersects = cell.row <= rect.rowTo && cell.row + cell.rowspan > rect.rowFrom
        && cell.column <= rect.columnTo && cell.column + cell.colspan > rect.columnFrom;
      if (!intersects) { place(cell.node, cell.row, cell.column, cell.rowspan, cell.colspan); continue; }
      if (fill) {
        const value = incoming.cells[0]!.node;
        const attrs: Attributes = { ...value.attrs, rowspan: cell.rowspan, colspan: cell.colspan,
          colwidth: cell.colspan === 1 ? value.attrs.colwidth ?? cell.node.attrs.colwidth : cell.node.attrs.colwidth };
        place(value.type.create(attrs, value.content.map(clone), value.text, value.marks), cell.row, cell.column, cell.rowspan, cell.colspan);
        continue;
      }
      for (let row = cell.row; row < cell.row + cell.rowspan; row++) for (let column = cell.column; column < cell.column + cell.colspan; column++) {
        if (inside(rect, row, column)) continue;
        const node = row === cell.row && column === cell.column
          ? geometry(cell.node, 1, 1, cell.node.content, column - cell.column) : empty(cell.node, column - cell.column);
        place(node, row, column, 1, 1);
      }
    }
    if (!fill) for (let row = rect.rowFrom; row <= rect.rowTo; row += incoming.height) {
      for (let column = rect.columnFrom; column <= rect.columnTo; column += incoming.width) for (const cell of incoming.cells) {
        const y = row + cell.row, x = column + cell.column;
        if (y > rect.rowTo || x > rect.columnTo) continue;
        const rowspan = Math.min(cell.rowspan, rect.rowTo - y + 1), colspan = Math.min(cell.colspan, rect.columnTo - x + 1);
        place(geometry(cell.node, rowspan, colspan, cell.node.content.map(clone)), y, x, rowspan, colspan);
      }
    }
    const rows: Node[] = [];
    for (let row = 0; row < height; row++) {
      const cells: Node[] = [];
      for (let column = 0; column < width; column++) {
        const address = key(row, column), node = anchors.get(address);
        if (node) cells.push(node);
        else if (!covered.has(address)) {
          const reference = current.cellAt(Math.min(row, current.height - 1), Math.min(column, current.width - 1))?.node ?? anchor.node;
          const node = empty(reference); place(node, row, column, 1, 1); cells.push(node);
        }
      }
      const original = table.content[row];
      rows.push(original ? cells.length === original.childCount && cells.every((cell, index) => cell === original.child(index))
        ? original : original.copy(cells)
        : schema.nodes.table_row.create(source.content[(row - rect.rowFrom) % incoming.height]?.attrs, cells));
    }
    const transaction = editor.createTransaction().step(new RestructureChildrenStep(tablePath, 0, table.content, rows));
    const map = TableMap.create(getNodeAtPath(transaction.doc, tablePath), tablePath);
    if (!map.valid) return false;
    const first = map.cellAt(rect.rowFrom, rect.columnFrom), last = map.cellAt(rect.rowTo, rect.columnTo);
    if (!first || !last) return false;
    transaction.setSelection(new CellSelection(transaction.doc, first.path, last.path));
    schema.validate(transaction.doc);
    return editor.dispatch(transaction);
  } catch { return false; }
}
