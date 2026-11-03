import type { Attributes } from './schema';
import { fontFamilyCSS, normalizeFontFamily } from '../text-style/values';

export const LIST_MARKER_STYLES = Object.freeze(['decimal', 'decimal-leading-zero', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman', 'literal', 'none'] as const);
export type ListMarkerStyle = typeof LIST_MARKER_STYLES[number];

/** Geometry relative to the containing content box, in points. A list moves its
 * text origin; an item override moves that item relative to the list origin.
 * markerOffset is an anchor relative to the item's text origin. Paragraph
 * indents remain relative to that origin, never a second copy of this offset.
 */
export interface ListLayout {
  readonly unit: 'pt';
  readonly indentStart: number;
  readonly indentEnd?: number;
  readonly markerOffset: number;
  readonly markerStyle: ListMarkerStyle;
  readonly markerAlign?: 'left' | 'center' | 'right';
  readonly markerPrefix?: string;
  readonly markerSuffix?: string;
  /** First line text position relative to wrapped text, independently of marker. */
  readonly firstLineIndent?: number;
  readonly fontFamily?: string;
  readonly fontSize?: number;
}
const keys = new Set(['unit', 'indentStart', 'indentEnd', 'markerOffset', 'markerStyle', 'markerAlign', 'markerPrefix', 'markerSuffix', 'firstLineIndent', 'fontFamily', 'fontSize']);
const length = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100_000;
export function isListLayout(value: unknown): value is ListLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const layout = value as Record<string, unknown>;
  return layout.unit === 'pt' && Object.keys(layout).every(key => keys.has(key))
    && length(layout.indentStart) && length(layout.markerOffset)
    && LIST_MARKER_STYLES.includes(layout.markerStyle as ListMarkerStyle)
    && (layout.indentEnd === undefined || length(layout.indentEnd))
    && (layout.firstLineIndent === undefined || length(layout.firstLineIndent))
    && (layout.markerAlign === undefined || ['left', 'center', 'right'].includes(String(layout.markerAlign)))
    && ['markerPrefix', 'markerSuffix'].every(key => layout[key] === undefined || typeof layout[key] === 'string' && (layout[key] as string).length <= 256 && !/[\u0000-\u001f\u007f]/u.test(layout[key] as string))
    && (layout.fontFamily === undefined || typeof layout.fontFamily === 'string' && normalizeFontFamily(layout.fontFamily) === layout.fontFamily)
    && (layout.fontSize === undefined || typeof layout.fontSize === 'number' && Number.isFinite(layout.fontSize) && layout.fontSize >= 1 && layout.fontSize <= 384);
}
export const listLayoutAttribute = { default: undefined, validate: (value: unknown) => value === undefined || isListLayout(value) };
const pt = (value: number) => `${Number(value.toFixed(4))}pt`;
export function listMarkerAffixes(layout: ListLayout): readonly [string, string] {
  return [layout.markerPrefix ?? (layout.markerStyle === 'literal' ? '•' : ''), layout.markerSuffix ?? (layout.markerStyle === 'literal' || layout.markerStyle === 'none' ? '' : '.')];
}
export function listLayoutDOMAttributes(value: unknown, item = false): Attributes {
  if (!isListLayout(value)) return {};
  const [prefix, suffix] = listMarkerAffixes(value);
  const content = value.markerStyle === 'none' ? 'none' : `${JSON.stringify(prefix)} ${value.markerStyle === 'literal' ? '' : `counter(list-item,${value.markerStyle}) `}${JSON.stringify(suffix)}`;
  const styles = [
    `margin-inline-start:${pt(value.indentStart)}`, `margin-inline-end:${pt(value.indentEnd ?? 0)}`,
    `--fountain-list-marker-offset:${pt(value.markerOffset)}`, `--fountain-list-marker-content:${content}`,
    `--fountain-list-marker-align:${value.markerAlign ?? 'left'}`,
    `--fountain-list-first-line:${pt(value.firstLineIndent ?? 0)}`,
    `--fountain-list-marker-family:${value.fontFamily ? fontFamilyCSS(value.fontFamily) : 'initial'}`,
    `--fountain-list-marker-size:${value.fontSize === undefined ? 'initial' : pt(value.fontSize)}`,
  ];
  // The stylesheet replaces native markers inside Fountain/its reader. Keep a
  // semantic fallback in fragments pasted into clients without that stylesheet.
  if (!item) styles.push('padding-inline:0', 'margin-block:0', `list-style-type:${value.markerStyle === 'literal' ? 'disc' : value.markerStyle}`);
  return { 'data-fountain-list-layout': JSON.stringify(value), ...(!item ? { role: 'list' } : {}), style: styles.join(';') };
}
export function listItemDOMAttributes(node: { readonly attrs: Attributes }): Attributes {
  return listLayoutDOMAttributes(node.attrs.layout, true);
}
export function readListLayout(element: { getAttribute(name: string): string | null }): Attributes {
  const raw = element.getAttribute('data-fountain-list-layout');
  if (!raw || raw.length > 4096) return {};
  try { const layout: unknown = JSON.parse(raw); return isListLayout(layout) ? { layout } : {}; } catch { return {}; }
}

/** Shared editor/standalone-reader projection. Pseudo markers add no editable
 * DOM nodes or text positions; semantic ol/li and native counters remain intact.
 */
export const LIST_LAYOUT_STYLES: string = `:is(ol,ul)[data-fountain-list-layout]>li,li[data-fountain-list-layout]{list-style:none;margin-block:0}:is(ol,ul)[data-fountain-list-layout]>li>:is(p,h1,h2,h3,h4,h5,h6):first-child,li[data-fountain-list-layout]>:is(p,h1,h2,h3,h4,h5,h6):first-child{text-indent:calc(var(--fountain-list-marker-offset,0pt) + var(--fountain-paragraph-first-line,0pt))!important}:is(ol,ul)[data-fountain-list-layout]>li>:is(p,h1,h2,h3,h4,h5,h6):first-child::before,li[data-fountain-list-layout]>:is(p,h1,h2,h3,h4,h5,h6):first-child::before{display:inline-block;width:0;margin-inline-end:calc(var(--fountain-list-first-line,0pt) - var(--fountain-list-marker-offset,0pt));content:var(--fountain-list-marker-content,none);text-align:var(--fountain-list-marker-align,left);text-indent:0;white-space:pre;font-family:var(--fountain-list-marker-family,inherit);font-size:var(--fountain-list-marker-size,inherit);pointer-events:none;user-select:none}`;
