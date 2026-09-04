import {
  AllSelection,
  CellSelection,
  GapSelection,
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  type AnySelection,
  type Editor,
  type EditorState,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import { defineExtension, type FountainExtension } from './extension';

export type FountainMenuKind = 'bubble' | 'floating';

export interface FountainMenuVisibilityContext {
  readonly editor: Editor;
  readonly state: EditorState;
  readonly selection: AnySelection;
  readonly defaultOpen: boolean;
}

export interface FountainMenuOptions {
  /** Creates an independently composable named instance. */
  readonly id?: string;
  readonly showWhenReadOnly?: boolean;
  readonly shouldShow?: (context: FountainMenuVisibilityContext) => boolean;
}

export interface FountainMenuSnapshot {
  readonly kind: FountainMenuKind;
  readonly open: boolean;
  readonly state: EditorState;
  readonly selection: AnySelection;
  /** Nearest editable block for floating-menu anchoring. */
  readonly anchorPath: readonly number[] | null;
  readonly revision: number;
  readonly error?: string;
}

export type FountainMenuListener = (snapshot: FountainMenuSnapshot) => void;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function selectionIdentity(selection: AnySelection): string {
  if (selection instanceof NodeSelection) return `node:${selection.nodePath.join('.')}`;
  if (selection instanceof CellSelection) {
    return `cell:${selection.anchorCellPath.join('.')}:${selection.headCellPath.join('.')}`;
  }
  if (selection instanceof GapSelection) return `gap:${selection.position}:${selection.association}`;
  if (selection instanceof AllSelection) return 'all';
  return `text:${selection.path.join('.')}:${selection.from}:${selection.endPath.join('.')}:${selection.to}`;
}

function floatingAnchorPath(state: EditorState): readonly number[] | null {
  const selection = state.selection;
  if (!(selection instanceof Selection) || !selection.isCollapsed) return null;
  for (let depth = selection.path.length - 1; depth > 0; depth -= 1) {
    const path = selection.path.slice(0, depth);
    try {
      const node = getNodeAtPath(state.doc, path);
      if (!node.isText && node.isBlock) return Object.freeze(path);
    } catch { return null; }
  }
  return null;
}

function defaultVisibility(kind: FountainMenuKind, state: EditorState): boolean {
  const selection = state.selection;
  if (kind === 'bubble') {
    if (selection instanceof Selection) return !selection.isCollapsed;
    return selection instanceof NodeSelection || selection instanceof CellSelection || selection instanceof AllSelection;
  }
  const path = floatingAnchorPath(state);
  if (!path) return false;
  try { return getNodeAtPath(state.doc, path).textContent.length === 0; }
  catch { return false; }
}

/** Framework-neutral visibility/lifecycle state for bubble and floating menus. */
export class FountainMenuController {
  private readonly listeners = new Set<FountainMenuListener>();
  private readonly unsubscribe: () => void;
  private snapshot: FountainMenuSnapshot;
  private dismissedIdentity = '';
  private revision = 0;
  private destroyed = false;

  constructor(
    readonly editor: Editor,
    readonly kind: FountainMenuKind,
    private readonly options: FountainMenuOptions = {},
  ) {
    this.snapshot = this.computeSnapshot();
    this.unsubscribe = editor.subscribe(() => this.update());
  }

  getSnapshot = (): FountainMenuSnapshot => this.snapshot;

  subscribe = (listener: FountainMenuListener): (() => void) => {
    if (this.destroyed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Hides this menu until the model selection changes or refresh() is called. */
  dismiss(): boolean {
    if (this.destroyed || !this.snapshot.open) return false;
    this.dismissedIdentity = selectionIdentity(this.editor.state.selection);
    this.update();
    return true;
  }

  /** Re-evaluates custom visibility and clears a selection-local dismissal. */
  refresh(): boolean {
    if (this.destroyed) return false;
    this.dismissedIdentity = '';
    this.update();
    return true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    this.listeners.clear();
  }

  private computeSnapshot(): FountainMenuSnapshot {
    const state = this.editor.state;
    const selection = state.selection;
    const defaultOpen = defaultVisibility(this.kind, state);
    let eligible = defaultOpen;
    let error: string | undefined;
    if (this.options.shouldShow) {
      try {
        eligible = Boolean(this.options.shouldShow({ editor: this.editor, state, selection, defaultOpen }));
      } catch (cause) {
        eligible = false;
        error = errorMessage(cause);
      }
    }
    if (!this.options.showWhenReadOnly && !this.editor.editable) eligible = false;
    const open = eligible && selectionIdentity(selection) !== this.dismissedIdentity;
    return Object.freeze({
      kind: this.kind,
      open,
      state,
      selection,
      anchorPath: this.kind === 'floating' ? floatingAnchorPath(state) : null,
      revision: this.revision,
      ...(error ? { error } : {}),
    });
  }

  private update(): void {
    this.revision += 1;
    this.snapshot = this.computeSnapshot();
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

export interface FountainMenuService {
  readonly kind: FountainMenuKind;
  readonly id: string;
  readonly key: PluginKey<null>;
  getController(editor: Editor): FountainMenuController;
}

function normalizedId(value: string | undefined, kind: FountainMenuKind): string {
  const id = value === undefined ? 'default' : value.trim();
  if (!id) throw new TypeError(`${kind} menu ids require a non-empty value.`);
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new TypeError(`${kind} menu ids may contain only letters, numbers, dots, underscores, and hyphens.`);
  }
  return id;
}

function createMenuExtension(kind: FountainMenuKind, options: FountainMenuOptions): FountainExtension {
  const id = normalizedId(options.id, kind);
  const key = new PluginKey<null>(`${kind}-menu:${id}`);
  const controllers = new WeakMap<Editor, FountainMenuController>();
  const getController = (editor: Editor): FountainMenuController => {
    const existing = controllers.get(editor);
    if (existing) return existing;
    const controller = new FountainMenuController(editor, kind, options);
    controllers.set(editor, controller);
    return controller;
  };
  const plugin = new Plugin<null>({
    key,
    props: {
      onDestroy: (editor) => {
        controllers.get(editor)?.destroy();
        controllers.delete(editor);
      },
    },
  });
  const service: FountainMenuService = Object.freeze({ kind, id, key, getController });
  const defaultName = kind === 'bubble' ? 'bubbleMenu' : 'floatingMenu';
  const serviceName = id === 'default' ? defaultName : `${defaultName}:${id}`;
  return defineExtension({
    name: id === 'default' ? `${kind}-menu` : `${kind}-menu:${id}`,
    plugins: [plugin],
    services: { [serviceName]: service },
  });
}

export function createBubbleMenuExtension(options: FountainMenuOptions = {}): FountainExtension {
  return createMenuExtension('bubble', options);
}

export function createFloatingMenuExtension(options: FountainMenuOptions = {}): FountainExtension {
  return createMenuExtension('floating', options);
}

export const BubbleMenuExtension = createBubbleMenuExtension();
export const FloatingMenuExtension = createFloatingMenuExtension();
