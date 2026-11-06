import { resolveDocumentPoint, type Decoration, type Node } from '../core';

interface Entry { decoration: Decoration; dom: HTMLElement }

/** A passive DOM projection. No editable DOM anchors or native selection writes. */
export class WidgetOverlayLayer {
  private layer?: HTMLDivElement;
  private entries: Entry[] = [];
  private document?: Node;
  private frame?: number;
  private resize?: ResizeObserver;

  constructor(private readonly editorDOM: HTMLElement) {}

  update(document: Node, decorations: readonly Decoration[]): void {
    if (!decorations.length) { this.clear(); return; }
    this.document = document;
    const owner = this.editorDOM.ownerDocument;
    if (!this.layer) {
      this.layer = owner.createElement('div');
      this.layer.className = 'fountain-widget-overlay';
      this.layer.dataset.fountainOverlayWidgets = '';
      this.layer.setAttribute('aria-hidden', 'true');
      this.layer.inert = true;
      Object.assign(this.layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', overflow: 'hidden', zIndex: 'var(--fountain-widget-overlay-z-index, 10)' });
      owner.body.append(this.layer);
      owner.addEventListener('scroll', this.schedule, true);
      owner.addEventListener('load', this.schedule, true);
      owner.defaultView?.addEventListener('resize', this.schedule);
      owner.defaultView?.visualViewport?.addEventListener('resize', this.schedule);
      owner.defaultView?.visualViewport?.addEventListener('scroll', this.schedule);
      owner.fonts?.addEventListener('loadingdone', this.schedule);
      const Resize = owner.defaultView?.ResizeObserver;
      if (Resize) {
        this.resize = new Resize(this.schedule);
        for (let element: HTMLElement | null = this.editorDOM; element; element = element.parentElement) this.resize.observe(element);
      }
    }
    try { this.entries = decorations.map(decoration => {
      const produced = decoration.toDOM?.() as globalThis.Node | undefined;
      if (!produced) throw new Error('An overlay widget factory must return a DOM node.');
      const dom = owner.createElement('div');
      dom.dataset.fountainOverlayWidget = decoration.spec.key ?? 'widget';
      Object.assign(dom.style, { position: 'absolute', width: '0', pointerEvents: 'none' });
      dom.append(produced);
      dom.hidden = true;
      return { decoration, dom };
    });
    this.layer.replaceChildren(...this.entries.map(entry => entry.dom));
    this.schedule();
    } catch (error) { this.clear(); throw error; }
  }

  private readonly schedule = (): void => {
    const view = this.editorDOM.ownerDocument.defaultView;
    if (!this.layer || this.frame !== undefined) return;
    if (view?.requestAnimationFrame) this.frame = view.requestAnimationFrame(() => { this.frame = undefined; this.measure(); });
    else queueMicrotask(() => this.measure());
  };

  private range(position: number, association: -1 | 1): Range | undefined {
    if (!this.document) return;
    const point = resolveDocumentPoint(this.document, position, association), owner = this.editorDOM.ownerDocument;
    const range = owner.createRange();
    if (point.kind === 'text') {
      const wrapper = this.editorDOM.querySelector(`[data-fountain-text-path="${point.path.join('.')}"]`);
      if (!wrapper) return; // Virtualized/offscreen content must not be mounted for a remote cursor.
      const walker = owner.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement?.closest('[data-fountain-widget]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      let remaining = point.offset;
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        const length = text.textContent?.length ?? 0;
        if (remaining <= length) { range.setStart(text, remaining); range.collapse(true); return range; }
        remaining -= length;
      }
      range.selectNodeContents(wrapper); range.collapse(true); return range;
    }
    const at = (index: number) => this.editorDOM.querySelector(`[data-fountain-path="${[...point.parentPath, index].join('.')}"]`);
    const next = at(point.index), previous = point.index ? at(point.index - 1) : null;
    const element = next ?? previous ?? (point.parentPath.length
      ? this.editorDOM.querySelector(`[data-fountain-path="${point.parentPath.join('.')}"]`) : this.editorDOM);
    if (!element) return;
    range.selectNodeContents(element); range.collapse(Boolean(next)); return range;
  }

  private measure(): void {
    const layer = this.layer, view = this.editorDOM.ownerDocument.defaultView;
    if (!layer || !view || !this.editorDOM.isConnected) return;
    const editor = this.editorDOM.getBoundingClientRect();
    let top = Math.max(0, editor.top), left = Math.max(0, editor.left), right = Math.min(view.innerWidth, editor.right), bottom = Math.min(view.innerHeight, editor.bottom);
    for (let ancestor = this.editorDOM.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = view.getComputedStyle(ancestor), box = ancestor.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
    }
    layer.style.clipPath = `inset(${top}px ${Math.max(0, view.innerWidth - right)}px ${Math.max(0, view.innerHeight - bottom)}px ${left}px)`;
    for (const entry of this.entries) {
      const range = this.range(entry.decoration.from, entry.decoration.spec.side ?? 1);
      let rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'height'> | undefined = range && typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : undefined;
      if (range && (!rect || rect.height <= 0)) {
        // Empty text and structural gaps can have no collapsed Range box.
        // Measure their mounted owner; never invent or mount document content.
        const container = range.startContainer.nodeType === globalThis.Node.ELEMENT_NODE
          ? range.startContainer as HTMLElement : range.startContainer.parentElement;
        const element = container?.closest<HTMLElement>('[data-fountain-text-path], [data-fountain-path]') ?? container;
        if (element) {
          const box = element.getBoundingClientRect(), style = view.getComputedStyle(element);
          const height = Math.max(1, Math.min(box.height || 20, parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.25 || 20));
          const end = range.startOffset > 0, x = (style.direction === 'rtl') !== end ? box.right : box.left;
          const y = end ? box.bottom - height : box.top;
          rect = { left: x, right: x, top: y, bottom: y + height, height };
        }
      }
      entry.dom.hidden = !rect || rect.height <= 0 || right <= left || bottom <= top || rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom;
      if (!entry.dom.hidden && rect) Object.assign(entry.dom.style, { left: `${rect.left}px`, top: `${rect.top}px`, height: `${rect.height}px` });
    }
  }

  private clear(): void {
    const owner = this.editorDOM.ownerDocument;
    owner.removeEventListener('scroll', this.schedule, true); owner.removeEventListener('load', this.schedule, true);
    owner.defaultView?.removeEventListener('resize', this.schedule);
    owner.defaultView?.visualViewport?.removeEventListener('resize', this.schedule);
    owner.defaultView?.visualViewport?.removeEventListener('scroll', this.schedule);
    owner.fonts?.removeEventListener('loadingdone', this.schedule);
    if (this.frame !== undefined) owner.defaultView?.cancelAnimationFrame(this.frame);
    this.frame = undefined; this.resize?.disconnect(); this.resize = undefined;
    this.layer?.remove(); this.layer = undefined; this.entries = []; this.document = undefined;
  }

  destroy(): void { this.clear(); }
}
