import {
  AllSelection,
  CellSelection,
  Editor,
  GapSelection,
  NodeSelection,
  Selection,
  type AnySelection,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';

function parsePath(element: HTMLElement): number[] {
  return (element.dataset.fountainTextPath ?? '').split('.').filter(Boolean).map(Number);
}

function parseNodePath(element: HTMLElement): number[] {
  return (element.dataset.fountainPath ?? '').split('.').filter(Boolean).map(Number);
}

function textOffsetWithin(root: HTMLElement, node: globalThis.Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  try { range.setEnd(node, offset); } catch { return 0; }
  const fragment = range.cloneContents();
  fragment.querySelectorAll?.('[data-fountain-widget]').forEach((widget) => widget.remove());
  return fragment.textContent?.length ?? 0;
}

function locateOffset(root: HTMLElement, target: number): { node: globalThis.Node; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest('[data-fountain-widget]')
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT),
  });
  let remaining = target;
  let current = walker.nextNode();
  while (current) {
    const length = current.textContent?.length ?? 0;
    if (remaining <= length) return { node: current, offset: remaining };
    remaining -= length;
    current = walker.nextNode();
  }
  return root.firstChild ? { node: root.firstChild, offset: 0 } : null;
}

interface DirectionState {
  _b?: Selection;
}

export class SelectionHandler {
  private syncing = false;
  private pointerSelectionHandled = false;
  private domSyncRequested = false;

  constructor(
    private readonly editor: Editor,
    private readonly dom: HTMLElement,
    private readonly shouldStopEvent?: (event: Event) => boolean,
  ) {
    document.addEventListener('selectionchange', this.onSelectionChange);
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointerup', this.onSelectionInteraction);
    dom.addEventListener('keyup', this.onSelectionInteraction);
  }

  read(): Selection | null {
    const domSelection = document.getSelection();
    delete (this as SelectionHandler & DirectionState)._b;
    if (!domSelection?.anchorNode || !domSelection.focusNode || !this.dom.contains(domSelection.anchorNode)) return null;
    const anchorElement = (domSelection.anchorNode.nodeType === 1 ? domSelection.anchorNode as Element : domSelection.anchorNode.parentElement)
      ?.closest<HTMLElement>('[data-fountain-text-path]');
    const focusElement = (domSelection.focusNode.nodeType === 1 ? domSelection.focusNode as Element : domSelection.focusNode.parentElement)
      ?.closest<HTMLElement>('[data-fountain-text-path]');
    if (!anchorElement || !focusElement) return null;
    const anchor = textOffsetWithin(anchorElement, domSelection.anchorNode, domSelection.anchorOffset);
    const focus = textOffsetWithin(focusElement, domSelection.focusNode, domSelection.focusOffset);
    const anchorPath = parsePath(anchorElement);
    const focusPath = parsePath(focusElement);
    if (anchorElement === focusElement) {
      const result = new Selection(anchorPath, Math.min(anchor, focus), Math.max(anchor, focus));
      if (anchor > focus) (this as SelectionHandler & DirectionState)._b = result;
      return result;
    }
    const anchorComesFirst = Boolean(anchorElement.compareDocumentPosition(focusElement) & Node.DOCUMENT_POSITION_FOLLOWING);
    const result = anchorComesFirst
      ? Selection.range(anchorPath, anchor, focusPath, focus)
      : Selection.range(focusPath, focus, anchorPath, anchor);
    if (!anchorComesFirst) (this as SelectionHandler & DirectionState)._b = result;
    return result;
  }

  capture(): Selection | null {
    const selection = this.read();
    if (selection && !selection.eq(this.editor.state.selection)) {
      this.editor.dispatch(this.editor.state.createTransaction().setSelection(selection));
    }
    return selection;
  }

  ownsDOMSelection(): boolean {
    const selection = document.getSelection();
    return Boolean(selection?.anchorNode && selection.focusNode
      && this.dom.contains(selection.anchorNode) && this.dom.contains(selection.focusNode));
  }

  requestDOMSync(): void {
    this.domSyncRequested = true;
    queueMicrotask(() => { this.domSyncRequested = false; });
  }

  consumeDOMSyncRequest(): boolean {
    const requested = this.domSyncRequested;
    this.domSyncRequested = false;
    return requested;
  }

