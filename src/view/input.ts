import {
  deleteBackward,
  deleteForward,
  deleteSelection,
  extendCellSelection,
  insertPlainText,
  insertHardBreak,
  insertDocument,
  insertText,
  indentListItem,
  isInsideNode,
  moveTableCell,
  moveBlock,
  outdentListItem,
  selectAdjacentNode,
  selectAll,
  setNodeAttributes,
  splitBlock,
  toggleMark,
  pasteTableCells,
  serializeTableSelection,
  type Editor,
  type AnySelection,
  NodeSelection,
  CellSelection,
  Selection,
} from '../core';
import { HTMLImporter } from '../core/importers/html-importer';
import { getNodeAtPath } from '../core/transaction/path';
import { redo, setHistoryGroup, undo } from '../extensions/plugins/history';
import {
  insertAssetFile,
  insertImageFile,
  type AssetUploadHandler,
  type ImageUploadHandler,
} from './media';
import {
  FOUNTAIN_LEGACY_BLOCK_DRAG_TYPE,
  FOUNTAIN_NODE_DRAG_TYPE,
  type BlockHandleManager,
} from './block-handles';
import type { SelectionHandler } from './selection-handler';

function sameMarks(left: readonly import('../core').Mark[], right: readonly import('../core').Mark[]): boolean {
  return left.length === right.length && left.every((mark) => right.some((candidate) => candidate.eq(mark)));
}

export interface InputManagerOptions {
  imageUpload?: ImageUploadHandler;
  assetUpload?: AssetUploadHandler;
  maxInlineImageBytes?: number;
  onError?: (error: unknown) => void;
  shouldStopEvent?: (event: Event) => boolean;
  blockHandles?: BlockHandleManager;
}

