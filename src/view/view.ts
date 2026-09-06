import {
  CellSelection,
  DecorationSet,
  GapSelection,
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
  renderVirtualDocument,
  type MountedDocumentNode,
  type MountedNodeView,
} from './dom-renderer';
import { InputManager } from './input';
import { BlockHandleManager, type BlockHandleOptions } from './block-handles';
import { DropCursorManager, type DropCursorOptions } from './drop-cursor';
import type { AssetUploadHandler, ImageUploadHandler } from './media';
import type { ExternalPasteOptions } from './paste';
import { SelectionHandler } from './selection-handler';
import {
  VirtualBlockLayout,
  type VirtualBlockLayoutOptions,
  type VirtualBlockPlan,
  type VirtualBlockRange,
} from './virtual-layout';

export interface EditorViewVirtualizationOptions extends VirtualBlockLayoutOptions {
  /** Do not virtualize documents below this top-level block count. Defaults to 250. */
  minimumBlockCount?: number;
  /** Scroll viewport that owns this editor. Defaults to the editor window. */
  scrollContainer?: HTMLElement | Window;
}

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
  /** Native drag feedback. Enabled by default; pass false to replace or remove it. */
  dropCursor?: boolean | DropCursorOptions;
  /** Opt-in viewport rendering for very large documents. */
  virtualization?: boolean | EditorViewVirtualizationOptions;
  onError?: (error: unknown) => void;
  /** Source-aware Word, Docs, spreadsheet, MathML, and generic HTML paste policy. */
  paste?: ExternalPasteOptions;
}

export type EditorFocusPosition = 'current' | 'start' | 'end';

type ViewFocusCommands = {
  focus: (editor: Editor, position?: EditorFocusPosition) => boolean;
};

export type ViewCommandRegistry<Commands extends CommandRegistry> = Omit<Commands, 'focus'> & ViewFocusCommands;

const EDITABLE_PAGE_STYLE_PREFIX = '--fountain-editable-page-';

function styleWithoutEditablePageProperties(ownerDocument: Document, value: string | null): string {
  const probe = ownerDocument.createElement('span');
  if (value) probe.setAttribute('style', value);
  return [...probe.style]
    .filter((property) => !property.startsWith(EDITABLE_PAGE_STYLE_PREFIX))
    .sort()
    .map((property) => (
      `${property}:${probe.style.getPropertyValue(property)}!${probe.style.getPropertyPriority(property)}`
    ))
    .join(';');
}

function isEditablePageStyleMutation(mutation: MutationRecord): boolean {
  if (mutation.type !== 'attributes' || mutation.attributeName !== 'style') return false;
  const target = mutation.target;
  if (!(target instanceof HTMLElement)) return false;
  const current = target.getAttribute('style');
  if (![mutation.oldValue, current].some((value) => value?.includes(EDITABLE_PAGE_STYLE_PREFIX))) return false;
  return styleWithoutEditablePageProperties(target.ownerDocument, mutation.oldValue)
    === styleWithoutEditablePageProperties(target.ownerDocument, current);
}

