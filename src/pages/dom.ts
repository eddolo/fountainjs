import type { Node } from '../core';
import { layoutPages, type PageFlowFragment, type PageFlowItem, type PageGeometry, type PageLayoutOptions, type PageLayoutResult } from './layout';
import { projectPagePresentation, type PagePresentation } from './presentation';
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

export type DOMPageFragmentSourceKind =
  | 'text-line'
  | 'list-item'
  | 'table-row-group'
  | 'whole'
  | 'manual-break';

export interface DOMPageFragmentSource {
  readonly itemId: string;
  readonly fragmentId: string;
  readonly fragmentIndex: number;
  readonly kind: DOMPageFragmentSourceKind;
  /** Top-level model path of the measured flow item. */
  readonly sourcePath: readonly number[];
  /** Nested model paths represented by a list/table structural fragment. */
  readonly partPaths: readonly (readonly number[])[];
  /** Vertical source offset used by a non-editable clipped projection. */
  readonly clipOffset: number;
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
  readonly fragmentSources: readonly DOMPageFragmentSource[];
  readonly templates: readonly DOMPageTemplateMeasurement[];
  readonly warnings: readonly DOMPageMeasurementWarning[];
  /** Inline size of the rendered source used to calculate wrapping. */
  readonly contentWidth: number;
  /** Number of geometry reads made by this measurement pass. */
  readonly measurementCount: number;
}

export interface DOMPageContentPlacement {
  readonly itemId: string;
  readonly fragmentFrom: number;
  readonly fragmentTo: number;
  readonly height: number;
  readonly contentHeight: number;
  readonly continuationHeight: number;
  readonly continuedBefore: boolean;
  readonly continuedAfter: boolean;
  readonly sources: readonly DOMPageFragmentSource[];
}

export interface DOMPageContentPage {
  readonly number: number;
  readonly placements: readonly DOMPageContentPlacement[];
}

export interface DOMPageContentProjection {
  readonly pages: readonly DOMPageContentPage[];
}

export interface DOMPageLayoutSnapshot {
  readonly measurement: DOMPageFlowMeasurement;
  readonly layout: PageLayoutResult;
  /** Exact measured source slices assigned to each calculated page. */
  readonly content: DOMPageContentProjection;
  readonly presentation: PagePresentation;
}

export type DOMPageLayoutReason =
  | 'initial'
  | 'manual'
  | 'mutation'
  | 'resize'
  | 'window-resize'
  | 'fonts'
  | 'before-print';

export interface DOMPageLayoutCycle {
  readonly revision: number;
  readonly reason: DOMPageLayoutReason;
  readonly durationMs: number;
  readonly snapshot: DOMPageLayoutSnapshot;
}

export interface DOMPageLayoutControllerOptions {
  readonly measurement?: DOMPageMeasurementOptions;
  readonly layout?: PageLayoutOptions;
  /** Observe DOM, size, font, window, and print changes. Defaults to true. */
  readonly observe?: boolean;
  /** Reuse unchanged top-level geometry for mutation-only cycles. Defaults to true. */
  readonly incremental?: boolean;
  readonly onLayout?: (cycle: DOMPageLayoutCycle) => void;
  readonly onError?: (error: unknown) => void;
}

export type DOMPageGeometrySource = PageGeometry | (() => PageGeometry);

const DEFAULT_LINE_FRAGMENT_TYPES = Object.freeze(['paragraph', 'heading', 'code_block']);

interface CachedDefinitionMeasurement {
  readonly node: Node;
  readonly element: HTMLElement;
  readonly height: number;
}

interface CachedFlowMeasurement {
  readonly node: Node;
  readonly element: HTMLElement;
  readonly definitionSignature: string;
  readonly item?: PageFlowItem;
  readonly sources: readonly DOMPageFragmentSource[];
  readonly template?: DOMPageTemplateMeasurement;
  readonly warnings: readonly DOMPageMeasurementWarning[];
}

interface DOMPageMeasurementCache {
  root: HTMLElement | null;
  contentWidth: number;
  definitions: Map<number, CachedDefinitionMeasurement>;
  entries: Map<number, CachedFlowMeasurement>;
}

function createMeasurementCache(): DOMPageMeasurementCache {
  return { root: null, contentWidth: Number.NaN, definitions: new Map(), entries: new Map() };
}

function clearMeasurementCache(cache: DOMPageMeasurementCache): void {
  cache.root = null;
  cache.contentWidth = Number.NaN;
  cache.definitions.clear();
  cache.entries.clear();
}

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

