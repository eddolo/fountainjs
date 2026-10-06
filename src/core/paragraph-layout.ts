import type { Attributes } from './schema';
import { fontFamilyCSS, normalizeFontFamily } from '../text-style/values';

export const PARAGRAPH_BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type ParagraphBorderSide = typeof PARAGRAPH_BORDER_SIDES[number];

export interface ParagraphBorder {
  readonly style: 'solid';
  readonly color: string;
  readonly width: number;
  readonly space?: number;
}

/** Portable paragraph geometry and font context. Physical lengths are points; line-height may
 * instead be a unitless multiple. This is document state, not browser CSS or
 * an OOXML style binding, so non-DOM renderers can interpret the same values.
 */
export interface ParagraphLayout {
  readonly unit: 'pt';
  /** Paragraph font context, including empty lines. Inline font marks override it. */
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly spacingBefore?: number;
  readonly spacingAfter?: number;
  readonly lineHeight?: number;
  readonly lineHeightUnit?: 'multiple' | 'pt';
  readonly lineHeightRule?: 'auto' | 'exact' | 'atLeast';
  readonly indentStart?: number;
  readonly indentEnd?: number;
  readonly firstLineIndent?: number;
  readonly hangingIndent?: number;
  readonly keepWithNext?: boolean;
  readonly keepLinesTogether?: boolean;
  readonly pageBreakBefore?: boolean;
  readonly background?: string;
  readonly borders?: Readonly<Partial<Record<ParagraphBorderSide, ParagraphBorder>>>;
}

const LENGTH_KEYS = ['spacingBefore', 'spacingAfter', 'indentStart', 'indentEnd', 'firstLineIndent', 'hangingIndent'] as const;
const BOOLEAN_KEYS = ['keepWithNext', 'keepLinesTogether', 'pageBreakBefore'] as const;
const KEYS = new Set(['unit', ...LENGTH_KEYS, ...BOOLEAN_KEYS, 'fontFamily', 'fontSize', 'lineHeight', 'lineHeightUnit', 'lineHeightRule', 'background', 'borders']);

function finiteLength(value: unknown, signed = false): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100_000 && (signed || value >= 0);
}

function color(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}

function isParagraphBorder(value: unknown): value is ParagraphBorder {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const border = value as Record<string, unknown>;
  return Object.keys(border).every(key => ['style', 'color', 'width', 'space'].includes(key))
    && border.style === 'solid' && color(border.color)
    && finiteLength(border.width) && border.width > 0 && border.width <= 96
    && (border.space === undefined || finiteLength(border.space));
}

export function isParagraphLayout(value: unknown): value is ParagraphLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const layout = value as Record<string, unknown>;
  if (layout.unit !== 'pt' || Object.keys(layout).some(key => !KEYS.has(key))) return false;
  if (layout.fontFamily !== undefined && (typeof layout.fontFamily !== 'string' || normalizeFontFamily(layout.fontFamily) !== layout.fontFamily)) return false;
  if (layout.fontSize !== undefined && (typeof layout.fontSize !== 'number' || !Number.isFinite(layout.fontSize) || layout.fontSize < 1 || layout.fontSize > 384)) return false;
  for (const key of LENGTH_KEYS) {
    const item = layout[key];
    if (item !== undefined && !finiteLength(item, key === 'indentStart' || key === 'indentEnd')) return false;
  }
  if (layout.firstLineIndent !== undefined && layout.hangingIndent !== undefined) return false;
  for (const key of BOOLEAN_KEYS) if (layout[key] !== undefined && typeof layout[key] !== 'boolean') return false;
  if (layout.background !== undefined && !color(layout.background)) return false;
  if (layout.lineHeight !== undefined && (!finiteLength(layout.lineHeight) || layout.lineHeight === 0)) return false;
  if (layout.lineHeightUnit !== undefined && !['multiple', 'pt'].includes(String(layout.lineHeightUnit))) return false;
  if (layout.lineHeightRule !== undefined && !['auto', 'exact', 'atLeast'].includes(String(layout.lineHeightRule))) return false;
  if (layout.lineHeight === undefined && (layout.lineHeightUnit !== undefined || layout.lineHeightRule !== undefined)) return false;
  if (layout.lineHeight !== undefined) {
    if (!layout.lineHeightUnit || !layout.lineHeightRule) return false;
    if (layout.lineHeightUnit === 'multiple' && layout.lineHeightRule !== 'auto') return false;
    if (layout.lineHeightUnit === 'pt' && !['exact', 'atLeast'].includes(String(layout.lineHeightRule))) return false;
  }
  if (layout.borders !== undefined) {
    if (!layout.borders || typeof layout.borders !== 'object' || Array.isArray(layout.borders)) return false;
    const borders = layout.borders as Record<string, unknown>;
    if (Object.keys(borders).some(key => !PARAGRAPH_BORDER_SIDES.includes(key as ParagraphBorderSide))) return false;
    if (Object.values(borders).some(border => !isParagraphBorder(border))) return false;
  }
  return true;
}

