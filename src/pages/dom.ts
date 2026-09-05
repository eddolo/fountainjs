import type { Node } from '../core';
import { layoutPages, type PageFlowFragment, type PageFlowItem, type PageGeometry, type PageLayoutOptions, type PageLayoutResult } from './layout';
import type { PageTemplateKind, PageTemplateVariant } from './templates';

interface RectLike {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
}

export interface DOMPageTemplateMeasurement {
  readonly kind: PageTemplateKind;
  readonly variant: PageTemplateVariant;
  readonly path: readonly number[];
  readonly height: number;
}

export type DOMPageMeasurementWarningCode =
  | 'missing-rendered-node'
  | 'invalid-measurement'
  | 'unmeasured-footnote';

export interface DOMPageMeasurementWarning {
  readonly code: DOMPageMeasurementWarningCode;
  readonly path: readonly number[];
  readonly detail: string;
}

export interface DOMPageMeasurementOptions {
  /** Minimum paragraph/code lines retained at each side of a split. Defaults to two. */
  readonly minimumTextLines?: number;
  /** Custom block types whose rendered line boxes are legal split points. */
  readonly lineFragmentNodeTypes?: readonly string[];
}

export interface DOMPageFlowMeasurement {
  readonly items: readonly PageFlowItem[];
  readonly templates: readonly DOMPageTemplateMeasurement[];
  readonly warnings: readonly DOMPageMeasurementWarning[];
  /** Number of geometry reads made by this measurement pass. */
  readonly measurementCount: number;
}

export interface DOMPageLayoutSnapshot {
  readonly measurement: DOMPageFlowMeasurement;
  readonly layout: PageLayoutResult;
}

const DEFAULT_LINE_FRAGMENT_TYPES = Object.freeze(['paragraph', 'heading', 'code_block']);

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function numericStyle(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? '0');
  return finiteNonNegative(parsed) ? parsed : 0;
}

function elementMargins(element: HTMLElement): { readonly before: number; readonly after: number } {
  const view = element.ownerDocument.defaultView;
  if (!view) return Object.freeze({ before: 0, after: 0 });
  const style = view.getComputedStyle(element);
  return Object.freeze({
    before: numericStyle(style.marginBlockStart || style.marginTop),
    after: numericStyle(style.marginBlockEnd || style.marginBottom),
  });
}

function measuredRect(element: Element, count: () => void): RectLike {
  count();
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height,
  };
}

function outerHeight(element: HTMLElement, count: () => void): number {
  const rect = measuredRect(element, count);
  const margins = elementMargins(element);
  const height = rect.height + margins.before + margins.after;
  return finiteNonNegative(height) ? height : Number.NaN;
}

function renderedTopLevel(root: HTMLElement, index: number): HTMLElement | null {
  return Array.from(root.children).find((element) => (
    (element as HTMLElement).dataset?.fountainPath === String(index)
  )) as HTMLElement | undefined ?? null;
}

function pathOf(element: HTMLElement): readonly number[] {
  const source = element.dataset.fountainPath;
  if (!source) return Object.freeze([]);
  const path = source.split('.').map(Number);
  return Object.freeze(path.every((part) => Number.isSafeInteger(part) && part >= 0) ? path : []);
}

function rangeRects(element: HTMLElement, count: () => void): readonly RectLike[] {
  const range = element.ownerDocument.createRange();
  try {
    range.selectNodeContents(element);
    if (typeof range.getClientRects !== 'function') return Object.freeze([]);
    count();
    return Object.freeze(Array.from(range.getClientRects()).map((rect) => ({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
    })).filter((rect) => rect.height > 0 && rect.width >= 0));
  } finally {
    range.detach?.();
  }
}

function lineBands(rects: readonly RectLike[]): readonly RectLike[] {
  const sorted = [...rects].sort((left, right) => left.top - right.top || left.left - right.left);
  const bands: Array<{ top: number; bottom: number; left: number; right: number }> = [];
  sorted.forEach((rect) => {
    const match = bands.find((band) => rect.top < band.bottom + 1 && rect.bottom > band.top - 1);
    if (match) {
      match.top = Math.min(match.top, rect.top);
      match.bottom = Math.max(match.bottom, rect.bottom);
      match.left = Math.min(match.left, rect.left);
      match.right = Math.max(match.right, rect.right);
    } else bands.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
  });
  return Object.freeze(bands.sort((left, right) => left.top - right.top).map((band) => Object.freeze({
    ...band,
    width: Math.max(0, band.right - band.left),
    height: Math.max(0, band.bottom - band.top),
  })));
}

function fragmentHeights(element: HTMLElement, lines: readonly RectLike[], count: () => void): readonly number[] {
  const block = measuredRect(element, count);
  const margins = elementMargins(element);
  const start = block.top - margins.before;
  const end = block.bottom + margins.after;
  const boundaries = lines.slice(0, -1).map((line, index) => (
    (line.bottom + (lines[index + 1]?.top ?? line.bottom)) / 2
  ));
  return Object.freeze(lines.map((_line, index) => {
    const from = index === 0 ? start : boundaries[index - 1] as number;
    const to = index === lines.length - 1 ? end : boundaries[index] as number;
    return Math.max(0, to - from);
  }));
}

