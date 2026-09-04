import {
  DecorationSet,
  NodeSelection,
  Selection,
  nodeRangeAtPath,
  setBlockType,
  toggleMark,
  type AnySelection,
  type Decoration,
  type Editor,
  type EditorState,
  type Node,
  type NodeViewLike,
  type Transaction,
} from '../core';
import {
  createCommandManager,
  type CommandChecks,
  type CommandManager,
  type CommandRegistry,
} from '../extensions/command-manager';
import { getNodeAtPath, getTextLeaves } from '../core/transaction/path';
import {
  reconcileDocument,
  renderDocument,
  type MountedDocumentNode,
  type MountedNodeView,
} from './dom-renderer';
import { InputManager } from './input';
import { BlockHandleManager, type BlockHandleOptions } from './block-handles';
import type { AssetUploadHandler, ImageUploadHandler } from './media';
import { SelectionHandler } from './selection-handler';

export interface EditorViewOptions {
  ariaLabel?: string;
  className?: string;
  placeholder?: string;
  attributes?: Record<string, string>;
  imageUpload?: ImageUploadHandler;
  assetUpload?: AssetUploadHandler;
  maxInlineImageBytes?: number;
  /** Enables framework-neutral drag, keyboard, and touch block controls. */
  blockHandles?: boolean | BlockHandleOptions;
  onError?: (error: unknown) => void;
}

export type EditorFocusPosition = 'current' | 'start' | 'end';

type ViewFocusCommands = {
  focus: (editor: Editor, position?: EditorFocusPosition) => boolean;
};

export type ViewCommandRegistry<Commands extends CommandRegistry> = Omit<Commands, 'focus'> & ViewFocusCommands;

export class EditorView {
  readonly dom: HTMLDivElement;
  private readonly selections: SelectionHandler;
  private readonly input: InputManager;
  private readonly blockHandles?: BlockHandleManager;
  private readonly unsubscribe: () => void;
  private nodeViews: MountedNodeView[] = [];
  private documentNodes: MountedDocumentNode[] = [];
  private selectedNodeView?: NodeViewLike;
  private mutationObserver?: MutationObserver;
  private decorations = DecorationSet.empty;
  private destroyed = false;

  constructor(public readonly mount: HTMLElement, public readonly editor: Editor, options: EditorViewOptions = {}) {
    this.dom = document.createElement('div');
    this.dom.className = ['fountain-editor', options.className].filter(Boolean).join(' ');
    this.dom.contentEditable = editor.editable ? 'true' : 'false';
    this.dom.tabIndex = 0;
    this.dom.setAttribute('role', 'textbox');
    this.dom.setAttribute('aria-multiline', 'true');
    this.dom.setAttribute('aria-label', options.ariaLabel ?? 'Rich text editor');
    this.dom.setAttribute('spellcheck', 'true');
    if (options.placeholder) this.dom.dataset.placeholder = options.placeholder;
    Object.entries(options.attributes ?? {}).forEach(([name, value]) => {
      if (!/^on/i.test(name)) this.dom.setAttribute(name, value);
    });
    mount.appendChild(this.dom);
    this.blockHandles = options.blockHandles
      ? new BlockHandleManager(mount, this.dom, editor, options.blockHandles === true ? {} : options.blockHandles)
      : undefined;
    this.decorations = this.collectDecorations(editor.state);
    this.render(editor.state.doc, this.decorations);
    this.selections = new SelectionHandler(editor, this.dom, this.shouldStopNodeViewEvent);
    this.input = new InputManager(editor, this.dom, this.selections, {
      imageUpload: options.imageUpload,
      assetUpload: options.assetUpload,
      maxInlineImageBytes: options.maxInlineImageBytes,
      onError: options.onError,
      shouldStopEvent: this.shouldStopNodeViewEvent,
      blockHandles: this.blockHandles,
    });
    if (typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver(this.onMutations);
      this.observeMutations();
    }
    this.unsubscribe = editor.subscribe(this.onStateChange);
    this.syncNodeViewSelection(editor.state.selection);
    queueMicrotask(() => this.selections.sync(editor.state.selection, false));
  }

  focus(position: EditorFocusPosition = 'current'): void {
    if (this.destroyed) return;
    this.moveSelection(position);
    this.dom.focus();
    this.selections.sync(this.editor.state.selection);
  }

