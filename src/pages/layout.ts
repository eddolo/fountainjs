export type StandardPageSize = 'a4' | 'letter';

export interface PageSize {
  /** Width in the resolved layout measurement unit. */
  readonly width: number;
  /** Height in the resolved layout measurement unit. */
  readonly height: number;
}

export interface PageMargins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface PageGeometry {
  readonly size: PageSize;
  readonly margins: PageMargins;
  /** Reserved header height in the same measurement unit as flow items. */
  readonly headerHeight: number;
  /** Reserved footer height in the same measurement unit as flow items. */
  readonly footerHeight: number;
  /** Body height in the same measurement unit as flow items. */
  readonly bodyHeight: number;
}

export interface PageGeometryOptions {
  readonly size?: StandardPageSize | PageSize;
  readonly margins?: number | Partial<PageMargins>;
  readonly headerHeight?: number;
  readonly footerHeight?: number;
  /** Converts physical millimetres to the layout measurement unit. */
  readonly unitsPerMillimetre?: number;
}

export interface PageFootnoteMeasurement {
  readonly id: string;
  readonly height: number;
}

export interface PageFlowFragment {
  readonly id: string;
  readonly height: number;
  readonly footnotes?: readonly PageFootnoteMeasurement[];
}

export interface PageFlowItem {
  readonly id: string;
  /** Used when `fragments` is absent. */
  readonly height?: number;
  /** Legal ordered split units, such as lines, list items, or table row groups. */
  readonly fragments?: readonly PageFlowFragment[];
  readonly breakBefore?: boolean;
  readonly breakAfter?: boolean;
  readonly keepWithNext?: boolean;
  /** Minimum fragments kept on the first occupied page. Defaults to one. */
  readonly minimumStart?: number;
  /** Minimum fragments kept on the final occupied page. Defaults to one. */
  readonly minimumEnd?: number;
  /** Repeated header/caption height on every continuation page. */
  readonly continuationHeight?: number;
}

export interface PagePlacement {
  readonly itemId: string;
  readonly fragmentFrom: number;
  readonly fragmentTo: number;
  readonly height: number;
  readonly continuedBefore: boolean;
  readonly continuedAfter: boolean;
}

export interface PageLayoutPage {
  readonly number: number;
  readonly placements: readonly PagePlacement[];
  readonly footnotes: readonly PageFootnoteMeasurement[];
  readonly usedHeight: number;
  readonly availableHeight: number;
}

export type PageLayoutWarningCode =
  | 'oversized-item'
  | 'oversized-fragment'
  | 'constraint-relaxed'
  | 'maximum-pages';

export interface PageLayoutWarning {
  readonly code: PageLayoutWarningCode;
  readonly itemId: string;
  readonly detail: string;
}

export interface PageLayoutResult {
  readonly pages: readonly PageLayoutPage[];
  readonly warnings: readonly PageLayoutWarning[];
}

export interface PageLayoutOptions {
  readonly maximumPages?: number;
}

const STANDARD_SIZES: Readonly<Record<StandardPageSize, PageSize>> = Object.freeze({
  a4: Object.freeze({ width: 210, height: 297 }),
  letter: Object.freeze({ width: 215.9, height: 279.4 }),
});

const finitePositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const finiteNonNegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function optionalPositiveInteger(value: unknown, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
  return Number(value);
}

function frozenSize(value: StandardPageSize | PageSize | undefined): PageSize {
  const size = typeof value === 'string' ? STANDARD_SIZES[value] : value ?? STANDARD_SIZES.a4;
  if (!size || !finitePositive(size.width) || !finitePositive(size.height)) {
    throw new TypeError('Page size requires positive finite width and height in millimetres.');
  }
  return Object.freeze({ width: size.width, height: size.height });
}