function contentWidth(element: HTMLElement, count: () => void): number {
  const rect = measuredRect(element, count);
  const view = element.ownerDocument.defaultView;
  if (!view) return rect.width;
  const style = view.getComputedStyle(element);
  const borderLeft = style.borderLeftStyle === 'none' ? 0 : numericStyle(style.borderLeftWidth);
  const borderRight = style.borderRightStyle === 'none' ? 0 : numericStyle(style.borderRightWidth);
  return Math.max(0, rect.width
    - numericStyle(style.paddingLeft)
    - numericStyle(style.paddingRight)
    - borderLeft
    - borderRight);
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

function referencedDefinitionSignature(node: Node, definitions: ReadonlyMap<string, number>): string {
  const ids = new Set<string>();
  node.descendants((descendant) => {
    if (descendant.type.name === 'footnote_reference') ids.add(String(descendant.attrs.id));
  });
  return [...ids].sort().map((id) => `${id}:${definitions.get(id) ?? 'missing'}`).join('|');
}

function textFragments(
  element: HTMLElement,
  itemId: string,
  sourcePath: readonly number[],
  definitionHeights: ReadonlyMap<string, number>,
  count: () => void,
): { readonly fragments: readonly PageFlowFragment[]; readonly sources: readonly DOMPageFragmentSource[] } | null {
  const lines = lineBands(rangeRects(element, count));
  if (lines.length < 2) return null;
  const heights = fragmentHeights(element, lines, count);
  const references = referencesIn(element, definitionHeights, count);
  const fragments = lines.map((line, index) => Object.freeze({
    id: `${itemId}:line:${index + 1}`,
    height: heights[index] as number,
    footnotes: uniqueFootnotes(references
      .filter((reference) => reference.center >= line.top - 1 && reference.center <= line.bottom + 1)),
  }));
  let clipOffset = 0;
  const sources = fragments.map((fragment, index) => {
    const source = Object.freeze({
      itemId,
      fragmentId: fragment.id,
      fragmentIndex: index,
      kind: 'text-line' as const,
      sourcePath,
      partPaths: Object.freeze([]),
      clipOffset,
      height: fragment.height,
    });
    clipOffset += fragment.height;
    return source;
  });
  return Object.freeze({ fragments: Object.freeze(fragments), sources: Object.freeze(sources) });
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
  sourcePath: readonly number[],
  definitionHeights: ReadonlyMap<string, number>,
  count: () => void,
): {
  readonly fragments: readonly PageFlowFragment[];
  readonly sources: readonly DOMPageFragmentSource[];
  readonly continuationHeight?: number;
} | null {
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
  let clipOffset = 0;
  const kind = node.type.name === 'table' ? 'table-row-group' as const : 'list-item' as const;
  const sources = fragments.map((fragment, index) => {
    const source = Object.freeze({
      itemId,
      fragmentId: fragment.id,
      fragmentIndex: index,
      kind,
      sourcePath,
      partPaths: Object.freeze((pieces[index] ?? []).map((part) => pathOf(part)).filter((path) => path.length > 0)),
      clipOffset,
      height: fragment.height,
    });
    clipOffset += fragment.height;
    return source;
  });
  return Object.freeze({
    fragments: Object.freeze(fragments),
    sources: Object.freeze(sources),
    ...(continuationHeight > 0 ? { continuationHeight } : {}),
  });
}

function wholeItem(
  element: HTMLElement,
  itemId: string,
  sourcePath: readonly number[],
  definitionHeights: ReadonlyMap<string, number>,
  count: () => void,
): { readonly item: PageFlowItem; readonly sources: readonly DOMPageFragmentSource[] } {
  const height = outerHeight(element, count);
  const references = referencesIn(element, definitionHeights, count);
  const item = Object.freeze({
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
  return Object.freeze({
    item,
    sources: Object.freeze([Object.freeze({
      itemId,
      fragmentId: item.fragments?.[0]?.id ?? itemId,
      fragmentIndex: 0,
      kind: 'whole',
      sourcePath,
      partPaths: Object.freeze([]),
      clipOffset: 0,
      height,
    })]),
  });
}

function measureDOMPageFlowInternal(
  root: HTMLElement,
  document: Node,
  options: DOMPageMeasurementOptions = {},
  cache?: DOMPageMeasurementCache,
  invalidatedIndexes: ReadonlySet<number> = new Set(),
): DOMPageFlowMeasurement {
  if (!root?.ownerDocument || !document) throw new TypeError('measureDOMPageFlow requires a rendered editor root and document.');
  const minimumTextLines = options.minimumTextLines ?? 2;
  if (!Number.isSafeInteger(minimumTextLines) || minimumTextLines < 1) {
    throw new TypeError('minimumTextLines must be a positive safe integer.');
  }
  const lineTypes = new Set(options.lineFragmentNodeTypes ?? DEFAULT_LINE_FRAGMENT_TYPES);
  const warnings: DOMPageMeasurementWarning[] = [];
  const items: PageFlowItem[] = [];
  const fragmentSources: DOMPageFragmentSource[] = [];
  const templates: DOMPageTemplateMeasurement[] = [];
  let measurementCount = 0;
  const count = () => { measurementCount += 1; };
  const measuredContentWidth = contentWidth(root, count);
  const cacheMatches = cache?.root === root
    && finiteNonNegative(cache.contentWidth)
    && Math.abs(cache.contentWidth - measuredContentWidth) <= .01;
  const priorDefinitions = cacheMatches ? cache.definitions : new Map<number, CachedDefinitionMeasurement>();
  const priorEntries = cacheMatches ? cache.entries : new Map<number, CachedFlowMeasurement>();

  const rendered = new Map<number, HTMLElement>();
  Array.from(root.children).forEach((child) => {
    const element = child as HTMLElement;
    const source = element.dataset.fountainPath;
    if (!source || source.includes('.')) return;
    const index = Number(source);
    if (
      Number.isSafeInteger(index)
      && index >= 0
      && String(index) === source
      && !rendered.has(index)
    ) rendered.set(index, element);
  });
  document.content.forEach((_node, index) => {
    if (!rendered.has(index)) warnings.push(Object.freeze({
      code: 'missing-rendered-node', path: Object.freeze([index]),
      detail: `No rendered top-level node was found for model path ${index}.`,
    }));
  });

  const definitionHeights = new Map<string, number>();
  const nextDefinitions = new Map<number, CachedDefinitionMeasurement>();
  document.content.forEach((node, index) => {
    if (node.type.name !== 'footnote_definition') return;
    const element = rendered.get(index);
    if (!element) return;
    const cached = !invalidatedIndexes.has(index) ? priorDefinitions.get(index) : undefined;
    const height = cached?.node === node && cached.element === element
      ? cached.height
      : outerHeight(element, count);
    nextDefinitions.set(index, { node, element, height });
    if (finiteNonNegative(height)) definitionHeights.set(String(node.attrs.id), height);
  });

  const nextEntries = new Map<number, CachedFlowMeasurement>();
  document.content.forEach((node, index) => {
    const element = rendered.get(index);
    if (!element) return;
    const path = Object.freeze([index]);
    if (node.type.name === 'footnote_definition') return;
    const definitionSignature = referencedDefinitionSignature(node, definitionHeights);
    const cached = !invalidatedIndexes.has(index) ? priorEntries.get(index) : undefined;
    if (
      cached?.node === node
      && cached.element === element
      && cached.definitionSignature === definitionSignature
    ) {
      if (cached.template) templates.push(cached.template);
      if (cached.item) items.push(cached.item);
      fragmentSources.push(...cached.sources);
      warnings.push(...cached.warnings);
      nextEntries.set(index, cached);
      return;
    }

    const entryWarnings: DOMPageMeasurementWarning[] = [];
    if (node.type.name === 'page_header' || node.type.name === 'page_footer') {
      const height = outerHeight(element, count);
      let template: DOMPageTemplateMeasurement | undefined;
      if (!finiteNonNegative(height)) entryWarnings.push(Object.freeze({
        code: 'invalid-measurement', path,
        detail: `Page template at ${index} returned a non-finite height.`,
      }));
      else {
        template = Object.freeze({
          kind: node.type.name === 'page_header' ? 'header' : 'footer',
          variant: node.attrs.variant as PageTemplateVariant,
          path,
          height,
        });
        templates.push(template);
      }
      warnings.push(...entryWarnings);
      nextEntries.set(index, {
        node, element, definitionSignature, sources: Object.freeze([]), template,
        warnings: Object.freeze(entryWarnings),
      });
      return;
    }
    const itemId = `block:${index}:${node.type.name}`;
    if (node.type.name === 'page_break') {
      const item = Object.freeze({ id: itemId, height: 0, breakAfter: true });
      const sources = Object.freeze([Object.freeze({
        itemId,
        fragmentId: itemId,
        fragmentIndex: 0,
        kind: 'manual-break',
        sourcePath: path,
        partPaths: Object.freeze([]),
        clipOffset: 0,
        height: 0,
      })]);
      items.push(item);
      fragmentSources.push(...sources);
      nextEntries.set(index, {
        node, element, definitionSignature, item, sources, warnings: Object.freeze([]),
      });
      return;
    }

    let item: PageFlowItem;
    let sources: readonly DOMPageFragmentSource[] = Object.freeze([]);
    const structural = structuralFragments(element, node, itemId, path, definitionHeights, count);
    const text = lineTypes.has(node.type.name)
      ? textFragments(element, itemId, path, definitionHeights, count)
      : null;
    if (structural) {
      item = Object.freeze({
        id: itemId,
        fragments: structural.fragments,
        ...(structural.continuationHeight !== undefined
          ? { continuationHeight: structural.continuationHeight }
          : {}),
      });
      sources = structural.sources;
    }
    else if (text) item = Object.freeze({
      id: itemId,
      fragments: text.fragments,
      minimumStart: Math.min(minimumTextLines, text.fragments.length),
      minimumEnd: Math.min(minimumTextLines, text.fragments.length),
      ...(node.type.name === 'heading' ? { keepWithNext: true } : {}),
    });
    else {
      const whole = wholeItem(element, itemId, path, definitionHeights, count);
      item = whole.item;
      sources = whole.sources;
    }
    if (text && !structural) sources = text.sources;

    const heights = item.fragments?.map((fragment) => fragment.height) ?? [item.height];
    const validHeights = heights.every(finiteNonNegative);
    if (!validHeights) entryWarnings.push(Object.freeze({
      code: 'invalid-measurement', path,
      detail: `Rendered node at ${index} returned a non-finite height and was excluded.`,
    }));
    else {
      items.push(item);
      fragmentSources.push(...sources);
    }

    element.querySelectorAll<HTMLElement>('[data-fountain-footnote-reference]').forEach((reference) => {
      const id = reference.dataset.fountainFootnoteReference;
      if (id && !definitionHeights.has(id)) entryWarnings.push(Object.freeze({
        code: 'unmeasured-footnote', path: pathOf(reference),
        detail: `Footnote ${id} has no measurable rendered definition.`,
      }));
    });
    warnings.push(...entryWarnings);
    nextEntries.set(index, {
      node,
      element,
      definitionSignature,
      ...(validHeights ? { item } : {}),
      sources: validHeights ? sources : Object.freeze([]),
      warnings: Object.freeze(entryWarnings),
    });
  });

  if (cache) {
    cache.root = root;
    cache.contentWidth = measuredContentWidth;
    cache.definitions = nextDefinitions;
    cache.entries = nextEntries;
  }

  return Object.freeze({
    items: Object.freeze(items),
    fragmentSources: Object.freeze(fragmentSources),
    templates: Object.freeze(templates),
    warnings: Object.freeze(warnings),
    contentWidth: measuredContentWidth,
    measurementCount,
  });
}

/** Measures an EditorView-compatible DOM into platform-neutral legal page-flow items. */
export function measureDOMPageFlow(
  root: HTMLElement,
  document: Node,
  options: DOMPageMeasurementOptions = {},
): DOMPageFlowMeasurement {
  return measureDOMPageFlowInternal(root, document, options);
}

/**
 * Resolves each neutral page placement to the exact measured DOM/model source
 * fragments it owns. The result contains no DOM nodes and is safe to retain.
 */
export function projectDOMPageContent(
  measurement: DOMPageFlowMeasurement,
  layout: PageLayoutResult,
): DOMPageContentProjection {
  if (!measurement || !Array.isArray(measurement.fragmentSources) || !layout || !Array.isArray(layout.pages)) {
    throw new TypeError('projectDOMPageContent requires a DOM page measurement and page layout result.');
  }
  const layoutPages = layout.pages as PageLayoutResult['pages'];
  const sourcesByItem = new Map<string, DOMPageFragmentSource[]>();
  measurement.fragmentSources.forEach((source) => {
    if (
      !source
      || typeof source.itemId !== 'string'
      || !source.itemId
      || typeof source.fragmentId !== 'string'
      || !source.fragmentId
      || !Number.isSafeInteger(source.fragmentIndex)
      || source.fragmentIndex < 0
      || !finiteNonNegative(source.clipOffset)
      || !finiteNonNegative(source.height)
    ) {
      throw new TypeError('DOM page fragment sources require ids, a non-negative safe index, offset, and height.');
    }
    const sources = sourcesByItem.get(source.itemId) ?? [];
    if (sources.some((candidate) => candidate.fragmentIndex === source.fragmentIndex)) {
      throw new TypeError(`DOM page fragment source ${source.itemId}:${source.fragmentIndex} is duplicated.`);
    }
    sources.push(source);
    sourcesByItem.set(source.itemId, sources);
  });
  sourcesByItem.forEach((sources) => sources.sort((left, right) => left.fragmentIndex - right.fragmentIndex));

  const pages = layoutPages.map((page, pageIndex) => {
    if (page.number !== pageIndex + 1) {
      throw new TypeError('DOM page content requires sequential one-based layout page numbers.');
    }
    const placements = page.placements.map((placement) => {
      if (
        !Number.isSafeInteger(placement.fragmentFrom)
        || !Number.isSafeInteger(placement.fragmentTo)
        || placement.fragmentFrom < 0
        || placement.fragmentTo <= placement.fragmentFrom
        || !finiteNonNegative(placement.height)
      ) {
        throw new TypeError(`Page ${page.number} contains an invalid placement for ${placement.itemId}.`);
      }
      const itemSources = sourcesByItem.get(placement.itemId) ?? [];
      const sources = itemSources.filter((source) => (
        source.fragmentIndex >= placement.fragmentFrom && source.fragmentIndex < placement.fragmentTo
      ));
      const expected = placement.fragmentTo - placement.fragmentFrom;
      if (expected < 1 || sources.length !== expected || sources.some((source, index) => (
        source.fragmentIndex !== placement.fragmentFrom + index
      ))) {
        throw new TypeError(
          `Page ${page.number} placement ${placement.itemId} has no complete measured fragment source range `
          + `${placement.fragmentFrom}:${placement.fragmentTo}.`,
        );
      }
      const contentHeight = sources.reduce((sum, source) => sum + source.height, 0);
      if (contentHeight > placement.height + 0.01) {
        throw new TypeError(`Page ${page.number} placement ${placement.itemId} is shorter than its measured content.`);
      }
      const continuationHeight = Math.max(0, placement.height - contentHeight);
      return Object.freeze({
        ...placement,
        contentHeight,
        continuationHeight,
        sources: Object.freeze(sources),
      });
    });
    return Object.freeze({ number: page.number, placements: Object.freeze(placements) });
  });
  return Object.freeze({ pages: Object.freeze(pages) });
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
  const layout = layoutPages(measurement.items, geometry, layoutOptions);
  return Object.freeze({
    measurement,
    layout,
    content: projectDOMPageContent(measurement, layout),
    presentation: projectPagePresentation(document, layout),
  });
}

/**
 * Coalesces browser layout invalidations into measured snapshots. It observes
 * the editor but never inserts, moves, clones, or annotates editable nodes.
 */
export class DOMPageLayoutController {
  private readonly mutationObserver?: MutationObserver;
  private readonly resizeObserver?: ResizeObserver;
  private readonly view: Window | null;
  private readonly fonts: FontFaceSet | null;
  private scheduledFrame: number | null = null;
  private scheduledMicrotask = false;
  private pendingReason: DOMPageLayoutReason = 'initial';
  private revision = 0;
  private destroyed = false;
  private readonly measurementCache?: DOMPageMeasurementCache;
  private readonly invalidatedIndexes = new Set<number>();

  constructor(
    public readonly root: HTMLElement,
    private readonly getDocument: () => Node,
    private readonly geometry: DOMPageGeometrySource,
    private readonly options: DOMPageLayoutControllerOptions = {},
  ) {
    if (!root?.ownerDocument || typeof getDocument !== 'function') {
      throw new TypeError('DOMPageLayoutController requires an editor root and document reader.');
    }
    this.view = root.ownerDocument.defaultView;
    this.fonts = root.ownerDocument.fonts ?? null;
    this.measurementCache = options.incremental === false ? undefined : createMeasurementCache();
    if (options.observe !== false) {
      const MutationObserverConstructor = (this.view as (Window & {
        MutationObserver?: typeof MutationObserver;
      }) | null)?.MutationObserver;
      if (MutationObserverConstructor) {
        const observer = new MutationObserverConstructor((records) => {
          records.forEach((record) => this.markMutation(record));
          this.requestLayout('mutation');
        });
        observer.observe(root, { childList: true, characterData: true, subtree: true });
        this.mutationObserver = observer;
      }
      const ResizeObserverConstructor = (this.view as (Window & {
        ResizeObserver?: typeof ResizeObserver;
      }) | null)?.ResizeObserver;
      if (ResizeObserverConstructor) {
        const observer = new ResizeObserverConstructor(() => this.requestLayout('resize'));
        observer.observe(root);
        this.resizeObserver = observer;
      }
      this.view?.addEventListener('resize', this.onWindowResize);
      this.view?.addEventListener('beforeprint', this.onBeforePrint);
      this.fonts?.addEventListener('loadingdone', this.onFontsChanged);
    }
    this.requestLayout('initial');
  }

  get isDestroyed(): boolean { return this.destroyed; }

  /** Schedules one animation-frame measurement for any number of invalidations. */
  requestLayout(reason: DOMPageLayoutReason = 'manual'): void {
    if (this.destroyed) return;
    this.pendingReason = reason;
    if (this.scheduledFrame !== null || this.scheduledMicrotask) return;
    if (this.view?.requestAnimationFrame) {
      this.scheduledFrame = this.view.requestAnimationFrame(() => {
        this.scheduledFrame = null;
        this.runScheduled();
      });
      return;
    }
    this.scheduledMicrotask = true;
    queueMicrotask(() => {
      this.scheduledMicrotask = false;
      this.runScheduled();
    });
  }

  /** Measures synchronously, primarily for printing, tests, and explicit host refresh. */
  refreshNow(reason: DOMPageLayoutReason = 'manual'): DOMPageLayoutCycle {
    if (this.destroyed) throw new Error('Cannot refresh a destroyed DOMPageLayoutController.');
    const started = this.now();
    const geometry = typeof this.geometry === 'function' ? this.geometry() : this.geometry;
    const document = this.getDocument();
    if (reason !== 'mutation' && this.measurementCache) clearMeasurementCache(this.measurementCache);
    const measurement = measureDOMPageFlowInternal(
      this.root,
      document,
      this.options.measurement,
      this.measurementCache,
      reason === 'mutation' ? this.invalidatedIndexes : new Set(),
    );
    this.invalidatedIndexes.clear();
    const layout = layoutPages(measurement.items, geometry, this.options.layout);
    const snapshot = Object.freeze({
      measurement,
      layout,
      content: projectDOMPageContent(measurement, layout),
      presentation: projectPagePresentation(document, layout),
    });
    const cycle = Object.freeze({
      revision: ++this.revision,
      reason,
      durationMs: Math.max(0, this.now() - started),
      snapshot,
    });
    this.options.onLayout?.(cycle);
    return cycle;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.mutationObserver?.disconnect();
    this.resizeObserver?.disconnect();
    this.view?.removeEventListener('resize', this.onWindowResize);
    this.view?.removeEventListener('beforeprint', this.onBeforePrint);
    this.fonts?.removeEventListener('loadingdone', this.onFontsChanged);
    if (this.scheduledFrame !== null) this.view?.cancelAnimationFrame(this.scheduledFrame);
    this.scheduledFrame = null;
    this.invalidatedIndexes.clear();
    if (this.measurementCache) clearMeasurementCache(this.measurementCache);
  }

  private readonly onWindowResize = () => this.requestLayout('window-resize');
  private readonly onFontsChanged = () => this.requestLayout('fonts');
  private readonly onBeforePrint = () => {
    if (this.destroyed) return;
    try { this.refreshNow('before-print'); }
    catch (error) { this.options.onError?.(error); }
  };

  private markMutation(record: MutationRecord): void {
    const element = record.target.nodeType === 1
      ? record.target as HTMLElement
      : record.target.parentElement;
    const measured = element?.closest<HTMLElement>('[data-fountain-path]');
    if (!measured || !this.root.contains(measured)) return;
    const index = pathOf(measured)[0];
    if (index !== undefined) this.invalidatedIndexes.add(index);
  }

  private runScheduled(): void {
    if (this.destroyed) return;
    const reason = this.pendingReason;
    try { this.refreshNow(reason); }
    catch (error) { this.options.onError?.(error); }
  }

  private now(): number {
    return this.view?.performance.now() ?? Date.now();
  }
}

export function createDOMPageLayoutController(
  root: HTMLElement,
  getDocument: () => Node,
  geometry: DOMPageGeometrySource,
  options: DOMPageLayoutControllerOptions = {},
): DOMPageLayoutController {
  return new DOMPageLayoutController(root, getDocument, geometry, options);
}
