import {
  deleteBackward,
  deleteForward,
  extendCellSelection,
  insertPlainText,
  insertHardBreak,
  insertDocument,
  insertText,
  indentListItem,
  isInsideNode,
  moveTableCell,
  outdentListItem,
  selectAdjacentNode,
  selectAll,
  setNodeAttributes,
  splitBlock,
  toggleMark,
  type Editor,
  type AnySelection,
  Selection,
} from '../core';
import { HTMLImporter } from '../core/importers/html-importer';
import { getNodeAtPath } from '../core/transaction/path';
import { insertImageFile, type ImageUploadHandler } from './media';
import type { SelectionHandler } from './selection-handler';

function sameMarks(left: readonly import('../core').Mark[], right: readonly import('../core').Mark[]): boolean {
  return left.length === right.length && left.every((mark) => right.some((candidate) => candidate.eq(mark)));
}

export interface InputManagerOptions {
  imageUpload?: ImageUploadHandler;
  maxInlineImageBytes?: number;
  onError?: (error: unknown) => void;
  shouldStopEvent?: (event: Event) => boolean;
}

export class InputManager {
  private compositionSelection?: AnySelection;
  private composingValue = false;

  get composing(): boolean { return this.composingValue; }

  constructor(
    private readonly editor: Editor,
    private readonly dom: HTMLElement,
    private readonly selections: SelectionHandler,
    private readonly options: InputManagerOptions = {},
  ) {
    dom.addEventListener('beforeinput', this.onBeforeInput);
    dom.addEventListener('keydown', this.onKeyDown);
    dom.addEventListener('paste', this.onPaste);
    dom.addEventListener('dragover', this.onDragOver);
    dom.addEventListener('drop', this.onDrop);
    dom.addEventListener('compositionstart', this.onCompositionStart);
    dom.addEventListener('compositionend', this.onCompositionEnd);
    dom.addEventListener('change', this.onChange);
    dom.addEventListener('click', this.onClick);
  }