/** Resolves physical page settings into the unit used by a measurement adapter. */
export function createPageGeometry(options: PageGeometryOptions = {}): PageGeometry {
  const size = frozenSize(options.size);
  const scale = options.unitsPerMillimetre ?? 1;
  if (!finitePositive(scale)) throw new TypeError('unitsPerMillimetre must be a positive finite number.');
  const marginInput = options.margins ?? 20;
  const margin = typeof marginInput === 'number' ? marginInput : 20;
  const physical = typeof marginInput === 'number'
    ? { top: margin, right: margin, bottom: margin, left: margin }
    : {
        top: marginInput.top ?? 20,
        right: marginInput.right ?? 20,
        bottom: marginInput.bottom ?? 20,
        left: marginInput.left ?? 20,
      };
  if (Object.values(physical).some((value) => !finiteNonNegative(value))) {
    throw new TypeError('Page margins must be finite non-negative millimetres.');
  }
  const headerHeight = options.headerHeight ?? 0;
  const footerHeight = options.footerHeight ?? 0;
  if (!finiteNonNegative(headerHeight) || !finiteNonNegative(footerHeight)) {
    throw new TypeError('Header and footer heights must be finite non-negative layout units.');
  }
  const margins = Object.freeze({
    top: physical.top * scale,
    right: physical.right * scale,
    bottom: physical.bottom * scale,
    left: physical.left * scale,
  });
  const bodyHeight = size.height * scale - margins.top - margins.bottom - headerHeight - footerHeight;
  if (!finitePositive(bodyHeight)) throw new TypeError('Page margins, header, and footer leave no positive body height.');
  return Object.freeze({
    size: Object.freeze({ width: size.width * scale, height: size.height * scale }),
    margins,
    headerHeight,
    footerHeight,
    bodyHeight,
  });
}

interface MutablePage {
  placements: PagePlacement[];
  footnotes: Map<string, PageFootnoteMeasurement>;
  contentHeight: number;
}

function validateId(value: unknown, kind: string): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 256) throw new TypeError(`${kind} requires a 1-256 character id.`);
}

function measuredFootnotes(
  value: readonly PageFootnoteMeasurement[] | undefined,
  knownHeights: Map<string, number>,
): readonly PageFootnoteMeasurement[] {
  const localIds = new Set<string>();
  return Object.freeze((value ?? []).map((footnote) => {
    validateId(footnote?.id, 'A page footnote');
    if (!finiteNonNegative(footnote.height)) throw new TypeError(`Footnote ${footnote.id} requires a finite non-negative height.`);
    if (localIds.has(footnote.id)) throw new TypeError(`Fragment repeats footnote ${footnote.id}.`);
    localIds.add(footnote.id);
    const knownHeight = knownHeights.get(footnote.id);
    if (knownHeight !== undefined && knownHeight !== footnote.height) {
      throw new TypeError(`Footnote ${footnote.id} has conflicting measured heights.`);
    }
    knownHeights.set(footnote.id, footnote.height);
    return Object.freeze({ id: footnote.id, height: footnote.height });
  }));
}

function itemFragments(item: PageFlowItem, knownFootnoteHeights: Map<string, number>): readonly PageFlowFragment[] {
  validateId(item?.id, 'A page flow item');
  if (item.fragments !== undefined) {
    if (!Array.isArray(item.fragments) || !item.fragments.length) throw new TypeError(`Page flow item ${item.id} requires at least one fragment.`);
    const fragmentIds = new Set<string>();
    return Object.freeze(item.fragments.map((fragment) => {
      validateId(fragment?.id, `A fragment in ${item.id}`);
      if (fragmentIds.has(fragment.id)) throw new TypeError(`Page flow item ${item.id} repeats fragment id ${fragment.id}.`);
      fragmentIds.add(fragment.id);
      if (!finiteNonNegative(fragment.height)) throw new TypeError(`Fragment ${fragment.id} requires a finite non-negative height.`);
      return Object.freeze({
        id: fragment.id,
        height: fragment.height,
        footnotes: measuredFootnotes(fragment.footnotes, knownFootnoteHeights),
      });
    }));
  }
  if (!finiteNonNegative(item.height)) throw new TypeError(`Page flow item ${item.id} requires a finite non-negative height.`);
  return Object.freeze([Object.freeze({ id: item.id, height: item.height, footnotes: Object.freeze([]) })]);
}

