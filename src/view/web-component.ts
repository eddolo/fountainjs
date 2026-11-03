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
  required: boolean;
  readonly labels: NodeListOf<HTMLLabelElement> | null;
  readonly validity: ValidityState | null;
  readonly validationMessage: string;
  readonly willValidate: boolean;
  checkValidity(): boolean;
  reportValidity(): boolean;
  setCustomValidity(message: string): void;
  focusEditor(position?: EditorFocusPosition): void;
}

export interface RegisterFountainElementOptions {
  /** Opt in to native FormData, validation, labels, reset, state restoration and fieldset disabling. */
  formAssociated?: boolean;
  /** Localized required-content message for form-associated editors. */
  requiredMessage?: string;
  /** Override emptiness only, not schema validation or server authorization.
   * Default: non-whitespace text or a non-break atom counts as content.
   * Throws/non-boolean results fail native constraint validation closed. */
  isFormValueEmpty?: (value: NodeJSON | undefined) => boolean;
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
    static observedAttributes = ['disabled', 'required', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-errormessage', 'id'];
    private currentEditor?: Editor;
    private view?: EditorView;
    private unsubscribe?: () => void;
    private pendingValue?: NodeJSON;
    private initialValue?: NodeJSON;
    private internals?: ElementInternals;
    private formDisabled = false;
    private settingValue = false;
    private customValidity = '';
    private labelObserver?: MutationObserver;
    private validationAnchor?: HTMLSpanElement;

    constructor() {
      super();
      if (options.formAssociated) {
        this.internals = this.attachInternals();
        if (typeof this.internals.setFormValue !== 'function' || typeof this.internals.setValidity !== 'function') {
          throw new Error('Form-associated Fountain editors require native ElementInternals form-value and validation support.');
        }
      }
      this.addEventListener('click', event => {
        // Native label activation dispatches a click at its associated host.
        if (this.internals && event.target === this) this.focusEditor();
      });
      this.addEventListener('focus', event => {
        if (this.internals && event.target === this) this.forwardNativeFocus();
      });
      this.addEventListener('focusin', () => this.syncLabel());
    }

    get form(): HTMLFormElement | null { return this.internals?.form ?? null; }
    get name(): string { return this.getAttribute('name') ?? ''; }
    set name(value: string) { this.setAttribute('name', value); }
    get disabled(): boolean { return this.hasAttribute('disabled'); }
    set disabled(value: boolean) { this.toggleAttribute('disabled', Boolean(value)); }
    get required(): boolean { return this.hasAttribute('required'); }
    set required(value: boolean) { this.toggleAttribute('required', Boolean(value)); }
    get labels(): NodeListOf<HTMLLabelElement> | null {
      // The HTML contract contains associated label elements; lib.dom exposes
      // ElementInternals.labels only as the less specific NodeList.
      return (this.internals?.labels ?? null) as NodeListOf<HTMLLabelElement> | null;
    }
    get validity(): ValidityState | null { return this.internals?.validity ?? null; }
    get validationMessage(): string { return this.internals?.validationMessage ?? ''; }
    get willValidate(): boolean { return this.internals?.willValidate ?? false; }
    checkValidity(): boolean { return this.internals?.checkValidity() ?? true; }
    reportValidity(): boolean { return this.internals?.reportValidity() ?? true; }
    setCustomValidity(message: string): void {
      if (!this.internals) throw new DOMException('Native validation requires formAssociated: true.', 'NotSupportedError');
      this.customValidity = String(message);
      this.syncFormValidity();
    }
    private get effectivelyDisabled(): boolean { return this.disabled || this.formDisabled; }

    private forwardNativeFocus(): void {
      // Finish the browser's native focus operation before forwarding it.
      // Synchronous redirection leaves Firefox FACE validation focus stale on
      // subsequent invalid submissions. Do not override another listener's focus.
      queueMicrotask(() => {
        const active = this.ownerDocument.activeElement;
        if (active === this || active === this.validationAnchor) this.focusEditor();
      });
    }

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
      this.syncFormValidity(value);
    }

