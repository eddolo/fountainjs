import type { NodeJSON, Plugin, SchemaSpec, Transaction } from '../core';
import { createEditor, setContent, type Editor, type EditorState } from '../core';
import { CoreSchemaSpec } from '../extensions';
import { EditorView } from './view';

export interface FountainElementChangeDetail {
  state: EditorState;
  transaction: Transaction;
  value: NodeJSON;
}

export interface FountainEditorElement extends HTMLElement {
  readonly editor?: Editor;
  value: NodeJSON | undefined;
  focusEditor(position?: 'start' | 'end'): void;
}

export interface RegisterFountainElementOptions {
  tagName?: `${string}-${string}`;
  schema?: SchemaSpec;
  plugins?: readonly Plugin<any>[];
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * Registers a Web Component that can be consumed by plain HTML, React, Vue,
 * Svelte, Angular, or any other framework that can render a custom element.
 */
export function registerFountainElement(
  options: RegisterFountainElementOptions = {},
): CustomElementConstructor {
  if (!globalThis.customElements || !globalThis.HTMLElement) {
    throw new Error('registerFountainElement() requires a browser Custom Elements environment.');
  }
  const tagName = options.tagName ?? 'fountain-editor';
  const registered = globalThis.customElements.get(tagName);
  if (registered) return registered;

  class FountainElement extends HTMLElement implements FountainEditorElement {
    private currentEditor?: Editor;
    private view?: EditorView;
    private unsubscribe?: () => void;
    private pendingValue?: NodeJSON;

    get editor(): Editor | undefined { return this.currentEditor; }

    get value(): NodeJSON | undefined {
      return this.currentEditor?.getJSON() ?? this.pendingValue;
    }

    set value(value: NodeJSON | undefined) {
      this.pendingValue = value;
      if (value && this.currentEditor) {
        setContent(this.currentEditor, this.currentEditor.state.schema.nodeFromJSON(value));
      }
    }

    connectedCallback(): void {
      if (this.currentEditor) return;
      const attributeValue = this.getAttribute('value');
      if (!this.pendingValue && attributeValue) {
        try { this.pendingValue = JSON.parse(attributeValue) as NodeJSON; }
        catch { throw new Error('The fountain-editor value attribute must contain valid document JSON.'); }
      }
      this.currentEditor = createEditor({
        schema: options.schema ?? CoreSchemaSpec,
        content: this.pendingValue,
        plugins: options.plugins,
      });
      this.view = new EditorView(this, this.currentEditor, {
        placeholder: this.getAttribute('placeholder') ?? options.placeholder,
        ariaLabel: this.getAttribute('aria-label') ?? options.ariaLabel ?? 'Rich text editor',
      });
      this.unsubscribe = this.currentEditor.subscribe((state, transaction) => {
        this.pendingValue = state.doc.toJSON();
        this.dispatchEvent(new CustomEvent<FountainElementChangeDetail>('fountain-change', {
          bubbles: true,
          composed: true,
          detail: { state, transaction, value: this.pendingValue },
        }));
      });
    }

    disconnectedCallback(): void {
      this.pendingValue = this.currentEditor?.getJSON() ?? this.pendingValue;
      this.unsubscribe?.();
      this.view?.destroy();
      this.currentEditor?.destroy();
      this.unsubscribe = undefined;
      this.view = undefined;
      this.currentEditor = undefined;
    }

    focusEditor(position: 'start' | 'end' = 'end'): void {
      this.view?.focus(position);
    }
  }

  globalThis.customElements.define(tagName, FountainElement);
  return FountainElement;
}
