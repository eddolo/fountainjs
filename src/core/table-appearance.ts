import type { Attributes, Node, NodeDOMContext } from './schema';
import { TableMap } from './table-map';
import { getNodeAtPath } from './transaction/path';
import { isTablePreferredWidth } from './table-width';

export const TABLE_EDGE_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export const TABLE_BORDER_SIDES = [...TABLE_EDGE_SIDES, 'insideH', 'insideV'] as const;
export type TableEdgeSide = typeof TABLE_EDGE_SIDES[number];
export type TableBorderSide = typeof TABLE_BORDER_SIDES[number];
export type TableBorder = { readonly style: 'none' } | { readonly style: 'hidden' }
  | { readonly style: 'solid' | 'double' | 'dotted' | 'dashed'; readonly width: number; readonly color: string };

/** Physical declarations in points, not host CSS. Missing sides remain missing;
 * explicit none/hidden and zero padding are real document values. */
export interface TableAppearance {
  readonly unit: 'pt';
  readonly borders?: Readonly<Partial<Record<TableBorderSide, TableBorder>>>;
  readonly padding?: Readonly<Partial<Record<TableEdgeSide, number>>>;
}

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export function isTableAppearance(value: unknown, cell = false): value is TableAppearance {
  if (!record(value) || value.unit !== 'pt' || Object.keys(value).some(key => !['unit', 'borders', 'padding'].includes(key))) return false;
  if (value.padding !== undefined && (!record(value.padding) || Object.entries(value.padding).some(([side, length]) =>
    !TABLE_EDGE_SIDES.includes(side as TableEdgeSide) || typeof length !== 'number' || !Number.isFinite(length) || length < 0 || length > 1000))) return false;
  if (value.borders !== undefined) {
    if (!record(value.borders)) return false;
    for (const [side, border] of Object.entries(value.borders)) {
      if (!(cell ? TABLE_EDGE_SIDES : TABLE_BORDER_SIDES).includes(side as TableEdgeSide) || !record(border)) return false;
      if (border.style === 'none' || border.style === 'hidden') {
        if (Object.keys(border).some(key => key !== 'style')) return false;
      } else if (!['solid', 'double', 'dotted', 'dashed'].includes(String(border.style))
        || Object.keys(border).some(key => !['style', 'width', 'color'].includes(key))
        || typeof border.width !== 'number' || !Number.isFinite(border.width) || border.width < 0.125 || border.width > 12
        || typeof border.color !== 'string' || !/^#[\da-f]{6}$/i.test(border.color)) return false;
    }
  }
  return true;
}
export const tableAppearanceAttribute = { default: undefined, validate: (value: unknown) => value === undefined || isTableAppearance(value) };
export const cellAppearanceAttribute = { default: undefined, validate: (value: unknown) => value === undefined || isTableAppearance(value, true) };

export function readTableAppearance(element: { getAttribute(name: string): string | null }, cell = false): Attributes {
  const source = element.getAttribute('data-fountain-table-appearance');
  if (!source || source.length > 8192) return {};
  try { const appearance = JSON.parse(source) as unknown; return isTableAppearance(appearance, cell) ? { appearance } : {}; }
  catch { return {}; }
}

export function tableAppearanceDOMAttributes(value: unknown): Attributes {
  return isTableAppearance(value) ? { 'data-fountain-table-appearance': JSON.stringify(value),
    style: 'border:0;border-radius:0;border-collapse:collapse' } : {};
}
function borderCSS(border: TableBorder | undefined): string {
  if (!border || border.style === 'none' || border.style === 'hidden') return `0 ${border?.style ?? 'none'}`;
  return `${Number(border.width.toFixed(4))}pt ${border.style} ${border.color}`;
}
const maps = new WeakMap<Node, TableMap>();

/** A context projection, not materialized per-cell copies of table defaults.
 * Reordering/spans therefore select the correct outer/interior edge anew. */
export function cellAppearanceDOMAttributes(node: Node, context?: NodeDOMContext): Attributes {
  const own = isTableAppearance(node.attrs.appearance, true) ? node.attrs.appearance : undefined;
  let table: Node | undefined;
  let row = 0, column = 0, height = 0, width = 0, colspan = 1, rowspan = 1;
  if (context && context.path.length >= 3) {
    try {
      const candidate = getNodeAtPath(context.document, context.path.slice(0, -2));
      if (candidate.type.name === 'table') {
        table = candidate;
        let map = maps.get(table);
        if (!map) { map = TableMap.create(table); maps.set(table, map); }
        const info = map.cellInfo(context.path.slice(-2));
        if (info) ({ row, column, colspan, rowspan } = info);
        height = map.height; width = map.width;
      }
    } catch { /* Standalone custom rendering retains only direct cell declarations. */ }
  }
  const parent = table && isTableAppearance(table.attrs.appearance) ? table.attrs.appearance : undefined;
  if (!own && !parent) return table && isTablePreferredWidth(table.attrs.preferredWidth) ? { style: 'box-sizing:border-box' } : {};
  const inherited = { top: row === 0 ? 'top' : 'insideH', bottom: row + rowspan >= height ? 'bottom' : 'insideH',
    left: column === 0 ? 'left' : 'insideV', right: column + colspan >= width ? 'right' : 'insideV' } as const;
  // Native grid widths already include cell borders and margins. Do not add
  // those a second time through the browser's content-box width convention.
  const styles: string[] = ['box-sizing:border-box'];
  for (const side of TABLE_EDGE_SIDES) {
    // Word 'none' permits the table-level fallback; 'nil' (hidden) suppresses it.
    const direct = own?.borders?.[side];
    const border = direct?.style === 'none' ? parent?.borders?.[inherited[side]] : direct ?? parent?.borders?.[inherited[side]];
    if (parent || direct) styles.push(`border-${side}:${borderCSS(border)}`);
    const padding = own?.padding?.[side] ?? parent?.padding?.[side];
    if (padding !== undefined) styles.push(`padding-${side}:${Number(padding.toFixed(4))}pt`);
    else if (parent) styles.push(`padding-${side}:0`);
  }
  return { ...(own ? { 'data-fountain-table-appearance': JSON.stringify(own) } : {}),
    'data-fountain-cell-appearance': 'true', ...(styles.length ? { style: styles.join(';') } : {}) };
}