function referencesIn(element: HTMLElement, definitionHeights: ReadonlyMap<string, number>, count: () => void): readonly {
  readonly id: string;
  readonly height: number;
  readonly center: number;
}[] {
  const references: Array<{ id: string; height: number; center: number }> = [];
  element.querySelectorAll<HTMLElement>('[data-fountain-footnote-reference]').forEach((reference) => {
    const id = reference.dataset.fountainFootnoteReference;
    if (!id) return;
    const height = definitionHeights.get(id);
    if (height === undefined) return;
    const rect = measuredRect(reference, count);
    references.push({ id, height, center: (rect.top + rect.bottom) / 2 });
  });
  return Object.freeze(references);
}

function uniqueFootnotes(references: readonly { readonly id: string; readonly height: number }[]): readonly {
  readonly id: string;
  readonly height: number;
}[] {
  const found = new Map<string, number>();
  references.forEach(({ id, height }) => found.set(id, height));
  return Object.freeze([...found].map(([id, height]) => Object.freeze({ id, height })));
}

function textFragments(
  element: HTMLElement,
  itemId: string,
  definitionHeights: ReadonlyMap<string, number>,
  count: () => void,
): readonly PageFlowFragment[] | null {
  const lines = lineBands(rangeRects(element, count));
  if (lines.length < 2) return null;
  const heights = fragmentHeights(element, lines, count);
  const references = referencesIn(element, definitionHeights, count);
  return Object.freeze(lines.map((line, index) => Object.freeze({
    id: `${itemId}:line:${index + 1}`,
    height: heights[index] as number,
    footnotes: uniqueFootnotes(references
      .filter((reference) => reference.center >= line.top - 1 && reference.center <= line.bottom + 1)),
  })));
}

function directListItems(element: HTMLElement): readonly HTMLElement[] {
  return Object.freeze(Array.from(element.children).filter((child): child is HTMLElement => (
    child.tagName === 'LI'
  )));
}

function tableRows(element: HTMLElement): readonly HTMLTableRowElement[] {
  return Object.freeze(Array.from(element.querySelectorAll<HTMLTableRowElement>('tr')).filter((row) => (
    row.closest('table') === element
  )));
}

function groupedTableRows(rows: readonly HTMLTableRowElement[]): readonly (readonly HTMLTableRowElement[])[] {
  const groups: HTMLTableRowElement[][] = [];
  let start = 0;
  let occupiedUntil = 1;
  rows.forEach((row, index) => {
    row.querySelectorAll<HTMLTableCellElement>(':scope > th, :scope > td').forEach((cell) => {
      occupiedUntil = Math.max(occupiedUntil, index + Math.max(1, cell.rowSpan));
    });
    if (index + 1 >= occupiedUntil) {
      groups.push(rows.slice(start, index + 1));
      start = index + 1;
      occupiedUntil = index + 2;
    }
  });
  if (start < rows.length) groups.push(rows.slice(start));
  return Object.freeze(groups.map((group) => Object.freeze(group)));
}

function structuralFragments(
  element: HTMLElement,
  node: Node,
  itemId: string,
  definitionHeights: ReadonlyMap<string, number>,
  count: () => void,
): { readonly fragments: readonly PageFlowFragment[]; readonly continuationHeight?: number } | null {
  const pieces: readonly HTMLElement[][] = node.type.name === 'table'
    ? groupedTableRows(tableRows(element)).map((group) => [...group])
    : ['bullet_list', 'ordered_list', 'task_list'].includes(node.type.name)
      ? directListItems(element).map((item) => [item])
      : [];
  if (pieces.length < 2) return null;
  const wholeHeight = outerHeight(element, count);
  const pieceHeights = pieces.map((piece) => piece.reduce((sum, child) => sum + measuredRect(child, count).height, 0));
  const missing = Math.max(0, wholeHeight - pieceHeights.reduce((sum, height) => sum + height, 0));
  const fragments = pieces.map((piece, index) => {
    const references = piece.flatMap((child) => referencesIn(child, definitionHeights, count));
    return Object.freeze({
      id: `${itemId}:${node.type.name === 'table' ? 'row-group' : 'item'}:${index + 1}`,
      height: pieceHeights[index] as number + (index === 0 ? missing : 0),
      footnotes: uniqueFootnotes(references),
    });
  });
  const rows = node.type.name === 'table' ? tableRows(element) : [];
  const headerRows: HTMLTableRowElement[] = [];
  for (const row of rows) {
    if (row.querySelectorAll(':scope > th').length === 0 || row.querySelectorAll(':scope > td').length > 0) break;
    headerRows.push(row);
  }
  const continuationHeight = headerRows.reduce((sum, row) => sum + measuredRect(row, count).height, 0);
  return Object.freeze({
    fragments: Object.freeze(fragments),
    ...(continuationHeight > 0 ? { continuationHeight } : {}),
  });
}