function pageUsed(page: MutablePage): number {
  return page.contentHeight + [...page.footnotes.values()].reduce((total, footnote) => total + footnote.height, 0);
}

function additionalFootnoteHeight(
  page: MutablePage,
  fragments: readonly PageFlowFragment[],
  placedFootnotes: ReadonlySet<string>,
): number {
  const additions = new Map<string, number>();
  fragments.forEach((fragment) => fragment.footnotes?.forEach((footnote) => {
    if (!placedFootnotes.has(footnote.id) && !page.footnotes.has(footnote.id)) {
      additions.set(footnote.id, footnote.height);
    }
  }));
  return [...additions.values()].reduce((total, height) => total + height, 0);
}

function freezePage(page: MutablePage, number: number, bodyHeight: number): PageLayoutPage {
  return Object.freeze({
    number,
    placements: Object.freeze([...page.placements]),
    footnotes: Object.freeze([...page.footnotes.values()].map((footnote) => Object.freeze({ ...footnote }))),
    usedHeight: pageUsed(page),
    availableHeight: bodyHeight,
  });
}

/**
 * Deterministically assigns measured legal fragments to physical page bodies.
 * It performs no DOM access and never changes document data.
 */
export function layoutPages(
  input: readonly PageFlowItem[],
  geometry: PageGeometry,
  options: PageLayoutOptions = {},
): PageLayoutResult {
  if (!geometry || !finitePositive(geometry.bodyHeight)) throw new TypeError('layoutPages requires a valid positive page body height.');
  if (!Array.isArray(input)) throw new TypeError('layoutPages requires an ordered list of flow items.');
  const maximumPages = optionalPositiveInteger(options.maximumPages, 10_000, 'maximumPages');
  if (maximumPages > 100_000) throw new TypeError('maximumPages cannot exceed 100,000.');
  const itemIds = new Set<string>();
  const knownFootnoteHeights = new Map<string, number>();
  const normalized = input.map((item) => {
    validateId(item?.id, 'A page flow item');
    if (itemIds.has(item.id)) throw new TypeError(`Page flow item id ${item.id} is duplicated.`);
    itemIds.add(item.id);
    return {
      item,
      fragments: itemFragments(item, knownFootnoteHeights),
      minimumStart: optionalPositiveInteger(item.minimumStart, 1, `minimumStart for ${item.id}`),
      minimumEnd: optionalPositiveInteger(item.minimumEnd, 1, `minimumEnd for ${item.id}`),
      continuationHeight: item.continuationHeight ?? 0,
    };
  });
  normalized.forEach(({ item, fragments, minimumStart, minimumEnd, continuationHeight }) => {
    if (!finiteNonNegative(continuationHeight)) throw new TypeError(`Page flow item ${item.id} requires a finite non-negative continuation height.`);
    if (minimumStart > fragments.length || minimumEnd > fragments.length) {
      throw new TypeError(`Page flow item ${item.id} has a fragment constraint larger than its fragment count.`);
    }
  });

  const pages: MutablePage[] = [];
  const warnings: PageLayoutWarning[] = [];
  const placedFootnotes = new Set<string>();
  const page = (): MutablePage => {
    if (!pages.length) pages.push({ placements: [], footnotes: new Map(), contentHeight: 0 });
    return pages.at(-1) as MutablePage;
  };
  const nextPage = (itemId: string): MutablePage => {
    if (pages.length >= maximumPages) {
      warnings.push(Object.freeze({ code: 'maximum-pages', itemId, detail: `Layout stopped at the configured ${maximumPages} page limit.` }));
      throw new RangeError(`Page layout exceeded the configured ${maximumPages} page limit.`);
    }
    pages.push({ placements: [], footnotes: new Map(), contentHeight: 0 });
    return page();
  };
  const remaining = (target: MutablePage): number => geometry.bodyHeight - pageUsed(target);
  const append = (
    target: MutablePage,
    itemId: string,
    fragments: readonly PageFlowFragment[],
    from: number,
    to: number,
    continuationHeight: number,
    total: number,
  ): void => {
    const continuedBefore = from > 0;
    const height = fragments.slice(from, to).reduce((sum, fragment) => sum + fragment.height, 0)
      + (continuedBefore ? continuationHeight : 0);
    target.placements.push(Object.freeze({
      itemId,
      fragmentFrom: from,
      fragmentTo: to,
      height,
      continuedBefore,
      continuedAfter: to < total,
    }));
    target.contentHeight += height;
    fragments.slice(from, to).forEach((fragment) => fragment.footnotes?.forEach((footnote) => {
      if (!placedFootnotes.has(footnote.id) && !target.footnotes.has(footnote.id)) {
        target.footnotes.set(footnote.id, footnote);
        placedFootnotes.add(footnote.id);
      }
    }));
  };

  normalized.forEach((entry, itemIndex) => {
    const { item, fragments, minimumStart, minimumEnd, continuationHeight } = entry;
    if (item.breakBefore && page().placements.length) nextPage(item.id);

    const next = normalized[itemIndex + 1];
    if (item.keepWithNext && next && fragments.length === 1 && next.fragments.length === 1) {
      const pair = fragments[0].height + next.fragments[0].height
        + additionalFootnoteHeight(page(), [fragments[0], next.fragments[0]], placedFootnotes);
      if (pair <= geometry.bodyHeight && pair > remaining(page()) && page().placements.length) nextPage(item.id);
    }

    let from = 0;
    while (from < fragments.length) {
      let target = page();
      const continued = from > 0 ? continuationHeight : 0;
      let to = from;
      let height = continued;
      while (to < fragments.length) {
        const candidate = fragments[to];
        const addedFootnotes = additionalFootnoteHeight(target, fragments.slice(from, to + 1), placedFootnotes);
        if (height + candidate.height + addedFootnotes > remaining(target)) break;
        height += candidate.height;
        to += 1;
      }

      if (to === from && target.placements.length) {
        target = nextPage(item.id);
        continue;
      }

      if (to === from) {
        const candidate = fragments[from];
        const code = fragments.length === 1 ? 'oversized-item' : 'oversized-fragment';
        warnings.push(Object.freeze({
          code,
          itemId: item.id,
          detail: `${fragments.length === 1 ? 'Item' : `Fragment ${candidate.id}`} exceeds one empty page body and was retained without clipping.`,
        }));
        append(target, item.id, fragments, from, from + 1, continuationHeight, fragments.length);
        from += 1;
        if (from < fragments.length) nextPage(item.id);
        continue;
      }

      const placed = to - from;
      const rest = fragments.length - to;
      const firstPlacement = from === 0;
      const violatesStart = firstPlacement && to < fragments.length && placed < minimumStart;
      const violatesEnd = rest > 0 && rest < minimumEnd;
      if ((violatesStart || violatesEnd) && target.placements.length) {
        nextPage(item.id);
        continue;
      }
      if (violatesEnd) {
        const adjusted = to - (minimumEnd - rest);
        if (adjusted > from && (!firstPlacement || adjusted - from >= minimumStart)) to = adjusted;
      }
      const finalPlaced = to - from;
      const finalRest = fragments.length - to;
      const relaxedStart = firstPlacement && to < fragments.length && finalPlaced < minimumStart;
      const relaxedEnd = finalRest > 0 && finalRest < minimumEnd;
      if (relaxedStart || relaxedEnd) {
        warnings.push(Object.freeze({
          code: 'constraint-relaxed',
          itemId: item.id,
          detail: 'Widow/orphan fragment constraints could not fit an empty page and were relaxed without dropping content.',
        }));
      }

      append(target, item.id, fragments, from, to, continuationHeight, fragments.length);
      from = to;
      if (from < fragments.length) nextPage(item.id);
    }
    if (item.breakAfter && itemIndex < normalized.length - 1 && page().placements.length) nextPage(item.id);
  });

  if (!pages.length) pages.push({ placements: [], footnotes: new Map(), contentHeight: 0 });
  return Object.freeze({
    pages: Object.freeze(pages.map((value, index) => freezePage(value, index + 1, geometry.bodyHeight))),
    warnings: Object.freeze(warnings),
  });
}
