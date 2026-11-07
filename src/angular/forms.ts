import { ChangeDetectionStrategy, Component, ElementRef, NgZone, computed, forwardRef, inject, input, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { EditorState, Plugin, type EditorConfig, type NodeJSON } from 'fountainjs-editor/core';
import type { EditorViewOptions } from 'fountainjs-editor';
import { createFountain, FountainEditorDirective } from './index.js';

/** An Angular Forms control whose value is portable Fountain document JSON. */
@Component({
  selector: 'fountain-document-field',
  standalone: true,
  imports: [FountainEditorDirective],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FountainDocumentField), multi: true }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(focusout)': 'handleFocusOut($event)' },
  template: '<div [inert]="disabled()" [fountainEditor]="editor()" [fountainOptions]="viewOptions()"></div>',
})
export class FountainDocumentField implements ControlValueAccessor {
  readonly fountainConfig = input.required<Pick<EditorConfig, 'schema' | 'plugins'>>();
  readonly fountainOptions = input<EditorViewOptions>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly disabledState = signal(false);
  private pending: NodeJSON | null = null;
  private writing = false;
  private change: (value: NodeJSON) => void = () => {};
  private touched: () => void = () => {};
  readonly disabled = this.disabledState.asReadonly();
  protected readonly viewOptions = computed(() => {
    const options = this.fountainOptions();
    return this.disabled() ? {
      ...options, attributes: { ...options?.attributes, contenteditable: 'false', tabindex: '-1', 'aria-disabled': 'true' },
    } : options;
  });
  readonly editor = createFountain(() => {
    const { schema, plugins = [] } = this.fountainConfig();
    const content = this.pending ?? undefined;
    this.pending = null;
    return {
      schema, content,
      plugins: [new Plugin({ filterTransaction: tx => this.writing || !this.disabled() || !tx.docChanged }), ...plugins],
      onUpdate: (state, tx) => {
        if (tx.docChanged && !this.writing && !this.disabled()) this.zone.run(() => this.change(state.doc.toJSON()));
      },
    };
  });

  writeValue(value: NodeJSON | null): void {
    const editor = this.editor();
    if (!editor) { this.pending = value; return; }
    const schema = editor.state.schema;
    const next = EditorState.create({ schema, doc: value ? schema.nodeFromJSON(value) : undefined });
    const tx = editor.createTransaction();
    if (!next.doc.eq(editor.state.doc)) tx.replaceDocument(next.doc);
    tx.setSelection(next.selection).setStoredMarks(next.storedMarks)
      .setMeta('content$replace', true).setMeta('addToHistory', false).setMeta('history$reset', true);
    this.writing = true;
    try {
      if (!editor.dispatch(tx)) throw new Error('The Fountain form field rejected the document.');
    } finally { this.writing = false; }
  }

  registerOnChange(change: (value: NodeJSON) => void): void { this.change = change; }
  registerOnTouched(touched: () => void): void { this.touched = touched; }
  setDisabledState(disabled: boolean): void { this.disabledState.set(disabled); }

  protected handleFocusOut(event: FocusEvent): void {
    const host = this.host.nativeElement;
    const NodeClass = host.ownerDocument.defaultView?.Node;
    if (!this.disabled() && !(NodeClass && event.relatedTarget instanceof NodeClass && host.contains(event.relatedTarget))) {
      this.touched();
    }
  }
}