export const paragraphLayoutAttribute = {
  default: undefined,
  validate: (value: unknown) => value === undefined || isParagraphLayout(value),
};

function points(value: number): string {
  return `${Number(value.toFixed(4))}pt`;
}

/** HTML carries the typed value for exact round trips and CSS only as a view
 * projection. In particular, CSS cannot express Word's at-least line rule or
 * exact pagination behavior, so the data attribute remains authoritative.
 */
export function paragraphLayoutDOMAttributes(value: unknown): Attributes {
  if (!isParagraphLayout(value)) return {};
  const styles: string[] = [];
  if (value.fontFamily !== undefined) styles.push(`font-family:${fontFamilyCSS(value.fontFamily)}`);
  if (value.fontSize !== undefined) styles.push(`font-size:${points(value.fontSize)}`);
  if (value.spacingBefore !== undefined) styles.push(`margin-block-start:${points(value.spacingBefore)}`);
  if (value.spacingAfter !== undefined) styles.push(`margin-block-end:${points(value.spacingAfter)}`);
  if (value.lineHeight !== undefined) styles.push(`line-height:${value.lineHeightUnit === 'multiple' ? Number(value.lineHeight.toFixed(6)) : points(value.lineHeight)}`);
  if (value.indentStart !== undefined) styles.push(`margin-inline-start:${points(value.indentStart)}`);
  if (value.indentEnd !== undefined) styles.push(`margin-inline-end:${points(value.indentEnd)}`);
  if (value.firstLineIndent !== undefined) styles.push(`text-indent:${points(value.firstLineIndent)}`);
  if (value.hangingIndent !== undefined) styles.push(`text-indent:-${points(value.hangingIndent)}`);
  if (value.background) styles.push(`background-color:${value.background}`);
  // Firefox drops `avoid-page` even though Chromium/WebKit accept it. The
  // generic `avoid` value expresses the same keep-with-next intent for this
  // block flow, and the legacy aliases preserve print behavior in older browser
  // engines without changing the authoritative typed document value.
  if (value.keepWithNext) styles.push('break-after:avoid', 'page-break-after:avoid');
  if (value.keepLinesTogether) styles.push('break-inside:avoid', 'page-break-inside:avoid');
  if (value.pageBreakBefore) styles.push('break-before:page', 'page-break-before:always');
  for (const side of PARAGRAPH_BORDER_SIDES) {
    const border = value.borders?.[side];
    if (!border) continue;
    styles.push(`border-${side}:${points(border.width)} solid ${border.color}`);
    if (border.space) styles.push(`padding-${side}:${points(border.space)}`);
  }
  return {
    'data-fountain-paragraph-layout': JSON.stringify(value),
    ...(styles.length ? { style: styles.join(';') } : {}),
  };
}

export function readParagraphLayout(element: { getAttribute(name: string): string | null }): Attributes {
  const source = element.getAttribute('data-fountain-paragraph-layout');
  if (!source || source.length > 32_768) return {};
  try {
    const value = JSON.parse(source) as unknown;
    return isParagraphLayout(value) ? { layout: value } : {};
  } catch { return {}; }
}
