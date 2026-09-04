import {
  AllSelection,
  CellSelection,
  NodeSelection,
  Selection,
  type AnySelection,
} from '../core';
import type { FountainMenuSnapshot } from '../extensions/floating-menu';

function elementAtPath(root: HTMLElement, path: readonly number[]): HTMLElement | null {
  const value = path.join('.');
  return [...root.querySelectorAll<HTMLElement>('[data-fountain-path]')]
    .find((element) => element.dataset.fountainPath === value) ?? null;
}

function textElementAtPath(root: HTMLElement, path: readonly number[]): HTMLElement | null {
  const value = path.join('.');
  return [...root.querySelectorAll<HTMLElement>('[data-fountain-text-path]')]
    .find((element) => element.dataset.fountainTextPath === value) ?? null;
}

function textPoint(element: HTMLElement, requestedOffset: number): { node: globalThis.Node; offset: number } {
  const filters = element.ownerDocument.defaultView?.NodeFilter ?? NodeFilter;
  const walker = element.ownerDocument.createTreeWalker(element, filters.SHOW_TEXT, {
    acceptNode: (node) => node.parentElement?.closest('[data-fountain-widget]')
      ? filters.FILTER_REJECT
      : filters.FILTER_ACCEPT,
  });
  let remaining = Math.max(0, requestedOffset);
  let current = walker.nextNode();
  while (current) {
    const length = current.textContent?.length ?? 0;
    if (remaining <= length) return { node: current, offset: remaining };
    remaining -= length;
    current = walker.nextNode();
  }
  return { node: element, offset: element.childNodes.length };
}

function usable(rect: DOMRectReadOnly): boolean {
  return Number.isFinite(rect.left) && Number.isFinite(rect.top) && (rect.width > 0 || rect.height > 0);
}

function union(rects: readonly DOMRectReadOnly[]): DOMRectReadOnly | null {
  const available = rects.filter(usable);
  if (!available.length) return null;
  const left = Math.min(...available.map((rect) => rect.left));
  const top = Math.min(...available.map((rect) => rect.top));
  const right = Math.max(...available.map((rect) => rect.right));
  const bottom = Math.max(...available.map((rect) => rect.bottom));
  return Object.freeze({
    x: left,
    y: top,
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({ left, top, right, bottom, width: right - left, height: bottom - top }),
  });
}

function textSelectionRect(root: HTMLElement, selection: Selection): DOMRectReadOnly | null {
  const start = textElementAtPath(root, selection.path);
  const end = textElementAtPath(root, selection.endPath);
  if (!start || !end) return null;
  try {
    const range = root.ownerDocument.createRange();
    const from = textPoint(start, selection.from);
    const to = textPoint(end, selection.to);
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    const clientRects = [...range.getClientRects()];
    return union(clientRects) ?? (usable(range.getBoundingClientRect()) ? range.getBoundingClientRect() : null);
  } catch { return null; }
}

function blockFallback(root: HTMLElement, selection: AnySelection): DOMRectReadOnly | null {
  const path = selection instanceof NodeSelection ? selection.nodePath : selection.path.slice(0, -1);
  const element = elementAtPath(root, path);
  const rect = element?.getBoundingClientRect();
  return rect && usable(rect) ? rect : null;
}

/** Resolves model selections to a reusable viewport-relative DOM reference box. */
export function getEditorMenuAnchorRect(
  root: HTMLElement,
  snapshot: Pick<FountainMenuSnapshot, 'kind' | 'selection' | 'anchorPath'>,
): DOMRectReadOnly | null {
  if (snapshot.kind === 'floating' && snapshot.anchorPath) {
    const rect = elementAtPath(root, snapshot.anchorPath)?.getBoundingClientRect();
    if (rect && usable(rect)) return rect;
  }
  const selection = snapshot.selection;
  if (selection instanceof AllSelection) {
    const rect = root.getBoundingClientRect();
    return usable(rect) ? rect : null;
  }
  if (selection instanceof NodeSelection) {
    const rect = elementAtPath(root, selection.nodePath)?.getBoundingClientRect();
    return rect && usable(rect) ? rect : null;
  }
  if (selection instanceof CellSelection) {
    return union(selection.cellPaths.map((path) => elementAtPath(root, path)?.getBoundingClientRect())
      .filter((rect): rect is DOMRectReadOnly => Boolean(rect)));
  }
  if (selection instanceof Selection) return textSelectionRect(root, selection) ?? blockFallback(root, selection);
  return null;
}

export interface EditorMenuPlacementOptions {
  readonly edge?: number;
  readonly gap?: number;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
}

export interface EditorMenuPlacement {
  readonly left: number;
  readonly top: number;
  readonly side: 'top' | 'bottom';
}

/** Clamps a menu to the viewport and flips it when the preferred side has no room. */
export function placeEditorMenu(
  reference: DOMRectReadOnly,
  menu: Pick<DOMRectReadOnly, 'width' | 'height'>,
  kind: 'bubble' | 'floating',
  options: EditorMenuPlacementOptions = {},
): EditorMenuPlacement {
  const edge = options.edge ?? 8;
  const gap = options.gap ?? 8;
  const viewportWidth = options.viewportWidth ?? window.innerWidth;
  const viewportHeight = options.viewportHeight ?? window.innerHeight;
  const preferredTop = kind === 'bubble';
  const topSpace = reference.top - edge;
  const bottomSpace = viewportHeight - reference.bottom - edge;
  const side = preferredTop
    ? (topSpace >= menu.height + gap || topSpace >= bottomSpace ? 'top' : 'bottom')
    : (bottomSpace >= menu.height + gap || bottomSpace >= topSpace ? 'bottom' : 'top');
  const naturalTop = side === 'top'
    ? reference.top - menu.height - gap
    : reference.bottom + gap;
  const naturalLeft = kind === 'bubble'
    ? reference.left + reference.width / 2 - menu.width / 2
    : reference.left;
  return Object.freeze({
    left: Math.max(edge, Math.min(viewportWidth - menu.width - edge, naturalLeft)),
    top: Math.max(edge, Math.min(viewportHeight - menu.height - edge, naturalTop)),
    side,
  });
}
