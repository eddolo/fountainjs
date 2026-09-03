import {
  selectNode,
  type Editor,
  type Node,
  type NodeViewLike,
} from '../../core';
import { getNodeAtPath } from '../../core/transaction/path';
import { imageText } from './image-attributes';

const MIN_IMAGE_WIDTH = 50;
const MAX_IMAGE_WIDTH = 2_000;

interface ImageEditorView { readonly editor: Editor }

/** Framework-neutral, accessible editing surface for block images. */
export class ImageNodeView implements NodeViewLike {
  readonly dom = document.createElement('figure');
  private readonly image = document.createElement('img');
  private readonly caption = document.createElement('figcaption');
  private readonly captionInput = document.createElement('textarea');
  private readonly captionText = document.createElement('span');
  private readonly error = document.createElement('div');
  private readonly retry = document.createElement('button');
  private readonly controls = document.createElement('div');
  private readonly leftHandle = this.createHandle('left');
  private readonly rightHandle = this.createHandle('right');
  private current: Node;
  private dragging = false;
  private dragDirection: -1 | 1 = 1;
  private startX = 0;
  private startWidth = 0;
  private previewWidth = 0;

  constructor(node: Node, private readonly view: unknown, private readonly getPath: () => number[]) {
    this.current = node;
    this.dom.className = 'fountain-image';
    this.dom.tabIndex = -1;
    this.dom.setAttribute('role', 'figure');
    this.image.className = 'fountain-image__media';
    this.image.draggable = false;
    this.image.addEventListener('load', this.onLoad);
    this.image.addEventListener('error', this.onError);

    this.caption.className = 'fountain-image__caption';
    this.caption.contentEditable = 'false';
    this.captionInput.className = 'fountain-image__caption-input';
    this.captionInput.rows = 1;
    this.captionInput.maxLength = 20_000;
    this.captionInput.setAttribute('aria-label', 'Image caption');
    this.captionInput.placeholder = 'Add a caption';
    this.captionInput.addEventListener('blur', this.commitCaption);
    this.captionInput.addEventListener('keydown', this.onCaptionKeyDown);
    this.captionText.className = 'fountain-image__caption-text';
    this.caption.append(this.captionInput, this.captionText);

    this.error.className = 'fountain-image__error';
    this.error.contentEditable = 'false';
    this.error.setAttribute('role', 'status');
    this.error.textContent = 'Image could not be loaded. ';
    this.retry.type = 'button';
    this.retry.textContent = 'Retry';
    this.retry.addEventListener('click', this.retryImage);
    this.error.append(this.retry);

    this.controls.className = 'fountain-image__resize-controls';
    this.controls.contentEditable = 'false';
    this.controls.append(this.leftHandle, this.rightHandle);
    this.dom.append(this.image, this.caption, this.error, this.controls);
    this.render();
  }

  update(node: Node): boolean {
    if (node.type !== this.current.type) return false;
    this.current = node;
    this.render();
    return true;
  }

  selectNode(): void { this.dom.dataset.fountainImageSelected = 'true'; }
  deselectNode(): void { delete this.dom.dataset.fountainImageSelected; }

  stopEvent(event: Event): boolean {
    return this.controls.contains(event.target as globalThis.Node)
      || this.caption.contains(event.target as globalThis.Node)
      || this.error.contains(event.target as globalThis.Node);
  }

  ignoreMutation(mutation: MutationRecord): boolean {
    if (this.caption.contains(mutation.target) || this.controls.contains(mutation.target) || this.error.contains(mutation.target)) return true;
    return mutation.target === this.dom
      && ['style', 'data-fountain-image-selected', 'data-fountain-image-resizing', 'data-fountain-image-error']
        .includes(mutation.attributeName ?? '');
  }

  destroy(): void {
    this.finishResize(false);
    this.image.removeEventListener('load', this.onLoad);
    this.image.removeEventListener('error', this.onError);
    this.captionInput.removeEventListener('blur', this.commitCaption);
    this.captionInput.removeEventListener('keydown', this.onCaptionKeyDown);
    this.retry.removeEventListener('click', this.retryImage);
  }

  private get editor(): Editor | null {
    return (this.view as Partial<ImageEditorView> | null)?.editor ?? null;
  }

  private get editable(): boolean { return this.editor?.editable === true; }

  private render(): void {
    const attrs = this.current.attrs;
    this.dom.dataset.align = String(attrs.align);
    this.dom.style.width = String(attrs.width);
    this.dom.style.maxWidth = '100%';
    this.dom.setAttribute('aria-label', imageText(attrs));
    this.image.src = String(attrs.src);
    this.image.alt = String(attrs.alt);
    this.image.title = String(attrs.title);
    this.image.loading = attrs.loading === 'eager' ? 'eager' : 'lazy';
    this.image.decoding = ['auto', 'sync', 'async'].includes(String(attrs.decoding))
      ? String(attrs.decoding) as 'auto' | 'sync' | 'async'
      : 'async';
    this.image.style.width = '100%';
    this.image.style.height = String(attrs.height);
    const srcset = String(attrs.srcset || '');
    const sizes = String(attrs.sizes || '');
    if (srcset) this.image.srcset = srcset;
    else this.image.removeAttribute('srcset');
    if (sizes) this.image.sizes = sizes;
    else this.image.removeAttribute('sizes');
    const value = String(attrs.caption || '');
    if (document.activeElement !== this.captionInput) this.captionInput.value = value;
    this.captionText.textContent = value;
    this.captionInput.hidden = !this.editable;
    this.captionText.hidden = this.editable || !value;
    this.caption.hidden = !this.editable && !value;
    this.controls.hidden = !this.editable;
    this.retry.hidden = !this.editable;
    delete this.dom.dataset.fountainImageError;
    this.error.hidden = true;
    const numericWidth = Number.parseFloat(String(attrs.width));
    [this.leftHandle, this.rightHandle].forEach((handle) => {
      handle.setAttribute('aria-valuenow', String(Number.isFinite(numericWidth) ? Math.round(numericWidth) : MIN_IMAGE_WIDTH));
    });
  }

