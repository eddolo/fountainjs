import {
  Decoration,
  DecorationSet,
  Node,
  Plugin,
  PluginKey,
  REBROADCAST_APPEND_TRANSACTION_META,
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
  /** Applies a validated, current-state transaction without serializing the document. */
  applyRemoteTransaction(transaction: Transaction, options?: RemoteDocumentOptions): boolean;
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

export interface ReplaceCollaborationAdapterOptions {
  /** Connect the replacement. Defaults to preserving the current connection intent. */
  readonly connect?: boolean;
}

interface CollaborationRuntime {
  readonly editor: Editor;
  adapter: CollaborationAdapter;
  context?: CollaborationAdapterContext;
  unsubscribe: () => void;
  generation: number;
  connected: boolean;
  destroyed: boolean;
  readonly destroyedAdapters: WeakSet<CollaborationAdapter>;
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
  context: CollaborationAdapterContext,
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
    context.setStatus('error', {
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
    });
    return false;
  }
}

function applyRemoteTransaction(
  runtime: CollaborationRuntime,
  context: CollaborationAdapterContext,
  transaction: Transaction,
  options: RemoteDocumentOptions = {},
): boolean {
  if (runtime.destroyed || runtime.editor.isDestroyed) return false;
  try {
    const editor = runtime.editor;
    if (transaction.originalDoc !== editor.state.doc) {
      throw new Error('A remote transaction must start from the editor current document.');
    }
    editor.state.schema.validate(transaction.doc);
    if (transaction.doc.type !== editor.state.schema.topNodeType) {
      throw new Error('A collaborative transaction must retain the configured top node type.');
    }
    if (options.selection) transaction.setSelection(options.selection);
    transaction
      .setMeta(COLLABORATION_REMOTE_META, true)
      .setMeta(COLLABORATION_ORIGIN_META, options.origin)
      .setMeta('addToHistory', false);
    return editor.dispatch(transaction);
  } catch (error) {
    context.setStatus('error', {
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
    });
    return false;
  }
}

function reportRuntimeError(runtime: CollaborationRuntime, error: unknown, generation: number): void {
  if (runtime.destroyed || runtime.editor.isDestroyed || runtime.generation !== generation) return;
  const current = collaborationKey.get(runtime.editor.state) ?? initialState();
  setState(runtime.editor, snapshot('error', current.presences, immutableError({
    message: error instanceof Error ? error.message : String(error), recoverable: true,
  })));
}

function contain(
  runtime: CollaborationRuntime,
  operation: () => void | Promise<void>,
  generation = runtime.generation,
): void {
  try {
    const result = operation();
    if (result && typeof result.then === 'function') {
      void result.catch((error) => reportRuntimeError(runtime, error, generation));
    }
  } catch (error) {
    reportRuntimeError(runtime, error, generation);
  }
}

function adapterFrom(
  editor: Editor,
  source: CollaborationAdapter | ((editor: Editor) => CollaborationAdapter),
): CollaborationAdapter {
  const adapter = typeof source === 'function' ? source(editor) : source;
  if (!adapter || typeof adapter !== 'object' || typeof adapter.connect !== 'function') {
    throw new TypeError('A collaboration adapter must provide connect(context).');
  }
  return adapter;
}

function createContext(
  runtime: CollaborationRuntime,
  adapter: CollaborationAdapter,
  generation: number,
): CollaborationAdapterContext {
  let context!: CollaborationAdapterContext;
  const active = () => !runtime.destroyed
    && !runtime.editor.isDestroyed
    && runtime.connected
    && runtime.generation === generation
    && runtime.adapter === adapter
    && runtime.context === context;
  context = Object.freeze({
    editor: runtime.editor,
    applyRemoteTransaction: (transaction: Transaction, options?: RemoteDocumentOptions) => (
      active() ? applyRemoteTransaction(runtime, context, transaction, options) : false
    ),
    applyRemoteDocument: (document: Node | NodeJSON, options?: RemoteDocumentOptions) => (
      active() ? applyRemoteDocument(runtime, context, document, options) : false
    ),
    setPresences: (presences: readonly CollaborationPresence[]) => {
      if (!active()) return;
      const current = collaborationKey.get(runtime.editor.state) ?? initialState();
      setState(runtime.editor, snapshot(
        current.status,
        normalizePresences(presences, runtime.editor.state.doc),
        current.error,
      ));
    },
    setStatus: (status: CollaborationStatus, error?: CollaborationError | string) => {
      if (!active()) return;
      const current = collaborationKey.get(runtime.editor.state) ?? initialState();
      setState(runtime.editor, snapshot(status, current.presences, immutableError(error)));
    },
  });
  return context;
}

function destroyAdapter(runtime: CollaborationRuntime, adapter: CollaborationAdapter): void {
  if (runtime.destroyedAdapters.has(adapter)) return;
  runtime.destroyedAdapters.add(adapter);
  contain(runtime, () => adapter.destroy?.());
}

