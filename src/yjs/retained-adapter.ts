import * as Y from 'yjs';
import { EditorState, isSafeURL, nodeRangeAtPath, textPointToPosition, type AnySelection, type Node } from '../core';
import { registerSharedDirectionIdentity } from '../core/shared-direction';
import { createCollaborationExtension, type CollaborationAdapter, type CollaborationAdapterContext,
  type CollaborationLocalUpdate, type CollaborationPresence, type CollaborationUser } from '../extensions/collaboration';
import type { YjsCollaborationExtensionOptions } from './index';
import { RetainedDocumentStore, validateRetainedDocument } from './retained-document';
import { retainSelection, restoreSelection, type RetainedSelection } from './retained-selection';
import { YjsStructuredAttributeStore } from './structured-attributes';
import { prepareRetainedAdmission, readRetainedAdmission, snapshotRetainedAdmission, type RetainedAdmission, type RetainedAdmissionLease } from './retained-admission';

export interface RetainedYjsCollaborationExtensionOptions extends YjsCollaborationExtensionOptions {
  /** Validate an authoritative existing-room snapshot before starting transport.
   * Without this opt-in, isolated local/offline initialization is unchanged. */
  readonly admission?: RetainedAdmission;
}

const GATE = 'fountain-retained-room', FORMAT = 'fountain-retained-document/3';
const BEFORE = Symbol('retained-selection-before'), AFTER = Symbol('retained-selection-after');
const uuid = () => `r-${globalThis.crypto.randomUUID()}`;

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

/** Experimental internal adapter. Not exported by the package or used by demos.
 * Named new rooms only; existing legacy data is refused, never auto-migrated. */
export class RetainedYjsCollaborationAdapter implements CollaborationAdapter {
  private readonly room: string;
  private readonly fragment: Y.XmlFragment;
  private readonly localUser: CollaborationUser;
  private readonly origin = Object.freeze({ fountain: 'retained-local' });
  private readonly repair = Object.freeze({ fountain: 'retained-repair' });
  private readonly structured?: YjsStructuredAttributeStore;
  private readonly prefix = uuid();
  private sequence = 0;
  private context?: CollaborationAdapterContext;
  private store?: RetainedDocumentStore;
  private manager?: Y.UndoManager;
  private roomId?: string;
  private releaseDirection?: () => void;
  private localSelection?: RetainedSelection;
  private restoring?: RetainedSelection;
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
  private joining = false;
  private joinBaseline?: Node;
  private admissionLease?: RetainedAdmissionLease;

  constructor(private readonly options: RetainedYjsCollaborationExtensionOptions) {
    if (!(options?.document instanceof Y.Doc)) throw new TypeError('Yjs needs a Y.Doc.');
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
    if (options.structuredAttributes) this.structured = new YjsStructuredAttributeStore(options.document, options.structuredAttributes, `${this.room}:structured-attributes`);
    if (options.admission !== undefined) {
      this.admission = snapshotRetainedAdmission(options.admission);
    }
  }

