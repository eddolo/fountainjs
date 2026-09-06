import {
  NodeSelection,
  canMoveNode,
  moveNode,
  type AnySelection,
  type Editor,
  type Node,
  type NodeMove,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';

export const FOUNTAIN_NODE_DRAG_TYPE = 'application/x-fountain-node-path';
export const FOUNTAIN_LEGACY_BLOCK_DRAG_TYPE = 'application/x-fountain-block';

export interface BlockHandleContext {
  readonly editor: Editor;
  readonly node: Node;
  readonly parent: Node;
  readonly path: readonly number[];
}

export interface BlockHandleLabels {
  toolbar?: (context: BlockHandleContext) => string;
  drag?: (context: BlockHandleContext) => string;
  moveBefore?: (context: BlockHandleContext) => string;
  moveAfter?: (context: BlockHandleContext) => string;
}

export interface BlockHandleOptions {
  /** Return false to hide controls for a node, or true to opt a custom node in. */
  include?: (context: BlockHandleContext) => boolean;
  /** Product-owned accessible labels. Defaults include the humanized node type. */
  labels?: BlockHandleLabels;
}

interface BlockHandleCandidate extends BlockHandleContext {
  readonly element: HTMLElement;
}

interface DropTarget {
  readonly element: HTMLElement;
  readonly move: NodeMove;
  readonly position: 'before' | 'after';
}

const EXCLUDED_NESTED_TYPES = new Set([
  'doc', 'text', 'hard_break', 'inline_image',
  'table_row', 'table_cell', 'table_header', 'figcaption',
]);

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function parsePath(value: string | undefined): number[] | null {
  if (value === undefined) return null;
  if (value === '') return [];
  const path = value.split('.').map(Number);
  return path.every((part) => Number.isInteger(part) && part >= 0) ? path : null;
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function icon(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  paths.forEach((value) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', value);
    svg.appendChild(path);
  });
  return svg;
}

function button(action: 'drag' | 'before' | 'after', label: string): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = `fountain-block-controls__button fountain-block-controls__button--${action}`;
  control.dataset.fountainBlockAction = action;
  control.setAttribute('aria-label', label);
  control.title = label;
  control.appendChild(action === 'drag'
    ? icon(['M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01'])
    : action === 'before'
      ? icon(['m6 15 6-6 6 6'])
      : icon(['m6 9 6 6 6-6']));
  return control;
}

function defaultCandidate(context: BlockHandleContext): boolean {
  if (context.path.length === 1) return true;
  if (EXCLUDED_NESTED_TYPES.has(context.node.type.name)) return false;
  if (['list_item', 'task_item'].includes(context.node.type.name)) return true;
  return context.node.type.spec.group?.split(/\s+/).includes('block') === true;
}

/** Owns the optional, framework-neutral DOM controls for model-backed node moves. */
export class BlockHandleManager {
  private readonly controls = document.createElement('div');
  private readonly dropIndicator = document.createElement('div');
  private readonly dragButton = button('drag', 'Drag block');
  private readonly beforeButton = button('before', 'Move block before');
  private readonly afterButton = button('after', 'Move block after');
  private readonly candidates = new Map<string, BlockHandleCandidate>();
  private readonly resizeObserver?: ResizeObserver;
  private activeKey?: string;
  private draggedKey?: string;
  private dropElement?: HTMLElement;
  private dropPosition?: 'before' | 'after';
  private pointerEngaged = false;
  private focusEngaged = false;
  private keyboardGrabbed = false;
  private focusResetTimer?: ReturnType<typeof setTimeout>;
  private keyboardFocusRestorePending = false;
  private keyboardFocusFrame?: number;
  private destroyed = false;

