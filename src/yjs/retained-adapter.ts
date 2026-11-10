import * as Y from 'yjs';
import { EditorState, isSafeURL, nodeRangeAtPath, textPointToPosition, type AnySelection, type Node } from '../core';
import { registerSharedDirectionIdentity } from '../core/shared-direction';
import { createCollaborationExtension, type CollaborationAdapter, type CollaborationAdapterContext,
  type CollaborationLocalUpdate, type CollaborationPresence, type CollaborationUser } from '../extensions/collaboration';
import type { YjsAwareness, YjsExtensionOptions } from './types';
import { RetainedDocumentStore, validateRetainedDocument } from './retained-document';
import { retainedIdentityAllocator } from './retained-nodes';
import { removesOnlyDuplicateProvenance } from './retained-text';
import { retainSelection, restoreSelection, type RetainedSelection } from './retained-selection';
import { YjsStructuredAttributeStore } from './structured-attributes';
import { declareRetainedStructuredMap } from './retained-structured-map';
import { prepareRetainedAdmission, readRetainedAdmission, snapshotRetainedAdmission, type RetainedAdmission, type RetainedAdmissionLease } from './retained-admission';
import { admittedRoomRootChanged, admittedRoomRoots } from './admitted-room-root';
import { retainedDirectionIdentity } from './retained-direction';

export interface RetainedYjsCollaborationExtensionOptions extends YjsExtensionOptions {
  /** Validate an authoritative existing-room snapshot before starting transport.
   * Without admission, provider-backed clients must already contain the room's
   * initialized native state. Isolated initialization without a provider is allowed. */
  readonly admission?: RetainedAdmission;
}

const GATE = 'fountain-retained-room', FORMAT = 'fountain-retained-document/3';
const BEFORE = Symbol('retained-selection-before'), AFTER = Symbol('retained-selection-after');
const REDUNDANT_UNDO = Symbol('retained-redundant-undo');

function user(value: CollaborationUser): CollaborationUser {
  if (!value || typeof value.id !== 'string' || !/^[\w.:@/-]{1,200}$/.test(value.id)
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200 || /[\u0000-\u001f\u007f]/.test(value.name)
    || typeof value.color !== 'string' || !/^#[\da-f]{6}$/i.test(value.color)
    || value.avatar !== undefined && (typeof value.avatar !== 'string' || value.avatar.length > 2_048 || !isSafeURL(value.avatar, { allowDataImage: true }))) throw new TypeError('Invalid local user identity.');
  return Object.freeze({ id: value.id.trim(), name: value.name.trim(), color: value.color.toLowerCase(), ...(value.avatar ? { avatar: value.avatar.trim() } : {}) });
}

function bounds(document: Node, selection: AnySelection): { anchor: number; head: number } {
  if (selection.kind === 'range') return { anchor: selection.anchor, head: selection.head };
  if (selection.kind === 'gap') return { anchor: selection.position, head: selection.position };
  if (selection.kind === 'all') return { anchor: 0, head: document.nodeSize - 2 };
  if (selection.kind === 'node') return { anchor: selection.structuralFrom, head: selection.structuralTo };
  if (selection.kind === 'cell') {
    const first = nodeRangeAtPath(document, selection.anchorCellPath), last = nodeRangeAtPath(document, selection.headCellPath);
    return first.from <= last.from ? { anchor: first.from, head: last.to } : { anchor: first.to, head: last.from };
  }
  return { anchor: textPointToPosition(document, selection.path, selection.from), head: textPointToPosition(document, selection.endPath, selection.to) };
}

/** Retained-identity adapter used by the default /yjs entry.
 * Named retained rooms only; existing legacy data is refused, never auto-migrated. */