    private syncFormValidity(value?: NodeJSON): void {
      if (!this.internals) return;
      let valueMissing = false, failed = '';
      if (this.required && !this.effectivelyDisabled) {
        try {
          const current = value ?? this.value;
          const hasContent = (node: NodeJSON | undefined): boolean => Boolean(node && (
            node.type === 'text' ? /\S/u.test(node.text ?? '')
              : (options.schema ?? CoreSchemaSpec).nodes[node.type]?.atom && node.type !== 'hard_break'
                || node.content?.some(hasContent)
          ));
          const empty = options.isFormValueEmpty ? options.isFormValueEmpty(current) : !hasContent(current);
          if (typeof empty !== 'boolean') throw new TypeError('isFormValueEmpty must return a boolean.');
          valueMissing = empty;
        } catch (error) {
          failed = 'This document could not be validated.';
          try { options.onError?.(error); } catch { /* An observer cannot bypass validation. */ }
        }
      }
      const message = this.customValidity || failed;
      const flags = { valueMissing, customError: Boolean(message) };
      const text = message || (valueMissing ? options.requiredMessage || 'Please enter content.' : '');
      // Keep browser-owned validation UI outside the document renderer. Some
      // WebKit ports attach a UA shadow tree to the anchor, hiding its light
      // children. An empty sibling lets native reporting leave the editor intact.
      this.internals.setValidity(flags, text, this.validationAnchor ?? this);
      this.view?.dom.setAttribute('aria-required', String(this.required));
      this.view?.dom.setAttribute('aria-invalid', String(!this.effectivelyDisabled && !this.internals.validity.valid));
    }

    private editorLabel(): string {
      const text = (node: globalThis.Node): string => node === this ? ''
        : node.nodeType === globalThis.Node.TEXT_NODE ? node.textContent ?? ''
          : Array.from(node.childNodes).map(text).join('');
      return this.getAttribute('aria-label') ?? options.ariaLabel
        ?? (Array.from(this.labels ?? []).map(label => text(label).trim()).filter(Boolean).join(' ')
          || 'Rich text editor');
    }

    private syncLabel(): void {
      if (!this.view) return;
      this.view.dom.setAttribute('aria-label', this.editorLabel());
      const labelledBy = this.getAttribute('aria-labelledby');
      for (const name of ['aria-labelledby', 'aria-describedby', 'aria-errormessage']) {
        const value = this.getAttribute(name);
        if (value === null) this.view.dom.removeAttribute(name);
        else this.view.dom.setAttribute(name, value);
      }
      this.labelObserver?.disconnect();
      if (!this.internals || this.hasAttribute('aria-label') || options.ariaLabel !== undefined || labelledBy !== null) return;
      this.labelObserver ??= new MutationObserver(records => {
        if (records.some(record => !this.contains(record.target))) this.syncLabel();
      });
      for (const label of this.labels ?? []) this.labelObserver.observe(label, {
        childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['for'],
      });
    }

    private syncDisabled(): void {
      if (this.view) {
        this.view.dom.contentEditable = this.effectivelyDisabled ? 'false' : 'true';
        this.view.dom.inert = this.effectivelyDisabled;
        this.view.dom.setAttribute('aria-disabled', String(this.effectivelyDisabled));
      }
      this.syncFormValidity();
    }

    attributeChangedCallback(name: string): void {
      if (name === 'disabled') this.syncDisabled();
      else if (name === 'required') this.syncFormValidity();
      else this.syncLabel();
    }
    formAssociatedCallback(): void { this.syncLabel(); }
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
      // Native validation may focus the FACE host before its explicit anchor.
      // Make it programmatically focusable without adding a second Tab stop.
      if (this.internals && !this.hasAttribute('tabindex')) this.tabIndex = -1;
      if (this.internals) {
        this.validationAnchor = document.createElement('span');
        this.validationAnchor.dataset.fountainFormValidationAnchor = '';
        this.validationAnchor.tabIndex = -1;
        this.validationAnchor.style.cssText = 'position:relative;display:block;height:1px;margin-bottom:-1px;pointer-events:none';
        this.validationAnchor.addEventListener('focus', () => this.forwardNativeFocus());
        this.prepend(this.validationAnchor);
      }
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
        ariaLabel: this.editorLabel(),
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
      this.syncLabel();
    }

    disconnectedCallback(): void {
      this.pendingValue = this.currentEditor?.getJSON() ?? this.pendingValue;
      this.unsubscribe?.();
      this.labelObserver?.disconnect();
      this.view?.destroy();
      this.validationAnchor?.remove();
      this.validationAnchor = undefined;
      this.currentEditor?.destroy();
      this.unsubscribe = undefined;
      this.view = undefined;
      this.currentEditor = undefined;
    }

    focusEditor(position: EditorFocusPosition = 'current'): void {
      if (this.effectivelyDisabled) return;
      this.syncLabel();
      this.view?.focus(position);
    }
  }

  globalThis.customElements.define(tagName, FountainElement);
  return FountainElement;
}
