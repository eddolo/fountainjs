import {
  deleteSelection,
  insertText,
  joinBackward,
  splitBlock,
  toggleMark,
  type Editor,
  Selection,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import type { SelectionHandler } from './selection-handler';

export class InputManager {
  constructor(
    private readonly editor: Editor,
    private readonly dom: HTMLElement,
    private readonly selections: SelectionHandler,
  ) {
    dom.addEventListener('beforeinput', this.onBeforeInput);
    dom.addEventListener('keydown', this.onKeyDown);
    dom.addEventListener('paste', this.onPaste);
  }

  destroy(): void {
    this.dom.removeEventListener('beforeinput', this.onBeforeInput);
    this.dom.removeEventListener('keydown', this.onKeyDown);
    this.dom.removeEventListener('paste', this.onPaste);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    this.selections.capture();
    for (const plugin of this.editor.state.plugins) {
      if (plugin.spec.props?.handleKeyDown?.(this.editor, event)) return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const mark = modifier && !event.altKey
      ? key === 'b' ? 'strong' : key === 'i' ? 'em' : key === 'u' ? 'underline' : null
      : null;
    if (mark) {
      event.preventDefault();
      toggleMark(this.editor, mark);
    } else if (event.key === 'Tab' && getNodeAtPath(this.editor.state.doc, this.editor.state.selection.path).type.name === 'text') {
      const block = this.editor.state.doc.content[this.editor.state.selection.path[0]];
      if (block?.type.name === 'code_block') {
        event.preventDefault();
        insertText(this.editor, '  ');
      }
    }
  };

  private onBeforeInput = (event: InputEvent): void => {
    if (!this.editor.editable || event.isComposing) return;
    this.selections.capture();
    const { state } = this.editor;
    const selection = state.selection;

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
      splitBlock(this.editor);
      return;
    }

    if (event.inputType === 'insertLineBreak') {
      event.preventDefault();
      insertText(this.editor, '\n');
      return;
    }

    if (event.inputType === 'deleteContentBackward' || event.inputType === 'deleteContentForward') {
      event.preventDefault();
      if (deleteSelection(this.editor)) return;
      const target = getNodeAtPath(state.doc, selection.path);
      const length = target.text?.length ?? 0;
      if (event.inputType === 'deleteContentBackward') {
        if (selection.from === 0) { joinBackward(this.editor); return; }
        const transaction = state.createTransaction()
          .replaceText(selection.path, selection.from - 1, selection.from, '')
          .setSelection(Selection.cursor(selection.path, selection.from - 1));
        this.editor.dispatch(transaction);
      } else if (selection.from < length) {
        const transaction = state.createTransaction()
          .replaceText(selection.path, selection.from, selection.from + 1, '')
          .setSelection(Selection.cursor(selection.path, selection.from));
        this.editor.dispatch(transaction);
      }
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
    if (!this.editor.editable) return;
    const text = event.clipboardData?.getData('text/plain');
    if (text === undefined) return;
    event.preventDefault();
    this.selections.capture();
    insertText(this.editor, text.replace(/\r\n?/g, '\n'));
  };
}
