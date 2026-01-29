import { Editor, Selection } from '../core';

export class SelectionHandler {
  constructor(private editor: Editor, private dom: HTMLElement) {
    document.addEventListener('selectionchange', this.onSelectionChange);
  }

  private onSelectionChange = (): void => {
    const domSel = document.getSelection();
    if (!domSel || !domSel.anchorNode || !this.dom.contains(domSel.anchorNode)) {
      return;
    }

    // --- NEW, MORE ROBUST PATH/OFFSET FINDING ---
    const { anchorNode, anchorOffset, focusNode, focusOffset } = domSel;

    const start = this.findPosition(anchorNode, anchorOffset);
    const end = this.findPosition(focusNode, focusOffset);
    
    // If we can't map the DOM selection to our model, do nothing.
    if (start === null || end === null) {
      return;
    }

    // Create a new selection. For simplicity, we only support ranges within the same paragraph.
    const newSelection = new Selection(start.path, start.offset, end.offset);

    // Only dispatch a transaction if the selection has actually changed.
    if (JSON.stringify(this.editor.state.selection) !== JSON.stringify(newSelection)) {
      this.editor.dispatch(this.editor.createTransaction().setSelection(newSelection));
    }
  };

  // This is the hard part: mapping a DOM node + offset to our model's path + offset.
  private findPosition(domNode: globalThis.Node | null, domOffset: number): { path: number[], offset: number } | null {
    if (!domNode) return null;

    let textNode: globalThis.Node | null = null;
    let textOffset = 0;

    // If the selection is directly on a text node, use it.
    if (domNode.nodeType === Node.TEXT_NODE) {
      textNode = domNode;
      textOffset = domOffset;
    } else { // If it's on an element (like a <p>), find the text node inside.
      textNode = domNode.firstChild;
      textOffset = domOffset;
    }

    if (!textNode) return null;

    // Find the parent paragraph to get its index.
    let parentParagraph = textNode.parentNode;
    while (parentParagraph && parentParagraph.nodeName !== 'P') {
      parentParagraph = parentParagraph.parentNode;
    }

    if (!parentParagraph || !this.dom.contains(parentParagraph)) return null;

    const blockIndex = Array.from(this.dom.childNodes).indexOf(parentParagraph as any);
    if (blockIndex === -1) return null;
    
    // Our simplified path is [paragraphIndex, textNodeIndex (always 0 for now)]
    return { path: [blockIndex, 0], offset: textOffset };
  }


  public syncSelectionToDOM(selection: Selection): void {
    // This part is also very complex. For now, we will let the browser lead.
    // The onSelectionChange handler will keep our state in sync with the browser.
  }

  public destroy(): void {
    document.removeEventListener('selectionchange', this.onSelectionChange);
  }
}