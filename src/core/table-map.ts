import type { Node } from './schema';

export interface TableCellInfo {
  readonly node: Node;
  readonly path: readonly number[];
  readonly row: number;
  readonly column: number;
  readonly rowspan: number;
  readonly colspan: number;
}

export interface TableRect {
  readonly rowFrom: number;
  readonly rowTo: number;
  readonly columnFrom: number;
  readonly columnTo: number;
}

export interface TableProblem {
  readonly kind: 'missing' | 'overflow';
  readonly row: number;
  readonly column: number;
  readonly path?: readonly number[];
}

function span(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 1 ? Math.min(100, Number(value)) : 1;
}

function pathKey(path: readonly number[]): string { return path.join('.'); }

/** Logical table geometry independent of DOM row/cell indexes. */
export class TableMap {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly TableCellInfo[];
  readonly problems: readonly TableProblem[];
  private readonly grid: readonly (readonly (TableCellInfo | null)[])[];
  private readonly byPath: ReadonlyMap<string, TableCellInfo>;

  private constructor(table: Node, tablePath: readonly number[]) {
    if (table.type.name !== 'table') throw new Error('TableMap requires a table node.');
    this.height = table.childCount;
    const grid: (TableCellInfo | null)[][] = Array.from({ length: this.height }, () => []);
    const cells: TableCellInfo[] = [];
    const problems: TableProblem[] = [];

    table.content.forEach((row, rowIndex) => {
      let cursor = 0;
      row.content.forEach((cell, cellIndex) => {
        const colspan = span(cell.attrs.colspan);
        const rowspan = span(cell.attrs.rowspan);
        while (true) {
          while (grid[rowIndex]?.[cursor]) cursor += 1;
          const available = Array.from({ length: colspan }, (_, offset) => !grid[rowIndex]?.[cursor + offset]).every(Boolean);
          if (available) break;
          cursor += 1;
        }
        const info: TableCellInfo = Object.freeze({
          node: cell,
          path: Object.freeze([...tablePath, rowIndex, cellIndex]),
          row: rowIndex,
          column: cursor,
          rowspan,
          colspan,
        });
        cells.push(info);
        if (rowIndex + rowspan > this.height) {
          problems.push(Object.freeze({ kind: 'overflow', row: rowIndex, column: cursor, path: info.path }));
        }
        for (let rowOffset = 0; rowOffset < rowspan && rowIndex + rowOffset < this.height; rowOffset += 1) {
          const targetRow = grid[rowIndex + rowOffset] as (TableCellInfo | null)[];
          for (let columnOffset = 0; columnOffset < colspan; columnOffset += 1) {
            targetRow[cursor + columnOffset] = info;
          }
        }
        cursor += colspan;
      });
    });

    this.width = grid.reduce((maximum, row) => Math.max(maximum, row.length), 0);
    grid.forEach((row, rowIndex) => {
      for (let column = 0; column < this.width; column += 1) {
        if (!row[column]) problems.push(Object.freeze({ kind: 'missing', row: rowIndex, column }));
      }
    });
    this.grid = Object.freeze(grid.map((row) => Object.freeze(Array.from({ length: this.width }, (_, column) => row[column] ?? null))));
    this.cells = Object.freeze(cells);
    this.problems = Object.freeze(problems);
    this.byPath = new Map(cells.map((cell) => [pathKey(cell.path), cell]));
  }

  static create(table: Node, tablePath: readonly number[] = []): TableMap {
    return new TableMap(table, tablePath);
  }

  get valid(): boolean { return this.width > 0 && this.height > 0 && this.problems.length === 0; }

  cellAt(row: number, column: number): TableCellInfo | null {
    return this.grid[row]?.[column] ?? null;
  }

  cellInfo(path: readonly number[]): TableCellInfo | null {
    return this.byPath.get(pathKey(path)) ?? null;
  }

  cellsInRect(rect: TableRect): readonly TableCellInfo[] {
    const unique = new Map<string, TableCellInfo>();
    for (let row = rect.rowFrom; row <= rect.rowTo; row += 1) {
      for (let column = rect.columnFrom; column <= rect.columnTo; column += 1) {
        const cell = this.cellAt(row, column);
        if (cell) unique.set(pathKey(cell.path), cell);
      }
    }
    return Object.freeze([...unique.values()].sort((left, right) => left.row - right.row || left.column - right.column));
  }

  /** Expands a requested rectangle until it never cuts through a spanning cell. */
  rectangleBetween(anchorPath: readonly number[], headPath: readonly number[]): TableRect {
    const anchor = this.cellInfo(anchorPath);
    const head = this.cellInfo(headPath);
    if (!anchor || !head) throw new Error('Both cell paths must belong to this table.');
    let rowFrom = Math.min(anchor.row, head.row);
    let rowTo = Math.max(anchor.row + anchor.rowspan - 1, head.row + head.rowspan - 1);
    let columnFrom = Math.min(anchor.column, head.column);
    let columnTo = Math.max(anchor.column + anchor.colspan - 1, head.column + head.colspan - 1);
    let changed = true;
    while (changed) {
      changed = false;
      for (const cell of this.cellsInRect({ rowFrom, rowTo, columnFrom, columnTo })) {
        const nextRowFrom = Math.min(rowFrom, cell.row);
        const nextRowTo = Math.max(rowTo, cell.row + cell.rowspan - 1);
        const nextColumnFrom = Math.min(columnFrom, cell.column);
        const nextColumnTo = Math.max(columnTo, cell.column + cell.colspan - 1);
        if (nextRowFrom !== rowFrom || nextRowTo !== rowTo || nextColumnFrom !== columnFrom || nextColumnTo !== columnTo) {
          changed = true;
        }
        rowFrom = nextRowFrom;
        rowTo = Math.min(this.height - 1, nextRowTo);
        columnFrom = nextColumnFrom;
        columnTo = Math.min(this.width - 1, nextColumnTo);
      }
    }
    return Object.freeze({ rowFrom, rowTo, columnFrom, columnTo });
  }

  columnWidth(column: number): number | null {
    for (const cell of this.cells) {
      if (column < cell.column || column >= cell.column + cell.colspan) continue;
      const widths = Array.isArray(cell.node.attrs.colwidth) ? cell.node.attrs.colwidth : [];
      const width = Number(widths[column - cell.column]);
      if (Number.isFinite(width) && width > 0) return width;
    }
    return null;
  }
}