  /** Adds a view-aware `focus()` command to any framework-neutral registry. */
  commandManager<Commands extends CommandRegistry>(commands: Commands): CommandManager<ViewCommandRegistry<Commands>> {
    if (Object.prototype.hasOwnProperty.call(commands, 'focus')) {
      throw new Error('EditorView reserves the focus command name.');
    }
    const focus = (editor: Editor, position: EditorFocusPosition = 'current'): boolean => {
      if (this.destroyed || editor !== this.editor) return false;
      this.focus(position);
      return true;
    };
    const checkFocus = (editor: Editor, position: EditorFocusPosition = 'current'): boolean => {
      if (this.destroyed || editor !== this.editor) return false;
      this.moveSelection(position);
      return true;
    };
    const viewCommands = { ...commands, focus } as ViewCommandRegistry<Commands>;
    const checks = { focus: checkFocus } as CommandChecks<ViewCommandRegistry<Commands>>;
    return createCommandManager(this.editor, viewCommands, { checks });
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
    this.mutationObserver?.disconnect();
    this.unsubscribe();
    this.input.destroy();
    this.selections.destroy();
    this.blockHandles?.destroy();
    this.destroyNodeViews();
    this.dom.remove();
  }

  private onStateChange = (state: EditorState, transaction: import('../core').Transaction): void => {
    if (this.destroyed) return;
    const ownsDOMSelection = this.selections.consumeDOMSyncRequest()
      || this.selections.ownsDOMSelection()
      || this.dom === document.activeElement
      || (transaction.selectionSet && transaction.getMeta('fountain$collaborationRemote') !== true);
    const decorations = this.collectDecorations(state);
    if (transaction.docChanged || !decorations.eq(this.decorations)) this.render(state.doc, decorations, transaction);
    this.decorations = decorations;
    this.syncNodeViewSelection(state.selection);
    this.blockHandles?.syncSelection(state.selection);
    queueMicrotask(() => this.selections.sync(state.selection, ownsDOMSelection));
  };

  private render(document: Node, decorations: DecorationSet, transaction?: Transaction, allowReuse = true): void {
    const previous = this.nodeViews;
    const reusableNodeViews = allowReuse ? this.reusableNodeViewMap(document, transaction) : new Map<string, MountedNodeView>();
    this.mutationObserver?.disconnect();
    const mounted: MountedNodeView[] = [];
    const context = { view: this, nodeViews: mounted, reusableNodeViews, decorations };
    const canReconcile = allowReuse
      && this.documentNodes.length > 0
      && this.decorations.decorations.length === 0
      && decorations.decorations.length === 0;
    if (canReconcile) {
      const nodeViewsByTopLevel = new Map<number, MountedNodeView[]>();
      previous.forEach((entry) => {
        const index = entry.path[0];
        if (index === undefined) return;
        const entries = nodeViewsByTopLevel.get(index) ?? [];
        entries.push(entry);
        nodeViewsByTopLevel.set(index, entries);
      });
      this.documentNodes = reconcileDocument(this.dom, document, this.documentNodes, context, (index) => {
        mounted.push(...(nodeViewsByTopLevel.get(index) ?? []));
      });
    } else {
      this.documentNodes = renderDocument(this.dom, document, context);
    }
    const retained = new Set(mounted.map((entry) => entry.nodeView));
    previous.forEach((entry) => {
      if (retained.has(entry.nodeView)) return;
      if (this.selectedNodeView === entry.nodeView) {
        entry.nodeView.deselectNode?.();
        this.selectedNodeView = undefined;
      }
      entry.nodeView.destroy?.();
    });
    this.nodeViews = mounted;
    this.blockHandles?.refresh(document, this.editor.state.selection);
    this.mutationObserver?.takeRecords();
    this.observeMutations();
  }

  private collectDecorations(state: EditorState): DecorationSet {
    const decorations: Decoration[] = [];
    state.plugins.forEach((plugin) => {
      const provided = plugin.spec.props?.decorations?.(state);
      if (provided instanceof DecorationSet) decorations.push(...provided.decorations);
      else if (provided) decorations.push(...provided);
    });
    return DecorationSet.create(state.doc, decorations);
  }

  private moveSelection(position: EditorFocusPosition): void {
    if (position === 'current') return;
    const leaves = getTextLeaves(this.editor.state.doc);
    const target = position === 'start' ? leaves[0] : leaves.at(-1);
    if (!target) return;
    const offset = position === 'start' ? 0 : target.node.text?.length ?? 0;
    this.editor.dispatch(this.editor.state.createTransaction().setSelection(Selection.cursor(target.path, offset)));
  }