export class RetainedYjsCollaborationAdapter implements CollaborationAdapter {
  private readonly options: Pick<RetainedYjsCollaborationExtensionOptions, 'document' | 'provider' | 'captureTimeout'>;
  private readonly localAwareness?: YjsAwareness;
  private readonly structuredMapName?: string;
  private readonly room: string;
  private readonly fragment: Y.XmlFragment;
  private readonly localUser: CollaborationUser;
  private readonly origin = Object.freeze({ fountain: 'retained-local' });
  private readonly repair = Object.freeze({ fountain: 'retained-repair' });
  private readonly structured?: YjsStructuredAttributeStore;
  private readonly roomSeed = globalThis.crypto.randomUUID();
  private readonly allocateIdentity = retainedIdentityAllocator(this.roomSeed);
  private context?: CollaborationAdapterContext;
  private store?: RetainedDocumentStore;
  private manager?: Y.UndoManager;
  private historyPop?: { stack: Y.UndoManager['undoStack']; items: Y.UndoManager['undoStack'] };
  private roomId?: string;
  private roomConflict?: Error;
  private releaseDirection?: () => void;
  private localSelection?: RetainedSelection;
  private pendingHistory?: { before: RetainedSelection; after?: RetainedSelection };
  private providerActive = false;
  private presenceTimer?: ReturnType<typeof setTimeout>;
  private pendingPresence?: { value: Record<string, unknown>; signature: string };
  private published?: string;
  private lastPresence = Number.NEGATIVE_INFINITY;
  private readonly throttle: number;
  private readonly field: string;
  private destroyed = false;
  private readonly admission?: RetainedAdmission;
  private admissionController?: AbortController;
  // Keep the document from the last attached session until a join accepts it.
  private joinBaseline?: Node;
  private admissionLease?: RetainedAdmissionLease;

