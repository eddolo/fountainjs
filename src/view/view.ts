import { Editor, EditorState, Node, Selection } from '../core';

// Advanced editor view with multi-block support
export class EditorView {
  public readonly editor: Editor;
  public readonly dom: HTMLElement;
  private isDestroyed = false;
  private isReconciling = false;
  private readonly unsubscribe: () => void;
  private nodeToDOM = new WeakMap<Node, HTMLElement>();
  private domToPath = new WeakMap<HTMLElement, number[]>();

  constructor(mount: HTMLElement, editor: Editor) {
    this.editor = editor;
    this.dom = document.createElement('div');
    this.dom.setAttribute('role', 'textbox');
    this.dom.setAttribute('aria-label', 'Editor');
    this.dom.contentEditable = 'true';
    this.dom.style.cssText = `
      padding: 12px;
      min-height: 200px;
      outline: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #333;
    `;

    mount.appendChild(this.dom);

    this.dom.addEventListener('input', this.handleInput);
    this.dom.addEventListener('keydown', this.handleKeyDown);
    this.dom.addEventListener('paste', this.handlePaste);
    
    this.unsubscribe = this.editor.subscribe(this.onStateChange);
    this.render(this.editor.state);
  }

  private handleInput = (): void => {
    if (this.isReconciling) return;
    this.reconcile();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    // Ctrl/Cmd + B: Bold
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      this.toggleMark('strong');
      return;
    }
    // Ctrl/Cmd + I: Italic
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      this.toggleMark('em');
      return;
    }
    // Ctrl/Cmd + Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      // Undo would be handled by history plugin
      return;
    }
  };

  private handlePaste = (e: ClipboardEvent): void => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain');
    if (text) {
      document.execCommand('insertText', false, text);
    }
  };

  private toggleMark(markName: string): void {
    const { state } = this.editor;
    const selection = window.getSelection();
    
    if (!selection || selection.isCollapsed) return;

    const { anchorNode, focusNode, anchorOffset, focusOffset } = selection;
    if (!anchorNode || !focusNode) return;

    // Simple mark toggle using DOM manipulation
    const selectedText = selection.toString();
    const markType = state.schema.marks[markName];
    
    if (markType) {
      const span = document.createElement('span');
      if (markName === 'strong') span.style.fontWeight = 'bold';
      if (markName === 'em') span.style.fontStyle = 'italic';
      span.textContent = selectedText;
      
      try {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(span);
      } catch (e) {
        // Fallback to document.execCommand
        if (markName === 'strong') document.execCommand('bold');
        if (markName === 'em') document.execCommand('italic');
      }
    }
    
    queueMicrotask(() => this.reconcile());
  }

  private reconcile = (): void => {
    if (this.isReconciling) return;
    this.isReconciling = true;

    try {
      const { state } = this.editor;
      const selection = window.getSelection();

      if (!selection || !selection.anchorNode) {
        this.isReconciling = false;
        return;
      }

      // Reconstruct content from DOM
      const newContent = this.extractContent(this.dom);
      
      if (newContent.length > 0) {
        const tr = state.createTransaction().replace(0, state.doc.content.length, newContent);
        
        // Try to preserve cursor position
        if (selection.anchorNode) {
          const offset = selection.anchorOffset;
          tr.setSelection(Selection.createCursor([0, 0], offset));
        }

        this.editor.dispatch(tr);
      }
    } finally {
      queueMicrotask(() => { this.isReconciling = false; });
    }
  };

  private extractContent(domNode: HTMLElement): Node[] {
    const content: Node[] = [];
    
    for (let i = 0; i < domNode.childNodes.length; i++) {
      const child = domNode.childNodes[i];
      
      if (child.nodeType === 3) { // Node.TEXT_NODE
        const text = child.textContent || '';
        if (text.trim()) {
          const textNode = new Node(this.editor.state.schema.nodes.text, {}, [], text);
          const para = new Node(this.editor.state.schema.nodes.paragraph, {}, [textNode]);
          content.push(para);
        }
      } else if (child.nodeType === 1) { // Node.ELEMENT_NODE
        const el = child as HTMLElement;
        const nodeName = el.tagName.toLowerCase();
        
        if (nodeName === 'p' || nodeName === 'div') {
          const text = el.textContent || '';
          const textNode = new Node(this.editor.state.schema.nodes.text, {}, [], text);
          const para = new Node(this.editor.state.schema.nodes.paragraph, {}, [textNode]);
          content.push(para);
        } else if (nodeName === 'h1' || nodeName === 'h2' || nodeName === 'h3') {
          const level = parseInt(nodeName[1]);
          const text = el.textContent || '';
          const textNode = new Node(this.editor.state.schema.nodes.text, {}, [], text);
          const heading = new Node(this.editor.state.schema.nodes.heading, { level }, [textNode]);
          content.push(heading);
        }
      }
    }

    return content.length > 0 ? content : [
      new Node(this.editor.state.schema.nodes.paragraph, {}, [
        new Node(this.editor.state.schema.nodes.text, {}, [], '')
      ])
    ];
  }

  private render(state: EditorState): void {
    this.nodeToDOM = new WeakMap<Node, HTMLElement>();
    this.domToPath = new WeakMap<HTMLElement, number[]>();
    
    const newDOM = this.renderNode(state.doc, []);
    
    if (newDOM.childNodes.length > 0) {
      this.dom.innerHTML = '';
      for (let i = 0; i < newDOM.childNodes.length; i++) {
        this.dom.appendChild(newDOM.childNodes[i].cloneNode(true));
      }
    }

    queueMicrotask(() => this.restoreSelection(state.selection));
  }

  private renderNode(node: Node, path: number[]): HTMLElement {
    const container = document.createElement('div');
    const isInline = node.type && node.type.name === 'text';
    
    if (!isInline) {
      const tag = this.getTagForNode(node);
      const el = document.createElement(tag);
      
      // Add attributes
      if (node.attrs && node.attrs.level) {
        el.setAttribute('data-level', node.attrs.level);
      }
      if (node.attrs && node.attrs.src) {
        const img = document.createElement('img');
        img.src = node.attrs.src;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        el.appendChild(img);
      }
      
      // Render children
      if (node.content) {
        for (let i = 0; i < node.content.length; i++) {
          const childNode = node.content[i];
          const childPath = [...path, i];
          const childDOM = this.renderNode(childNode, childPath);
          
          for (let j = 0; j < childDOM.childNodes.length; j++) {
            el.appendChild(childDOM.childNodes[j].cloneNode(true));
          }
        }
      } else if (node.text) {
        el.textContent = node.text;
      }
      
      this.nodeToDOM.set(node, el);
      container.appendChild(el);
    } else {
      container.textContent = node.text || '';
    }
    
    return container;
  }

  private getTagForNode(node: Node): string {
    const type = node.type.name;
    const tagMap: { [key: string]: string } = {
      heading: `h${node.attrs?.level || 1}`,
      paragraph: 'p',
      bullet_list: 'ul',
      list_item: 'li',
      table: 'table',
      table_row: 'tr',
      table_cell: 'td',
      image_super: 'figure',
      figcaption: 'figcaption',
    };
    return tagMap[type] || 'div';
  }

  private restoreSelection(selection: Selection): void {
    const sel = window.getSelection();
    if (!sel) return;

    try {
      const firstElement = this.dom.querySelector('p, h1, h2, h3, h4, h5, h6');
      if (firstElement?.firstChild) {
        const range = document.createRange();
        const offset = Math.min(selection.to, (firstElement.firstChild.textContent?.length ?? 0) - 1);
        range.setStart(firstElement.firstChild, Math.max(0, offset));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } catch (e) {
      // Selection restoration failed, continue
    }
  }

  public execCommand(command: string, value?: string): boolean {
    return document.execCommand(command, false, value);
  }

  private onStateChange = (newState: EditorState): void => {
    if (this.isDestroyed || this.isReconciling) return;
    this.render(newState);
  };
  
  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.unsubscribe();
    this.dom.removeEventListener('input', this.handleInput);
    this.dom.removeEventListener('keydown', this.handleKeyDown);
    this.dom.removeEventListener('paste', this.handlePaste);
    this.dom.remove();
  }
}