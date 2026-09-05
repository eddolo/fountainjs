import type { PageGeometry } from './layout';
import type { PagePresentationPage, ProjectedPageTemplate } from './presentation';
import type {
  DOMPageContentPlacement,
  DOMPageFragmentSource,
  DOMPageLayoutSnapshot,
} from './dom';

export interface DOMPagePreviewOptions {
  /** Accessible name for the complete preview region. */
  readonly ariaLabel?: string;
  /** Optional host class added alongside FountainJS preview classes. */
  readonly className?: string;
  /** Include one non-paginated screen-reader copy. Defaults to true. */
  readonly includeAccessibleDocument?: boolean;
  /** Install a named physical page rule for browser printing. Defaults to true. */
  readonly includePrintStyles?: boolean;
}

export interface DOMPagePreviewResult {
  readonly root: HTMLElement;
  readonly pages: readonly HTMLElement[];
  /** Deterministic named `@page`, absent when print styles are disabled. */
  readonly printPageName?: string;
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function renderedTopLevel(root: HTMLElement, path: readonly number[]): HTMLElement | null {
  if (path.length < 1) return null;
  const key = String(path[0]);
  return Array.from(root.children).find((element) => (
    (element as HTMLElement).dataset.fountainPath === key
  )) as HTMLElement | undefined ?? null;
}

function elementsIncluding(root: HTMLElement): readonly HTMLElement[] {
  return Object.freeze([root, ...root.querySelectorAll<HTMLElement>('*')]);
}

function prepareClone(
  clone: HTMLElement,
  pageNumber: number,
  cloneIndex: number,
  visualOnly = true,
): HTMLElement {
  const prefix = `fountain-preview-${pageNumber}-${cloneIndex}-`;
  const ids = new Map<string, string>();
  elementsIncluding(clone).forEach((element) => {
    const id = element.id;
    if (id) {
      const replacement = `${prefix}${id}`;
      ids.set(id, replacement);
      element.id = replacement;
    }
    const path = element.dataset.fountainPath;
    if (path !== undefined) {
      element.dataset.fountainSourcePath = path;
      delete element.dataset.fountainPath;
    }
    delete element.dataset.fountainTextPath;
    element.removeAttribute('contenteditable');
    element.removeAttribute('aria-selected');
    element.removeAttribute('tabindex');
    [
      'data-fountain-selected-node',
      'data-fountain-selected-cell',
      'data-fountain-gap',
      'data-fountain-block-reorderable',
      'data-fountain-drop-position',
      'data-fountain-dragging',
      'data-fountain-image-selected',
      'data-fountain-image-resizing',
      'data-fountain-media-selected',
      'data-fountain-math-selected',
      'data-fountain-resizing',
      'draggable',
    ].forEach((attribute) => element.removeAttribute(attribute));
    if (['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
      (element as HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement).disabled = true;
    }
    if (visualOnly && element.tagName === 'A') element.setAttribute('tabindex', '-1');
  });
  elementsIncluding(clone).forEach((element) => {
    const href = element.getAttribute('href');
    if (href?.startsWith('#')) {
      const replacement = ids.get(href.slice(1));
      if (replacement) element.setAttribute('href', `#${replacement}`);
    }
  });
  clone.contentEditable = 'false';
  return clone;
}

function sourcePathKey(path: readonly number[]): string {
  return path.join('.');
}

function directListItems(element: HTMLElement): readonly HTMLElement[] {
  return Object.freeze(Array.from(element.children).filter((child): child is HTMLElement => child.tagName === 'LI'));
}

function tableRows(element: HTMLElement): readonly HTMLTableRowElement[] {
  return Object.freeze(Array.from(element.querySelectorAll<HTMLTableRowElement>('tr')).filter((row) => (
    row.closest('table') === element
  )));
}

function isTableHeaderRow(row: HTMLTableRowElement): boolean {
  return row.querySelectorAll(':scope > th').length > 0 && row.querySelectorAll(':scope > td').length === 0;
}

function structuralClone(
  clone: HTMLElement,
  placement: DOMPageContentPlacement,
): HTMLElement {
  const retained = new Set(placement.sources.flatMap((source) => source.partPaths.map(sourcePathKey)));
  const kind = placement.sources[0]?.kind;
  if (kind === 'list-item') {
    const items = directListItems(clone);
    const firstIndex = items.findIndex((item) => retained.has(item.dataset.fountainSourcePath ?? ''));
    items.forEach((item) => {
      if (!retained.has(item.dataset.fountainSourcePath ?? '')) item.remove();
    });
    if (clone.tagName === 'OL' && firstIndex > 0) {
      const originalStart = Number.parseInt(clone.getAttribute('start') ?? '1', 10);
      clone.setAttribute('start', String((Number.isSafeInteger(originalStart) ? originalStart : 1) + firstIndex));
    }
  } else if (kind === 'table-row-group') {
    tableRows(clone).forEach((row) => {
      const repeatHeader = placement.continuedBefore && isTableHeaderRow(row);
      if (!repeatHeader && !retained.has(row.dataset.fountainSourcePath ?? '')) row.remove();
    });
  }
  return clone;
}

function clonedPlacement(
  sourceRoot: HTMLElement,
  placement: DOMPageContentPlacement,
  allSources: readonly DOMPageFragmentSource[],
  pageNumber: number,
  cloneIndex: number,
): HTMLElement | null {
  const first = placement.sources[0];
  if (!first || first.kind === 'manual-break') return null;
  const source = renderedTopLevel(sourceRoot, first.sourcePath);
  if (!source) throw new Error(`No rendered source exists for page placement ${placement.itemId}.`);
  const clone = prepareClone(source.cloneNode(true) as HTMLElement, pageNumber, cloneIndex);
  clone.dataset.fountainPageItem = placement.itemId;
  if (first.kind === 'list-item' || first.kind === 'table-row-group') {
    return structuralClone(clone, placement);
  }
  const itemSources = allSources.filter((candidate) => candidate.itemId === placement.itemId);
  const complete = placement.fragmentFrom === 0 && placement.fragmentTo === itemSources.length;
  if (first.kind !== 'text-line' || complete) return clone;

  const clip = sourceRoot.ownerDocument.createElement('div');
  clip.className = 'fountain-page-preview__clip';
  clip.dataset.fountainPageItem = placement.itemId;
  clip.style.display = 'flow-root';
  clip.style.blockSize = `${placement.contentHeight}px`;
  clip.style.overflow = 'hidden';
  clone.style.transform = `translateY(${-first.clipOffset}px)`;
  clone.style.transformOrigin = 'top left';
  clip.appendChild(clone);
  return clip;
}

function clonedTemplate(
  sourceRoot: HTMLElement,
  template: ProjectedPageTemplate | undefined,
  pageNumber: number,
  cloneIndex: number,
): HTMLElement | null {
  if (!template) return null;
  const source = renderedTopLevel(sourceRoot, template.sourcePath);
  if (!source) throw new Error(`No rendered source exists for the ${template.kind} ${template.variant} template.`);
  const clone = prepareClone(source.cloneNode(true) as HTMLElement, pageNumber, cloneIndex);
  clone.classList.remove(`fountain-page-${template.kind}`);
  clone.dataset.fountainPageTemplate = `${template.kind}:${template.variant}`;
  clone.querySelectorAll<HTMLElement>('[data-fountain-page-field]').forEach((field) => {
    const projected = template.fields.find((candidate) => candidate.kind === field.dataset.fountainPageField);
    if (projected) {
      field.textContent = projected.value;
      field.classList.remove('fountain-page-field');
    }
  });
  return clone;
}

function wireFootnotes(page: HTMLElement, pageNumber: number): void {
  const anchor = (id: string) => `fountain-preview-${pageNumber}-footnote-${encodeURIComponent(id)}`;
  page.querySelectorAll<HTMLElement>('[data-fountain-footnote-definition]').forEach((definition) => {
    const id = definition.dataset.fountainFootnoteDefinition;
    if (id) definition.id = anchor(id);
  });
  page.querySelectorAll<HTMLElement>('[data-fountain-footnote-reference]').forEach((reference) => {
    const id = reference.dataset.fountainFootnoteReference;
    if (!id) return;
    reference.querySelectorAll<HTMLAnchorElement>('a').forEach((link) => link.setAttribute('href', `#${anchor(id)}`));
  });
}

function appendFootnotes(
  sourceRoot: HTMLElement,
  page: PagePresentationPage,
  target: HTMLElement,
  cloneIndex: () => number,
): void {
  if (!page.footnotes.length) return;
  const footnotes = sourceRoot.ownerDocument.createElement('section');
  footnotes.className = 'fountain-page-preview__footnotes';
  footnotes.setAttribute('aria-label', `Footnotes for page ${page.number}`);
  page.footnotes.forEach((footnote) => {
    const source = renderedTopLevel(sourceRoot, footnote.sourcePath);
    if (!source) throw new Error(`No rendered source exists for footnote ${footnote.id}.`);
    footnotes.appendChild(prepareClone(source.cloneNode(true) as HTMLElement, page.number, cloneIndex()));
  });
  target.appendChild(footnotes);
}

function pageRegion(owner: Document, className: string, height: number): HTMLElement {
  const region = owner.createElement('div');
  region.className = `${className} fountain-editor`;
  region.style.boxSizing = 'border-box';
  region.style.blockSize = `${height}px`;
  region.style.minBlockSize = `${height}px`;
  region.style.minHeight = '0';
  region.style.padding = '0';
  return region;
}

function cssNumber(value: number): string {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function cssNumberToken(value: number): string {
  return cssNumber(value).replaceAll('-', 'm').replaceAll('.', 'p').replaceAll('+', 'p');
}

function physicalPageName(geometry: PageGeometry): string {
  return `fountain-preview-w${cssNumberToken(geometry.size.width)}-h${cssNumberToken(geometry.size.height)}`;
}

function physicalPageStyle(owner: Document, pageName: string, geometry: PageGeometry): HTMLStyleElement {
  const style = owner.createElement('style');
  style.media = 'print';
  style.dataset.fountainPagePrintStyle = pageName;
  const declaration = `size: ${cssNumber(geometry.size.width)}px ${cssNumber(geometry.size.height)}px; margin: 0;`;
  style.textContent = `@page { ${declaration} }\n@page ${pageName} { ${declaration} }`;
  return style;
}

/**
 * Renders a separate read-only paged preview from one measured editor snapshot.
 * The editable source DOM is only cloned and is never moved or annotated.
 */
export function renderDOMPagePreview(
  sourceRoot: HTMLElement,
  target: HTMLElement,
  geometry: PageGeometry,
  snapshot: DOMPageLayoutSnapshot,
  options: DOMPagePreviewOptions = {},
): DOMPagePreviewResult {
  if (
    !sourceRoot?.ownerDocument
    || !target?.ownerDocument
    || sourceRoot === target
    || target.contains(sourceRoot)
    || sourceRoot.contains(target)
  ) {
    throw new TypeError('renderDOMPagePreview requires separate source and target elements.');
  }
  if (
    !geometry
    || !finitePositive(geometry.size?.width)
    || !finitePositive(geometry.size?.height)
    || !finitePositive(geometry.bodyHeight)
    || snapshot?.content?.pages.length !== snapshot?.presentation?.pages.length
    || snapshot?.presentation?.pageCount !== snapshot?.presentation?.pages.length
  ) throw new TypeError('renderDOMPagePreview requires valid geometry and a complete page snapshot.');
  const extraClasses = options.className?.trim().split(/\s+/u).filter(Boolean) ?? [];
  const bodyWidth = geometry.size.width - geometry.margins.left - geometry.margins.right;
  if (!finitePositive(bodyWidth) || Math.abs(snapshot.measurement.contentWidth - bodyWidth) > 0.5) {
    throw new TypeError(
      `The preview body width (${bodyWidth}) must match the measured editor width `
      + `(${snapshot.measurement.contentWidth}).`,
    );
  }

  const owner = target.ownerDocument;
  const fragment = owner.createDocumentFragment();
  const pages: HTMLElement[] = [];
  const printPageName = options.includePrintStyles === false ? undefined : physicalPageName(geometry);
  let cloneCount = 0;
  snapshot.content.pages.forEach((contentPage, pageIndex) => {
    const presentation = snapshot.presentation.pages[pageIndex];
    if (!presentation || presentation.number !== contentPage.number) {
      throw new TypeError('Page content and presentation numbers must match.');
    }
    const sheet = owner.createElement('article');
    sheet.className = 'fountain-page-preview__sheet';
    sheet.dataset.fountainPage = String(contentPage.number);
    sheet.setAttribute('aria-hidden', 'true');
    sheet.style.boxSizing = 'border-box';
    sheet.style.inlineSize = `${geometry.size.width}px`;
    sheet.style.blockSize = `${geometry.size.height}px`;
    sheet.style.padding = `${geometry.margins.top}px ${geometry.margins.right}px ${geometry.margins.bottom}px ${geometry.margins.left}px`;
    if (printPageName) sheet.style.setProperty('page', printPageName);

    const header = pageRegion(owner, 'fountain-page-preview__header', geometry.headerHeight);
    const projectedHeader = clonedTemplate(sourceRoot, presentation.header, presentation.number, ++cloneCount);
    if (projectedHeader) header.appendChild(projectedHeader);
    sheet.appendChild(header);

    const body = pageRegion(owner, 'fountain-page-preview__body', geometry.bodyHeight);
    const content = owner.createElement('div');
    content.className = 'fountain-page-preview__content';
    contentPage.placements.forEach((placement) => {
      const clone = clonedPlacement(
        sourceRoot,
        placement,
        snapshot.measurement.fragmentSources,
        presentation.number,
        ++cloneCount,
      );
      if (clone) content.appendChild(clone);
    });
    body.appendChild(content);
    appendFootnotes(sourceRoot, presentation, body, () => ++cloneCount);
    sheet.appendChild(body);

    const footer = pageRegion(owner, 'fountain-page-preview__footer', geometry.footerHeight);
    const projectedFooter = clonedTemplate(sourceRoot, presentation.footer, presentation.number, ++cloneCount);
    if (projectedFooter) footer.appendChild(projectedFooter);
    sheet.appendChild(footer);
    if (presentation.usedHeight > presentation.availableHeight) sheet.dataset.fountainPageOverflow = 'true';
    wireFootnotes(sheet, presentation.number);
    fragment.appendChild(sheet);
    pages.push(sheet);
  });

  if (options.includeAccessibleDocument !== false) {
    const accessible = prepareClone(sourceRoot.cloneNode(true) as HTMLElement, 0, 0, false);
    accessible.className = 'fountain-page-preview__accessible';
    accessible.setAttribute('role', 'document');
    accessible.setAttribute('aria-label', options.ariaLabel ?? 'Document content');
    fragment.prepend(accessible);
  }
  if (printPageName) fragment.prepend(physicalPageStyle(owner, printPageName, geometry));
  target.replaceChildren(fragment);
  target.classList.add('fountain-page-preview');
  if (extraClasses.length) target.classList.add(...extraClasses);
  target.setAttribute('role', 'region');
  target.setAttribute('aria-label', options.ariaLabel ?? 'Document page preview');
  if (options.includeAccessibleDocument === false) target.setAttribute('aria-hidden', 'true');
  else target.removeAttribute('aria-hidden');
  return Object.freeze({
    root: target,
    pages: Object.freeze(pages),
    ...(printPageName ? { printPageName } : {}),
  });
}