function start(runtime: CollaborationRuntime, reconnecting = false): boolean {
  if (runtime.destroyed || runtime.connected) return false;
  runtime.connected = true;
  const generation = ++runtime.generation;
  const adapter = runtime.adapter;
  const context = createContext(runtime, adapter, generation);
  runtime.context = context;
  context.setStatus(reconnecting ? 'reconnecting' : 'connecting');
  try {
    const result = adapter.connect(context);
    if (result && typeof result.then === 'function') {
      void result.then(() => {
        if (!runtime.destroyed && runtime.connected && runtime.generation === generation
          && runtime.adapter === adapter && runtime.context === context
          && collaborationKey.get(runtime.editor.state)?.status !== 'error') context.setStatus('connected');
      }).catch((error) => {
        if (!runtime.destroyed && runtime.generation === generation
          && runtime.adapter === adapter && runtime.context === context) {
          runtime.connected = false;
          runtime.context = undefined;
          contain(runtime, () => adapter.disconnect?.(), generation);
          const current = collaborationKey.get(runtime.editor.state) ?? initialState();
          setState(runtime.editor, snapshot('error', current.presences, immutableError({
            message: error instanceof Error ? error.message : String(error), recoverable: true,
          })));
        }
      });
    } else if (collaborationKey.get(runtime.editor.state)?.status !== 'error') context.setStatus('connected');
    contain(runtime, () => adapter.onLocalSelection?.(runtime.editor.state.doc, runtime.editor.state.selection), generation);
    return true;
  } catch (error) {
    runtime.connected = false;
    runtime.context = undefined;
    contain(runtime, () => adapter.disconnect?.(), generation);
    const current = collaborationKey.get(runtime.editor.state) ?? initialState();
    setState(runtime.editor, snapshot('error', current.presences, immutableError({
      message: error instanceof Error ? error.message : String(error), recoverable: true,
    })));
    return false;
  }
}

function stop(runtime: CollaborationRuntime, destroyed = false): boolean {
  if (!runtime.connected && !destroyed) return false;
  runtime.connected = false;
  const generation = ++runtime.generation;
  const adapter = runtime.adapter;
  runtime.context = undefined;
  if (!destroyed) setState(runtime.editor, snapshot('disconnected', Object.freeze([])));
  contain(runtime, () => adapter.disconnect?.(), generation);
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

export function getCollaborationAdapter(editor: Editor): CollaborationAdapter | undefined {
  return runtimes.get(editor)?.adapter;
}

/**
 * Atomically retires the current adapter and binds a fresh document/provider
 * session to the same editor. Callbacks retained by the old adapter become
 * inert before its disconnect and destroy hooks run.
 */
export function replaceCollaborationAdapter(
  editor: Editor,
  source: CollaborationAdapter | ((editor: Editor) => CollaborationAdapter),
  options: ReplaceCollaborationAdapterOptions = {},
): boolean {
  const runtime = runtimes.get(editor);
  if (!runtime || runtime.destroyed) return false;
  let replacement: CollaborationAdapter;
  try { replacement = adapterFrom(editor, source); }
  catch (error) {
    reportRuntimeError(runtime, error, runtime.generation);
    return false;
  }
  if (replacement === runtime.adapter) {
    return options.connect === true && !runtime.connected ? start(runtime) : false;
  }
  const shouldConnect = options.connect ?? runtime.connected;
  const wasConnected = runtime.connected;
  const previous = runtime.adapter;
  if (runtime.connected) stop(runtime);
  else {
    runtime.generation++;
    runtime.context = undefined;
    setState(runtime.editor, snapshot('disconnected', Object.freeze([])));
  }
  destroyAdapter(runtime, previous);
  runtime.adapter = replacement;
  return shouldConnect ? start(runtime, wasConnected) : true;
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
        try { adapter = adapterFrom(editor, options.adapter); }
        catch (error) {
          setState(editor, snapshot('error', Object.freeze([]), immutableError({
            message: error instanceof Error ? error.message : String(error), recoverable: false,
          })));
          return;
        }
        const runtime: CollaborationRuntime = {
          editor,
          adapter,
          unsubscribe: () => {},
          generation: 0,
          connected: false,
          destroyed: false,
          destroyedAdapters: new WeakSet(),
        };
        runtime.unsubscribe = editor.subscribe((state, transaction) => {
          if (transaction.getMeta(STATE_META)) return;
          const activeAdapter = runtime.adapter;
          const generation = runtime.generation;
          const rebroadcastRepair = transaction.getMeta(REBROADCAST_APPEND_TRANSACTION_META) === true;
          if (runtime.connected && transaction.docChanged
            && (transaction.getMeta(COLLABORATION_REMOTE_META) !== true || rebroadcastRepair)) {
            contain(runtime, () => activeAdapter.onLocalUpdate?.({
              before: transaction.originalDoc,
              document: state.doc,
              beforeSelection: transaction.originalSelection,
              selection: state.selection,
              transaction,
            }), generation);
          }
          if (runtime.connected && (transaction.docChanged || transaction.selectionSet)) {
            contain(runtime, () => activeAdapter.onLocalSelection?.(state.doc, state.selection), generation);
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
        destroyAdapter(runtime, runtime.adapter);
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
      replaceCollaborationAdapter,
    },
    services: { collaboration: Object.freeze({ key: collaborationKey }) },
  });
}