  private destroyNodeViews(): void {
    this.selectedNodeView?.deselectNode?.();
    this.selectedNodeView = undefined;
    this.nodeViews.forEach(({ nodeView }) => nodeView.destroy?.());
    this.nodeViews = [];
  }

  private reusableNodeViewMap(document: Node, transaction?: Transaction): Map<string, MountedNodeView> {
    const reusable = new Map<string, MountedNodeView>();
    this.nodeViews.forEach((entry) => {
      try {
        let path: readonly number[] | null = entry.path;
        const samePathNode = getNodeAtPath(document, entry.path);
        if (samePathNode === entry.node) {
          reusable.set(path.join('.'), entry);
          return;
        }
        if (transaction) {
          const range = nodeRangeAtPath(transaction.originalDoc, entry.path);
          const from = transaction.mapping.map(range.from, 1);
          const to = transaction.mapping.map(range.to, -1);
          path = this.findNodePath(document, entry.node.type.name, from, to);
        } else {
          const candidate = getNodeAtPath(document, path);
          if (candidate.type !== entry.node.type) path = null;
        }
        if (path) reusable.set(path.join('.'), entry);
      } catch { /* A deleted or structurally replaced view is recreated or destroyed. */ }
    });
    return reusable;
  }

  private findNodePath(document: Node, typeName: string, from: number, to: number): readonly number[] | null {
    let found: readonly number[] | null = null;
    document.descendants((node, path) => {
      if (found || node.type.name !== typeName) return !found;
      const range = nodeRangeAtPath(document, path);
      if (range.from === from && range.to === to) {
        found = Object.freeze([...path]);
        return false;
      }
      return true;
    });
    return found;
  }

  private syncNodeViewSelection(selection: AnySelection): void {
    const next = selection instanceof NodeSelection
      ? this.nodeViews.find((entry) => this.samePath(entry.path, selection.nodePath))?.nodeView
      : undefined;
    if (next === this.selectedNodeView) return;
    this.pauseMutationObserver(() => {
      this.selectedNodeView?.deselectNode?.();
      next?.selectNode?.();
    });
    this.selectedNodeView = next;
  }

  private shouldStopNodeViewEvent = (event: Event): boolean => {
    const target = event.target;
    if (!(target instanceof globalThis.Node)) return false;
    const entry = [...this.nodeViews]
      .sort((left, right) => right.path.length - left.path.length)
      .find(({ nodeView }) => nodeView.dom === target || nodeView.dom.contains(target));
    if (!entry?.nodeView.stopEvent) return false;
    try { return entry.nodeView.stopEvent(event); }
    catch { return true; }
  };

  private onMutations = (mutations: MutationRecord[]): void => {
    if (this.destroyed || this.input.composing) return;
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && [
        'data-fountain-selected-node',
        'data-fountain-selected-cell',
        'data-fountain-gap',
        'data-fountain-block-reorderable',
        'data-fountain-drop-position',
        'data-fountain-dragging',
        'draggable',
      ].includes(mutation.attributeName ?? '')) continue;
      const entry = [...this.nodeViews]
        .sort((left, right) => right.path.length - left.path.length)
        .find(({ nodeView }) => nodeView.dom === mutation.target || nodeView.dom.contains(mutation.target));
      if (!entry) continue;
      try {
        if (entry.nodeView.ignoreMutation?.(mutation)) continue;
      } catch { /* Restore the model-owned DOM after a failing hook. */ }
      const ownsDOMSelection = this.selections.ownsDOMSelection() || this.dom === document.activeElement;
      this.render(this.editor.state.doc, this.decorations, undefined, false);
      this.syncNodeViewSelection(this.editor.state.selection);
      queueMicrotask(() => this.selections.sync(this.editor.state.selection, ownsDOMSelection));
      return;
    }
  };

  private pauseMutationObserver(run: () => void): void {
    this.mutationObserver?.disconnect();
    try { run(); }
    finally {
      this.mutationObserver?.takeRecords();
      this.observeMutations();
    }
  }

  private observeMutations(): void {
    if (this.destroyed) return;
    this.mutationObserver?.observe(this.dom, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  private samePath(left: readonly number[], right: readonly number[]): boolean {
    return left.length === right.length && left.every((part, index) => part === right[index]);
  }
}
