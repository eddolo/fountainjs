import {
  Decoration,
  DecorationSet,
  Node,
  Plugin,
  PluginKey,
  SelectionBookmark,
  isSafeURL,
  isTextSelection,
  textPointToPosition,
  type AnySelection,
  type Editor,
  type NodeJSON,
  type Transaction,
} from '../core';
import { defineExtension, type FountainExtension } from './extension';

export type CollaborationStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface CollaborationUser {
  readonly id: string;
  readonly name: string;
  /** Six-digit CSS hex colour used only after validation. */
  readonly color: string;
  readonly avatar?: string;
}

/** Structural positions use the same units as `Node.nodeSize`. */
export interface CollaborationSelection {
  readonly anchor: number;
  readonly head: number;
}

export interface CollaborationPresence {
  readonly clientId: string;
  readonly user: CollaborationUser;
  readonly selection?: CollaborationSelection;
}

export interface CollaborationError {
  readonly message: string;
  readonly recoverable: boolean;
}

export interface CollaborationState {
  readonly status: CollaborationStatus;
  readonly presences: readonly CollaborationPresence[];
  readonly error?: CollaborationError;
}

export interface RemoteDocumentOptions {
  /** An adapter-resolved selection for the local user after the remote update. */
  readonly selection?: AnySelection;
  /** Provider/CRDT-specific provenance exposed as transaction metadata. */
  readonly origin?: unknown;
}

export interface CollaborationAdapterContext {
  readonly editor: Editor;
  applyRemoteDocument(document: Node | NodeJSON, options?: RemoteDocumentOptions): boolean;
  setPresences(presences: readonly CollaborationPresence[]): void;
  setStatus(status: CollaborationStatus, error?: CollaborationError | string): void;
}

export interface CollaborationLocalUpdate {
  readonly before: Node;
  readonly document: Node;
  readonly beforeSelection: AnySelection;
  readonly selection: AnySelection;
  readonly transaction: Transaction;
}

/**
 * Transport/CRDT boundary. Implementations may use Yjs, Automerge, a local
 * worker, WebSocket, WebRTC, IndexedDB, or a managed service.
 */
export interface CollaborationAdapter {
  connect(context: CollaborationAdapterContext): void | Promise<void>;
  disconnect?(): void | Promise<void>;
  onLocalUpdate?(update: CollaborationLocalUpdate): void | Promise<void>;
  onLocalSelection?(document: Node, selection: AnySelection): void | Promise<void>;
  undo?(): boolean;
  redo?(): boolean;
  canUndo?(): boolean;
  canRedo?(): boolean;
  stopCapturing?(): void;
  /** Final resource cleanup, called once when the editor is destroyed. */
  destroy?(): void;
}

export interface CollaborationExtensionOptions {
  /** A fresh adapter is created for each editor instance. */
  adapter: (editor: Editor) => CollaborationAdapter;
  autoConnect?: boolean;
}

interface CollaborationRuntime {
  readonly editor: Editor;
  readonly adapter: CollaborationAdapter;
  readonly context: CollaborationAdapterContext;
  unsubscribe: () => void;
  generation: number;
  connected: boolean;
  destroyed: boolean;
}

const STATE_META = 'fountain$collaborationState';
export const COLLABORATION_REMOTE_META = 'fountain$collaborationRemote';
export const COLLABORATION_ORIGIN_META = 'fountain$collaborationOrigin';
export const collaborationKey = new PluginKey<CollaborationState>('collaboration');
const runtimes = new WeakMap<Editor, CollaborationRuntime>();

function immutableError(error?: CollaborationError | string): CollaborationError | undefined {
  if (!error) return undefined;
  const value = typeof error === 'string' ? { message: error, recoverable: true } : error;
  return Object.freeze({ message: String(value.message).slice(0, 2_000), recoverable: Boolean(value.recoverable) });
}

