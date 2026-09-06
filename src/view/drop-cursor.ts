export type DropCursorOrientation = 'inline' | 'block';

export interface DropCursorOptions {
  /** CSS color used by the supplied cursor. Defaults to --fountain-accent. */
  color?: string;
  /** Additional product-owned class name for complete visual replacement. */
  className?: string;
}

function pathElement(node: globalThis.Node, root: HTMLElement): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement;
  const candidate = element?.closest<HTMLElement>('[data-fountain-path]') ?? null;
  return candidate && root.contains(candidate) ? candidate : null;
}

function caretRangeAtPoint(ownerDocument: Document, x: number, y: number): Range | null {
  const documentWithCaret = ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: globalThis.Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = documentWithCaret.caretPositionFromPoint?.(x, y);
  if (position) {
    const range = ownerDocument.createRange();
    try {
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    } catch {
      return null;
    }
  }
  return documentWithCaret.caretRangeFromPoint?.(x, y) ?? null;
}

/**
 * Framework-neutral visual feedback for native drag targets. It never changes
 * the document or the browser selection; InputManager still owns the drop.
 */
export class DropCursorManager {
  private readonly cursor: HTMLDivElement;
  private destroyed = false;

  constructor(
    private readonly mount: HTMLElement,
    private readonly dom: HTMLElement,
    options: DropCursorOptions = {},
  ) {
    this.cursor = dom.ownerDocument.createElement('div');
    this.cursor.className = ['fountain-drop-cursor', options.className].filter(Boolean).join(' ');
    this.cursor.dataset.fountainDropCursor = '';
    this.cursor.hidden = true;
    this.cursor.setAttribute('aria-hidden', 'true');
    if (options.color) this.cursor.style.setProperty('--fountain-drop-cursor-color', options.color);
    if (getComputedStyle(this.mount).position === 'static') this.mount.dataset.fountainDropCursorStatic = '';
    this.mount.dataset.fountainDropCursorEnabled = '';
    this.mount.append(this.cursor);
  }

  show(event: DragEvent): boolean {
    if (this.destroyed) return false;
    const range = caretRangeAtPoint(this.dom.ownerDocument, event.clientX, event.clientY);
    const eventElement = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-fountain-path]')
      : null;
    const rangeElement = range && this.dom.contains(range.startContainer)
      ? pathElement(range.startContainer, this.dom)
      : null;
    const element = rangeElement
      ?? (eventElement && this.dom.contains(eventElement) ? eventElement : null);
    if (!element) {
      this.clear();
      return false;
    }

    const container = this.mount.getBoundingClientRect();
    const elementBounds = element.getBoundingClientRect();
    const textHost = (range?.startContainer instanceof Text
      ? range.startContainer.parentElement
      : range?.startContainer instanceof Element ? range.startContainer : null)
      ?.closest<HTMLElement>('[data-fountain-text-path]');
    const inline = Boolean(range && textHost && this.dom.contains(textHost));
    const rangeBounds = inline ? range?.getBoundingClientRect() : null;
    const orientation: DropCursorOrientation = inline ? 'inline' : 'block';

    this.cursor.dataset.fountainDropCursor = orientation;
    this.cursor.dataset.fountainDropPath = element.dataset.fountainPath ?? '';
    if (orientation === 'inline') {
      const line = rangeBounds && rangeBounds.height > 0 ? rangeBounds : elementBounds;
      const x = rangeBounds && rangeBounds.width >= 0
        ? rangeBounds.left
        : Math.max(elementBounds.left, Math.min(event.clientX, elementBounds.right));
      this.cursor.style.left = `${x - container.left + this.mount.scrollLeft}px`;
      this.cursor.style.top = `${line.top - container.top + this.mount.scrollTop}px`;
      this.cursor.style.width = 'var(--fountain-drop-cursor-inline-width, 2px)';
      this.cursor.style.height = `${Math.max(16, line.height)}px`;
      delete this.cursor.dataset.fountainDropPosition;
    } else {
      const position = event.clientY >= elementBounds.top + elementBounds.height / 2 ? 'after' : 'before';
      const y = position === 'before' ? elementBounds.top : elementBounds.bottom;
      this.cursor.dataset.fountainDropPosition = position;
      this.cursor.style.left = `${elementBounds.left - container.left + this.mount.scrollLeft}px`;
      this.cursor.style.top = `${y - container.top + this.mount.scrollTop}px`;
      this.cursor.style.width = `${elementBounds.width}px`;
      this.cursor.style.height = 'var(--fountain-drop-cursor-block-height, 3px)';
    }
    this.cursor.hidden = false;
    return true;
  }

  clear(): void {
    this.cursor.hidden = true;
    this.cursor.dataset.fountainDropCursor = '';
    delete this.cursor.dataset.fountainDropPath;
    delete this.cursor.dataset.fountainDropPosition;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clear();
    delete this.mount.dataset.fountainDropCursorEnabled;
    delete this.mount.dataset.fountainDropCursorStatic;
    this.cursor.remove();
  }
}
