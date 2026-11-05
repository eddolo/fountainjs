import {
  AllSelection,
  CellSelection,
  Editor,
  GapSelection,
  NodeSelection,
  RangeSelection,
  Selection,
  nodeRangeAtPath,
  resolveDocumentPoint,
  selectionAtPosition,
  textPointToPosition,
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
  private pointerSelectionActive = false;
  private nodeViewPointerActive = false;
  private pendingModelSync = false;
  private pendingFocusSelection = false;
  #domSyncRequested = false;

  constructor(
    private readonly editor: Editor,
    private readonly dom: HTMLElement,
    private readonly shouldStopEvent?: (event: Event) => boolean,
  ) {
    document.addEventListener('selectionchange', this.onSelectionChange);
    dom.addEventListener('focus', this.onHostFocus);
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointerup', this.onSelectionInteraction);
    dom.addEventListener('keyup', this.onSelectionInteraction);
    document.addEventListener('pointerup', this.endPointerSelection);
    document.addEventListener('pointercancel', this.endPointerSelection);
  }

  private readPoint(node: globalThis.Node, offset: number): { element: HTMLElement; offset: number } | null {
    if (!this.dom.contains(node)) return null;
    const element = node.nodeType === 1 ? node as HTMLElement : node.parentElement;
    const blocked = (element: HTMLElement) => Boolean(element.closest('[data-fountain-widget]')
      || (element.closest('[contenteditable="false"]') && element.closest('[contenteditable="false"]') !== this.dom));
    if (!element || blocked(element)) return null;
    const wrapper = element.closest<HTMLElement>('[data-fountain-text-path]');
    if (wrapper) return { element: wrapper, offset: textOffsetWithin(wrapper, node, offset) };
    // Home/Shift+Up can leave a native endpoint on the paragraph itself,
    // before its text wrapper, instead of inside a text node. Resolve that
    // child boundary without falling back to the previous model selection.
    // Root boundaries remain owned by semantic all/cell/gap selection handling.
    if (node.nodeType !== 1 || node === this.dom) return null;
    const owner = element.closest<HTMLElement>('[data-fountain-path]');
    if (!owner) return null;
    try {
      const block = getNodeAtPath(this.editor.state.doc, parseNodePath(owner));
      // Do not reinterpret the TR/TD/container endpoints produced by semantic
      // cell or node selection synchronization as an ordinary text range.
      if (!block.type.isBlock || block.type.spec.atom || block.content.some(child => !child.type.isInline)) return null;
    } catch { return null; }
    const edge = (child: globalThis.Node, last: boolean): HTMLElement | undefined => {
      if (child.nodeType !== 1) return undefined;
      const candidate = child as HTMLElement;
      const wrappers = candidate.matches('[data-fountain-text-path]') ? [candidate]
        : Array.from(candidate.querySelectorAll<HTMLElement>('[data-fountain-text-path]'));
      const editable = wrappers.filter(item => !blocked(item));
      return last ? editable.at(-1) : editable[0];
    };
    const children = Array.from(node.childNodes);
    for (let index = offset; index < children.length; index += 1) {
      const next = edge(children[index]!, false);
      if (next) return { element: next, offset: 0 };
    }
    for (let index = Math.min(offset, children.length) - 1; index >= 0; index -= 1) {
      const previous = edge(children[index]!, true);
      if (previous) return { element: previous, offset: textOffsetWithin(previous, previous, previous.childNodes.length) };
    }
    return null;
  }

  private documentPosition(node: globalThis.Node, offset: number, association: -1 | 1, ranged = true): number | null {
    try { return this.readDocumentPosition(node, offset, association, ranged); }
    catch { return null; } // Detached/stale render paths cannot redirect an edit.
  }

  private readDocumentPosition(node: globalThis.Node, offset: number, association: -1 | 1, ranged: boolean): number | null {
    const text = this.readPoint(node, offset);
    if (text) return textPointToPosition(this.editor.state.doc, parsePath(text.element), text.offset);
    if (!this.dom.contains(node)) return null;
    const element = node.nodeType === 1 ? node as HTMLElement : node.parentElement;
    if (!element || element.closest('[data-fountain-widget]')) return null;
    const owner = element.closest<HTMLElement>('[data-fountain-path]');
    if (owner) {
      const path = parseNodePath(owner), model = getNodeAtPath(this.editor.state.doc, path);
      if (model.type.spec.atom || !model.type.spec.content) {
        if (!ranged) return null;
        const range = nodeRangeAtPath(this.editor.state.doc, path);
        return association > 0 ? range.from : range.to;
      }
    }
    if (node.nodeType !== 1 || (element.closest('[contenteditable="false"]')
      && element.closest('[contenteditable="false"]') !== this.dom)) return null;
    const mapped = (child: globalThis.Node, reverse: boolean): HTMLElement | null => {
      if (child.nodeType !== 1) return null;
      const candidate = child as HTMLElement;
      if (candidate.matches('[data-fountain-widget]')) return null;
      if (candidate.matches('[data-fountain-path], [data-fountain-text-path]')) return candidate;
      const descendants = Array.from(candidate.childNodes);
      if (reverse) descendants.reverse();
      for (const descendant of descendants) { const found = mapped(descendant, reverse); if (found) return found; }
      return null;
    };
    const positionFor = (candidate: HTMLElement, after: boolean): number => {
      if (candidate.dataset.fountainTextPath !== undefined) {
        const path = parsePath(candidate), model = getNodeAtPath(this.editor.state.doc, path);
        return textPointToPosition(this.editor.state.doc, path, after ? model.nodeSize : 0);
      }
      const range = nodeRangeAtPath(this.editor.state.doc, parseNodePath(candidate));
      return after ? range.to : range.from;
    };
    const children = Array.from(node.childNodes);
    for (let index = offset; index < children.length; index += 1) {
      const next = mapped(children[index]!, false);
      if (next) return positionFor(next, false);
    }
    for (let index = Math.min(offset, children.length) - 1; index >= 0; index -= 1) {
      const previous = mapped(children[index]!, true);
      if (previous) return positionFor(previous, true);
    }
    if (node === this.dom) return this.editor.state.doc.childCount ? null : 0;
    if (owner && (element.matches('[data-fountain-content-dom]') || element === owner && !owner.querySelector('[data-fountain-content-dom]'))) {
      return nodeRangeAtPath(this.editor.state.doc, parseNodePath(owner)).from + 1;
    }
    return null;
  }

  anchorPosition(): number | null {
    const native = this.dom.ownerDocument.getSelection();
    if (!native?.anchorNode || !native.rangeCount) return null;
    const range = native.getRangeAt(0);
    const backward = !native.isCollapsed && native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset;
    return this.documentPosition(native.anchorNode, native.anchorOffset, backward ? -1 : 1, !native.isCollapsed);
  }

  private documentDOMPoint(position: number, association: -1 | 1): { node: globalThis.Node; offset: number } | null {
    const point = resolveDocumentPoint(this.editor.state.doc, position, association);
    if (point.kind === 'text') {
      const element = this.textElement(point.path);
      return element ? locateOffset(element, point.offset) : null;
    }
    const next = this.nodeElement([...point.parentPath, point.index]);
    const previous = point.index ? this.nodeElement([...point.parentPath, point.index - 1]) : null;
    const child = next ?? previous;
    if (child?.parentNode) return { node: child.parentNode,
      offset: Array.prototype.indexOf.call(child.parentNode.childNodes, child) + (next ? 0 : 1) };
    const parent = point.parentPath.length ? this.nodeElement(point.parentPath) : this.dom;
    if (!parent) return null;
    const content = parent.matches('[data-fountain-content-dom]') ? parent : parent.querySelector<HTMLElement>('[data-fountain-content-dom]') ?? parent;
    return { node: content, offset: 0 };
  }

  read(allowGapMovement = false): AnySelection | null {
    const domSelection = document.getSelection();
    delete (this as SelectionHandler & DirectionState)._b;
    if (!domSelection?.anchorNode || !domSelection.focusNode || !this.dom.contains(domSelection.anchorNode)) return null;
    // selectNode(inlineAtom) uses two offsets on its paragraph parent. Those
    // endpoints are the existing semantic selection, not a new text caret.
    // Preserve only the exact native range; a subsequent click in text must
    // still be allowed to replace the node selection.
    const semantic = this.editor.state.selection;
    const allowNativeAnchor = allowGapMovement || this.pointerSelectionActive;
    if (this.pendingModelSync && !allowNativeAnchor) return null;
    if (semantic instanceof NodeSelection && this.pointerSelectionHandled && this.pendingModelSync) return null;
    // A browser may normalize an element-boundary caret into nearby text
    // during layout/focus (Chromium does so after terminal media). That is not
    // user navigation. Keep the semantic gap until a pointer or navigation
    // key actually places a different caret; typing still inserts at the gap.
    if (semantic instanceof GapSelection && domSelection.isCollapsed && !allowNativeAnchor) return null;
    const retainStructuralAnchor = semantic instanceof RangeSelection && !allowNativeAnchor
      && resolveDocumentPoint(this.editor.state.doc, semantic.anchor).kind === 'boundary';
    if (retainStructuralAnchor && !semantic.isCollapsed && domSelection.isCollapsed) return null;
    if (semantic instanceof AllSelection && domSelection.rangeCount === 1) {
      const range = domSelection.getRangeAt(0);
      if (range.startContainer === this.dom && range.startOffset === 0 && range.endContainer === this.dom
        && range.endOffset === this.dom.childNodes.length) return null;
    }
    if (semantic instanceof CellSelection && domSelection.rangeCount === 1) {
      const first = this.nodeElement(semantic.cellPaths[0]!), last = this.nodeElement(semantic.cellPaths.at(-1)!);
      const range = domSelection.getRangeAt(0);
      if (first?.parentNode && last?.parentNode && range.startContainer === first.parentNode && range.endContainer === last.parentNode
        && range.startOffset === Array.prototype.indexOf.call(first.parentNode.childNodes, first)
        && range.endOffset === Array.prototype.indexOf.call(last.parentNode.childNodes, last) + 1) return null;
    }
    if (semantic instanceof NodeSelection && domSelection.rangeCount === 1) {
      const selected = this.nodeElement(semantic.nodePath) ?? this.textElement(semantic.nodePath);
      const parent = selected?.parentNode;
      if (selected && parent) {
        const index = Array.prototype.indexOf.call(parent.childNodes, selected) as number;
        const range = domSelection.getRangeAt(0);
        if (range.startContainer === parent && range.endContainer === parent
          && range.startOffset === index && range.endOffset === index + 1) return null;
      }
    }
    const anchorPoint = this.readPoint(domSelection.anchorNode, domSelection.anchorOffset);
    const focusPoint = this.readPoint(domSelection.focusNode, domSelection.focusOffset);
    if (!anchorPoint || !focusPoint) {
      const range = domSelection.rangeCount ? domSelection.getRangeAt(0) : null;
      const backward = range && !domSelection.isCollapsed && domSelection.anchorNode === range.endContainer && domSelection.anchorOffset === range.endOffset;
      const anchor = retainStructuralAnchor ? semantic.anchor
        : this.documentPosition(domSelection.anchorNode, domSelection.anchorOffset, backward ? -1 : 1, !domSelection.isCollapsed);
      const head = this.documentPosition(domSelection.focusNode, domSelection.focusOffset, backward ? 1 : -1, !domSelection.isCollapsed);
      if (anchor === null || head === null) return null;
      return anchor === head ? selectionAtPosition(this.editor.state.doc, anchor) : new RangeSelection(this.editor.state.doc, anchor, head);
    }
    const { element: anchorElement, offset: anchor } = anchorPoint;
    const { element: focusElement, offset: focus } = focusPoint;
    const anchorPath = parsePath(anchorElement);
    const focusPath = parsePath(focusElement);
    if (semantic instanceof RangeSelection) {
      const anchorPosition = retainStructuralAnchor ? semantic.anchor
        : this.documentPosition(domSelection.anchorNode, domSelection.anchorOffset, 1);
      const headPosition = this.documentPosition(domSelection.focusNode, domSelection.focusOffset, -1);
      if (anchorPosition === null || headPosition === null) return null;
      return anchorPosition === headPosition ? selectionAtPosition(this.editor.state.doc, anchorPosition)
        : new RangeSelection(this.editor.state.doc, anchorPosition, headPosition);
    }
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

  capture(allowGapMovement = false): AnySelection | null {
    const selection = this.read(allowGapMovement);
    if (!selection) {
      const native = document.getSelection();
      const anchor = native?.anchorNode;
      const element = anchor?.nodeType === 1 ? anchor as Element : anchor?.parentElement;
      const empty = native?.isCollapsed ? element?.closest<HTMLElement>('[data-fountain-empty-text-block]') : null;
      if (empty && this.dom.contains(empty)) {
        try {
          const path = parseNodePath(empty);
          const node = getNodeAtPath(this.editor.state.doc, path);
          if (!node.childCount && !node.type.spec.atom) {
            const blockSelection = new NodeSelection(this.editor.state.doc, path);
            if (!blockSelection.eq(this.editor.state.selection)) {
              this.editor.dispatch(this.editor.state.createTransaction().setSelection(blockSelection));
            }
          }
        } catch { /* A replaced DOM block must not redirect typing. */ }
      }
    }
    if (selection && !selection.eq(this.editor.state.selection)) {
      this.editor.dispatch(this.editor.state.createTransaction().setSelection(selection));
    }
    return selection;
  }

  ownsDOMSelection(): boolean {
    const owner = this.dom.ownerDocument;
    const active = owner.activeElement;
    // Native controls (notably colour inputs) can leave an old editor range
    // selected. Rendering/mutation repair must not reclaim their keyboard focus.
    // Explicit view.focus() still applies the current logical editor selection.
    if (active && active !== owner.body && active !== owner.documentElement && !this.dom.contains(active)) return false;
    const selection = owner.getSelection();
    return Boolean(selection?.anchorNode && selection.focusNode
      && this.dom.contains(selection.anchorNode) && this.dom.contains(selection.focusNode));
  }

  requestDOMSync(): void {
    this.#domSyncRequested = true;
    queueMicrotask(() => { this.#domSyncRequested = false; });
  }

  /** A committed selection must reach the DOM before incidental native
   * endpoints from the preceding render can replace it. */
  requestModelSync(preserveForFocus = false): void {
    this.pendingModelSync = true;
    this.pendingFocusSelection ||= preserveForFocus;
  }

  consumeDOMSyncRequest(): boolean {
    const requested = this.#domSyncRequested;
    this.#domSyncRequested = false;
    return requested;
  }

  sync(selection: AnySelection, applyDOM = true): void {
    this.pendingModelSync = false;
    // A mapped model selection is not a request to leave a native field.
    // Explicit view.focus() focuses the editing host before calling sync.
    const active = this.dom.ownerDocument.activeElement;
    applyDOM = applyDOM && !active?.matches('input,textarea,select');
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
      // Updating a selected node must not move the browser caret out of its
      // own native form control. Selecting a different node or explicitly
      // focusing the editor still applies the requested document selection.
      const ownsControl = active instanceof HTMLElement && element.contains(active)
        && active.matches('button')
        && active.closest<HTMLElement>('[contenteditable]')?.contentEditable === 'false';
      if (!applyDOM || ownsControl) return this.finishSync();
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
      // Selecting/resizing this cell must not steal keyboard focus from its
      // non-editable controls. Explicit editor focus or selection of another
      // cell still applies the requested DOM range, as with atomic NodeViews.
      const ownsControl = active instanceof HTMLElement && cells.some(cell => cell.contains(active))
        && active.closest<HTMLElement>('[contenteditable]')?.contentEditable === 'false';
      if (!applyDOM || ownsControl) return this.finishSync();
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

    if (selection instanceof RangeSelection) {
      if (!applyDOM) return this.finishSync();
      const anchor = this.documentDOMPoint(selection.anchor, selection.backward ? -1 : 1);
      const head = this.documentDOMPoint(selection.head, selection.backward ? 1 : -1);
      if (!anchor || !head) return this.finishSync();
      domSelection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
      return this.finishSync();
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
    const backward = (this as SelectionHandler & DirectionState)._b?.eq(selection);
    const anchor = backward ? end : start;
    const focus = backward ? start : end;
    // A native keyboard/pointer selection already has the correct endpoints.
    // Replacing its range discards browser-only state such as bidi caret
    // affinity (Firefox) and can reverse the next visual arrow movement.
    // Changed endpoints or replaced DOM nodes still need model-to-DOM sync.
    if (domSelection.anchorNode === anchor.node && domSelection.anchorOffset === anchor.offset
      && domSelection.focusNode === focus.node && domSelection.focusOffset === focus.offset) {
      return this.finishSync();
    }
    // Decorations split one model text leaf into several DOM text nodes. Two
    // native endpoints can map to the requested model range while differing
    // from locateOffset's preferred boundary. Preserve the native choice and
    // its line/bidi affinity instead of moving across a non-editable widget.
    // Different offsets in the same text node cannot be equivalent: avoid
    // cloning native ranges on the ordinary typing/cursor-update path.
    const differentTextOffset = (domSelection.anchorNode === anchor.node && anchor.node.nodeType === Node.TEXT_NODE
      && domSelection.anchorOffset !== anchor.offset)
      || (domSelection.focusNode === focus.node && focus.node.nodeType === Node.TEXT_NODE
        && domSelection.focusOffset !== focus.offset);
    if (!differentTextOffset && domSelection.anchorNode && domSelection.focusNode) {
      const nativeAnchor = this.readPoint(domSelection.anchorNode, domSelection.anchorOffset);
      const nativeFocus = domSelection.anchorNode === domSelection.focusNode && domSelection.anchorOffset === domSelection.focusOffset
        ? nativeAnchor : this.readPoint(domSelection.focusNode, domSelection.focusOffset);
      if (nativeAnchor?.element === (backward ? endWrapper : wrapper) && nativeAnchor.offset === (backward ? selection.to : selection.from)
        && nativeFocus?.element === (backward ? wrapper : endWrapper) && nativeFocus.offset === (backward ? selection.from : selection.to)) {
        return this.finishSync();
      }
    }
    if (backward) {
      domSelection.setBaseAndExtent(end.node, end.offset, start.node, start.offset);
      return this.finishSync();
    }
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    this.applyDOMSelection(domSelection, range);
  }

  /** Let the browser choose visual/grapheme movement at the head, while the
   * document model keeps an anchor that native selection cannot maintain. */
  extendStructuralRange(direction: 'left' | 'right'): boolean {
    const selection = this.editor.state.selection;
    if (!(selection instanceof RangeSelection) || selection.isCollapsed
      || resolveDocumentPoint(this.editor.state.doc, selection.anchor).kind !== 'boundary') return false;
    const native = this.dom.ownerDocument.getSelection();
    const point = this.documentDOMPoint(selection.head, direction === 'left' ? -1 : 1);
    if (!native || !point || typeof native.modify !== 'function') return false;
    native.collapse(point.node, point.offset);
    native.modify('move', direction, 'character');
    const head = native.focusNode ? this.documentPosition(native.focusNode, native.focusOffset, direction === 'left' ? -1 : 1) : null;
    if (head !== null) {
      this.requestDOMSync();
      this.editor.dispatch(this.editor.createTransaction().setSelection(head === selection.anchor
        ? selectionAtPosition(this.editor.state.doc, head) : new RangeSelection(this.editor.state.doc, selection.anchor, head)));
    }
    this.sync(this.editor.state.selection);
    return true;
  }

  destroy(): void {
    document.removeEventListener('selectionchange', this.onSelectionChange);
    this.dom.removeEventListener('focus', this.onHostFocus);
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    this.dom.removeEventListener('pointerup', this.onSelectionInteraction);
    this.dom.removeEventListener('keyup', this.onSelectionInteraction);
    document.removeEventListener('pointerup', this.endPointerSelection);
    document.removeEventListener('pointercancel', this.endPointerSelection);
  }

  private onHostFocus = (event: FocusEvent): void => {
    // Returning from a toolbar must apply the committed command landing before
    // native beforeinput captures stale endpoints. Real pointer placement still
    // belongs to the browser, and nested native controls do not fire host focus.
    if (!this.pendingFocusSelection || this.syncing || this.pointerSelectionActive
      || event.relatedTarget instanceof Element && this.dom.contains(event.relatedTarget)) return;
    this.requestModelSync();
    // Some hosts restore their old native range after the focus event. Apply
    // the command landing after that default action, before the next input.
    queueMicrotask(() => {
      if (this.pendingFocusSelection) this.sync(this.editor.state.selection,
        this.dom.ownerDocument.activeElement === this.dom && !this.pointerSelectionActive);
    });
  };

  private onSelectionChange = (event: Event): void => {
    const activeElement = document.activeElement;
    const activeEditingHost = activeElement instanceof Element
      ? activeElement.closest<HTMLElement>('[contenteditable]')
      : null;
    if (activeElement instanceof HTMLElement
      && activeElement !== this.dom
      && this.dom.contains(activeElement)
      && (activeElement.closest('[data-fountain-widget]') || activeEditingHost?.contentEditable === 'false')) {
      return;
    }
    // Explicit host placement supersedes a deferred command caret, including
    // during the host's focus default or while its toolbar button keeps focus.
    // Browser-generated events can instead report stale endpoints. Native
    // text/colour fields retain ownership of their selection and keyboard.
    if (!this.syncing && !event.isTrusted && (this.ownsDOMSelection()
      || activeElement?.matches('button') && !this.dom.contains(activeElement))) {
      const native = this.dom.ownerDocument.getSelection();
      if (native?.anchorNode && native.focusNode
        && this.dom.contains(native.anchorNode) && this.dom.contains(native.focusNode)) {
        this.pendingFocusSelection = false;
        this.pendingModelSync = false;
        this.capture(true);
        return;
      }
    }
    if (!this.syncing && this.ownsDOMSelection()) this.capture();
  };

  private onSelectionInteraction = (event: Event): void => {
    if (this.nodeViewPointerActive || this.shouldStopEvent?.(event)) return;
    if (this.pointerSelectionHandled) {
      this.pointerSelectionHandled = false;
      return;
    }
    const nativeNavigation = event instanceof KeyboardEvent && !event.shiftKey
      && ['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key);
    const documentNavigation = event instanceof KeyboardEvent && (event.ctrlKey || event.metaKey)
      && ['Home', 'End', 'ArrowUp', 'ArrowDown'].includes(event.key);
    if (!this.syncing) this.capture(event.type === 'pointerup' || nativeNavigation && !documentNavigation);
  };

  private endPointerSelection = (): void => {
    this.pointerSelectionActive = false;
    this.nodeViewPointerActive = false;
  };

  private onPointerDown = (event: PointerEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !this.dom.contains(target)) return;
    this.pendingFocusSelection = false;
    // A resize/widget gesture can finish over editable content rather than its
    // original handle. NodeView ownership lasts until document pointerup/cancel.
    this.nodeViewPointerActive = Boolean(this.shouldStopEvent?.(event));
    if (this.nodeViewPointerActive) return;
    this.pointerSelectionActive = true;
    this.requestDOMSync();

    const cell = target.closest<HTMLElement>('td[data-fountain-path], th[data-fountain-path]');
    if (cell && event.shiftKey) {
      const head = parseNodePath(cell);
      const anchor = this.editor.state.selection instanceof CellSelection
        ? this.editor.state.selection.anchorCellPath
        : this.cellPathForSelection(this.editor.state.selection);
      // Within one cell, Shift-click extends the native text range. Only
      // crossing cells (or extending an existing cell selection) owns the
      // rectangular selection gesture.
      if (anchor && (this.editor.state.selection instanceof CellSelection
        || anchor.length !== head.length || anchor.some((part, index) => part !== head[index]))) {
        try {
          const selection = new CellSelection(this.editor.state.doc, anchor, head);
          event.preventDefault();
          this.pointerSelectionHandled = true;
          this.dom.focus({ preventScroll: true });
          this.editor.dispatch(this.editor.state.createTransaction().setSelection(selection));
          return;
        } catch { /* Let the browser place a regular text selection. */ }
      }
    }

    const previous = this.editor.state.selection;
    if (event.shiftKey && event.button === 0 && !event.defaultPrevented
      && (previous instanceof GapSelection || previous instanceof RangeSelection)
      && target.closest('input, textarea, select, button, [contenteditable]') === this.dom) {
      // Chromium normalizes a native caret after a non-editable media shell
      // back into preceding text when Shift-click extends it. Keep the exact
      // model anchor and use the browser only to hit-test the new endpoint.
      const owner = this.dom.ownerDocument;
      const caret = owner.caretPositionFromPoint?.(event.clientX, event.clientY);
      const hit = caret ? { node: caret.offsetNode, offset: caret.offset }
        : (() => {
          const range = owner.caretRangeFromPoint?.(event.clientX, event.clientY);
          return range ? { node: range.startContainer, offset: range.startOffset } : null;
        })();
      const head = hit ? this.documentPosition(hit.node, hit.offset, 1, true) : null;
      if (head !== null) {
        const anchor = previous instanceof RangeSelection ? previous.anchor : previous.position;
        const selection = anchor === head ? selectionAtPosition(this.editor.state.doc, head)
          : new RangeSelection(this.editor.state.doc, anchor, head);
        event.preventDefault();
        this.pointerSelectionHandled = true;
        this.dom.focus({ preventScroll: true });
        this.editor.dispatch(this.editor.state.createTransaction().setSelection(selection));
        return;
      }
    }

    // A non-atomic NodeView may still expose a selectable outer shell. Its
    // model-owned editable contentDOM owns ordinary browser text selection.
    const atom = target.closest<HTMLElement>('[data-fountain-node][data-fountain-path]');
    if (!atom) return;
    const contentRegion = target.closest('[data-fountain-content-dom]');
    // An inline atom inside somebody else's content region still owns node
    // selection. Only bypass the shell that owns this editable region.
    const emptyTextBlock = atom.dataset.fountainEmptyTextBlock === 'true'
      && contentRegion && atom.contains(contentRegion);
    if (contentRegion && atom.contains(contentRegion) && !emptyTextBlock) {
      // Establish focus without revealing an old offscreen caret before the
      // browser places this pointer's native text selection (notably Firefox).
      if (!event.defaultPrevented && event.button === 0 && document.activeElement !== this.dom
        && target.closest('input, textarea, select, button, [contenteditable]') === this.dom) {
        this.dom.focus({ preventScroll: true });
      }
      return;
    }
    try {
      const path = parseNodePath(atom);
      const node = getNodeAtPath(this.editor.state.doc, path);
      // Chromium can place an empty inline code caret on the surrounding
      // paragraph instead of inside its contentDOM. Keep the actual pointer
      // target as a semantic selection until typing creates its first text.
      if (emptyTextBlock && node.type.isInline && (!node.type.spec.code || node.childCount)) return;
      if (!node.type.spec.atom && !node.type.spec.selectable
        && !(atom.dataset.fountainEmptyTextBlock === 'true' && !node.childCount)) return;
      const selection = new NodeSelection(this.editor.state.doc, path);
      event.preventDefault();
      this.pointerSelectionHandled = true;
      // This is explicit document interaction, unlike a background render.
      // preventDefault suppresses native focus transfer from the old field.
      this.dom.focus({ preventScroll: true });
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
    if (this.syncing && this.dom.ownerDocument.activeElement === this.dom) this.pendingFocusSelection = false;
    queueMicrotask(() => { this.syncing = false; });
  }
}
