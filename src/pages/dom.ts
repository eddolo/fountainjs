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
  readonly index: number;
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

function rebasePath(path: readonly number[], index: number): readonly number[] {
  return Object.freeze([index, ...path.slice(1)]);
}

function rebaseBlockIdentifier(identifier: string, previousIndex: number, index: number): string {
  const prefix = `block:${previousIndex}:`;
  return identifier.startsWith(prefix) ? `block:${index}:${identifier.slice(prefix.length)}` : identifier;
}

function rebaseCachedFlowMeasurement(cached: CachedFlowMeasurement, index: number): CachedFlowMeasurement {
  if (cached.index === index) return cached;
  const item = cached.item
    ? Object.freeze({
        ...cached.item,
        id: rebaseBlockIdentifier(cached.item.id, cached.index, index),
        ...(cached.item.fragments
          ? { fragments: Object.freeze(cached.item.fragments.map((fragment) => Object.freeze({
              ...fragment,
              id: rebaseBlockIdentifier(fragment.id, cached.index, index),
            }))) }
          : {}),
      })
    : undefined;
  const sources = Object.freeze(cached.sources.map((source) => Object.freeze({
    ...source,
    itemId: rebaseBlockIdentifier(source.itemId, cached.index, index),
    fragmentId: rebaseBlockIdentifier(source.fragmentId, cached.index, index),
    sourcePath: rebasePath(source.sourcePath, index),
    partPaths: Object.freeze(source.partPaths.map((path) => rebasePath(path, index))),
  })));
  const template = cached.template
    ? Object.freeze({ ...cached.template, path: rebasePath(cached.template.path, index) })
    : undefined;
  const warnings = Object.freeze(cached.warnings.map((warning) => Object.freeze({
    ...warning,
    path: rebasePath(warning.path, index),
    detail: warning.detail.replace(`at ${cached.index}`, `at ${index}`),
  })));
  return {
    index,
    node: cached.node,
    element: cached.element,
    definitionSignature: cached.definitionSignature,
    ...(item ? { item } : {}),
    sources,
    ...(template ? { template } : {}),
    warnings,
  };
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
  const priorDefinitionsByElement = new Map<HTMLElement, CachedDefinitionMeasurement>();
  const priorEntriesByElement = new Map<HTMLElement, CachedFlowMeasurement>();
  priorDefinitions.forEach((entry) => priorDefinitionsByElement.set(entry.element, entry));
  priorEntries.forEach((entry) => priorEntriesByElement.set(entry.element, entry));

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
    const indexed = priorDefinitions.get(index);
    const cached = !invalidatedIndexes.has(index)
      ? indexed?.node === node && indexed.element === element ? indexed : priorDefinitionsByElement.get(element)
      : undefined;
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
    const indexed = priorEntries.get(index);
    const candidate = !invalidatedIndexes.has(index)
      ? indexed?.node === node && indexed.element === element ? indexed : priorEntriesByElement.get(element)
      : undefined;
    const cached = candidate?.node === node && candidate.element === element
      ? rebaseCachedFlowMeasurement(candidate, index)
      : undefined;
    if (
      cached
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
        index, node, element, definitionSignature, sources: Object.freeze([]), template,
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
        index, node, element, definitionSignature, item, sources, warnings: Object.freeze([]),
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
      index,
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

export type DOMEditablePageMode = 'paged' | 'continuous';

export type DOMEditablePageIssueCode =
  | 'fragmented-editable-source'
  | 'missing-rendered-source'
  | 'unplaced-page-intent';

export interface DOMEditablePageIssue {
  readonly code: DOMEditablePageIssueCode;
  readonly path: readonly number[];
  readonly detail: string;
}

export interface DOMEditablePageSurfaceOptions {
  /** Space between page sheets in CSS pixels. Defaults to 24. */
  readonly gap?: number;
  /** Optional host class added alongside the FountainJS page-surface class. */
  readonly className?: string;
}

export interface DOMEditablePageSurfaceResult {
  readonly mode: DOMEditablePageMode;
  readonly root: HTMLElement;
  readonly pages: readonly HTMLElement[];
  readonly issues: readonly DOMEditablePageIssue[];
  readonly snapshot: DOMPageLayoutSnapshot;
}

interface EditableSourceDecoration {
  readonly attribute: string | null;
  readonly shift: string;
  readonly shiftPriority: string;
}

const EDITABLE_PAGE_VARIABLES = Object.freeze([
  '--fountain-editable-page-width',
  '--fountain-editable-page-height',
  '--fountain-editable-page-total-height',
  '--fountain-editable-page-gap',
  '--fountain-editable-page-margin-left',
  '--fountain-editable-page-margin-right',
]);

function editableGeometry(geometry: PageGeometry): void {
  if (
    !geometry
    || !finiteNonNegative(geometry.size?.width)
    || geometry.size.width === 0
    || !finiteNonNegative(geometry.size?.height)
    || geometry.size.height === 0
    || !finiteNonNegative(geometry.bodyHeight)
  ) throw new TypeError('Editable page surfaces require valid positive page geometry.');
}

function editableTopLevel(root: HTMLElement, path: readonly number[]): HTMLElement | null {
  if (path.length < 1) return null;
  const key = String(path[0]);
  return Array.from(root.children).find((child) => (
    (child as HTMLElement).dataset.fountainPath === key
  )) as HTMLElement | undefined ?? null;
}

function hasPageInlineSpace(host: HTMLElement, geometry: PageGeometry): boolean {
  const rect = host.getBoundingClientRect();
  if (!finiteNonNegative(rect.width) || rect.width === 0) return true;
  const style = host.ownerDocument.defaultView?.getComputedStyle(host);
  const border = numericStyle(style?.borderInlineStartWidth || style?.borderLeftWidth)
    + numericStyle(style?.borderInlineEndWidth || style?.borderRightWidth);
  const padding = numericStyle(style?.paddingInlineStart || style?.paddingLeft)
    + numericStyle(style?.paddingInlineEnd || style?.paddingRight);
  return rect.width - border - padding + .5 >= geometry.size.width;
}

function pageShell(owner: Document, geometry: PageGeometry, number: number): HTMLElement {
  const sheet = owner.createElement('article');
  sheet.className = 'fountain-editable-pages__sheet';
  sheet.dataset.fountainEditablePage = String(number);
  sheet.setAttribute('aria-hidden', 'true');

  const header = owner.createElement('div');
  header.className = 'fountain-editable-pages__header';
  header.style.insetBlockStart = `${geometry.margins.top}px`;
  header.style.insetInline = `${geometry.margins.left}px ${geometry.margins.right}px`;
  header.style.blockSize = `${geometry.headerHeight}px`;

  const body = owner.createElement('div');
  body.className = 'fountain-editable-pages__body';
  body.style.insetBlockStart = `${geometry.margins.top + geometry.headerHeight}px`;
  body.style.insetInline = `${geometry.margins.left}px ${geometry.margins.right}px`;
  body.style.blockSize = `${geometry.bodyHeight}px`;

  const footer = owner.createElement('div');
  footer.className = 'fountain-editable-pages__footer';
  footer.style.insetBlockEnd = `${geometry.margins.bottom}px`;
  footer.style.insetInline = `${geometry.margins.left}px ${geometry.margins.right}px`;
  footer.style.blockSize = `${geometry.footerHeight}px`;

  const label = owner.createElement('span');
  label.className = 'fountain-editable-pages__number';
  label.textContent = String(number);
  sheet.append(header, body, footer, label);
  return sheet;
}

/**
 * Owns the visual page-sheet layer around one continuous EditorView root.
 * Editable nodes are never cloned, moved, wrapped, or reordered. Whole source
 * blocks receive transient visual offsets; unsupported split sources fall back
 * to a continuous canvas.
 */
export class DOMEditablePageSurface {
  readonly host: HTMLElement;
  readonly shells: HTMLElement;
  private readonly decorated = new Map<HTMLElement, EditableSourceDecoration>();
  private readonly hostVariables = new Map<string, { value: string; priority: string }>();
  private readonly hostHadClass: boolean;
  private readonly rootHadClass: boolean;
  private readonly extraClasses: readonly string[];
  private readonly priorExtraClasses = new Map<string, boolean>();
  private readonly priorHostMode: string | null;
  private readonly priorRootMode: string | null;
  private destroyed = false;
  private gap: number;
  private currentResult?: DOMEditablePageSurfaceResult;

  constructor(
    public readonly root: HTMLElement,
    geometry: PageGeometry,
    options: DOMEditablePageSurfaceOptions = {},
  ) {
    if (!root?.ownerDocument || !root.parentElement) {
      throw new TypeError('DOMEditablePageSurface requires a mounted editor root.');
    }
    editableGeometry(geometry);
    const gap = options.gap ?? 24;
    if (!finiteNonNegative(gap)) throw new TypeError('Editable page gap must be a finite non-negative number.');
    this.gap = gap;
    this.host = root.parentElement;
    this.hostHadClass = this.host.classList.contains('fountain-editable-pages');
    this.rootHadClass = root.classList.contains('fountain-editable-pages__content');
    this.extraClasses = Object.freeze(options.className?.trim().split(/\s+/u).filter(Boolean) ?? []);
    this.extraClasses.forEach((token) => this.priorExtraClasses.set(token, this.host.classList.contains(token)));
    this.priorHostMode = this.host.getAttribute('data-fountain-editable-pages-mode');
    this.priorRootMode = root.getAttribute('data-fountain-editable-pages-mode');
    EDITABLE_PAGE_VARIABLES.forEach((property) => this.hostVariables.set(property, {
      value: this.host.style.getPropertyValue(property),
      priority: this.host.style.getPropertyPriority(property),
    }));
    this.host.classList.add('fountain-editable-pages', ...this.extraClasses);
    root.classList.add('fountain-editable-pages__content');
    this.shells = root.ownerDocument.createElement('div');
    this.shells.className = 'fountain-editable-pages__shells';
    this.shells.setAttribute('aria-hidden', 'true');
    this.shells.contentEditable = 'false';
    this.host.insertBefore(this.shells, root);
    this.prepare(geometry, 1);
  }

  get isDestroyed(): boolean { return this.destroyed; }
  get current(): DOMEditablePageSurfaceResult | undefined { return this.currentResult; }

  prepare(geometry: PageGeometry, pageCount: number): void {
    if (this.destroyed) throw new Error('Cannot prepare a destroyed DOMEditablePageSurface.');
    editableGeometry(geometry);
    if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
      throw new TypeError('Editable page surfaces require a positive page count.');
    }
    const totalHeight = pageCount * geometry.size.height + Math.max(0, pageCount - 1) * this.gap;
    this.host.style.setProperty('--fountain-editable-page-width', `${geometry.size.width}px`);
    this.host.style.setProperty('--fountain-editable-page-height', `${geometry.size.height}px`);
    this.host.style.setProperty('--fountain-editable-page-total-height', `${totalHeight}px`);
    this.host.style.setProperty('--fountain-editable-page-gap', `${this.gap}px`);
    this.host.style.setProperty('--fountain-editable-page-margin-left', `${geometry.margins.left}px`);
    this.host.style.setProperty('--fountain-editable-page-margin-right', `${geometry.margins.right}px`);
  }

  update(geometry: PageGeometry, snapshot: DOMPageLayoutSnapshot): DOMEditablePageSurfaceResult {
    if (this.destroyed) throw new Error('Cannot update a destroyed DOMEditablePageSurface.');
    editableGeometry(geometry);
    if (!snapshot?.content?.pages.length || snapshot.content.pages.length !== snapshot.layout.pages.length) {
      throw new TypeError('Editable page surfaces require a complete non-empty page snapshot.');
    }
    const view = this.root.ownerDocument.defaultView;
    const narrowContinuous = (view?.matchMedia?.('(max-width: 720px)').matches ?? false)
      || !hasPageInlineSpace(this.host, geometry);
    if (narrowContinuous) {
      this.clearDecorations();
      this.shells.replaceChildren();
      this.prepare(geometry, 1);
      this.setMode('continuous');
      return this.finish('continuous', [], [], snapshot);
    }
    const bodyWidth = geometry.size.width - geometry.margins.left - geometry.margins.right;
    if (!finiteNonNegative(bodyWidth) || Math.abs(snapshot.measurement.contentWidth - bodyWidth) > .5) {
      throw new TypeError(
        `The editable page body width (${bodyWidth}) must match the measured editor width `
        + `(${snapshot.measurement.contentWidth}).`,
      );
    }
    this.clearDecorations();
    this.prepare(geometry, snapshot.content.pages.length);

    const issues: DOMEditablePageIssue[] = [];
    const placementsByItem = new Map<string, Array<{ page: number; placement: DOMPageContentPlacement }>>();
    snapshot.content.pages.forEach((page) => page.placements.forEach((placement) => {
      const entries = placementsByItem.get(placement.itemId) ?? [];
      entries.push({ page: page.number, placement });
      placementsByItem.set(placement.itemId, entries);
    }));
    placementsByItem.forEach((entries) => {
      const pages = new Set(entries.map((entry) => entry.page));
      const source = entries[0]?.placement.sources[0];
      if (pages.size > 1 && source) issues.push(Object.freeze({
        code: 'fragmented-editable-source',
        path: Object.freeze([...source.sourcePath]),
        detail: `Editable source ${source.sourcePath.join('.')} spans ${pages.size} pages and cannot be cloned safely.`,
      }));
      if (source && !editableTopLevel(this.root, source.sourcePath)) issues.push(Object.freeze({
        code: 'missing-rendered-source',
        path: Object.freeze([...source.sourcePath]),
        detail: `No rendered top-level node exists for editable source ${source.sourcePath.join('.')}.`,
      }));
    });
    Array.from(this.root.children).forEach((child) => {
      const element = child as HTMLElement;
      if (!['page_header', 'page_footer', 'footnote_definition'].includes(element.dataset.fountainNode ?? '')) return;
      const path = pathOf(element);
      issues.push(Object.freeze({
        code: 'unplaced-page-intent',
        path,
        detail: `${element.dataset.fountainNode} remains canonical editable intent and is not duplicated into page shells.`,
      }));
    });

    if (issues.length) {
      this.shells.replaceChildren();
      this.setMode('continuous');
      return this.finish('continuous', [], issues, snapshot);
    }

    const fragment = this.root.ownerDocument.createDocumentFragment();
    const pages = snapshot.content.pages.map((page) => {
      const shell = pageShell(this.root.ownerDocument, geometry, page.number);
      if (snapshot.layout.pages[page.number - 1]?.usedHeight
        > snapshot.layout.pages[page.number - 1]!.availableHeight) {
        shell.dataset.fountainEditablePageOverflow = 'true';
      }
      fragment.appendChild(shell);
      return shell;
    });
    this.shells.replaceChildren(fragment);
    this.setMode('paged');

    const rootRect = this.root.getBoundingClientRect();
    const decoratedItems = new Set<string>();
    snapshot.content.pages.forEach((page) => {
      let cursor = 0;
      page.placements.forEach((placement) => {
        const source = placement.sources[0];
        const element = source ? editableTopLevel(this.root, source.sourcePath) : null;
        if (source && element && !decoratedItems.has(placement.itemId)) {
          const style = element.ownerDocument.defaultView?.getComputedStyle(element);
          const marginBefore = numericStyle(style?.marginBlockStart || style?.marginTop);
          const naturalTop = element.getBoundingClientRect().top - rootRect.top;
          const pageTop = (page.number - 1) * (geometry.size.height + this.gap);
          const desiredTop = pageTop + geometry.margins.top + geometry.headerHeight + cursor + marginBefore;
          this.decorate(element, page.number, desiredTop - naturalTop);
          decoratedItems.add(placement.itemId);
        }
        cursor += placement.height;
      });
    });
    return this.finish('paged', pages, [], snapshot);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearDecorations();
    this.shells.remove();
    if (!this.hostHadClass) this.host.classList.remove('fountain-editable-pages');
    if (!this.rootHadClass) this.root.classList.remove('fountain-editable-pages__content');
    this.extraClasses.forEach((token) => {
      if (!this.priorExtraClasses.get(token)) this.host.classList.remove(token);
    });
    EDITABLE_PAGE_VARIABLES.forEach((property) => {
      const prior = this.hostVariables.get(property);
      if (prior?.value) this.host.style.setProperty(property, prior.value, prior.priority);
      else this.host.style.removeProperty(property);
    });
    this.restoreAttribute(this.host, 'data-fountain-editable-pages-mode', this.priorHostMode);
    this.restoreAttribute(this.root, 'data-fountain-editable-pages-mode', this.priorRootMode);
    this.currentResult = undefined;
  }

  private decorate(element: HTMLElement, page: number, shift: number): void {
    if (!this.decorated.has(element)) this.decorated.set(element, {
      attribute: element.getAttribute('data-fountain-editable-page'),
      shift: element.style.getPropertyValue('--fountain-editable-page-shift'),
      shiftPriority: element.style.getPropertyPriority('--fountain-editable-page-shift'),
    });
    element.dataset.fountainEditablePage = String(page);
    element.style.setProperty('--fountain-editable-page-shift', `${Math.round(shift * 1_000) / 1_000}px`);
  }

  private clearDecorations(): void {
    this.decorated.forEach((prior, element) => {
      this.restoreAttribute(element, 'data-fountain-editable-page', prior.attribute);
      if (prior.shift) element.style.setProperty('--fountain-editable-page-shift', prior.shift, prior.shiftPriority);
      else element.style.removeProperty('--fountain-editable-page-shift');
    });
    this.decorated.clear();
  }

  private setMode(mode: DOMEditablePageMode): void {
    this.host.dataset.fountainEditablePagesMode = mode;
    this.root.dataset.fountainEditablePagesMode = mode;
  }

  private finish(
    mode: DOMEditablePageMode,
    pages: readonly HTMLElement[],
    issues: readonly DOMEditablePageIssue[],
    snapshot: DOMPageLayoutSnapshot,
  ): DOMEditablePageSurfaceResult {
    const result = Object.freeze({
      mode,
      root: this.root,
      pages: Object.freeze([...pages]),
      issues: Object.freeze([...issues]),
      snapshot,
    });
    this.currentResult = result;
    return result;
  }

  private restoreAttribute(element: HTMLElement, name: string, value: string | null): void {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }
}

export interface DOMEditablePageControllerOptions extends DOMPageLayoutControllerOptions, DOMEditablePageSurfaceOptions {
  /** Called when a source cannot be paged without duplicating editable content. */
  readonly onFallback?: (issues: readonly DOMEditablePageIssue[]) => void;
}

/** Couples measured reflow to the guarded single-contenteditable page surface. */
export class DOMEditablePageController {
  readonly surface: DOMEditablePageSurface;
  readonly layout: DOMPageLayoutController;
  private readonly hostResizeObserver?: ResizeObserver;
  private destroyed = false;

  constructor(
    root: HTMLElement,
    getDocument: () => Node,
    geometry: DOMPageGeometrySource,
    options: DOMEditablePageControllerOptions = {},
  ) {
    const resolveGeometry = () => typeof geometry === 'function' ? geometry() : geometry;
    let currentGeometry = resolveGeometry();
    this.surface = new DOMEditablePageSurface(root, currentGeometry, options);
    const geometryForLayout = () => {
      currentGeometry = resolveGeometry();
      this.surface.prepare(currentGeometry, this.surface.current?.pages.length || 1);
      return currentGeometry;
    };
    this.layout = new DOMPageLayoutController(root, getDocument, geometryForLayout, {
      measurement: options.measurement,
      layout: options.layout,
      observe: options.observe,
      incremental: options.incremental,
      onError: options.onError,
      onLayout: (cycle) => {
        const result = this.surface.update(currentGeometry, cycle.snapshot);
        options.onLayout?.(cycle);
        if (result.mode === 'continuous' && result.issues.length) options.onFallback?.(result.issues);
      },
    });
    if (options.observe !== false) {
      const ResizeObserverConstructor = (root.ownerDocument.defaultView as (Window & {
        ResizeObserver?: typeof ResizeObserver;
      }) | null)?.ResizeObserver;
      if (ResizeObserverConstructor && this.surface.host !== root) {
        this.hostResizeObserver = new ResizeObserverConstructor(() => this.layout.requestLayout('resize'));
        this.hostResizeObserver.observe(this.surface.host);
      }
    }
    this.layout.refreshNow('initial');
  }

  get isDestroyed(): boolean { return this.destroyed; }
  get current(): DOMEditablePageSurfaceResult | undefined { return this.surface.current; }

  requestLayout(reason: DOMPageLayoutReason = 'manual'): void { this.layout.requestLayout(reason); }

  refreshNow(reason: DOMPageLayoutReason = 'manual'): DOMEditablePageSurfaceResult {
    if (this.destroyed) throw new Error('Cannot refresh a destroyed DOMEditablePageController.');
    this.layout.refreshNow(reason);
    if (!this.surface.current) throw new Error('Editable page layout produced no surface result.');
    return this.surface.current;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.hostResizeObserver?.disconnect();
    this.layout.destroy();
    this.surface.destroy();
  }
}

export function createDOMEditablePageController(
  root: HTMLElement,
  getDocument: () => Node,
  geometry: DOMPageGeometrySource,
  options: DOMEditablePageControllerOptions = {},
): DOMEditablePageController {
  return new DOMEditablePageController(root, getDocument, geometry, options);
}