  private createHandle(side: 'left' | 'right'): HTMLSpanElement {
    const handle = document.createElement('span');
    handle.className = `fountain-image__resize-handle is-${side}`;
    handle.contentEditable = 'false';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', `Resize image from ${side}`);
    handle.setAttribute('aria-valuemin', String(MIN_IMAGE_WIDTH));
    handle.setAttribute('aria-valuemax', String(MAX_IMAGE_WIDTH));
    handle.setAttribute('aria-orientation', 'horizontal');
    handle.addEventListener('pointerdown', (event) => this.startResize(event, side === 'left' ? -1 : 1));
    handle.addEventListener('keydown', (event) => this.onResizeKeyDown(event));
    return handle;
  }

  private commitAttrs(attrs: Record<string, unknown>): boolean {
    const editor = this.editor;
    if (!editor?.editable) return false;
    const path = this.getPath();
    let live: Node;
    try { live = getNodeAtPath(editor.state.doc, path); }
    catch { return false; }
    if (live.type.name !== 'image_super') return false;
    try {
      const next = { ...live.attrs, ...attrs };
      live.type.create(next);
      editor.dispatch(editor.state.createTransaction().setNodeAttrs(path, next));
      return true;
    } catch { return false; }
  }

  private commitCaption = (): void => {
    const next = this.captionInput.value;
    if (next !== String(this.current.attrs.caption || '')) this.commitAttrs({ caption: next });
  };

  private onCaptionKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.captionInput.value = String(this.current.attrs.caption || '');
      this.captionInput.blur();
      this.dom.focus();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.commitCaption();
      this.captionInput.blur();
    }
  };

  private startResize(event: PointerEvent, direction: -1 | 1): void {
    if (!this.editable || event.button !== 0) return;
    event.preventDefault();
    selectNode(this.editor as Editor, this.getPath());
    this.dragging = true;
    this.dragDirection = direction;
    this.startX = event.clientX;
    this.startWidth = Math.max(MIN_IMAGE_WIDTH, Math.round(this.dom.getBoundingClientRect().width || MIN_IMAGE_WIDTH));
    this.previewWidth = this.startWidth;
    this.dom.dataset.fountainImageResizing = 'true';
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp, { once: true });
    window.addEventListener('pointercancel', this.onPointerCancel, { once: true });
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    const delta = (event.clientX - this.startX) * this.dragDirection;
    this.previewWidth = Math.max(MIN_IMAGE_WIDTH, Math.min(MAX_IMAGE_WIDTH, Math.round(this.startWidth + delta)));
    this.dom.style.width = `${this.previewWidth}px`;
    [this.leftHandle, this.rightHandle].forEach((handle) => handle.setAttribute('aria-valuenow', String(this.previewWidth)));
  };

  private onPointerUp = (): void => { this.finishResize(true); };
  private onPointerCancel = (): void => { this.finishResize(false); };

  private finishResize(commit: boolean): void {
    if (!this.dragging) return;
    this.dragging = false;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    delete this.dom.dataset.fountainImageResizing;
    if (commit) this.commitAttrs({ width: `${this.previewWidth}px` });
    else this.render();
  }

  private onResizeKeyDown = (event: KeyboardEvent): void => {
    let width: number | null = null;
    const configured = /px$/.test(String(this.current.attrs.width)) ? Number.parseFloat(String(this.current.attrs.width)) : 0;
    const current = Math.max(MIN_IMAGE_WIDTH, Math.round(this.dom.getBoundingClientRect().width || configured || MIN_IMAGE_WIDTH));
    if (event.key === 'ArrowLeft') width = current - (event.shiftKey ? 50 : 10);
    else if (event.key === 'ArrowRight') width = current + (event.shiftKey ? 50 : 10);
    else if (event.key === 'Home') width = MIN_IMAGE_WIDTH;
    else if (event.key === 'End') width = MAX_IMAGE_WIDTH;
    if (width === null) return;
    event.preventDefault();
    this.commitAttrs({ width: `${Math.max(MIN_IMAGE_WIDTH, Math.min(MAX_IMAGE_WIDTH, width))}px` });
  };

  private onLoad = (): void => {
    delete this.dom.dataset.fountainImageError;
    this.error.hidden = true;
  };

  private onError = (): void => {
    this.dom.dataset.fountainImageError = 'true';
    this.error.hidden = false;
  };

  private retryImage = (): void => {
    this.error.hidden = true;
    this.image.src = '';
    this.image.src = String(this.current.attrs.src);
  };
}