  destroy(): void {
    this.composingValue = false;
    this.compositionSelection = undefined;
    this.dom.removeEventListener('beforeinput', this.onBeforeInput);
    this.dom.removeEventListener('keydown', this.onKeyDown);
    this.dom.removeEventListener('paste', this.onPaste);
    this.dom.removeEventListener('dragover', this.onDragOver);
    this.dom.removeEventListener('drop', this.onDrop);
    this.dom.removeEventListener('compositionstart', this.onCompositionStart);
    this.dom.removeEventListener('compositionend', this.onCompositionEnd);
    this.dom.removeEventListener('change', this.onChange);
    this.dom.removeEventListener('click', this.onClick);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.options.shouldStopEvent?.(event)) return;
    this.selections.capture();
    for (const plugin of this.editor.state.plugins) {
      if (plugin.spec.props?.handleKeyDown?.(this.editor, event)) {
        event.preventDefault();
        return;
      }
    }
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const mark = modifier && !event.altKey
      ? key === 'b' ? 'strong' : key === 'i' ? 'em' : key === 'u' ? 'underline' : null
      : null;
    if (modifier && !event.altKey && key === 'a') {
      event.preventDefault();
      selectAll(this.editor);
    } else if (event.altKey && event.shiftKey && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
      const direction = key.replace('arrow', '') as 'left' | 'right' | 'up' | 'down';
      if (extendCellSelection(this.editor, direction)) event.preventDefault();
    } else if (!modifier && !event.altKey && !event.shiftKey && (key === 'arrowleft' || key === 'arrowright')) {
      const direction = key === 'arrowleft' ? 'backward' : 'forward';
      if (selectAdjacentNode(this.editor, direction)) event.preventDefault();
    } else if (mark) {
      event.preventDefault();
      toggleMark(this.editor, mark);
    } else if (event.key === 'Tab' && (isInsideNode(this.editor, 'table_cell') || isInsideNode(this.editor, 'table_header'))) {
      event.preventDefault();
      moveTableCell(this.editor, event.shiftKey ? 'previous' : 'next');
    } else if (event.key === 'Tab' && (isInsideNode(this.editor, 'list_item') || isInsideNode(this.editor, 'task_item'))) {
      event.preventDefault();
      if (event.shiftKey) outdentListItem(this.editor);
      else indentListItem(this.editor);
    } else if (event.key === 'Tab' && getNodeAtPath(this.editor.state.doc, this.editor.state.selection.path).type.name === 'text') {
      const block = this.editor.state.doc.content[this.editor.state.selection.path[0]];
      if (block?.type.name === 'code_block') {
        event.preventDefault();
        insertText(this.editor, '  ');
      }
    }
  };

  private onBeforeInput = (event: InputEvent): void => {
    if (this.options.shouldStopEvent?.(event)) return;
    if (!this.editor.editable || event.isComposing) return;
    this.selections.capture();
    const { state } = this.editor;
    const selection = state.selection;
    for (const plugin of state.plugins) {
      if (plugin.spec.props?.handleBeforeInput?.(this.editor, event)) {
        event.preventDefault();
        return;
      }
    }

    if (event.inputType === 'insertText' && event.data) {
      for (const plugin of state.plugins) {
        if (plugin.spec.props?.handleTextInput?.(this.editor, selection.from, selection.to, event.data)) {
          event.preventDefault();
          return;
        }
      }
      event.preventDefault();
      insertText(this.editor, event.data);
      return;
    }

    if (event.inputType === 'insertParagraph') {
      event.preventDefault();
      if (selection.kind !== 'text') {
        insertText(this.editor, '');
        return;
      }
      const textBlock = getNodeAtPath(state.doc, selection.path.slice(0, -1));
      if (textBlock.type.spec.code) insertText(this.editor, '\n');
      else splitBlock(this.editor);
      return;
    }

    if (event.inputType === 'insertLineBreak') {
      event.preventDefault();
      const textBlock = getNodeAtPath(state.doc, selection.path.slice(0, -1));
      if (textBlock.type.spec.code) insertText(this.editor, '\n');
      else insertHardBreak(this.editor);
      return;
    }

    if (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') {
      event.preventDefault();
      if (event.inputType === 'deleteContentBackward') deleteBackward(this.editor);
      else deleteForward(this.editor);
      return;
    }

    const formatMap: Record<string, string> = { formatBold: 'strong', formatItalic: 'em', formatUnderline: 'underline', formatStrikeThrough: 'strike' };
    const mark = formatMap[event.inputType];
    if (mark) {
      event.preventDefault();
      toggleMark(this.editor, mark);
    }
  };

  private onPaste = (event: ClipboardEvent): void => {
    if (this.options.shouldStopEvent?.(event)) return;
    if (!this.editor.editable) return;
    this.selections.capture();
    for (const plugin of this.editor.state.plugins) {
      if (plugin.spec.props?.handlePaste?.(this.editor, event)) {
        event.preventDefault();
        return;
      }
    }
    const images = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
    if (images.length) {
      event.preventDefault();
      void this.insertImages(images);
      return;
    }
    const html = event.clipboardData?.getData('text/html');
    if (html?.trim()) {
      try {
        const document = HTMLImporter.parse(html, this.editor.state.schema);
        event.preventDefault();
        if (insertDocument(this.editor, document)) return;
      } catch (error) {
        this.options.onError?.(error);
      }
    }
    const text = event.clipboardData?.getData('text/plain');
    if (text === undefined) return;
    event.preventDefault();
    this.editor.runCommandBatch(() => insertPlainText(this.editor, text));
  };

  private onCompositionStart = (event: CompositionEvent): void => {
    if (this.options.shouldStopEvent?.(event)) return;
    this.composingValue = true;
    this.selections.capture();
    this.compositionSelection = this.editor.state.selection;
  };

  private onCompositionEnd = (event: CompositionEvent): void => {
    this.composingValue = false;
    if (this.options.shouldStopEvent?.(event)) {
      this.compositionSelection = undefined;
      return;
    }
    const selection = this.compositionSelection;
    this.compositionSelection = undefined;
    if (!selection || !event.data) return;
    if (selection.kind !== 'text') {
      insertText(this.editor, event.data);
      return;
    }
    const { state } = this.editor;
    const transaction = state.createTransaction();
    const target = getNodeAtPath(state.doc, selection.path);
    let landingPath = selection.path;
    let landingOffset = selection.from + event.data.length;
    if (selection.isCollapsed && target.isText && !sameMarks(target.marks, state.storedMarks)) {
      const value = target.text ?? '';
      const index = selection.path.at(-1) as number;
      landingPath = [...selection.path.slice(0, -1), index + (selection.from > 0 ? 1 : 0)];
      landingOffset = event.data.length;
      transaction.replaceNode(selection.path, [
        ...(selection.from ? [target.withText(value.slice(0, selection.from))] : []),
        state.schema.text(event.data, state.storedMarks),
        ...(selection.from < value.length ? [target.withText(value.slice(selection.from))] : []),
      ]);
    } else if (selection.isSingleText) transaction.replaceText(selection.path, selection.from, selection.to, event.data);
    else transaction.replaceTextRange(selection.path, selection.from, selection.endPath, selection.to, event.data);
    transaction.setStoredMarks(state.storedMarks).setSelection(Selection.cursor(landingPath, landingOffset));
    this.editor.dispatch(transaction);
  };

  private onChange = (event: Event): void => {
    if (this.options.shouldStopEvent?.(event)) return;
    const input = event.target instanceof HTMLInputElement
      ? event.target.closest<HTMLInputElement>('input[data-fountain-task-toggle]')
      : null;
    const item = input?.closest<HTMLElement>('[data-fountain-node="task_item"][data-fountain-path]');
    if (!input || !item) return;
    const path = (item.dataset.fountainPath ?? '').split('.').filter(Boolean).map(Number);
    setNodeAttributes(this.editor, path, { checked: input.checked });
  };

  private onClick = (event: MouseEvent): void => {
    if (this.options.shouldStopEvent?.(event)) return;
    for (const plugin of this.editor.state.plugins) {
      if (plugin.spec.props?.handleClick?.(this.editor, event)) {
        event.preventDefault();
        return;
      }
    }
  };

  private onDragOver = (event: DragEvent): void => {
    if (this.options.shouldStopEvent?.(event)) return;
    if (this.editor.editable && Array.from(event.dataTransfer?.items ?? []).some((item) => item.kind === 'file' && item.type.startsWith('image/'))) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }
  };

  private onDrop = (event: DragEvent): void => {
    if (this.options.shouldStopEvent?.(event)) return;
    if (!this.editor.editable) return;
    for (const plugin of this.editor.state.plugins) {
      if (plugin.spec.props?.handleDrop?.(this.editor, event)) {
        event.preventDefault();
        return;
      }
    }
    const images = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    event.preventDefault();
    this.placeCaret(event.clientX, event.clientY);
    this.selections.capture();
    void this.insertImages(images);
  };

  private placeCaret(x: number, y: number): void {
    const documentWithCaret = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const position = documentWithCaret.caretPositionFromPoint?.(x, y);
    const range = position ? document.createRange() : documentWithCaret.caretRangeFromPoint?.(x, y);
    if (position && range) {
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
    }
    if (!range) return;
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  private async insertImages(files: readonly File[]): Promise<void> {
    try {
      for (const file of files) {
        await insertImageFile(this.editor, file, {
          upload: this.options.imageUpload,
          maxInlineBytes: this.options.maxInlineImageBytes,
        });
      }
    } catch (error) {
      this.options.onError?.(error);
      const event = new CustomEvent('fountain-error', { bubbles: true, cancelable: true, detail: error });
      this.dom.dispatchEvent(event);
    }
  }
}
