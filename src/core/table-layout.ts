import type { Attributes, DOMOutputSpec, Node } from './schema';
import { TableMap } from './table-map';
import { tableAppearanceDOMAttributes } from './table-appearance';
import { isTablePreferredWidth, readTablePreferredWidth, tablePreferredWidthDOMAttributes } from './table-width';
import { textDirectionDOMAttributes } from './text-direction';

export const tableLayoutAttribute = {
  default: undefined,
  validate: (value: unknown) => value === undefined || value === 'auto' || value === 'fixed',
};

export function readTableRow(element: { getAttribute(name: string): string | null }): Attributes {
  const value = element.getAttribute('data-fountain-repeat-header');
  return value === 'true' || value === 'false' ? { repeatHeader: value === 'true' } : {};
}

export function tableRowDOMSpec(node: Node): DOMOutputSpec {
  return ['tr', { ...textDirectionDOMAttributes(node.attrs), ...(typeof node.attrs.repeatHeader === 'boolean'
    ? { 'data-fountain-repeat-header': String(node.attrs.repeatHeader) } : {}) }, 0];
}

/** A role is the legacy host default, not a replacement for explicit page intent. */
export function tableRowRepeats(node: Node): boolean {
  return typeof node.attrs.repeatHeader === 'boolean' ? node.attrs.repeatHeader
    : node.childCount > 0 && node.content.every(cell => cell.type.name === 'table_header');
}

/** Only a contiguous, rowspan-safe leading band can be repeated. */
export function repeatedDOMTableRows<T extends {
  getAttribute(name: string): string | null;
  cells: ArrayLike<{ tagName: string; rowSpan: number }>;
}>(rows: readonly T[]): readonly T[] {
  const headers: T[] = [];
  for (const row of rows) {
    const intent = readTableRow(row).repeatHeader;
    const cells = Array.from(row.cells);
    if (!(intent ?? (cells.length > 0 && cells.every(cell => cell.tagName === 'TH')))) break;
    headers.push(row);
  }
  return headers.every((row, index) => Array.from(row.cells).every(cell =>
    index + (cell.rowSpan === 0 ? rows.length - index : Math.max(1, cell.rowSpan)) <= headers.length))
    ? headers : [];
}

export function readTableLayout(element: { getAttribute(name: string): string | null; style: { tableLayout?: string } }): Attributes {
  const value = element.getAttribute('data-fountain-table-layout') || element.style.tableLayout;
  return { ...readTablePreferredWidth(element), ...(value === 'auto' || value === 'fixed' ? { layout: value } : {}) };
}

/** Layout is document state; columns are derived from the existing cell grid. */
export function tableDOMSpec(node: Node): DOMOutputSpec {
  const preferred = tablePreferredWidthDOMAttributes(node.attrs.preferredWidth);
  const paint = tableAppearanceDOMAttributes(node.attrs.appearance);
  const combinedStyle = [paint.style, preferred.style].filter(Boolean).join(';');
  const appearance = { ...paint, ...preferred, ...textDirectionDOMAttributes(node.attrs), ...(combinedStyle ? { style: combinedStyle } : {}) };
  const style = appearance.style ? `${appearance.style};` : '';
  if (node.attrs.layout !== 'fixed' && node.attrs.layout !== 'auto') return ['table', appearance, ['tbody', 0]];
  if (node.attrs.layout === 'auto') return ['table', { ...appearance, 'data-fountain-table-layout': 'auto', style: `${style}table-layout:auto` }, ['tbody', 0]];
  const map = TableMap.create(node);
  const widths = Array.from({ length: map.width }, (_, column) => map.columnWidth(column));
  const complete = widths.length > 0 && widths.every(width => width !== null);
  const width = complete ? widths.reduce<number>((sum, item) => sum + item!, 0) : undefined;
  const preference = node.attrs.preferredWidth;
  const followsGrid = !preferred.style || (isTablePreferredWidth(preference) && preference.unit === 'pt'
    && width !== undefined && Math.abs(preference.value * 4 / 3 - width) < 1e-6);
  return ['table', { ...appearance, 'data-fountain-table-layout': 'fixed',
    style: `${style}table-layout:fixed;box-sizing:border-box;overflow-wrap:anywhere${preferred.style || width === undefined ? '' : `;width:${width}px`}` },
    // An inferred whole-table width already includes the standard outer border.
    // Divide that box by the stored grid ratios instead of adding absolute
    // column widths to the border again. A matching physical preference uses
    // the same projection after DOCX reopening; different preferences remain
    // independent of the grid.
    ['colgroup', ...widths.map(item => ['col', item === null ? {} : { style: `width:${followsGrid && width ? `${item / width * 100}%` : `${item}px`}` }] as DOMOutputSpec)],
    ['tbody', 0]];
}