export class InputManager {
  private compositionSelection?: AnySelection;
  private compositionHandled = false;
  private composingValue = false;
  private draggedNodePath?: readonly number[];
  private suppressNativeDragDeleteUntil = 0;

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
    dom.addEventListener('copy', this.onCopy);
    dom.addEventListener('cut', this.onCut);
    dom.addEventListener('dragover', this.onDragOver);
    dom.addEventListener('dragstart', this.onDragStart);
    dom.addEventListener('dragend', this.onDragEnd);
    dom.addEventListener('drop', this.onDrop);
    dom.addEventListener('compositionstart', this.onCompositionStart);
    dom.addEventListener('compositionend', this.onCompositionEnd);
    dom.addEventListener('change', this.onChange);
    dom.addEventListener('click', this.onClick);
  }

  destroy(): void {
    this.composingValue = false;
    this.compositionSelection = undefined;
    this.compositionHandled = false;
    this.draggedNodePath = undefined;
    this.suppressNativeDragDeleteUntil = 0;
    this.dom.removeEventListener('beforeinput', this.onBeforeInput);
    this.dom.removeEventListener('keydown', this.onKeyDown);
    this.dom.removeEventListener('paste', this.onPaste);
    this.dom.removeEventListener('copy', this.onCopy);
    this.dom.removeEventListener('cut', this.onCut);
    this.dom.removeEventListener('dragover', this.onDragOver);
    this.dom.removeEventListener('dragstart', this.onDragStart);
    this.dom.removeEventListener('dragend', this.onDragEnd);
    this.dom.removeEventListener('drop', this.onDrop);
    this.dom.removeEventListener('compositionstart', this.onCompositionStart);
    this.dom.removeEventListener('compositionend', this.onCompositionEnd);
    this.dom.removeEventListener('change', this.onChange);
    this.dom.removeEventListener('click', this.onClick);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.options.shouldStopEvent?.(event)) return;
    this.selections.requestDOMSync();
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
    } else if (!modifier && !event.altKey && !event.isComposing && (key === 'backspace' || key === 'delete')) {
      const backward = key === 'backspace';
      const handled = this.runGroupedInput(
        backward ? 'delete-backward' : 'delete-forward',
        () => backward ? deleteBackward(this.editor) : deleteForward(this.editor),
      );
      if (handled) event.preventDefault();
    } else if (event.key === 'Tab' && (isInsideNode(this.editor, 'table_cell') || isInsideNode(this.editor, 'table_header'))) {
      event.preventDefault();
      moveTableCell(this.editor, event.shiftKey ? 'previous' : 'next');
    } else if (event.key === 'Tab' && (isInsideNode(this.editor, 'list_item') || isInsideNode(this.editor, 'task_item'))) {
      const handled = event.shiftKey ? outdentListItem(this.editor) : indentListItem(this.editor);
      if (handled) event.preventDefault();
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
    if (!this.editor.editable) return;
    this.selections.requestDOMSync();
    if (event.inputType === 'insertCompositionText' && event.isComposing) return;
    if (event.inputType === 'insertFromComposition' || event.inputType === 'insertCompositionText') {
      event.preventDefault();
      this.commitComposition(event.data ?? '');
      return;
    }
    if (event.isComposing) return;
    this.selections.capture();
    const { state } = this.editor;
    const selection = state.selection;
    for (const plugin of state.plugins) {
      if (plugin.spec.props?.handleBeforeInput?.(this.editor, event)) {
        event.preventDefault();
        return;
      }
    }

    if ((event.inputType === 'insertText' || event.inputType === 'insertReplacementText') && event.data !== null) {
      for (const plugin of state.plugins) {
        if (plugin.spec.props?.handleTextInput?.(this.editor, selection.from, selection.to, event.data)) {
          event.preventDefault();
          return;
        }
      }
      event.preventDefault();
      this.runGroupedInput('typing', () => event.data ? insertText(this.editor, event.data) : deleteSelection(this.editor));
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

    const backwardDeletes = new Set(['deleteContentBackward']);
    const forwardDeletes = new Set(['deleteContentForward']);
    if (backwardDeletes.has(event.inputType) || forwardDeletes.has(event.inputType)) {
      event.preventDefault();
      if (backwardDeletes.has(event.inputType)) this.runGroupedInput('delete-backward', () => deleteBackward(this.editor));
      else this.runGroupedInput('delete-forward', () => deleteForward(this.editor));
      return;
    }

    if (event.inputType === 'deleteByDrag' && Date.now() <= this.suppressNativeDragDeleteUntil) {
      // WebKit can emit its native source deletion during an internal block drag.
      // The model transaction owns the move, so accepting that deletion as well
      // would either remove the source before drop or delete it a second time.
      event.preventDefault();
      this.suppressNativeDragDeleteUntil = 0;
      return;
    }

    if (event.inputType === 'deleteByCut' || event.inputType === 'deleteByDrag') {
      event.preventDefault();
      this.runGroupedInput(event.inputType, () => deleteSelection(this.editor));
      return;
    }

    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault();
      if (event.inputType === 'historyUndo') undo(this.editor);
      else redo(this.editor);
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
    this.selections.requestDOMSync();
    if (this.options.shouldStopEvent?.(event)) return;
    if (!this.editor.editable) return;
    this.selections.capture();
    for (const plugin of this.editor.state.plugins) {
      if (plugin.spec.props?.handlePaste?.(this.editor, event)) {
        event.preventDefault();
        return;
      }
    }
    const text = event.clipboardData?.getData('text/plain');
    if (this.editor.state.selection instanceof CellSelection && text !== undefined && pasteTableCells(this.editor, text)) {
      event.preventDefault();
      return;
    }
    const files = Array.from(event.clipboardData?.files ?? [])
      .filter((file) => file.type.startsWith('image/') || Boolean(this.options.assetUpload));
    if (files.length) {
      event.preventDefault();
      void this.insertFiles(files);
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
    if (text === undefined) return;
    event.preventDefault();
    this.editor.runCommandBatch(() => insertPlainText(this.editor, text));
  };

  private writeCellSelection(event: ClipboardEvent): boolean {
    const selection = this.editor.state.selection;
    if (!(selection instanceof CellSelection) || !event.clipboardData) return false;
    const serialized = serializeTableSelection(this.editor.state.doc, selection);
    if (!serialized) return false;
    event.clipboardData.setData('text/plain', serialized.text);
    event.clipboardData.setData('text/html', serialized.html);
    event.preventDefault();
    return true;
  }

  private onCopy = (event: ClipboardEvent): void => {
    if (this.options.shouldStopEvent?.(event)) return;
    for (const plugin of this.editor.state.plugins) {
      if (plugin.spec.props?.handleCopy?.(this.editor, event)) {
        event.preventDefault();
        return;
      }
    }
    this.writeCellSelection(event);
  };

  private onCut = (event: ClipboardEvent): void => {
    this.selections.requestDOMSync();
    if (this.options.shouldStopEvent?.(event) || !this.editor.editable) return;
    for (const plugin of this.editor.state.plugins) {
      if (plugin.spec.props?.handleCut?.(this.editor, event)) {
        event.preventDefault();
        return;
      }
    }
    if (this.writeCellSelection(event)) deleteSelection(this.editor);
  };

  private onCompositionStart = (event: CompositionEvent): void => {
    if (this.options.shouldStopEvent?.(event)) return;
    this.composingValue = true;
    this.compositionHandled = false;
    this.selections.capture();
    this.compositionSelection = this.editor.state.selection;
  };

  private onCompositionEnd = (event: CompositionEvent): void => {
    this.selections.requestDOMSync();
    this.composingValue = false;
    if (this.options.shouldStopEvent?.(event)) {
      this.compositionSelection = undefined;
      this.compositionHandled = false;
      return;
    }
    this.commitComposition(event.data);
  };

  private commitComposition(data: string): boolean {
    const selection = this.compositionSelection;
    if (this.compositionHandled || !selection || !data) return false;
    if (selection.kind !== 'text') {
      const inserted = this.runGroupedInput('composition', () => insertText(this.editor, data));
      if (inserted) {
        this.compositionHandled = true;
        this.compositionSelection = undefined;
      }
      return inserted;
    }
    const { state } = this.editor;
    const transaction = state.createTransaction();
    const target = getNodeAtPath(state.doc, selection.path);
    let landingPath = selection.path;
    let landingOffset = selection.from + data.length;
    if (selection.isCollapsed && target.isText && !sameMarks(target.marks, state.storedMarks)) {
      const value = target.text ?? '';
      const index = selection.path.at(-1) as number;
      landingPath = [...selection.path.slice(0, -1), index + (selection.from > 0 ? 1 : 0)];
      landingOffset = data.length;
      transaction.replaceNode(selection.path, [
        ...(selection.from ? [target.withText(value.slice(0, selection.from))] : []),
        state.schema.text(data, state.storedMarks),
        ...(selection.from < value.length ? [target.withText(value.slice(selection.from))] : []),
      ]);
    } else if (selection.isSingleText) transaction.replaceText(selection.path, selection.from, selection.to, data);
    else transaction.replaceTextRange(selection.path, selection.from, selection.endPath, selection.to, data);
    setHistoryGroup(transaction, 'composition');
    transaction.setStoredMarks(state.storedMarks).setSelection(Selection.cursor(landingPath, landingOffset));
    this.editor.dispatch(transaction);
    this.compositionHandled = true;
    this.compositionSelection = undefined;
    return true;
  }

  private runGroupedInput(group: string, command: () => boolean): boolean {
    return this.editor.runCommandBatch(() => {
      if (!command()) return false;
      const marker = this.editor.state.createTransaction().setMeta('force', true);
      setHistoryGroup(marker, group);
      this.editor.dispatch(marker);
      return true;
    });
  }

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
    const types = Array.from(event.dataTransfer?.types ?? []);
    const sourcePath = this.options.blockHandles?.draggedPath ?? this.draggedNodePath;
    const internal = sourcePath !== undefined
      || types.includes(FOUNTAIN_NODE_DRAG_TYPE)
      || types.includes(FOUNTAIN_LEGACY_BLOCK_DRAG_TYPE);
    const uploadable = Array.from(event.dataTransfer?.items ?? []).some((item) => (
      item.kind === 'file' && (item.type.startsWith('image/') || Boolean(this.options.assetUpload))
    ));
    if (this.editor.editable && (internal || uploadable)) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = internal ? 'move' : 'copy';
      if (internal && sourcePath) this.options.blockHandles?.showDrop(event, sourcePath);
    }
  };

  private onDragStart = (event: DragEvent): void => {
    if (this.options.shouldStopEvent?.(event) || !this.editor.editable || !event.dataTransfer) return;
    const selection = this.editor.state.selection;
    if (!(selection instanceof NodeSelection) || selection.nodePath.length !== 1) return;
    const target = event.target instanceof Element ? event.target : null;
    const selected = this.dom.querySelector<HTMLElement>(`[data-fountain-path="${selection.nodePath[0]}"]`);
    if (!target || !selected || !(selected === target || selected.contains(target))) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(FOUNTAIN_NODE_DRAG_TYPE, JSON.stringify(selection.nodePath));
    event.dataTransfer.setData(FOUNTAIN_LEGACY_BLOCK_DRAG_TYPE, String(selection.nodePath[0]));
    event.dataTransfer.setData('text/plain', getNodeAtPath(this.editor.state.doc, selection.nodePath).textContent);
    this.draggedNodePath = selection.nodePath;
    this.suppressNativeDragDeleteUntil = Date.now() + 5_000;
    selected.dataset.fountainDragging = 'true';
  };

  private onDragEnd = (): void => {
    this.draggedNodePath = undefined;
    this.options.blockHandles?.clearDrag();
    this.suppressNativeDragDeleteUntil = Math.min(this.suppressNativeDragDeleteUntil, Date.now() + 1_000);
    this.dom.querySelectorAll<HTMLElement>('[data-fountain-dragging]')
      .forEach((element) => { delete element.dataset.fountainDragging; });
  };

  private onDrop = (event: DragEvent): void => {
    this.selections.requestDOMSync();
    if (this.options.shouldStopEvent?.(event)) return;
    if (!this.editor.editable) return;
    for (const plugin of this.editor.state.plugins) {
      if (plugin.spec.props?.handleDrop?.(this.editor, event)) {
        event.preventDefault();
        return;
      }
    }
    const sourcePath = this.options.blockHandles?.draggedPath
      ?? this.draggedNodePath;
    if (sourcePath) {
      event.preventDefault();
      if (this.options.blockHandles?.drop(event, sourcePath)) {
        this.suppressNativeDragDeleteUntil = Date.now() + 1_000;
        this.onDragEnd();
        return;
      }
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-fountain-path]')
        : null;
      const targetIndex = Number((target?.dataset.fountainPath ?? '').split('.')[0]);
      const sourceIndex = sourcePath.length === 1 ? sourcePath[0] : undefined;
      if (Number.isInteger(targetIndex) && Number.isInteger(sourceIndex)) {
        this.suppressNativeDragDeleteUntil = Date.now() + 1_000;
        const topLevel = this.dom.querySelector<HTMLElement>(`[data-fountain-path="${targetIndex}"]`);
        const bounds = topLevel?.getBoundingClientRect();
        const boundary = targetIndex + (bounds && event.clientY >= bounds.top + bounds.height / 2 ? 1 : 0);
        const destination = Math.max(0, Math.min(
          this.editor.state.doc.childCount - 1,
          boundary - ((sourceIndex as number) < boundary ? 1 : 0),
        ));
        moveBlock(this.editor, sourceIndex as number, destination);
      }
      this.onDragEnd();
      return;
    }
    const types = Array.from(event.dataTransfer?.types ?? []);
    if (types.includes(FOUNTAIN_NODE_DRAG_TYPE) || types.includes(FOUNTAIN_LEGACY_BLOCK_DRAG_TYPE)) {
      // Fountain drag payloads are intentionally accepted only from this view's
      // live drag state; paths from another editor instance are not transferable.
      event.preventDefault();
      return;
    }
    const files = Array.from(event.dataTransfer?.files ?? [])
      .filter((file) => file.type.startsWith('image/') || Boolean(this.options.assetUpload));
    if (!files.length) return;
    event.preventDefault();
    this.placeCaret(event.clientX, event.clientY);
    this.selections.capture();
    void this.insertFiles(files);
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

  private async insertFiles(files: readonly File[]): Promise<void> {
    try {
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          await insertImageFile(this.editor, file, {
            upload: this.options.imageUpload,
            maxInlineBytes: this.options.maxInlineImageBytes,
            onStatusChange: (snapshot, task) => {
              this.dom.dispatchEvent(new CustomEvent('fountain-image-upload', {
                bubbles: true,
                composed: true,
                detail: { snapshot, task },
              }));
            },
          });
        } else if (this.options.assetUpload) {
          await insertAssetFile(this.editor, file, {
            upload: this.options.assetUpload,
            onStatusChange: (snapshot, task) => {
              this.dom.dispatchEvent(new CustomEvent('fountain-asset-upload', {
                bubbles: true,
                composed: true,
                detail: { snapshot, task },
              }));
            },
          });
        }
      }
    } catch (error) {
      this.options.onError?.(error);
      const event = new CustomEvent('fountain-error', { bubbles: true, cancelable: true, detail: error });
      this.dom.dispatchEvent(event);
    }
  }
}