function wholeItem(
  element: HTMLElement,
  itemId: string,
  definitionHeights: ReadonlyMap<string, number>,
  count: () => void,
): PageFlowItem {
  const height = outerHeight(element, count);
  const references = referencesIn(element, definitionHeights, count);
  return Object.freeze({
    id: itemId,
    height,
    ...(references.length
      ? {
          fragments: Object.freeze([Object.freeze({
            id: `${itemId}:whole`,
            height,
            footnotes: uniqueFootnotes(references),
          })]),
        }
      : {}),
  });
}

/** Measures an EditorView-compatible DOM into platform-neutral legal page-flow items. */
export function measureDOMPageFlow(
  root: HTMLElement,
  document: Node,
  options: DOMPageMeasurementOptions = {},
): DOMPageFlowMeasurement {
  if (!root?.ownerDocument || !document) throw new TypeError('measureDOMPageFlow requires a rendered editor root and document.');
  const minimumTextLines = options.minimumTextLines ?? 2;
  if (!Number.isSafeInteger(minimumTextLines) || minimumTextLines < 1) {
    throw new TypeError('minimumTextLines must be a positive safe integer.');
  }
  const lineTypes = new Set(options.lineFragmentNodeTypes ?? DEFAULT_LINE_FRAGMENT_TYPES);
  const warnings: DOMPageMeasurementWarning[] = [];
  const items: PageFlowItem[] = [];
  const templates: DOMPageTemplateMeasurement[] = [];
  let measurementCount = 0;
  const count = () => { measurementCount += 1; };

  const rendered = new Map<number, HTMLElement>();
  document.content.forEach((_node, index) => {
    const element = renderedTopLevel(root, index);
    if (element) rendered.set(index, element);
    else warnings.push(Object.freeze({
      code: 'missing-rendered-node', path: Object.freeze([index]),
      detail: `No rendered top-level node was found for model path ${index}.`,
    }));
  });

  const definitionHeights = new Map<string, number>();
  document.content.forEach((node, index) => {
    if (node.type.name !== 'footnote_definition') return;
    const element = rendered.get(index);
    if (!element) return;
    const height = outerHeight(element, count);
    if (finiteNonNegative(height)) definitionHeights.set(String(node.attrs.id), height);
  });

  document.content.forEach((node, index) => {
    const element = rendered.get(index);
    if (!element) return;
    const path = Object.freeze([index]);
    if (node.type.name === 'page_header' || node.type.name === 'page_footer') {
      const height = outerHeight(element, count);
      if (!finiteNonNegative(height)) warnings.push(Object.freeze({
        code: 'invalid-measurement', path,
        detail: `Page template at ${index} returned a non-finite height.`,
      }));
      else templates.push(Object.freeze({
        kind: node.type.name === 'page_header' ? 'header' : 'footer',
        variant: node.attrs.variant as PageTemplateVariant,
        path,
        height,
      }));
      return;
    }
    if (node.type.name === 'footnote_definition') return;
    const itemId = `block:${index}:${node.type.name}`;
    if (node.type.name === 'page_break') {
      items.push(Object.freeze({ id: itemId, height: 0, breakAfter: true }));
      return;
    }

    let item: PageFlowItem;
    const structural = structuralFragments(element, node, itemId, definitionHeights, count);
    const text = lineTypes.has(node.type.name)
      ? textFragments(element, itemId, definitionHeights, count)
      : null;
    if (structural) item = Object.freeze({ id: itemId, ...structural });
    else if (text) item = Object.freeze({
      id: itemId,
      fragments: text,
      minimumStart: Math.min(minimumTextLines, text.length),
      minimumEnd: Math.min(minimumTextLines, text.length),
      ...(node.type.name === 'heading' ? { keepWithNext: true } : {}),
    });
    else item = wholeItem(element, itemId, definitionHeights, count);

    const heights = item.fragments?.map((fragment) => fragment.height) ?? [item.height];
    if (heights.some((height) => !finiteNonNegative(height))) warnings.push(Object.freeze({
      code: 'invalid-measurement', path,
      detail: `Rendered node at ${index} returned a non-finite height and was excluded.`,
    }));
    else items.push(item);

    element.querySelectorAll<HTMLElement>('[data-fountain-footnote-reference]').forEach((reference) => {
      const id = reference.dataset.fountainFootnoteReference;
      if (id && !definitionHeights.has(id)) warnings.push(Object.freeze({
        code: 'unmeasured-footnote', path: pathOf(reference),
        detail: `Footnote ${id} has no measurable rendered definition.`,
      }));
    });
  });

  return Object.freeze({
    items: Object.freeze(items),
    templates: Object.freeze(templates),
    warnings: Object.freeze(warnings),
    measurementCount,
  });
}

/** Measures rendered content and immediately feeds the neutral pagination algorithm. */
export function layoutDOMPages(
  root: HTMLElement,
  document: Node,
  geometry: PageGeometry,
  measurementOptions: DOMPageMeasurementOptions = {},
  layoutOptions: PageLayoutOptions = {},
): DOMPageLayoutSnapshot {
  const measurement = measureDOMPageFlow(root, document, measurementOptions);
  return Object.freeze({
    measurement,
    layout: layoutPages(measurement.items, geometry, layoutOptions),
  });
}
