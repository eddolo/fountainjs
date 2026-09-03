import { setBlockType, toggleMark, type Editor, type EditorState } from '../core';
import { renderDocument } from './dom-renderer';
import { InputManager } from './input';
import { SelectionHandler } from './selection-handler';

export interface EditorViewOptions {
  ariaLabel?: string;
  className?: string;
  placeholder?: string;
  attributes?: Record<string, string>;
}

export class EditorView {
  readonly dom: HTMLDivElement;
  private readonly selections: SelectionHandler;
  private readonly input: InputManager;
  private readonly unsubscribe: () => void;
  private destroyed = false;

  constructor(public readonly mount: HTMLElement, public readonly editor: Editor, options: EditorViewOptions = {}) {
    this.dom = document.createElement('div');
    this.dom.className = ['fountain-editor', options.className].filter(Boolean).join(' ');
    this.dom.contentEditable = editor.editable ? 'true' : 'false';
    this.dom.setAttribute('role', 'textbox');
    this.dom.setAttribute('aria-multiline', 'true');
    this.dom.setAttribute('aria-label', options.ariaLabel ?? 'Rich text editor');
    this.dom.setAttribute('spellcheck', 'true');
    if (options.placeholder) this.dom.dataset.placeholder = options.placeholder;
    Object.entries(options.attributes ?? {}).forEach(([name, value]) => {
      if (!/^on/i.test(name)) this.dom.setAttribute(name, value);
    });
    mount.appendChild(this.dom);
    renderDocument(this.dom, editor.state.doc);
    this.selections = new SelectionHandler(editor, this.dom);
    this.input = new InputManager(editor, this.dom, this.selections);
    this.unsubscribe = editor.subscribe(this.onStateChange);
  }

  focus(position: 'start' | 'end' = 'end'): void {
    this.dom.focus();
    if (position === 'end') this.selections.sync(this.editor.state.selection);
  }

  execCommand(command: string, value?: string): boolean {
    if (command === 'bold') return toggleMark(this.editor, 'strong');
    if (command === 'italic') return toggleMark(this.editor, 'em');
    if (command === 'underline') return toggleMark(this.editor, 'underline');
    if (command === 'formatBlock' && value) return setBlockType(this.editor, value.replace(/[<>]/g, '').toLowerCase());
    return false;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    this.input.destroy();
    this.selections.destroy();
    this.dom.remove();
  }

  private onStateChange = (state: EditorState, transaction: import('../core').Transaction): void => {
    if (this.destroyed) return;
    if (transaction.docChanged) renderDocument(this.dom, state.doc);
    queueMicrotask(() => this.selections.sync(state.selection));
  };
}