  constructor(
    private readonly mount: HTMLElement,
    private readonly dom: HTMLElement,
    private readonly editor: Editor,
    private readonly options: BlockHandleOptions = {},
  ) {
    this.controls.className = 'fountain-block-controls';
    this.controls.dataset.fountainBlockControls = '';
    this.controls.contentEditable = 'false';
    this.controls.setAttribute('role', 'toolbar');
    this.controls.setAttribute('aria-label', 'Block controls');
    this.dropIndicator.className = 'fountain-block-drop-indicator';
    this.dropIndicator.dataset.fountainBlockDropIndicator = '';
    this.dropIndicator.hidden = true;
    this.dropIndicator.setAttribute('aria-hidden', 'true');
    this.dragButton.draggable = true;
    this.dragButton.setAttribute('aria-pressed', 'false');
    this.controls.append(this.dragButton, this.beforeButton, this.afterButton);
    if (getComputedStyle(this.mount).position === 'static') this.mount.dataset.fountainBlockHandlesStatic = '';
    this.mount.dataset.fountainBlockHandles = '';
    this.dom.dataset.fountainBlockHandlesEnabled = '';
    this.mount.append(this.controls, this.dropIndicator);
    this.dom.addEventListener('pointermove', this.onPointerMove);
    this.dom.addEventListener('focusin', this.onFocusIn);
    this.dom.addEventListener('pointerdown', this.onPointerDown);
    this.controls.addEventListener('click', this.onControlClick);
    this.controls.addEventListener('keydown', this.onControlKeyDown);
    this.controls.addEventListener('pointerenter', this.onControlsPointerEnter);
    this.controls.addEventListener('pointerleave', this.onControlsPointerLeave);
    this.controls.addEventListener('focusin', this.onControlsFocusIn);
    this.controls.addEventListener('focusout', this.onControlsFocusOut);
    this.dragButton.addEventListener('dragstart', this.onDragStart);
    this.dragButton.addEventListener('dragend', this.onDragEnd);
    globalThis.addEventListener?.('resize', this.position);
    globalThis.addEventListener?.('scroll', this.position, true);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.position);
      this.resizeObserver.observe(this.mount);
      this.resizeObserver.observe(this.dom);
    }
  }

  get draggedPath(): readonly number[] | undefined {
    return this.draggedKey ? parsePath(this.draggedKey) ?? undefined : undefined;
  }

  refresh(documentNode: Node, selection: AnySelection): void {
    if (this.destroyed) return;
    this.dom.querySelectorAll<HTMLElement>('[data-fountain-block-reorderable], [data-fountain-block-active], [data-fountain-block-handle-active], [data-fountain-block-grabbed]')
      .forEach((element) => {
        delete element.dataset.fountainBlockReorderable;
        delete element.dataset.fountainBlockActive;
        delete element.dataset.fountainBlockHandleActive;
        delete element.dataset.fountainBlockGrabbed;
      });
    this.candidates.clear();
    const elements = new Map(Array.from(this.dom.querySelectorAll<HTMLElement>('[data-fountain-path]'))
      .map((element) => [element.dataset.fountainPath ?? '', element] as const));
    documentNode.descendants((node, path, parent) => {
      if (!path.length || node.isText || !parent) return;
      const element = elements.get(path.join('.'));
      if (!element) return;
      const context: BlockHandleContext = { editor: this.editor, node, parent, path: Object.freeze([...path]) };
      let included = defaultCandidate(context);
      if (this.options.include) {
        try { included = this.options.include(context); }
        catch { included = false; }
      }
      if (!included) return;
      const key = path.join('.');
      element.dataset.fountainBlockReorderable = 'true';
      this.candidates.set(key, { ...context, element });
    });
    const selectionKey = this.candidateKeyForSelection(selection);
    const next = selectionKey ?? (this.activeKey && this.candidates.has(this.activeKey) ? this.activeKey : this.candidates.keys().next().value);
    this.activate(typeof next === 'string' ? next : undefined, true);
  }

  syncSelection(selection: AnySelection): void {
    const key = this.candidateKeyForSelection(selection);
    if (key) this.activate(key);
  }

  showDrop(event: DragEvent, sourcePath: readonly number[]): boolean {
    const target = this.dropTarget(event, sourcePath);
    this.clearDropIndicator();
    if (!target) return false;
    target.element.dataset.fountainDropPosition = target.position;
    this.dropElement = target.element;
    this.dropPosition = target.position;
    this.positionDropIndicator();
    return true;
  }

  drop(event: DragEvent, sourcePath: readonly number[]): boolean {
    const target = this.dropTarget(event, sourcePath);
    this.clearDropIndicator();
    if (!target) return false;
    return moveNode(this.editor, target.move);
  }

  clearDrag(): void {
    this.draggedKey = undefined;
    this.clearDropIndicator();
    this.dom.querySelectorAll<HTMLElement>('[data-fountain-dragging]')
      .forEach((element) => { delete element.dataset.fountainDragging; });
    this.syncGrabbedState();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearDrag();
    this.resizeObserver?.disconnect();
    if (this.focusResetTimer !== undefined) clearTimeout(this.focusResetTimer);
    if (this.keyboardFocusFrame !== undefined) cancelAnimationFrame(this.keyboardFocusFrame);
    this.dom.removeEventListener('pointermove', this.onPointerMove);
    this.dom.removeEventListener('focusin', this.onFocusIn);
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.controls.removeEventListener('click', this.onControlClick);
    this.controls.removeEventListener('keydown', this.onControlKeyDown);
    this.controls.removeEventListener('pointerenter', this.onControlsPointerEnter);
    this.controls.removeEventListener('pointerleave', this.onControlsPointerLeave);
    this.controls.removeEventListener('focusin', this.onControlsFocusIn);
    this.controls.removeEventListener('focusout', this.onControlsFocusOut);
    this.dragButton.removeEventListener('dragstart', this.onDragStart);
    this.dragButton.removeEventListener('dragend', this.onDragEnd);
    globalThis.removeEventListener?.('resize', this.position);
    globalThis.removeEventListener?.('scroll', this.position, true);
    this.dom.querySelectorAll<HTMLElement>('[data-fountain-block-reorderable], [data-fountain-block-active], [data-fountain-block-handle-active], [data-fountain-block-grabbed], [data-fountain-drop-position], [data-fountain-dragging]')
      .forEach((element) => {
        delete element.dataset.fountainBlockReorderable;
        delete element.dataset.fountainBlockActive;
        delete element.dataset.fountainBlockHandleActive;
        delete element.dataset.fountainBlockGrabbed;
        delete element.dataset.fountainDropPosition;
        delete element.dataset.fountainDragging;
      });
    delete this.mount.dataset.fountainBlockHandles;
    delete this.mount.dataset.fountainBlockHandlesStatic;
    delete this.dom.dataset.fountainBlockHandlesEnabled;
    this.controls.remove();
    this.dropIndicator.remove();
    this.candidates.clear();
  }

  private activate(key: string | undefined, force = false): void {
    const previous = this.activeKey ? this.candidates.get(this.activeKey)?.element : undefined;
    if (!key || !this.candidates.has(key)) {
      if (previous) this.clearActiveMarkers(previous);
      this.activeKey = undefined;
      this.keyboardGrabbed = false;
      this.controls.hidden = true;
      this.syncGrabbedState();
      return;
    }
    if (!force && this.activeKey === key && !this.controls.hidden) {
      return;
    }
    if (previous && previous !== this.candidates.get(key)?.element) this.clearActiveMarkers(previous);
    this.activeKey = key;
    this.controls.hidden = false;
    const candidate = this.candidates.get(key) as BlockHandleCandidate;
    candidate.element.dataset.fountainBlockActive = 'true';
    this.syncEngagedState();
    this.syncGrabbedState();
    const name = humanize(candidate.node.type.name);
    const subject = /\bblock$/i.test(name) ? name : `${name} block`;
    const labels = this.options.labels;
    const toolbarLabel = labels?.toolbar?.(candidate) ?? `${subject} controls`;
    const dragLabel = labels?.drag?.(candidate) ?? `Drag ${subject}`;
    const beforeLabel = labels?.moveBefore?.(candidate) ?? `Move ${subject} before`;
    const afterLabel = labels?.moveAfter?.(candidate) ?? `Move ${subject} after`;
    this.controls.setAttribute('aria-label', toolbarLabel);
    this.controls.dir = getComputedStyle(this.dom).direction;
    this.controls.dataset.fountainBlockPath = key;
    this.setLabel(this.dragButton, dragLabel);
    this.setLabel(this.beforeButton, beforeLabel);
    this.setLabel(this.afterButton, afterLabel);
    this.dragButton.disabled = !this.editor.editable;
    this.dragButton.draggable = this.editor.editable;
    const index = candidate.path.at(-1) as number;
    const parentPath = candidate.path.slice(0, -1);
    this.beforeButton.disabled = !canMoveNode(this.editor, { fromPath: candidate.path, toParentPath: parentPath, toIndex: index - 1 });
    this.afterButton.disabled = !canMoveNode(this.editor, { fromPath: candidate.path, toParentPath: parentPath, toIndex: index + 1 });
    this.position();
  }

  private setLabel(control: HTMLButtonElement, label: string): void {
    control.setAttribute('aria-label', label);
    control.title = label;
  }

  private candidateKeyForSelection(selection: AnySelection): string | undefined {
    const path = selection instanceof NodeSelection ? selection.nodePath : selection.path;
    for (let length = path.length; length > 0; length -= 1) {
      const key = path.slice(0, length).join('.');
      if (this.candidates.has(key)) return key;
    }
    return undefined;
  }

  private candidateFromTarget(target: EventTarget | null): BlockHandleCandidate | undefined {
    const element = target instanceof Element
      ? target.closest<HTMLElement>('[data-fountain-block-reorderable="true"][data-fountain-path]')
      : null;
    return element ? this.candidates.get(element.dataset.fountainPath ?? '') : undefined;
  }

  private dropTarget(event: DragEvent, sourcePath: readonly number[]): DropTarget | null {
    let element = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-fountain-block-reorderable="true"][data-fountain-path]')
      : null;
    while (element && this.dom.contains(element)) {
      const path = parsePath(element.dataset.fountainPath);
      if (path) {
        const bounds = element.getBoundingClientRect();
        const position = event.clientY >= bounds.top + bounds.height / 2 ? 'after' : 'before';
        const boundary = (path.at(-1) as number) + (position === 'after' ? 1 : 0);
        const sameParent = samePath(sourcePath.slice(0, -1), path.slice(0, -1));
        const toIndex = boundary - (sameParent && (sourcePath.at(-1) as number) < boundary ? 1 : 0);
        const move: NodeMove = { fromPath: sourcePath, toParentPath: path.slice(0, -1), toIndex };
        if (canMoveNode(this.editor, move)) return { element, move, position };
      }
      element = element.parentElement?.closest<HTMLElement>('[data-fountain-block-reorderable="true"][data-fountain-path]') ?? null;
    }
    return null;
  }

  private clearDropIndicator(): void {
    if (this.dropElement) delete this.dropElement.dataset.fountainDropPosition;
    this.dropElement = undefined;
    this.dropPosition = undefined;
    this.dropIndicator.hidden = true;
    delete this.dropIndicator.dataset.fountainDropPath;
    delete this.dropIndicator.dataset.fountainDropPosition;
  }

  private clearActiveMarkers(element: HTMLElement): void {
    delete element.dataset.fountainBlockActive;
    delete element.dataset.fountainBlockHandleActive;
    delete element.dataset.fountainBlockGrabbed;
  }

  private syncEngagedState(): void {
    this.dom.querySelectorAll<HTMLElement>('[data-fountain-block-handle-active]')
      .forEach((element) => { delete element.dataset.fountainBlockHandleActive; });
    const candidate = this.activeKey ? this.candidates.get(this.activeKey) : undefined;
    if (candidate && (this.pointerEngaged || this.focusEngaged)) {
      candidate.element.dataset.fountainBlockHandleActive = 'true';
    }
  }

  private syncGrabbedState(): void {
    this.dom.querySelectorAll<HTMLElement>('[data-fountain-block-grabbed]')
      .forEach((element) => { delete element.dataset.fountainBlockGrabbed; });
    const grabbed = Boolean(this.draggedKey) || this.keyboardGrabbed;
    const key = this.draggedKey ?? this.activeKey;
    const candidate = key ? this.candidates.get(key) : undefined;
    if (grabbed && candidate) candidate.element.dataset.fountainBlockGrabbed = 'true';
    if (grabbed) this.controls.dataset.fountainBlockGrabbed = this.keyboardGrabbed ? 'keyboard' : 'pointer';
    else delete this.controls.dataset.fountainBlockGrabbed;
    this.dragButton.setAttribute('aria-pressed', String(grabbed));
  }

  private setKeyboardGrabbed(value: boolean): void {
    this.keyboardGrabbed = value && Boolean(this.activeKey) && this.editor.editable;
    if (!this.keyboardGrabbed) {
      this.keyboardFocusRestorePending = false;
      if (this.keyboardFocusFrame !== undefined) cancelAnimationFrame(this.keyboardFocusFrame);
      this.keyboardFocusFrame = undefined;
    }
    this.syncGrabbedState();
  }

  private moveActive(direction: -1 | 1): boolean {
    const candidate = this.activeKey ? this.candidates.get(this.activeKey) : undefined;
    if (!candidate) return false;
    const index = candidate.path.at(-1) as number;
    this.keyboardFocusRestorePending = this.keyboardGrabbed;
    const moved = moveNode(this.editor, {
      fromPath: candidate.path,
      toParentPath: candidate.path.slice(0, -1),
      toIndex: index + direction,
    });
    if (!moved) this.keyboardFocusRestorePending = false;
    if (moved) {
      if (this.keyboardFocusFrame !== undefined) cancelAnimationFrame(this.keyboardFocusFrame);
      this.keyboardFocusFrame = requestAnimationFrame(() => {
        this.keyboardFocusFrame = undefined;
        this.keyboardFocusRestorePending = false;
        if (!this.keyboardGrabbed || this.destroyed) return;
        this.dragButton.focus({ preventScroll: true });
        this.focusEngaged = true;
        this.syncEngagedState();
        this.syncGrabbedState();
      });
    }
    return moved;
  }

  private positionDropIndicator(): void {
    if (!this.dropElement || !this.dropPosition || !this.dropElement.isConnected) return;
    const target = this.dropElement.getBoundingClientRect();
    const container = this.mount.getBoundingClientRect();
    const top = (this.dropPosition === 'before' ? target.top : target.bottom)
      - container.top + this.mount.scrollTop;
    this.dropIndicator.style.left = `${target.left - container.left + this.mount.scrollLeft}px`;
    this.dropIndicator.style.top = `${top}px`;
    this.dropIndicator.style.width = `${target.width}px`;
    this.dropIndicator.dataset.fountainDropPath = this.dropElement.dataset.fountainPath ?? '';
    this.dropIndicator.dataset.fountainDropPosition = this.dropPosition;
    this.dropIndicator.hidden = false;
  }

  private position = (): void => {
    if (this.destroyed || !this.activeKey || this.controls.hidden) return;
    const candidate = this.candidates.get(this.activeKey);
    if (!candidate?.element.isConnected) return;
    const target = candidate.element.getBoundingClientRect();
    const editor = this.dom.getBoundingClientRect();
    const container = this.mount.getBoundingClientRect();
    const rtl = getComputedStyle(this.dom).direction === 'rtl';
    const inlineOffset = rtl
      ? container.right - editor.right + this.mount.scrollLeft + 7
      : editor.left - container.left + this.mount.scrollLeft + 7;
    const wantedTop = target.top - container.top + this.mount.scrollTop + 2;
    const maximumTop = Math.max(4, this.mount.scrollHeight - this.controls.offsetHeight - 4);
    this.controls.style.insetInlineStart = `${Math.max(0, inlineOffset)}px`;
    this.controls.style.top = `${Math.min(maximumTop, Math.max(4, wantedTop))}px`;
    this.positionDropIndicator();
  };

  private onControlsPointerEnter = (): void => {
    this.pointerEngaged = true;
    this.syncEngagedState();
  };

  private onControlsPointerLeave = (): void => {
    this.pointerEngaged = false;
    this.syncEngagedState();
  };

  private onControlsFocusIn = (): void => {
    if (this.focusResetTimer !== undefined) {
      clearTimeout(this.focusResetTimer);
      this.focusResetTimer = undefined;
    }
    this.focusEngaged = true;
    this.syncEngagedState();
  };

  private onControlsFocusOut = (event: FocusEvent): void => {
    if (event.relatedTarget instanceof globalThis.Node && this.controls.contains(event.relatedTarget)) return;
    if (this.focusResetTimer !== undefined) clearTimeout(this.focusResetTimer);
    // Firefox temporarily focuses the contenteditable while a model move maps
    // selection, then the keyboard handle is restored in a microtask. Defer the
    // real-blur decision so that internal focus handoff cannot cancel a grab.
    this.focusResetTimer = setTimeout(() => {
      this.focusResetTimer = undefined;
      if (this.keyboardFocusRestorePending) return;
      if (this.controls.contains(document.activeElement)) return;
      this.focusEngaged = false;
      this.pointerEngaged = false;
      this.setKeyboardGrabbed(false);
      this.syncEngagedState();
    }, 0);
  };

  private onPointerMove = (event: PointerEvent): void => {
    const candidate = this.candidateFromTarget(event.target);
    if (candidate) this.activate(candidate.path.join('.'));
  };

  private onFocusIn = (event: FocusEvent): void => {
    const candidate = this.candidateFromTarget(event.target);
    if (candidate) this.activate(candidate.path.join('.'));
  };

  private onPointerDown = (event: PointerEvent): void => {
    const candidate = this.candidateFromTarget(event.target);
    if (candidate) this.activate(candidate.path.join('.'));
  };

  private onControlClick = (event: MouseEvent): void => {
    const control = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('[data-fountain-block-action]')
      : null;
    const candidate = this.activeKey ? this.candidates.get(this.activeKey) : undefined;
    if (!control || !candidate || control.disabled) return;
    const action = control.dataset.fountainBlockAction;
    if (action === 'drag') return;
    event.preventDefault();
    const index = candidate.path.at(-1) as number;
    const moved = moveNode(this.editor, {
      fromPath: candidate.path,
      toParentPath: candidate.path.slice(0, -1),
      toIndex: action === 'before' ? index - 1 : index + 1,
    });
    if (moved) queueMicrotask(() => (action === 'before' ? this.beforeButton : this.afterButton).focus());
  };

  private onControlKeyDown = (event: KeyboardEvent): void => {
    const buttons = [this.dragButton, this.beforeButton, this.afterButton].filter((control) => !control.disabled);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    if (document.activeElement === this.dragButton && (event.key === 'Enter' || event.key === ' ' || event.key === 'Space')) {
      event.preventDefault();
      this.setKeyboardGrabbed(!this.keyboardGrabbed);
      return;
    }
    if (this.keyboardGrabbed) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.setKeyboardGrabbed(false);
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.moveActive(event.key === 'ArrowUp' ? -1 : 1);
        return;
      }
    }
    const rtl = getComputedStyle(this.controls).direction === 'rtl';
    const direction = event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowUp' ? -1
        : event.key === 'ArrowRight' ? (rtl ? -1 : 1)
          : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
    const target = event.key === 'Home' ? buttons[0]
      : event.key === 'End' ? buttons.at(-1)
        : direction ? buttons[(current + direction + buttons.length) % buttons.length] : undefined;
    if (!target) return;
    event.preventDefault();
    target.focus();
  };

  private onDragStart = (event: DragEvent): void => {
    const candidate = this.activeKey ? this.candidates.get(this.activeKey) : undefined;
    if (!candidate || !event.dataTransfer || !this.editor.editable) {
      event.preventDefault();
      return;
    }
    const value = JSON.stringify(candidate.path);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(FOUNTAIN_NODE_DRAG_TYPE, value);
    if (candidate.path.length === 1) event.dataTransfer.setData(FOUNTAIN_LEGACY_BLOCK_DRAG_TYPE, String(candidate.path[0]));
    event.dataTransfer.setData('text/plain', candidate.node.textContent);
    this.draggedKey = candidate.path.join('.');
    candidate.element.dataset.fountainDragging = 'true';
    this.syncGrabbedState();
    const selection = new NodeSelection(this.editor.state.doc, candidate.path);
    if (!this.editor.state.selection.eq(selection)) this.editor.dispatch(this.editor.state.createTransaction().setSelection(selection));
  };

  private onDragEnd = (): void => { this.clearDrag(); };
}