  private gate(): string {
    const entry = this.fragment.get(0);
    if (this.fragment.length !== 1 || !(entry instanceof Y.XmlElement) || entry.nodeName !== GATE || entry.length
      || Object.keys(entry.getAttributes()).length !== 2 || entry.getAttribute('format') !== FORMAT) throw new Error('Legacy, incompatible or conflicting collaboration room; original shared data preserved.');
    const id = entry.getAttribute('room');
    if (typeof id !== 'string' || !/^r-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) || this.roomId && id !== this.roomId) throw new Error('Retained collaboration room identity changed.');
    return id;
  }

  private error(error: unknown): void { this.context?.setStatus('error', { message: error instanceof Error ? error.message : String(error), recoverable: true }); }
  private readonly awareness = () => this.options.awareness ?? this.options.provider?.awareness;
  private readonly awarenessChanged = (): void => { try { this.presences(); } catch (error) { this.error(error); } };
  private readonly providerStatus = (value: string | { status?: string }): void => {
    const status = typeof value === 'string' ? value : value.status;
    if (status === 'connected' || status === 'connecting' || status === 'reconnecting' || status === 'disconnected') this.context?.setStatus(status);
  };
  private readonly historyItem = (event: { stackItem: { meta: Map<unknown, unknown> }; origin: unknown }): void => {
    if (event.origin !== this.origin || !this.pendingHistory) return;
    if (!event.stackItem.meta.has(BEFORE)) event.stackItem.meta.set(BEFORE, this.pendingHistory.before);
    if (this.pendingHistory.after) event.stackItem.meta.set(AFTER, this.pendingHistory.after);
  };

  private canonical(): Node {
    const store = this.store!, base = store.read();
    if (!this.structured) return base;
    const value = store.schema.nodeFromJSON(this.structured.overlay(base));
    if (!base.eq(value)) {
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
    if (!this.context || !this.store || transaction.origin === this.origin || transaction.origin === this.repair) return;
    const changed = new Set<unknown>(transaction.changedParentTypes.keys());
    if (![this.fragment, ...this.store.observed, ...(this.structured ? [this.structured.map] : [])].some(type => changed.has(type))) return;
    try {
      this.gate(); const value = this.canonical(), selection = restoreSelection(this.store, value, this.restoring ?? this.localSelection);
      this.apply(value, selection, transaction.origin);
      this.context.setStatus('connected'); this.presences();
    } catch (error) { this.error(error); }
  };

  connect(context: CollaborationAdapterContext): void | Promise<void> {
    if (this.destroyed || this.context) throw new Error('Retained adapter is destroyed or already connected.');
    if (this.admission) {
      this.context = context; this.joining = true; this.joinBaseline ??= context.editor.state.doc;
      const controller = new AbortController(); this.admissionController = controller;
      return this.admit(context, controller);
    }
    return this.attach(context);
  }

  private async admit(context: CollaborationAdapterContext, controller: AbortController): Promise<void> {
    const current = () => !controller.signal.aborted && !this.destroyed && this.context === context;
    let attaching = false;
    try {
      const response = await this.admission!.load(controller.signal);
      if (!current()) return;
      const { checkpoint, reference } = readRetainedAdmission(response, this.admission!, this.admissionLease);
      const candidate = await prepareRetainedAdmission(this.options.document, checkpoint, context.editor.state.schema, this.admission!.schemaVersion, this.room);
      if (!current()) return;
      const checkDraft = () => { if (!context.editor.state.doc.eq(this.joinBaseline!) && !context.editor.state.doc.eq(candidate.document)) throw new Error('Unresolved local draft made while joining; draft preserved. Resolve it explicitly before reconnecting.'); };
      checkDraft();
      const lease = reference ? Object.freeze({ ...reference, room: this.room, identity: candidate.identity }) : undefined;
      if (lease && this.admissionLease && lease.identity !== this.admissionLease.identity) throw new Error('Authority admission room identity changed; original client preserved.');
      if (lease) { await this.admission!.authority!.bind(lease, controller.signal); if (!current()) return; checkDraft(); }
      candidate.install(this.repair); if (!current()) return;
      this.admissionLease = lease;
      this.joining = false; attaching = true;
      await this.attach(context, false);
      if (current()) { this.admissionController = undefined; this.joinBaseline = undefined; }
    } catch (error) {
      // attach() and the generic lifecycle own transport failures. A rejected
      // retired request must never disconnect a newer session on this adapter.
      if (attaching) throw error;
      if (!current()) return;
      try { const cleanup = this.disconnect(); if (cleanup) void cleanup.catch(() => undefined); } catch { /* Preserve the admission failure. */ }
      throw error;
    }
  }

  private attach(context: CollaborationAdapterContext, allowSeed = true): void | Promise<void> {
    const fresh = this.fragment.length === 0 && this.options.document.getMap(`${this.room}:document`).size === 0;
    if (fresh && !allowSeed) throw new Error('Admission requires an already initialized retained room.');
    if (!fresh) this.roomId = this.gate();
    validateRetainedDocument(context.editor.state.doc, context.editor.state.schema); this.structured?.validate(context.editor.state.doc);
    this.context = context;
    try {
      this.options.document.transact(() => {
        this.store ??= new RetainedDocumentStore(this.options.document, this.room, context.editor.state.schema, () => `${this.prefix}-${this.sequence++}`, this.origin);
        if (this.store.schema !== context.editor.state.schema) throw new Error('Retained adapter belongs to another editor schema.');
        if (fresh) {
          this.store.seed(context.editor.state.doc); this.structured?.synchronize(context.editor.state.doc);
          const gate = new Y.XmlElement(GATE); gate.setAttribute('format', FORMAT); gate.setAttribute('room', this.prefix);
          this.fragment.insert(0, [gate]); this.roomId = this.prefix;
        } else this.structured?.initialize(this.store.read());
      }, this.origin);
      const value = this.canonical(), selection = restoreSelection(this.store!, value, this.localSelection);
      this.apply(value, selection, 'initial-sync');
      this.releaseDirection = registerSharedDirectionIdentity(context.editor, path => {
        const id = this.store?.identity(path); return id ? `yjs-${id === 'root' ? this.roomId : id}` : null;
      });
      if (!this.manager) {
        this.manager = new Y.UndoManager([...this.store!.scope, ...(this.structured ? [this.structured.map] : [])], {
          captureTimeout: this.options.captureTimeout ?? 500, trackedOrigins: new Set([this.origin]),
        });
        this.manager.on('stack-item-added', this.historyItem); this.manager.on('stack-item-updated', this.historyItem);
      }
      this.options.document.on('afterTransaction', this.sharedChanged); this.awareness()?.on('change', this.awarenessChanged);
      this.options.provider?.on?.('status', this.providerStatus);
      this.onLocalSelection(context.editor.state.doc, context.editor.state.selection); this.presences();
      if (this.options.provider?.connect) { this.providerActive = true; return this.options.provider.connect(); }
    } catch (error) {
      try { const cleanup = this.disconnect(); if (cleanup) void cleanup.catch(() => undefined); } catch { /* Preserve the connection failure. */ }
      throw error;
    }
  }

  disconnect(): void | Promise<void> {
    const pending = this.admissionController; this.admissionController = undefined; this.joining = false; pending?.abort();
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
    if (!this.context || !this.store || this.joining) return;
    this.gate(); this.structured?.overlay(update.before); this.structured?.validate(update.document);
    const recordHistory = update.transaction.getMeta('addToHistory') !== false;
    this.pendingHistory = recordHistory ? { before: retainSelection(this.store, update.before, update.beforeSelection) } : undefined;
    try {
      this.options.document.transact(() => {
        this.store!.apply(update.transaction); this.structured?.synchronize(update.document);
        if (this.pendingHistory) this.pendingHistory.after = retainSelection(this.store!, update.document, update.selection);
      }, recordHistory ? this.origin : this.repair);
    } finally { this.pendingHistory = undefined; }
  }

  onLocalSelection(document: Node, selection: AnySelection): void {
    if (!this.context || !this.store || this.joining) return;
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
    this.published = signature; this.lastPresence = Date.now(); this.awareness()?.setLocalStateField(this.field, value);
  }
  private presences(): void {
    if (!this.context || !this.store) return;
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
    if (this.joining) return false;
    const item = this.manager?.undoStack.at(-1); if (!item) return false;
    this.restoring = item.meta.get(BEFORE); try { return Boolean(this.manager!.undo()); } finally { this.restoring = undefined; }
  }
  redo(): boolean {
    if (this.joining) return false;
    const item = this.manager?.redoStack.at(-1); if (!item) return false;
    this.restoring = item.meta.get(AFTER); try { return Boolean(this.manager!.redo()); } finally { this.restoring = undefined; }
  }
  canUndo(): boolean { return !this.joining && (this.manager?.canUndo() ?? false); }
  canRedo(): boolean { return !this.joining && (this.manager?.canRedo() ?? false); }
  stopCapturing(): void { this.manager?.stopCapturing(); }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    try { const cleanup = this.disconnect(); if (cleanup) void cleanup.catch(() => undefined); }
    finally { this.manager?.destroy(); this.store?.destroy(); this.manager = undefined; this.store = undefined; }
  }
}

export function createRetainedYjsCollaborationExtension(options: RetainedYjsCollaborationExtensionOptions) {
  return createCollaborationExtension({ autoConnect: options.autoConnect, adapter: () => new RetainedYjsCollaborationAdapter(options) });
}