export class EditorView {
  readonly dom: HTMLDivElement;
  private readonly selections: SelectionHandler;
  private readonly input: InputManager;
  private readonly blockHandles?: BlockHandleManager;
  private readonly dropCursor?: DropCursorManager;
  private readonly unsubscribe: () => void;
  private nodeViews: MountedNodeView[] = [];
  private documentNodes: MountedDocumentNode[] = [];
  private selectedNodeView?: NodeViewLike;
  private mutationObserver?: MutationObserver;
  private decorations = DecorationSet.empty;
  private destroyed = false;
  private readonly virtualLayout?: VirtualBlockLayout;
  private readonly virtualMinimumBlockCount: number = 250;
  private readonly virtualScrollTarget?: HTMLElement | Window;
  private virtualPlanKey?: string;
  private virtualForcedRange?: VirtualBlockRange;
  private virtualizationSuspended = false;
  private virtualRenderFrame?: number;
  private virtualMeasureFrame?: number;
  private virtualRestoreTimer?: number;
  private virtualPrintResume = false;
  private virtualResizeObserver?: ResizeObserver;

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
    if (options.virtualization) {
      const virtualization = options.virtualization === true ? {} : options.virtualization;
      const minimum = virtualization.minimumBlockCount ?? 250;
      if (!Number.isSafeInteger(minimum) || minimum < 0) {
        throw new RangeError('virtualization.minimumBlockCount must be a non-negative integer.');
      }
      this.virtualMinimumBlockCount = minimum;
      this.virtualScrollTarget = virtualization.scrollContainer ?? this.dom.ownerDocument.defaultView ?? undefined;
      this.virtualLayout = new VirtualBlockLayout(virtualization);
    }
    mount.appendChild(this.dom);
    this.blockHandles = options.blockHandles
      ? new BlockHandleManager(mount, this.dom, editor, options.blockHandles === true ? {} : options.blockHandles)
      : undefined;
    this.dropCursor = options.dropCursor === false
      ? undefined
      : new DropCursorManager(mount, this.dom, options.dropCursor === true || options.dropCursor === undefined ? {} : options.dropCursor);
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
      dropCursor: this.dropCursor,
      prepareClipboard: this.prepareVirtualClipboard,
      paste: options.paste,
    });
    if (typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver(this.onMutations);
      this.observeMutations();
    }
    this.unsubscribe = editor.subscribe(this.onStateChange);
    this.startVirtualization();
    this.syncNodeViewSelection(editor.state.selection);
    queueMicrotask(() => this.selections.sync(editor.state.selection, false));
  }

  focus(position: EditorFocusPosition = 'current'): void {
    if (this.destroyed) return;
    this.moveSelection(position);
    this.dom.focus();
    this.selections.sync(this.editor.state.selection);
  }

  /** True while the view is currently rendering a reduced viewport window. */
  get virtualized(): boolean { return this.dom.dataset.fountainVirtualized === 'true'; }

  /**
   * Temporarily mount the complete document for accessibility, capture, or a
   * host-owned operation. Calling this does not change editor state.
   */
  setVirtualizationSuspended(suspended: boolean): void {
    if (!this.virtualLayout || this.virtualizationSuspended === suspended) return;
    this.virtualizationSuspended = suspended;
    this.render(this.editor.state.doc, this.decorations);
    this.syncNodeViewSelection(this.editor.state.selection);
    queueMicrotask(() => this.selections.sync(this.editor.state.selection, this.selections.ownsDOMSelection()));
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
    this.stopVirtualization();
    this.unsubscribe();
    this.input.destroy();
    this.selections.destroy();
    this.blockHandles?.destroy();
    this.dropCursor?.destroy();
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
    if (transaction.docChanged || (transaction.selectionSet && Boolean(this.virtualLayout)) || !decorations.eq(this.decorations)) {
      this.render(state.doc, decorations, transaction);
    }
    this.decorations = decorations;
    this.syncNodeViewSelection(state.selection);
    this.blockHandles?.syncSelection(state.selection);
    queueMicrotask(() => this.selections.sync(state.selection, ownsDOMSelection));
  };

  private render(
    document: Node,
    decorations: DecorationSet,
    transaction?: Transaction,
    allowReuse = true,
    viewportOnly = false,
  ): void {
    const wasVirtualized = this.virtualized;
    const previous = this.nodeViews;
    const activeElement = this.dom.ownerDocument.activeElement;
    const focusedNodeView = activeElement instanceof HTMLElement
      ? previous.find((entry) => (
        entry.nodeView.dom.contains(activeElement)
        && !entry.nodeView.contentDOM?.contains(activeElement)
      ))
      : undefined;
    const reusableNodeViews = allowReuse ? this.reusableNodeViewMap(document, transaction) : new Map<string, MountedNodeView>();
    this.mutationObserver?.disconnect();
    const mounted: MountedNodeView[] = [];
    const context = { view: this, nodeViews: mounted, reusableNodeViews, decorations };
    const virtualPlan = this.virtualPlan(document);
    const virtualPlanKey = virtualPlan
      ? `${virtualPlan.totalHeight}:${virtualPlan.ranges.map(({ from, to }) => `${from}-${to}`).join(',')}`
      : undefined;
    if (viewportOnly && virtualPlanKey === this.virtualPlanKey) {
      this.observeMutations();
      return;
    }
    this.virtualPlanKey = virtualPlanKey;
    if (virtualPlan) this.dom.dataset.fountainVirtualized = 'true';
    else delete this.dom.dataset.fountainVirtualized;
    const canReconcile = allowReuse
      && !wasVirtualized
      && this.documentNodes.length > 0
      && this.decorations.decorations.length === 0
      && decorations.decorations.length === 0;
    const mappedNodeViewsByTopLevel = new Map<number, MountedNodeView[]>();
    reusableNodeViews.forEach((entry, key) => {
      const path = key.split('.').map(Number);
      const index = path[0];
      if (index === undefined) return;
      const mapped = { ...entry, path: Object.freeze(path) };
      const entries = mappedNodeViewsByTopLevel.get(index) ?? [];
      entries.push(mapped);
      mappedNodeViewsByTopLevel.set(index, entries);
    });
    const retainReusedNodeViews = (index: number): void => {
      const mapped = mappedNodeViewsByTopLevel.get(index) ?? [];
      mapped.forEach((entry) => { entry.pathReference.current = [...entry.path]; });
      mounted.push(...mapped);
    };
    if (virtualPlan && this.virtualLayout) {
      const canReuseVirtualDOM = allowReuse && this.documentNodes.length > 0 && (
        (this.decorations.decorations.length === 0 && decorations.decorations.length === 0)
        || (!transaction?.docChanged && decorations.eq(this.decorations))
      );
      this.documentNodes = renderVirtualDocument(
        this.dom,
        document,
        virtualPlan,
        this.virtualLayout,
        canReuseVirtualDOM ? this.documentNodes : [],
        context,
        retainReusedNodeViews,
      );
    } else if (canReconcile) {
      this.documentNodes = reconcileDocument(this.dom, document, this.documentNodes, context, (index) => {
        retainReusedNodeViews(index);
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
    if (
      focusedNodeView
      && retained.has(focusedNodeView.nodeView)
      && activeElement instanceof HTMLElement
      && activeElement.isConnected
      && this.dom.ownerDocument.activeElement !== activeElement
    ) {
      try { activeElement.focus({ preventScroll: true }); }
      catch { activeElement.focus(); }
    }
    this.blockHandles?.refresh(document, this.editor.state.selection);
    if (virtualPlan) this.queueVirtualMeasurement();
    this.mutationObserver?.takeRecords();
    this.observeMutations();
  }

  private virtualPlan(documentNode: Node): VirtualBlockPlan | undefined {
    if (!this.virtualLayout || this.virtualizationSuspended || documentNode.childCount < this.virtualMinimumBlockCount) {
      return undefined;
    }
    const priorViewport = this.virtualViewport();
    const priorAnchorIndex = this.virtualLayout.blockCount
      ? this.virtualLayout.indexAt(priorViewport.offset)
      : -1;
    const priorAnchor = priorAnchorIndex >= 0 ? this.virtualLayout.nodeAt(priorAnchorIndex) : undefined;
    const priorAnchorOffset = priorAnchorIndex >= 0 ? this.virtualLayout.offsetAt(priorAnchorIndex) : 0;
    const documentChanged = this.virtualLayout.sync(documentNode);
    if (documentChanged && priorAnchor) {
      const nextAnchorIndex = this.virtualLayout.indexOf(priorAnchor);
      if (nextAnchorIndex >= 0) {
        this.adjustVirtualScroll(this.virtualLayout.offsetAt(nextAnchorIndex) - priorAnchorOffset);
      }
    }
    const selection = this.editor.state.selection;
    const bounds = this.virtualSelectionBounds(selection, documentNode.childCount);
    const pinned = [bounds.from, Math.max(bounds.from, bounds.to - 1)];
    const viewport = this.virtualViewport();
    const planned = this.virtualLayout.plan(viewport.offset, viewport.height, pinned);
    if (!this.virtualForcedRange) return planned;

    const forced = {
      from: Math.max(0, Math.min(documentNode.childCount, this.virtualForcedRange.from)),
      to: Math.max(0, Math.min(documentNode.childCount, this.virtualForcedRange.to)),
    };
    const ranges = [...planned.ranges, forced]
      .filter((range) => range.to > range.from)
      .sort((left, right) => left.from - right.from || left.to - right.to)
      .reduce<VirtualBlockRange[]>((merged, range) => {
        const prior = merged.at(-1);
        if (!prior || range.from > prior.to) merged.push(Object.freeze({ ...range }));
        else merged[merged.length - 1] = Object.freeze({ from: prior.from, to: Math.max(prior.to, range.to) });
        return merged;
      }, []);
    return Object.freeze({
      ranges: Object.freeze(ranges),
      totalHeight: planned.totalHeight,
      mountedCount: ranges.reduce((count, range) => count + range.to - range.from, 0),
    });
  }

  private virtualViewport(): { offset: number; height: number } {
    const layout = this.virtualLayout;
    const target = this.virtualScrollTarget;
    if (!layout || !target) return { offset: 0, height: 0 };
    const rootRect = this.dom.getBoundingClientRect();
    const ownerWindow = this.dom.ownerDocument.defaultView;
    if (target === ownerWindow) {
      const offset = Math.max(0, -rootRect.top);
      const available = Math.max(0, (ownerWindow?.innerHeight ?? 0) - Math.max(0, rootRect.top));
      return { offset, height: Math.min(Math.max(0, layout.totalHeight - offset), available) };
    }
    const container = target as HTMLElement;
    const containerRect = container.getBoundingClientRect();
    const visibleTop = Math.max(containerRect.top, rootRect.top);
    const documentBottom = rootRect.top + layout.totalHeight;
    return {
      offset: Math.max(0, visibleTop - rootRect.top),
      height: Math.max(0, Math.min(containerRect.bottom, documentBottom) - visibleTop),
    };
  }

  private startVirtualization(): void {
    if (!this.virtualLayout || !this.virtualScrollTarget) return;
    this.virtualScrollTarget.addEventListener('scroll', this.onVirtualViewportChange, { passive: true });
    const ownerWindow = this.dom.ownerDocument.defaultView;
    ownerWindow?.addEventListener('resize', this.onVirtualViewportChange, { passive: true });
    ownerWindow?.addEventListener('beforeprint', this.onVirtualBeforePrint);
    ownerWindow?.addEventListener('afterprint', this.onVirtualAfterPrint);
    if (typeof ResizeObserver !== 'undefined') {
      this.virtualResizeObserver = new ResizeObserver(this.onVirtualViewportChange);
      this.virtualResizeObserver.observe(this.dom);
    }
    this.queueVirtualMeasurement();
  }

  private stopVirtualization(): void {
    const ownerWindow = this.dom.ownerDocument.defaultView;
    this.virtualScrollTarget?.removeEventListener('scroll', this.onVirtualViewportChange);
    ownerWindow?.removeEventListener('resize', this.onVirtualViewportChange);
    ownerWindow?.removeEventListener('beforeprint', this.onVirtualBeforePrint);
    ownerWindow?.removeEventListener('afterprint', this.onVirtualAfterPrint);
    this.virtualResizeObserver?.disconnect();
    if (this.virtualRenderFrame !== undefined) ownerWindow?.cancelAnimationFrame(this.virtualRenderFrame);
    if (this.virtualMeasureFrame !== undefined) ownerWindow?.cancelAnimationFrame(this.virtualMeasureFrame);
    if (this.virtualRestoreTimer !== undefined) ownerWindow?.clearTimeout(this.virtualRestoreTimer);
    this.virtualRenderFrame = undefined;
    this.virtualMeasureFrame = undefined;
    this.virtualRestoreTimer = undefined;
  }

  private onVirtualViewportChange = (): void => {
    if (!this.virtualized || this.virtualRenderFrame !== undefined) return;
    const ownerWindow = this.dom.ownerDocument.defaultView;
    this.virtualRenderFrame = ownerWindow?.requestAnimationFrame(() => {
      this.virtualRenderFrame = undefined;
      if (this.destroyed) return;
      this.render(this.editor.state.doc, this.decorations, undefined, true, true);
      this.syncNodeViewSelection(this.editor.state.selection);
      queueMicrotask(() => this.selections.sync(this.editor.state.selection, this.selections.ownsDOMSelection()));
    });
  };

  private queueVirtualMeasurement(): void {
    if (!this.virtualized || this.virtualMeasureFrame !== undefined) return;
    const ownerWindow = this.dom.ownerDocument.defaultView;
    this.virtualMeasureFrame = ownerWindow?.requestAnimationFrame(() => {
      this.virtualMeasureFrame = undefined;
      this.measureVirtualBlocks();
    });
  }

  private measureVirtualBlocks(): void {
    if (!this.virtualized || !this.virtualLayout) return;
    const ownerWindow = this.dom.ownerDocument.defaultView;
    const viewport = this.virtualViewport();
    const anchor = this.virtualLayout.indexAt(viewport.offset);
    const anchorBefore = this.virtualLayout.offsetAt(anchor);
    const measurements = this.documentNodes.flatMap(({ dom, index }) => {
      if (!(dom instanceof HTMLElement) || index === undefined) return [];
      const bounds = dom.getBoundingClientRect();
      if (bounds.height <= 0) return [];
      const style = ownerWindow?.getComputedStyle(dom);
      const marginBefore = Number.parseFloat(style?.marginTop ?? '0') || 0;
      const marginAfter = Number.parseFloat(style?.marginBottom ?? '0') || 0;
      return [{ index, height: bounds.height + marginBefore + marginAfter }];
    });
    if (!this.virtualLayout.measure(measurements)) return;
    const anchorDelta = this.virtualLayout.offsetAt(anchor) - anchorBefore;
    if (Math.abs(anchorDelta) >= 0.5) this.adjustVirtualScroll(anchorDelta);
    this.onVirtualViewportChange();
  }

  private adjustVirtualScroll(delta: number): void {
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) return;
    const ownerWindow = this.dom.ownerDocument.defaultView;
    if (this.virtualScrollTarget === ownerWindow) {
      try { ownerWindow?.scrollBy({ top: delta, behavior: 'auto' }); } catch { /* Unsupported in tests. */ }
    } else if (this.virtualScrollTarget) {
      (this.virtualScrollTarget as HTMLElement).scrollTop += delta;
    }
  }

  private prepareVirtualClipboard = (): void => {
    if (!this.virtualized) return;
    const selection = this.editor.state.selection;
    const { from, to } = this.virtualSelectionBounds(selection, this.editor.state.doc.childCount);
    if (to <= from) return;
    const mounted = new Set(this.documentNodes.flatMap(({ index }) => index === undefined ? [] : [index]));
    let complete = true;
    for (let index = from; index < to; index += 1) {
      if (!mounted.has(index)) { complete = false; break; }
    }
    if (complete) return;
    this.virtualForcedRange = Object.freeze({ from, to });
    this.render(this.editor.state.doc, this.decorations);
    this.selections.sync(selection);
    const ownerWindow = this.dom.ownerDocument.defaultView;
    if (this.virtualRestoreTimer !== undefined) ownerWindow?.clearTimeout(this.virtualRestoreTimer);
    this.virtualRestoreTimer = ownerWindow?.setTimeout(() => {
      this.virtualRestoreTimer = undefined;
      this.virtualForcedRange = undefined;
      if (this.destroyed) return;
      this.render(this.editor.state.doc, this.decorations);
      this.syncNodeViewSelection(this.editor.state.selection);
      queueMicrotask(() => this.selections.sync(this.editor.state.selection, this.selections.ownsDOMSelection()));
    }, 0);
  };

  private virtualSelectionBounds(selection: AnySelection, blockCount: number): VirtualBlockRange {
    if (selection instanceof NodeSelection) {
      const index = selection.nodePath[0] ?? 0;
      return Object.freeze({ from: index, to: Math.min(blockCount, index + 1) });
    }
    if (selection instanceof CellSelection) {
      const indexes = selection.cellPaths.flatMap((path) => path[0] === undefined ? [] : [path[0]]);
      const from = indexes.length ? Math.min(...indexes) : 0;
      const to = (indexes.length ? Math.max(...indexes) : from) + 1;
      return Object.freeze({ from, to: Math.min(blockCount, to) });
    }
    if (selection instanceof GapSelection && selection.parentPath.length === 0) {
      return Object.freeze({
        from: Math.max(0, Math.min(blockCount - 1, selection.index - 1)),
        to: Math.min(blockCount, selection.index + 1),
      });
    }
    const from = selection.path[0] ?? 0;
    const to = Math.min(blockCount, (selection.endPath[0] ?? from) + 1);
    return Object.freeze({ from, to });
  }

  private onVirtualBeforePrint = (): void => {
    if (!this.virtualized) return;
    this.virtualPrintResume = true;
    this.setVirtualizationSuspended(true);
  };

  private onVirtualAfterPrint = (): void => {
    if (!this.virtualPrintResume) return;
    this.virtualPrintResume = false;
    this.setVirtualizationSuspended(false);
  };

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
          // Attribute/history steps may describe a same-size node replacement
          // without a useful positional range. In that case the NodeView's own
          // update hook remains the authority on whether same-path reuse is safe.
          if (!path && samePathNode.type === entry.node.type) path = entry.path;
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
        'data-fountain-block-active',
        'data-fountain-block-handle-active',
        'data-fountain-block-grabbed',
        'data-fountain-drop-position',
        'data-fountain-dragging',
        'data-fountain-editable-page',
        'data-fountain-editable-page-intent',
        'draggable',
      ].includes(mutation.attributeName ?? '')) continue;
      if (isEditablePageStyleMutation(mutation)) continue;
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
      attributeOldValue: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  private samePath(left: readonly number[], right: readonly number[]): boolean {
    return left.length === right.length && left.every((part, index) => part === right[index]);
  }
}
