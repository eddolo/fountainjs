import { Editor, Selection } from '../core';

function parsePath(element: HTMLElement): number[] {
  return (element.dataset.fountainTextPath ?? '').split('.').filter(Boolean).map(Number);
}

function textOffsetWithin(root: HTMLElement, node: globalThis.Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  try { range.setEnd(node, offset); } catch { return 0; }
  return range.toString().length;
}

function locateOffset(root: HTMLElement, target: number): { node: globalThis.Node; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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

export class SelectionHandler {
  private syncing = false;

  constructor(private readonly editor: Editor, private readonly dom: HTMLElement) {
    document.addEventListener('selectionchange', this.onSelectionChange);
    dom.addEventListener('pointerup', this.onSelectionInteraction);
    dom.addEventListener('keyup', this.onSelectionInteraction);
  }

  read(): Selection | null {
    const domSelection = document.getSelection();
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
      return new Selection(anchorPath, Math.min(anchor, focus), Math.max(anchor, focus));
    }
    const anchorComesFirst = Boolean(anchorElement.compareDocumentPosition(focusElement) & Node.DOCUMENT_POSITION_FOLLOWING);
    return anchorComesFirst
      ? Selection.range(anchorPath, anchor, focusPath, focus)
      : Selection.range(focusPath, focus, anchorPath, anchor);
  }

  capture(): Selection | null {
    const selection = this.read();
    if (selection && !selection.eq(this.editor.state.selection)) {
      this.editor.dispatch(this.editor.state.createTransaction().setSelection(selection));
    }
    return selection;
  }

  sync(selection: Selection): void {
    const path = selection.path.join('.');
    const wrappers = Array.from(this.dom.querySelectorAll<HTMLElement>('[data-fountain-text-path]'));
    const wrapper = wrappers
      .find((element) => element.dataset.fountainTextPath === path);
    const endPath = selection.endPath.join('.');
    const endWrapper = wrappers.find((element) => element.dataset.fountainTextPath === endPath);
    if (!wrapper || !endWrapper) return;
    const start = locateOffset(wrapper, selection.from);
    const end = locateOffset(endWrapper, selection.to);
    const domSelection = document.getSelection();
    if (!start || !end || !domSelection) return;
    this.syncing = true;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    domSelection.removeAllRanges();
    domSelection.addRange(range);
    queueMicrotask(() => { this.syncing = false; });
  }

  destroy(): void {
    document.removeEventListener('selectionchange', this.onSelectionChange);
    this.dom.removeEventListener('pointerup', this.onSelectionInteraction);
    this.dom.removeEventListener('keyup', this.onSelectionInteraction);
  }

  private onSelectionChange = (): void => {
    if (!this.syncing) this.capture();
  };

  private onSelectionInteraction = (): void => {
    if (!this.syncing) this.capture();
  };
}
