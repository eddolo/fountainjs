import type { Attributes } from './schema';

/** A table preference, independent of the column grid and layout algorithm. */
export type TablePreferredWidth = { readonly unit: 'auto' } | { readonly unit: 'nil' }
  | { readonly unit: 'pt' | 'percent'; readonly value: number };

export function isTablePreferredWidth(value: unknown): value is TablePreferredWidth {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const item = value as Record<string, unknown>;
  if (item.unit === 'auto' || item.unit === 'nil') return Object.keys(item).every(key => key === 'unit');
  return (item.unit === 'pt' || item.unit === 'percent')
    && Object.keys(item).every(key => key === 'unit' || key === 'value')
    && typeof item.value === 'number' && Number.isFinite(item.value) && item.value >= 0
    && item.value <= (item.unit === 'pt' ? 10_000 : 1000);
}

export const tablePreferredWidthAttribute = { default: undefined,
  validate: (value: unknown) => value === undefined || isTablePreferredWidth(value) };

export function readTablePreferredWidth(element: { getAttribute(name: string): string | null }): Attributes {
  const source = element.getAttribute('data-fountain-table-preferred-width');
  if (!source || source.length > 256) return {};
  try { const value: unknown = JSON.parse(source); return isTablePreferredWidth(value) ? { preferredWidth: value } : {}; }
  catch { return {}; }
}

export function tablePreferredWidthDOMAttributes(value: unknown): Attributes {
  if (!isTablePreferredWidth(value)) return {};
  const css = value.unit === 'auto' ? 'auto' : value.unit === 'nil' ? '0px'
    : `${value.value}${value.unit === 'pt' ? 'pt' : '%'}`;
  return { 'data-fountain-table-preferred-width': JSON.stringify(value), style: `width:${css}` };
}
