import { Node } from '../../core';
import { EditorView } from '../../view';

export class ImageSuperNodeView {
  public readonly dom: HTMLElement;
  public readonly contentDOM: HTMLElement;
  private readonly img: HTMLImageElement;
  private readonly getPos: () => number | undefined; // The function to get the node's position

  constructor(private node: Node, private view: EditorView, getPos: () => number | undefined) {
    // Store the getPos function
    this.getPos = getPos;

    // --- Create DOM Structure ---
    this.dom = document.createElement('figure');
    this.dom.style.position = 'relative';
    this.dom.style.margin = '1rem 0';
    this.dom.style.display = 'inline-block'; // Important for resizing

    this.img = document.createElement('img');
    this.updateImageAttributes(node.attrs);
    
    this.contentDOM = document.createElement('div'); // For the figcaption

    const resizeHandle = document.createElement('div');
    resizeHandle.style.position = 'absolute';
    resizeHandle.style.bottom = '5px';
    resizeHandle.style.right = '5px';
    resizeHandle.style.width = '10px';
    resizeHandle.style.height = '10px';
    resizeHandle.style.backgroundColor = '#007bff';
    resizeHandle.style.cursor = 'nwse-resize';
    resizeHandle.style.border = '1px solid white';

    this.dom.appendChild(this.img);
    this.dom.appendChild(this.contentDOM);
    this.dom.appendChild(resizeHandle);

    resizeHandle.addEventListener('mousedown', this.onResizeStart);
  }

  // Called by the main EditorView when the node changes
  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.updateImageAttributes(node.attrs);
    this.node = node;
    return true;
  }

  // Helper to sync node attributes to the DOM
  private updateImageAttributes(attrs: { [key: string]: any }): void {
    this.img.src = attrs.src;
    this.img.alt = attrs.alt;
    this.img.title = attrs.title;
    this.dom.style.width = attrs.width;
    this.img.style.width = '100%';
  }

  // --- Resize Logic ---
  private onResizeStart = (event: MouseEvent): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.dom.offsetWidth;

    const onResizeMove = (moveEvent: MouseEvent) => {
      const newWidth = startWidth + (moveEvent.clientX - startX);
      this.dom.style.width = `${newWidth}px`;
    };

    const onResizeEnd = () => {
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', onResizeEnd);
      
      const pos = this.getPos();
      if (pos === undefined) return;

      const newAttrs = { ...this.node.attrs, width: this.dom.style.width };
      
      // THIS IS THE KEY: We find the node's position and create a transaction
      // A real implementation needs a more robust way to find the path
      const path = [pos]; // Simplified path for top-level nodes

      const tr = this.view.editor.createTransaction().setNodeAttrs(path, newAttrs);
      this.view.editor.dispatch(tr);
    };

    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
  };
}