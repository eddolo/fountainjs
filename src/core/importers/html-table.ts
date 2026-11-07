import type { Attributes, Node, Schema } from '../schema';
import { readTableAppearance } from '../table-appearance';
import { tableBackground } from '../table-background';
import { readTableCellWidths } from '../table-column-width';
import { readTableLayout, readTablePlacement, readTableRow } from '../table-layout';
import { readContainerDirection, readTextAlignmentAttributes, readTextDirection } from '../text-direction';

/** Native table row order: header, body/direct rows, footer; stable within each. */
function orderedHTMLTableRows<T>(rows: readonly T[], groupName: (row: T) => string): T[] {
  const head: T[] = [];
  const body: T[] = [];
  const foot: T[] = [];
  for (const row of rows) {
    const tag = groupName(row).toLowerCase();
    (tag === 'thead' ? head : tag === 'tfoot' ? foot : body).push(row);
  }
  return [...head, ...body, ...foot];
}

/** Remaining rows are counted within each source row group, not the whole table. */
function remainingHTMLTableRows<T>(rows: readonly T[], group: (row: T) => unknown): ReadonlyMap<T, number> {
  const counts = new Map<unknown, number>();
  const remaining = new Map<T, number>();
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    const key = group(row);
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    remaining.set(row, count);
  }
  return remaining;
}

/** HTML non-negative integer parsing; null means invalid/missing, not zero. */
function htmlTableSpan(value: string | null): number | null {
  const digits = /^[\t\n\f\r ]*\+?(\d+)/u.exec(value ?? '')?.[1];
  return digits === undefined ? null : Number(digits);
}
interface TableElement {
  readonly tagName: string;
  readonly style: { readonly backgroundColor?: string; readonly tableLayout?: string; readonly textAlign?: string; readonly width?: string };
  getAttribute(name: string): string | null;
}

interface HTMLTableProjection<E> {
  readonly rows: readonly E[];
  readonly groupKey: (row: E) => unknown;
  readonly groupName: (row: E) => string;
  readonly cells: (row: E) => readonly E[];
  readonly blocks: (cell: E, attrs: Attributes) => Node[];
  readonly paragraph: (cell: E) => Node;
  readonly inheritRowMarks: (row: E, node: Node) => Node;
  readonly report?: (issue: 'row-order' | 'zero-rowspan' | 'span-limit') => void;
}

export function projectHTMLTable<E extends TableElement>(element: E, schema: Schema, source: HTMLTableProjection<E>): Node | undefined {
  if (!source.rows.length) return undefined;
  const remaining = remainingHTMLTableRows(source.rows, source.groupKey);
  const ordered = orderedHTMLTableRows(source.rows, source.groupName);
  if (source.report && ordered.some((row, index) => row !== source.rows[index])) source.report('row-order');
  const rows = ordered.map(row => {
    const attrs = { ...readTableRow(row), ...readContainerDirection(row, schema) };
    const cells = source.cells(row).filter(cell => /^(td|th)$/i.test(cell.tagName)).map(cell => {
      const columns = htmlTableSpan(cell.getAttribute('colspan')) ?? 1;
      const rowSpan = htmlTableSpan(cell.getAttribute('rowspan'));
      const resolvedRows = rowSpan === 0 ? remaining.get(row)! : rowSpan ?? 1;
      if (rowSpan === 0) source.report?.('zero-rowspan');
      if (resolvedRows > 100 || columns > 100) source.report?.('span-limit');
      const colspan = Math.max(1, Math.min(100, columns));
      const rowspan = Math.max(1, Math.min(100, resolvedRows));
      const dir = readTextDirection(cell, schema, true);
      const content = source.blocks(cell, { ...readTextAlignmentAttributes(cell, cell.style.textAlign, dir), ...dir });
      const header = cell.tagName.toLowerCase() === 'th';
      return schema.node(header ? 'table_header' : 'table_cell', {
        colspan, rowspan, colwidth: readTableCellWidths(cell, colspan),
        background: tableBackground(cell.style.backgroundColor),
        ...readTableAppearance(cell, true),
        ...readContainerDirection(cell, schema),
        ...(header ? { scope: cell.getAttribute('scope') || 'col' } : {}),
      }, content.length ? content : [source.paragraph(cell)]);
    });
    const node = schema.node('table_row', attrs, cells);
    return source.inheritRowMarks(row, node);
  });
  const placement = schema.nodes.table?.spec.attrs?.placement ? readTablePlacement(element) : {};
  return schema.node('table', { ...readTableLayout(element), ...placement, ...readTableAppearance(element), ...readContainerDirection(element, schema) }, rows);
}