  sync(selection: AnySelection, applyDOM = true): void {
    this.clearSemanticSelectionMarkers();
    const domSelection = document.getSelection();
    if (!domSelection) return;
    this.syncing = applyDOM;
    const range = document.createRange();

    if (selection instanceof AllSelection) {
      if (!applyDOM) return this.finishSync();
      range.selectNodeContents(this.dom);
      this.applyDOMSelection(domSelection, range);
      return;
    }

    if (selection instanceof NodeSelection) {
      const element = this.nodeElement(selection.nodePath) ?? this.textElement(selection.nodePath);
      if (!element) return this.finishSync();
      element.dataset.fountainSelectedNode = 'true';
      if (selection.nodePath.length === 1) element.draggable = true;
      if (!applyDOM) return this.finishSync();
      range.selectNode(element);
      this.applyDOMSelection(domSelection, range);
      return;
    }

    if (selection instanceof CellSelection) {
      const cells = selection.cellPaths
        .map((path) => this.nodeElement(path))
        .filter((element): element is HTMLElement => Boolean(element));
      cells.forEach((cell) => { cell.dataset.fountainSelectedCell = 'true'; });
      const first = cells[0];
      const last = cells.at(-1);
      if (!first || !last) return this.finishSync();
      if (!applyDOM) return this.finishSync();
      range.setStartBefore(first);
      range.setEndAfter(last);
      this.applyDOMSelection(domSelection, range);
      return;
    }

    if (selection instanceof GapSelection) {
      const next = this.nodeElement([...selection.parentPath, selection.index]);
      const previous = selection.index > 0
        ? this.nodeElement([...selection.parentPath, selection.index - 1])
        : null;
      const parent = selection.parentPath.length ? this.nodeElement(selection.parentPath) : this.dom;
      if (next) {
        next.dataset.fountainGap = 'before';
        range.setStartBefore(next);
      } else if (previous) {
        previous.dataset.fountainGap = 'after';
        range.setStartAfter(previous);
      } else if (parent) {
        parent.dataset.fountainGap = 'inside';
        if (!applyDOM) return this.finishSync();
        range.selectNodeContents(parent);
        range.collapse(false);
        this.applyDOMSelection(domSelection, range);
        return;
      } else return this.finishSync();
      if (!applyDOM) return this.finishSync();
      range.collapse(true);
      this.applyDOMSelection(domSelection, range);
      return;
    }

    if (!applyDOM) return this.finishSync();
    const path = selection.path.join('.');
    const wrappers = Array.from(this.dom.querySelectorAll<HTMLElement>('[data-fountain-text-path]'));
    const wrapper = wrappers
      .find((element) => element.dataset.fountainTextPath === path);
    const endPath = selection.endPath.join('.');
    const endWrapper = wrappers.find((element) => element.dataset.fountainTextPath === endPath);
    if (!wrapper || !endWrapper) return this.finishSync();
    const start = locateOffset(wrapper, selection.from);
    const end = locateOffset(endWrapper, selection.to);
    if (!start || !end) return this.finishSync();
    if ((this as SelectionHandler & DirectionState)._b?.eq(selection)) {
      domSelection.setBaseAndExtent(end.node, end.offset, start.node, start.offset);
      return this.finishSync();
    }
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    this.applyDOMSelection(domSelection, range);
  }

  destroy(): void {
    document.removeEventListener('selectionchange', this.onSelectionChange);
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('pointerup', this.onSelectionInteraction);
    this.dom.removeEventListener('keyup', this.onSelectionInteraction);
  }

  private onSelectionChange = (): void => {
    if (!this.syncing) this.capture();
  };

  private onSelectionInteraction = (event: Event): void => {
    if (this.shouldStopEvent?.(event)) return;
    if (this.pointerSelectionHandled) {
      this.pointerSelectionHandled = false;
      return;
    }
    if (!this.syncing) this.capture();
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (this.shouldStopEvent?.(event)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !this.dom.contains(target)) return;
    this.requestDOMSync();

    const cell = target.closest<HTMLElement>('td[data-fountain-path], th[data-fountain-path]');
    if (cell && event.shiftKey) {
      const head = parseNodePath(cell);
      const anchor = this.editor.state.selection instanceof CellSelection
        ? this.editor.state.selection.anchorCellPath
        : this.cellPathForSelection(this.editor.state.selection);
      if (anchor) {
        try {
          const selection = new CellSelection(this.editor.state.doc, anchor, head);
          event.preventDefault();
          this.pointerSelectionHandled = true;
          this.editor.dispatch(this.editor.state.createTransaction().setSelection(selection));
          return;
        } catch { /* Let the browser place a regular text selection. */ }
      }
    }

    const atom = target.closest<HTMLElement>('[data-fountain-node][data-fountain-path]');
    if (!atom) return;
    try {
      const path = parseNodePath(atom);
      if (!getNodeAtPath(this.editor.state.doc, path).type.spec.atom) return;
      const selection = new NodeSelection(this.editor.state.doc, path);
      event.preventDefault();
      this.pointerSelectionHandled = true;
      this.editor.dispatch(this.editor.state.createTransaction().setSelection(selection));
    } catch { /* Ignore stale DOM paths during a render boundary. */ }
  };

  private cellPathForSelection(selection: AnySelection): readonly number[] | null {
    for (let length = selection.path.length; length > 0; length -= 1) {
      const path = selection.path.slice(0, length);
      try {
        if (['table_cell', 'table_header'].includes(getNodeAtPath(this.editor.state.doc, path).type.name)) return path;
      } catch { return null; }
    }
    return null;
  }

  private nodeElement(path: readonly number[]): HTMLElement | null {
    const value = path.join('.');
    return Array.from(this.dom.querySelectorAll<HTMLElement>('[data-fountain-path]'))
      .find((element) => element.dataset.fountainPath === value) ?? null;
  }

  private textElement(path: readonly number[]): HTMLElement | null {
    const value = path.join('.');
    return Array.from(this.dom.querySelectorAll<HTMLElement>('[data-fountain-text-path]'))
      .find((element) => element.dataset.fountainTextPath === value) ?? null;
  }

  private clearSemanticSelectionMarkers(): void {
    this.dom.querySelectorAll<HTMLElement>('[data-fountain-selected-node], [data-fountain-selected-cell], [data-fountain-gap], [draggable="true"]')
      .forEach((element) => {
        delete element.dataset.fountainSelectedNode;
        delete element.dataset.fountainSelectedCell;
        delete element.dataset.fountainGap;
        element.removeAttribute('draggable');
      });
  }

  private applyDOMSelection(domSelection: globalThis.Selection, range: Range): void {
    domSelection.removeAllRanges();
    domSelection.addRange(range);
    this.finishSync();
  }

  private finishSync(): void {
    queueMicrotask(() => { this.syncing = false; });
  }
}