  constructor(options: RetainedYjsCollaborationExtensionOptions) {
    if (!(options?.document instanceof Y.Doc)) throw new TypeError('Yjs needs a Y.Doc.');
    // The adapter owns one session. Reusing the host's configuration object
    // must not redirect awaited admission, writes, or listener cleanup.
    this.options = { document: options.document, provider: options.provider, captureTimeout: options.captureTimeout };
    this.localAwareness = options.awareness ?? options.provider?.awareness;
    if (options.fragment !== undefined && (!(options.fragment instanceof Y.XmlFragment) || options.fragment.doc !== options.document)) throw new TypeError('Yjs needs a fragment belonging to its Y.Doc.');
    if (options.fragmentName !== undefined && typeof options.fragmentName !== 'string'
      || options.awarenessField !== undefined && typeof options.awarenessField !== 'string') throw new TypeError('Invalid retained room or awareness name.');
    const named = options.fragment && [...options.document.share].find(([, type]) => Object.is(type, options.fragment))?.[0];
    this.room = options.fragmentName ?? named ?? 'fountain';
    if (typeof this.room !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,193}$/.test(this.room) || options.fragment && (!named || named !== this.room)) throw new Error('Retained storage requires a compatible named root fragment.');
    this.fragment = options.document.getXmlFragment(this.room); this.localUser = user(options.user);
    this.field = options.awarenessField ?? 'fountain'; this.throttle = options.presenceThrottleMs ?? 32;
    if (!/^[\w.-]{1,100}$/.test(this.field) || !Number.isFinite(this.throttle) || this.throttle < 0 || this.throttle > 1_000
      || options.captureTimeout !== undefined && (!Number.isFinite(options.captureTimeout) || options.captureTimeout < 0)) throw new TypeError('Invalid retained collaboration timing or awareness options.');
    if (options.structuredAttributes) {
      this.structured = new YjsStructuredAttributeStore(options.document, options.structuredAttributes, `${this.room}:structured-attributes`);
      this.structuredMapName = options.structuredAttributes.mapName;
    }
    if (options.admission !== undefined) {
      this.admission = snapshotRetainedAdmission(options.admission);
    }
  }

  private gate(): string {
    if (this.roomConflict) throw this.roomConflict;
    if (admittedRoomRootChanged(this.fragment)) throw this.roomFailure('The admitted room root changed.');
    const entry = this.fragment.get(0);
    if (this.fragment.length !== 1 || !(entry instanceof Y.XmlElement) || entry.nodeName !== GATE || entry.length
      || Object.keys(entry.getAttributes()).length !== 2 || entry.getAttribute('format') !== FORMAT) {
      throw this.roomFailure('Legacy, incompatible or conflicting collaboration room; original shared data preserved.');
    }
    const id = entry.getAttribute('room');
    if (typeof id !== 'string' || !/^r-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) || this.roomId && id !== this.roomId) {
      throw this.roomFailure('Retained collaboration room identity changed.');
    }
    return id;
  }

  private roomFailure(message: string): Error {
    if (this.roomConflict) return this.roomConflict;
    if (!this.roomId) return new Error(message);
    const error = new Error(`${message} Preserve the local draft and replace the collaboration session.`);
    this.roomConflict = error;
    this.releaseDirection?.();
    this.releaseDirection = undefined;
    if (this.presenceTimer !== undefined) clearTimeout(this.presenceTimer);
    this.presenceTimer = undefined;
    this.pendingPresence = undefined;
    if (this.published !== undefined) {
      this.published = undefined;
      this.awareness()?.setLocalStateField(this.field, null);
    }
    this.context?.setPresences([]);
    return error;
  }

  private error(error: unknown): void { this.context?.setStatus('error', { message: error instanceof Error ? error.message : String(error), recoverable: true }); }
  private readonly awareness = () => this.localAwareness;
  private readonly awarenessChanged = (): void => { try { this.presences(); } catch (error) { this.error(error); } };
  private readonly providerStatus = (value: string | { status?: string }): void => {
    if (this.roomConflict) return;
    const status = typeof value === 'string' ? value : value.status;
    if (status === 'connected' || status === 'connecting' || status === 'reconnecting' || status === 'disconnected') this.context?.setStatus(status);
  };
  private readonly historyItem = (event: { stackItem: { meta: Map<unknown, unknown> }; origin: unknown }): void => {
    const manager = this.manager, current = this.poppedHistoryItem();
    if (manager && event.origin === manager && current) {
      // Yjs creates a new stack item for the inverse operation.
      for (const [key, value] of current.meta) event.stackItem.meta.set(key, value);
      return;
    }
    if (event.origin !== this.origin || !this.pendingHistory) return;
    if (!event.stackItem.meta.has(BEFORE)) event.stackItem.meta.set(BEFORE, this.pendingHistory.before);
    if (this.pendingHistory.after) event.stackItem.meta.set(AFTER, this.pendingHistory.after);
  };

  private canonical(transaction?: Y.Transaction, readOnly = false): Node {
    const store = this.store!, base = transaction ? store.readAfterRemote(transaction) : store.read();
    if (!this.structured) return base;
    const value = store.schema.nodeFromJSON(this.structured.overlay(base));
    if (!readOnly && !base.eq(value)) {
      const transaction = EditorState.create({ schema: store.schema, doc: base }).createTransaction();
      const visit = (before: Node, after: Node, path: number[]) => {
        if (before.type !== after.type || before.text !== after.text || before.childCount !== after.childCount
          || JSON.stringify(before.marks.map(mark => mark.toJSON())) !== JSON.stringify(after.marks.map(mark => mark.toJSON()))) throw new Error('Structured overlay changed document structure.');
        if (JSON.stringify(before.attrs) !== JSON.stringify(after.attrs)) {
          const attrs = Object.fromEntries([...new Set([...Object.keys(before.attrs), ...Object.keys(after.attrs)])].map(key => [key, after.attrs[key]]));
          transaction.setNodeAttrs(path, attrs);
        }
        before.content.forEach((child, index) => visit(child, after.child(index), [...path, index]));
      };
      visit(base, value, []);
      this.options.document.transact(() => store.apply(transaction), this.repair);
    }
    return value;
  }

  private apply(value: Node, selection: AnySelection | undefined, origin: unknown): void {
    const context = this.context!;
    const changed = !context.editor.state.doc.eq(value) || selection && !selection.eq(context.editor.state.selection);
    if (changed && !context.applyRemoteDocument(value, { selection, origin })) throw new Error('Editor rejected the shared document or selection.');
  }

  private readonly sharedChanged = (transaction: Y.Transaction): void => {
    const context = this.context;
    if (!context || !this.store || this.roomConflict || transaction.origin === this.origin || transaction.origin === this.repair) return;
    const changed = new Set<unknown>(transaction.changedParentTypes.keys());
    if (![this.fragment, ...this.store.observed, ...(this.structured ? [this.structured.map] : [])].some(type => changed.has(type))) return;
    try {
      this.gate();
      const manager = this.manager;
      const item = manager && transaction.origin === manager ? this.poppedHistoryItem() : undefined;
      const bookmark = manager && item && !item.meta.has(REDUNDANT_UNDO)
        ? item.meta.get(manager.undoing ? BEFORE : AFTER) as RetainedSelection | undefined
        : undefined;
      const value = this.canonical(transaction);
      const selection = restoreSelection(this.store, value, bookmark ?? this.localSelection);
      this.apply(value, selection, transaction.origin);
    } catch (error) {
      if (this.context === context) this.error(this.roomFailure(error instanceof Error ? error.message : String(error)));
      return;
    }
    if (this.context !== context || this.roomConflict) return;
    context.setStatus('connected');
    this.awarenessChanged();
  };

  connect(context: CollaborationAdapterContext): void | Promise<void> {
    if (this.destroyed || this.context) throw new Error('Retained adapter is destroyed or already connected.');
    if (this.roomConflict) throw this.roomConflict;
    this.joinBaseline ??= context.editor.state.doc;
    if (this.admission) {
      this.context = context;
      const controller = new AbortController(); this.admissionController = controller;
      return this.admit(context, controller);
    }
    return this.attach(context);
  }

  private checkDraft(context: CollaborationAdapterContext, shared: Node): void {
    const local = context.editor.state.doc;
    if (!local.eq(this.joinBaseline!) && !local.eq(shared)) {
      throw new Error('Unresolved local draft. Save it before rejoining.');
    }
  }

  private async admit(context: CollaborationAdapterContext, controller: AbortController): Promise<void> {
    const current = () => !controller.signal.aborted && !this.destroyed && this.context === context;
    let attaching = false;
    try {
      const response = await this.admission!.load(controller.signal);
      if (!current()) return;
      const { checkpoint, reference } = readRetainedAdmission(response, this.admission!, this.admissionLease);
      const document = this.options.document, structured = this.structured;
      // Reuse the normalized definitions and the actual top-level map binding.
      const mapName = structured && [...document.share].find(([, type]) => Object.is(type, structured.map))?.[0];
      const projection = structured && mapName !== undefined
        ? { mapName, definitions: structured.definitions, identityAttribute: structured.identityAttribute } : undefined;
      const candidate = await prepareRetainedAdmission(document, checkpoint, context.editor.state.schema, this.admission!.schemaVersion, this.room, projection);
      if (!current()) return;
      this.checkDraft(context, candidate.document);
      const lease = reference ? Object.freeze({ ...reference, room: this.room, identity: candidate.identity }) : undefined;
      if (lease && this.admissionLease && lease.identity !== this.admissionLease.identity) throw new Error('Authority admission room identity changed; original client preserved.');
      if (lease) { await this.admission!.authority!.bind(lease, controller.signal); if (!current()) return; this.checkDraft(context, candidate.document); }
      candidate.install(this.repair);
      if (!current()) return;
      this.admissionLease = lease;
      attaching = true;
      await this.attach(context);
      if (current()) this.admissionController = undefined;
    } catch (error) {
      // attach() and the generic lifecycle own transport failures. A rejected
      // retired request must never disconnect a newer session on this adapter.
      if (attaching) throw error;
      if (!current()) return;
      try { void this.disconnect()?.catch(() => undefined); } catch { /* Preserve the admission failure. */ }
      throw error;
    }
  }

  private attach(context: CollaborationAdapterContext): void | Promise<void> {
    const fresh = this.fragment.length === 0 && this.options.document.getMap(`${this.room}:document`).size === 0;
    if (fresh && this.admission) throw new Error('Admission requires an already initialized retained room.');
    const { store } = this.options.document;
    if (fresh && (store.pendingStructs || store.pendingDs)) {
      // Retrying this adapter after the missing bytes arrive would replace the draft.
      this.roomConflict = new Error('Cannot initialize a room with unresolved update dependencies. Preserve the local draft and replace the collaboration session.');
      throw this.roomConflict;
    }
    if (fresh && this.options.provider) {
      // Provider sync may reveal an existing legacy room. Seeding locally first
      // would publish a retained root into it before either client can refuse.
      this.roomConflict = new Error('Cannot initialize an empty provider-backed room before admission. Load the authoritative retained checkpoint and replace the collaboration session; local draft preserved.');
      throw this.roomConflict;
    }
    if (!fresh || admittedRoomRoots.has(this.fragment)) this.roomId = this.gate();
    this.context = context;
    try {
      if (!this.admission && this.store && !context.editor.state.doc.eq(this.joinBaseline!)) {
        // Refuse a known draft conflict before repairing shared structured data.
        this.checkDraft(context, this.canonical(undefined, true));
      }
      validateRetainedDocument(context.editor.state.doc, context.editor.state.schema); this.structured?.validate(context.editor.state.doc);
      if (this.context !== context) return;
      this.options.document.transact(() => {
        this.store ??= new RetainedDocumentStore(this.options.document, this.room, context.editor.state.schema, this.allocateIdentity, this.origin);
        if (this.store.schema !== context.editor.state.schema) throw new Error('Retained adapter belongs to another editor schema.');
        if (fresh) {
          this.store.seed(context.editor.state.doc); this.structured?.synchronize(context.editor.state.doc);
          const mapName = this.structuredMapName;
          if (mapName && this.options.document.share.get(mapName) === this.structured?.map) {
            declareRetainedStructuredMap(this.options.document, this.room, mapName);
          }
          const gate = new Y.XmlElement(GATE);
          const roomId = `r-${this.roomSeed}`;
          gate.setAttribute('format', FORMAT); gate.setAttribute('room', roomId);
          this.fragment.insert(0, [gate]); this.roomId = roomId;
        } else this.structured?.initialize(this.store.read());
      }, this.origin);
      // Host observers can cancel or restart the join during setup.
      if (this.context !== context) return;
      const value = this.canonical(), selection = restoreSelection(this.store!, value, this.localSelection);
      if (this.context !== context) return;
      this.checkDraft(context, value);
      this.joinBaseline = undefined;
      this.apply(value, selection, 'initial-sync');
      if (this.context !== context) return;
      this.releaseDirection = registerSharedDirectionIdentity(context.editor, path =>
        retainedDirectionIdentity(this.options.document, this.room, this.roomId, this.store?.identity(path)));
      if (!this.manager) {
        this.manager = new Y.UndoManager([...this.store!.scope, ...(this.structured ? [this.structured.map] : [])], {
          captureTimeout: this.options.captureTimeout ?? 500, trackedOrigins: new Set([this.origin]),
          deleteFilter: item => {
            // Yjs pops an item before filtering, and may skip several empty
            // items. Its currStackItem is assigned only after these filters.
            const entry = this.poppedHistoryItem();
            return !entry || !this.store!.retainUndoAllocation(item, entry.insertions);
          },
          captureTransaction: transaction => {
            const manager = this.manager, current = this.poppedHistoryItem();
            if (manager?.undoing && transaction.origin === manager && current
              && removesOnlyDuplicateProvenance(transaction)) {
              current.meta.set(REDUNDANT_UNDO, true);
              manager.stopCapturing();
              return false;
            }
            return true;
          },
        });
        this.manager.on('stack-item-added', this.historyItem); this.manager.on('stack-item-updated', this.historyItem);
      }
      this.options.document.on('afterTransaction', this.sharedChanged); this.awareness()?.on('change', this.awarenessChanged);
      this.options.provider?.on?.('status', this.providerStatus);
      if (this.context !== context) return;
      this.onLocalSelection(context.editor.state.doc, context.editor.state.selection);
      if (this.context === context && this.options.provider?.connect) {
        if (admittedRoomRoots.has(this.fragment)) this.gate();
        this.providerActive = true;
        return this.options.provider.connect();
      }
    } catch (error) {
      if (this.context !== context) return;
      try { void this.disconnect()?.catch(() => undefined); } catch { /* Preserve the connection failure. */ }
      throw error;
    }
  }

  disconnect(): void | Promise<void> {
    this.joinBaseline ??= this.context?.editor.state.doc;
    const pending = this.admissionController; this.admissionController = undefined; pending?.abort();
    if (!this.context && !this.providerActive) return;
    const published = this.published !== undefined;
    this.options.document.off('afterTransaction', this.sharedChanged); this.awareness()?.off('change', this.awarenessChanged);
    this.options.provider?.off?.('status', this.providerStatus); this.releaseDirection?.(); this.releaseDirection = undefined;
    if (this.presenceTimer !== undefined) clearTimeout(this.presenceTimer);
    this.presenceTimer = undefined; this.pendingPresence = undefined; this.published = undefined; this.lastPresence = Number.NEGATIVE_INFINITY;
    this.context = undefined; if (published) this.awareness()?.setLocalStateField(this.field, null);
    if (this.providerActive) { this.providerActive = false; return this.options.provider?.disconnect?.(); }
  }

  onLocalUpdate(update: CollaborationLocalUpdate): void {
    if (!this.context || !this.store || this.joinBaseline || this.roomConflict) return;
    try {
      this.gate();
      const updateAttributes = this.structured?.prepareUpdate(update.before, update.document);
      const recordHistory = update.transaction.getMeta('addToHistory') !== false;
      this.pendingHistory = recordHistory ? { before: retainSelection(this.store, update.before, update.beforeSelection) } : undefined;
      this.options.document.transact(() => {
        this.store!.apply(update.transaction); updateAttributes?.();
        if (this.pendingHistory) this.pendingHistory.after = retainSelection(this.store!, update.document, update.selection);
      }, recordHistory ? this.origin : this.repair);
    } catch (error) {
      throw this.roomFailure(error instanceof Error ? error.message : String(error));
    } finally { this.pendingHistory = undefined; }
  }

  onLocalSelection(document: Node, selection: AnySelection): void {
    if (!this.context || !this.store || this.joinBaseline || this.roomConflict) return;
    this.localSelection = retainSelection(this.store, document, selection);
    if (!this.awareness()) return;
    const value = { user: this.localUser, selection: this.localSelection }, signature = JSON.stringify(value);
    if (signature === this.published) { if (this.presenceTimer !== undefined) clearTimeout(this.presenceTimer); this.presenceTimer = undefined; this.pendingPresence = undefined; }
    else if (signature !== this.pendingPresence?.signature) {
      const elapsed = Date.now() - this.lastPresence;
      if (!this.throttle || elapsed >= this.throttle) this.publish(value, signature);
      else {
        this.pendingPresence = { value, signature };
        this.presenceTimer ??= setTimeout(() => {
          this.presenceTimer = undefined; const pending = this.pendingPresence; this.pendingPresence = undefined;
          if (pending && this.context) this.publish(pending.value, pending.signature);
        }, this.throttle - elapsed);
      }
    }
    this.presences();
  }

  private publish(value: Record<string, unknown>, signature: string): void {
    if (this.presenceTimer !== undefined) clearTimeout(this.presenceTimer);
    this.presenceTimer = undefined; this.pendingPresence = undefined;
    this.published = signature; this.lastPresence = Date.now(); this.awareness()?.setLocalStateField(this.field, value);
  }
  private presences(): void {
    if (!this.context || !this.store || this.roomConflict) return;
    const awareness = this.awareness(); if (!awareness) return;
    const result: CollaborationPresence[] = [], document = this.context.editor.state.doc;
    for (const [client, state] of awareness.getStates()) {
      if (client === (awareness.clientID ?? this.options.document.clientID) || result.length >= 1_000) continue;
      const value = state[this.field]; if (!value || typeof value !== 'object') continue;
      const candidate = value as { user?: CollaborationUser; selection?: unknown }, selection = restoreSelection(this.store, document, candidate.selection);
      result.push({ clientId: String(client), user: candidate.user as CollaborationUser, ...(selection ? { selection: bounds(document, selection) } : {}) });
    }
    this.context.setPresences(result);
  }

  undo(): boolean {
    const manager = this.sharedHistory();
    if (!manager) return false;
    while (this.manager === manager) {
      const item = this.popHistory(manager, 'undo');
      if (!item) return false;
      if (!item.meta.has(REDUNDANT_UNDO)) return true;
    }
    return false;
  }

  redo(): boolean {
    const manager = this.sharedHistory();
    return Boolean(manager && this.popHistory(manager, 'redo'));
  }
  private sharedHistory(): Y.UndoManager | undefined {
    if (this.context && !this.joinBaseline && !this.roomConflict) return this.manager;
  }
  private popHistory(manager: Y.UndoManager, direction: 'undo' | 'redo') {
    const stack = direction === 'undo' ? manager.undoStack : manager.redoStack;
    this.historyPop = { stack, items: stack.slice() };
    try { return manager[direction](); }
    finally { this.historyPop = undefined; }
  }
  private poppedHistoryItem() {
    const pending = this.historyPop;
    return pending?.items[pending.stack.length];
  }
  canUndo(): boolean { return this.sharedHistory()?.canUndo() ?? false; }
  canRedo(): boolean { return this.sharedHistory()?.canRedo() ?? false; }
  stopCapturing(): void { this.manager?.stopCapturing(); }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    try { void this.disconnect()?.catch(() => undefined); }
    finally { this.manager?.destroy(); this.store?.destroy(); this.manager = undefined; this.store = undefined; this.joinBaseline = undefined; }
  }
}

export function createRetainedYjsCollaborationExtension(options: RetainedYjsCollaborationExtensionOptions) {
  return createCollaborationExtension({ autoConnect: options.autoConnect, adapter: () => new RetainedYjsCollaborationAdapter(options) });
}
