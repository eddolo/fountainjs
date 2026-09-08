import type { NodeJSON, SchemaSpec, Transaction } from '../core';
import { createEditor, Plugin, type Editor, type EditorState } from '../core';
import { CoreSchemaSpec, COLLABORATION_REMOTE_META } from '../extensions';
import type { AssetUploadHandler, ImageUploadHandler } from './media';
import type { BlockHandleOptions } from './block-handles';
import type { DropCursorOptions } from './drop-cursor';
import type { ExternalPasteOptions } from './paste';
import { EditorView, type EditorFocusPosition, type EditorViewVirtualizationOptions } from './view';

export interface FountainElementChangeDetail {
  state: EditorState;
  transaction: Transaction;
  value: NodeJSON;
}

export interface FountainEditorElement extends HTMLElement {
  readonly editor?: Editor;
  value: NodeJSON | undefined;
  /** Native form association is enabled by the registration's formAssociated option. */
  readonly form: HTMLFormElement | null;
  name: string;
  disabled: boolean;
  focusEditor(position?: EditorFocusPosition): void;
}

export interface RegisterFountainElementOptions {
  /** Opt in to native FormData submission, reset, state restoration and fieldset disabling. */
  formAssociated?: boolean;
  tagName?: `${string}-${string}`;
  schema?: SchemaSpec;
  plugins?: readonly Plugin<any>[];
  placeholder?: string;
  ariaLabel?: string;
  imageUpload?: ImageUploadHandler;
  assetUpload?: AssetUploadHandler;
  maxInlineImageBytes?: number;
  blockHandles?: boolean | BlockHandleOptions;
  dropCursor?: boolean | DropCursorOptions;
  virtualization?: boolean | EditorViewVirtualizationOptions;
  onError?: (error: unknown) => void;
  paste?: ExternalPasteOptions;
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
    static formAssociated = options.formAssociated === true;
    static observedAttributes = ['disabled'];
    private currentEditor?: Editor;
    private view?: EditorView;
    private unsubscribe?: () => void;
    private pendingValue?: NodeJSON;
    private initialValue?: NodeJSON;
    private internals?: ElementInternals;
    private formDisabled = false;
    private settingValue = false;

    constructor() {
      super();
      if (options.formAssociated) {
        this.internals = this.attachInternals();
        if (typeof this.internals.setFormValue !== 'function') {
          throw new Error('Form-associated Fountain editors require ElementInternals.setFormValue support.');
        }
      }
    }

    get form(): HTMLFormElement | null { return this.internals?.form ?? null; }
    get name(): string { return this.getAttribute('name') ?? ''; }
    set name(value: string) { this.setAttribute('name', value); }
    get disabled(): boolean { return this.hasAttribute('disabled'); }
    set disabled(value: boolean) { this.toggleAttribute('disabled', Boolean(value)); }
    private get effectivelyDisabled(): boolean { return this.disabled || this.formDisabled; }

    get editor(): Editor | undefined { return this.currentEditor; }

    get value(): NodeJSON | undefined {
      return this.currentEditor?.getJSON() ?? this.pendingValue;
    }

    set value(value: NodeJSON | undefined) {
      if (value && this.currentEditor) {
        const document = this.currentEditor.state.schema.nodeFromJSON(value);
        this.settingValue = true;
        try {
          if (!this.currentEditor.dispatch(this.currentEditor.createTransaction().replaceDocument(document)
            .setMeta('content$replace', true)) && !document.eq(this.currentEditor.state.doc)) {
            throw new Error('The Fountain editor rejected the new document.');
          }
        } finally { this.settingValue = false; }
        this.pendingValue = this.currentEditor.getJSON();
      } else this.pendingValue = value;
      this.syncFormValue();
    }

    private syncFormValue(): void {
      if (!this.internals) return;
      const value = this.value;
      const serialized = value ? JSON.stringify(value) : null;
      this.internals?.setFormValue(serialized, serialized);
    }

    private syncDisabled(): void {
      if (!this.view) return;
      this.view.dom.contentEditable = this.effectivelyDisabled ? 'false' : 'true';
      this.view.dom.inert = this.effectivelyDisabled;
      this.view.dom.setAttribute('aria-disabled', String(this.effectivelyDisabled));
    }

    attributeChangedCallback(): void { this.syncDisabled(); }
    formDisabledCallback(disabled: boolean): void {
      this.formDisabled = disabled;
      this.syncDisabled();
    }
    formResetCallback(): void {
      const attribute = this.getAttribute('value');
      this.value = attribute ? JSON.parse(attribute) as NodeJSON : this.initialValue;
    }
    formStateRestoreCallback(state: string | File | FormData): void {
      if (typeof state !== 'string') throw new TypeError('Fountain form state must be serialized document JSON.');
      this.value = JSON.parse(state) as NodeJSON;
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
        plugins: [new Plugin({ filterTransaction: transaction => this.settingValue
          || !this.effectivelyDisabled || !transaction.docChanged
          || transaction.getMeta(COLLABORATION_REMOTE_META) === true }), ...(options.plugins ?? [])],
      });
      this.initialValue ??= this.currentEditor.getJSON();
      this.view = new EditorView(this, this.currentEditor, {
        placeholder: this.getAttribute('placeholder') ?? options.placeholder,
        ariaLabel: this.getAttribute('aria-label') ?? options.ariaLabel ?? 'Rich text editor',
        imageUpload: options.imageUpload,
        assetUpload: options.assetUpload,
        maxInlineImageBytes: options.maxInlineImageBytes,
        blockHandles: options.blockHandles,
        dropCursor: options.dropCursor,
        virtualization: options.virtualization,
        onError: options.onError,
        paste: options.paste,
      });
      this.unsubscribe = this.currentEditor.subscribe((state, transaction) => {
        this.pendingValue = state.doc.toJSON();
        if (transaction.docChanged) this.syncFormValue();
        this.dispatchEvent(new CustomEvent<FountainElementChangeDetail>('fountain-change', {
          bubbles: true,
          composed: true,
          detail: { state, transaction, value: this.pendingValue },
        }));
      });
      this.syncFormValue();
      this.syncDisabled();
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

    focusEditor(position: EditorFocusPosition = 'current'): void {
      this.view?.focus(position);
    }
  }

  globalThis.customElements.define(tagName, FountainElement);
  return FountainElement;
}