function validText(value: unknown, maximum: number): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function normalizePresence(value: CollaborationPresence, maximum: number): CollaborationPresence | null {
  if (!validText(value?.clientId, 200)
    || !/^[\w.:@/-]+$/.test(value.clientId)
    || !validText(value?.user?.id, 200)
    || !/^[\w.:@/-]+$/.test(value.user.id)
    || !validText(value?.user?.name, 200)
    || !/^#[\da-f]{6}$/i.test(value?.user?.color ?? '')) return null;
  const avatar = value.user.avatar;
  const user = Object.freeze({
    id: value.user.id.trim(),
    name: value.user.name.trim(),
    color: value.user.color.toLowerCase(),
    ...(typeof avatar === 'string' && avatar.length <= 2_048 && isSafeURL(avatar, { allowDataImage: true })
      ? { avatar: avatar.trim() }
      : {}),
  });
  const selection = value.selection;
  const normalizedSelection = selection
    && Number.isInteger(selection.anchor)
    && Number.isInteger(selection.head)
    && selection.anchor >= 0
    && selection.head >= 0
    ? Object.freeze({
      anchor: Math.min(selection.anchor, maximum),
      head: Math.min(selection.head, maximum),
    })
    : undefined;
  return Object.freeze({
    clientId: value.clientId.trim(),
    user,
    ...(normalizedSelection ? { selection: normalizedSelection } : {}),
  });
}

function normalizePresences(values: readonly CollaborationPresence[], document: Node): readonly CollaborationPresence[] {
  const maximum = Math.max(0, document.nodeSize - 2);
  const unique = new Map<string, CollaborationPresence>();
  const supplied = Array.isArray(values) ? values : [];
  supplied.slice(0, 1_000).forEach((value) => {
    const normalized = normalizePresence(value, maximum);
    if (normalized) unique.set(normalized.clientId, normalized);
  });
  return Object.freeze([...unique.values()].sort((left, right) => left.clientId.localeCompare(right.clientId)));
}

function initialState(): CollaborationState {
  return Object.freeze({ status: 'disconnected', presences: Object.freeze([]) });
}

function snapshot(
  status: CollaborationStatus,
  presences: readonly CollaborationPresence[],
  error?: CollaborationError,
): CollaborationState {
  return Object.freeze({ status, presences, ...(error ? { error } : {}) });
}

function setState(editor: Editor, value: CollaborationState): void {
  if (editor.isDestroyed) return;
  editor.dispatch(editor.state.createTransaction()
    .setMeta(STATE_META, value)
    .setMeta('addToHistory', false)
    .setMeta('force', true));
}

function preserveTextSelection(editor: Editor, next: Node): AnySelection | undefined {
  const selection = editor.state.selection;
  if (!isTextSelection(selection)) return undefined;
  try {
    const from = textPointToPosition(editor.state.doc, selection.path, selection.from);
    const bookmark = selection.isCollapsed
      ? SelectionBookmark.cursor(from)
      : SelectionBookmark.fromSelection(editor.state.doc, selection);
    return bookmark.resolve(next);
  } catch { return undefined; }
}

function applyRemoteDocument(
  runtime: CollaborationRuntime,
  document: Node | NodeJSON,
  options: RemoteDocumentOptions = {},
): boolean {
  if (runtime.destroyed || runtime.editor.isDestroyed) return false;
  try {
    const schema = runtime.editor.state.schema;
    const next = document instanceof Node ? document : schema.nodeFromJSON(document);
    schema.validate(next);
    if (next.type !== schema.topNodeType) throw new Error('A collaborative document must use the configured top node type.');
    const currentDocument = runtime.editor.state.doc;
    const selection = options.selection ?? (next.eq(currentDocument) ? undefined : preserveTextSelection(runtime.editor, next));
    if (next.eq(currentDocument)) {
      if (!selection || selection.eq(runtime.editor.state.selection)) return false;
      return runtime.editor.dispatch(runtime.editor.state.createTransaction()
        .setSelection(selection)
        .setMeta(COLLABORATION_REMOTE_META, true)
        .setMeta(COLLABORATION_ORIGIN_META, options.origin)
        .setMeta('addToHistory', false));
    }
    const transaction = runtime.editor.state.createTransaction()
      .replace(0, runtime.editor.state.doc.childCount, next.content)
      .setMeta(COLLABORATION_REMOTE_META, true)
      .setMeta(COLLABORATION_ORIGIN_META, options.origin)
      .setMeta('addToHistory', false);
    if (selection) transaction.setSelection(selection);
    return runtime.editor.dispatch(transaction);
  } catch (error) {
    runtime.context.setStatus('error', {
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
    });
    return false;
  }
}

function contain(runtime: CollaborationRuntime, operation: () => void | Promise<void>): void {
  try {
    const result = operation();
    if (result && typeof result.then === 'function') {
      void result.catch((error) => runtime.context.setStatus('error', {
        message: error instanceof Error ? error.message : String(error), recoverable: true,
      }));
    }
  } catch (error) {
    runtime.context.setStatus('error', {
      message: error instanceof Error ? error.message : String(error), recoverable: true,
    });
  }
}

function start(runtime: CollaborationRuntime, reconnecting = false): boolean {
  if (runtime.destroyed || runtime.connected) return false;
  runtime.connected = true;
  const generation = ++runtime.generation;
  runtime.context.setStatus(reconnecting ? 'reconnecting' : 'connecting');
  try {
    const result = runtime.adapter.connect(runtime.context);
    if (result && typeof result.then === 'function') {
      void result.then(() => {
        if (!runtime.destroyed && runtime.connected && runtime.generation === generation
          && collaborationKey.get(runtime.editor.state)?.status !== 'error') runtime.context.setStatus('connected');
      }).catch((error) => {
        if (runtime.generation === generation) {
          runtime.connected = false;
          contain(runtime, () => runtime.adapter.disconnect?.());
          runtime.context.setStatus('error', {
            message: error instanceof Error ? error.message : String(error), recoverable: true,
          });
        }
      });
    } else if (collaborationKey.get(runtime.editor.state)?.status !== 'error') runtime.context.setStatus('connected');
    contain(runtime, () => runtime.adapter.onLocalSelection?.(runtime.editor.state.doc, runtime.editor.state.selection));
    return true;
  } catch (error) {
    runtime.connected = false;
    contain(runtime, () => runtime.adapter.disconnect?.());
    runtime.context.setStatus('error', {
      message: error instanceof Error ? error.message : String(error), recoverable: true,
    });
    return false;
  }
}

function stop(runtime: CollaborationRuntime, destroyed = false): boolean {
  if (!runtime.connected && !destroyed) return false;
  runtime.connected = false;
  runtime.generation++;
  contain(runtime, () => runtime.adapter.disconnect?.());
  if (!destroyed) setState(runtime.editor, snapshot('disconnected', Object.freeze([])));
  return true;
}

function collaboratorDecorations(state: CollaborationState, document: Node): DecorationSet {
  if (typeof globalThis.document === 'undefined') return DecorationSet.empty;
  const maximum = Math.max(0, document.nodeSize - 2);
  const decorations: Decoration[] = [];
  state.presences.forEach((presence) => {
    if (!presence.selection) return;
    const anchor = Math.min(presence.selection.anchor, maximum);
    const head = Math.min(presence.selection.head, maximum);
    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    const identity = `collaboration-${presence.clientId}`;
    if (from < to) decorations.push(Decoration.inline(from, to, {
      class: 'fountain-collaboration-selection',
      style: `--fountain-collaborator-color:${presence.user.color}`,
      'data-fountain-collaborator': presence.clientId,
    }, { key: `${identity}-selection`, inclusiveStart: false, inclusiveEnd: false }));
    decorations.push(Decoration.widget(head, () => {
      const caret = globalThis.document.createElement('span');
      caret.className = 'fountain-collaboration-caret';
      caret.style.setProperty('--fountain-collaborator-color', presence.user.color);
      caret.dataset.fountainCollaborator = presence.clientId;
      caret.setAttribute('aria-label', `${presence.user.name}'s cursor`);
      caret.title = `${presence.user.name}'s cursor`;
      const label = globalThis.document.createElement('span');
      label.textContent = presence.user.name;
      label.setAttribute('aria-hidden', 'true');
      caret.appendChild(label);
      return caret;
    }, { key: `${identity}-caret`, side: head < anchor ? -1 : 1 }));
  });
  return DecorationSet.create(document, decorations);
}

export function getCollaborationState(editor: Editor): CollaborationState | undefined {
  return collaborationKey.get(editor.state);
}

export function connectCollaboration(editor: Editor): boolean {
  const runtime = runtimes.get(editor);
  return runtime ? start(runtime) : false;
}

export function disconnectCollaboration(editor: Editor): boolean {
  const runtime = runtimes.get(editor);
  return runtime ? stop(runtime) : false;
}

export function reconnectCollaboration(editor: Editor): boolean {
  const runtime = runtimes.get(editor);
  if (!runtime || runtime.destroyed) return false;
  stop(runtime);
  return start(runtime, true);
}

export function undoCollaboration(editor: Editor): boolean {
  return runtimes.get(editor)?.adapter.undo?.() ?? false;
}

export function redoCollaboration(editor: Editor): boolean {
  return runtimes.get(editor)?.adapter.redo?.() ?? false;
}

export function canUndoCollaboration(editor: Editor): boolean {
  return runtimes.get(editor)?.adapter.canUndo?.() ?? false;
}

export function canRedoCollaboration(editor: Editor): boolean {
  return runtimes.get(editor)?.adapter.canRedo?.() ?? false;
}

export function closeCollaborationHistory(editor: Editor): boolean {
  const adapter = runtimes.get(editor)?.adapter;
  if (!adapter?.stopCapturing) return false;
  adapter.stopCapturing();
  return true;
}

export function createCollaborationExtension(options: CollaborationExtensionOptions): FountainExtension {
  if (typeof options?.adapter !== 'function') throw new TypeError('Collaboration requires an adapter factory.');
  const plugin = new Plugin<CollaborationState>({
    key: collaborationKey,
    state: {
      init: initialState,
      apply: (transaction, value, _oldState, newState) => {
        const next = transaction.getMeta<CollaborationState>(STATE_META);
        if (next) return snapshot(next.status, normalizePresences(next.presences, newState.doc), next.error);
        if (!transaction.docChanged || !value.presences.some((presence) => presence.selection)) return value;
        return snapshot(value.status, normalizePresences(value.presences, newState.doc), value.error);
      },
    },
    props: {
      decorations: (state) => collaboratorDecorations(collaborationKey.get(state) ?? initialState(), state.doc),
      onCreate: (editor) => {
        let adapter: CollaborationAdapter;
        try { adapter = options.adapter(editor); }
        catch (error) {
          setState(editor, snapshot('error', Object.freeze([]), immutableError({
            message: error instanceof Error ? error.message : String(error), recoverable: false,
          })));
          return;
        }
        let runtime: CollaborationRuntime;
        const context: CollaborationAdapterContext = {
          editor,
          applyRemoteDocument: (document, remoteOptions) => applyRemoteDocument(runtime, document, remoteOptions),
          setPresences: (presences) => {
            if (runtime.destroyed) return;
            const current = collaborationKey.get(editor.state) ?? initialState();
            setState(editor, snapshot(current.status, normalizePresences(presences, editor.state.doc), current.error));
          },
          setStatus: (status, error) => {
            if (runtime.destroyed) return;
            const current = collaborationKey.get(editor.state) ?? initialState();
            setState(editor, snapshot(status, current.presences, immutableError(error)));
          },
        };
        runtime = {
          editor, adapter, context, unsubscribe: () => {}, generation: 0, connected: false, destroyed: false,
        };
        runtime.unsubscribe = editor.subscribe((state, transaction) => {
          if (transaction.getMeta(STATE_META)) return;
          if (runtime.connected && transaction.docChanged && transaction.getMeta(COLLABORATION_REMOTE_META) !== true) {
            contain(runtime, () => adapter.onLocalUpdate?.({
              before: transaction.originalDoc,
              document: state.doc,
              beforeSelection: transaction.originalSelection,
              selection: state.selection,
              transaction,
            }));
          }
          if (runtime.connected && (transaction.docChanged || transaction.selectionSet)) {
            contain(runtime, () => adapter.onLocalSelection?.(state.doc, state.selection));
          }
        });
        runtimes.set(editor, runtime);
        if (options.autoConnect !== false) start(runtime);
      },
      onDestroy: (editor) => {
        const runtime = runtimes.get(editor);
        if (!runtime) return;
        runtime.unsubscribe();
        runtime.destroyed = true;
        stop(runtime, true);
        contain(runtime, () => runtime.adapter.destroy?.());
        runtimes.delete(editor);
      },
    },
  });
  return defineExtension({
    name: 'collaboration',
    plugins: [plugin],
    commands: {
      connectCollaboration,
      disconnectCollaboration,
      reconnectCollaboration,
      undoCollaboration,
      redoCollaboration,
      canUndoCollaboration,
      canRedoCollaboration,
      closeCollaborationHistory,
    },
    services: { collaboration: Object.freeze({ key: collaborationKey }) },
  });
}
