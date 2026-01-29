import { Editor, Selection } from '../core';

export class InputManager {
  constructor(private editor: Editor, private dom: HTMLElement) {
    this.dom.addEventListener('beforeinput', this.onBeforeInput);
  }

  private onBeforeInput = (event: InputEvent): void => {
    // Let the browser handle complex inputs for now
    if (event.inputType.startsWith('format')) return;

    const { state } = this.editor;
    const { selection } = state;

    // If our selection isn't set, we can't do anything.
    if (!selection || !selection.path) {
      // Allow browser to handle it, but log a warning.
      console.warn("Fountain.js: No selection found, letting browser handle input.");
      return;
    }

    event.preventDefault();
    let tr = state.createTransaction();

    switch (event.inputType) {
      case 'insertText':
        if (event.data) {
          tr.replaceText(selection.path, selection.from, selection.to, event.data);
          tr.setSelection(Selection.createCursor(selection.path, selection.from + event.data.length));
        }
        break;

      case 'deleteContentBackward': // Backspace
        if (selection.isCollapsed) {
          if (selection.from > 0) {
            tr.replaceText(selection.path, selection.from - 1, selection.from, '');
            tr.setSelection(Selection.createCursor(selection.path, selection.from - 1));
          }
        } else {
          // If there's a range selection, delete the whole range.
          tr.replaceText(selection.path, selection.from, selection.to, '');
          tr.setSelection(Selection.createCursor(selection.path, selection.from));
        }
        break;
      
      case 'deleteContentForward': // Delete key
         if (selection.isCollapsed) {
            tr.replaceText(selection.path, selection.from, selection.from + 1, '');
            tr.setSelection(Selection.createCursor(selection.path, selection.from));
        } else {
            tr.replaceText(selection.path, selection.from, selection.to, '');
            tr.setSelection(Selection.createCursor(selection.path, selection.from));
        }
        break;
      
      case 'insertParagraph': // Enter key
        console.log("Enter key pressed - not implemented yet.");
        break;

      default:
        // For any other input type, do nothing and let the browser be prevented.
        console.log(`Unhandled inputType: ${event.inputType}`);
        break;
    }

    if (tr.steps.length > 0) {
      this.editor.dispatch(tr);
    }
  };

  public destroy(): void {
    this.dom.removeEventListener('beforeinput', this.onBeforeInput);
  }
}