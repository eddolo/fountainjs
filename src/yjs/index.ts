import * as Y from 'yjs';
import {
  Selection,
  isSafeURL,
  isTextSelection,
  textPointToPosition,
  type AnySelection,
  type Node,
  type NodeJSON,
} from '../core';
import {
  createCollaborationExtension,
  type CollaborationAdapter,
  type CollaborationAdapterContext,
  type CollaborationExtensionOptions,
  type CollaborationLocalUpdate,
  type CollaborationPresence,
  type CollaborationStatus,
  type CollaborationUser,
} from '../extensions/collaboration';
import type { FountainExtension } from '../extensions/extension';

const ELEMENT_NAME = 'fountain-node';
const TYPE_ATTRIBUTE = 'fountain:type';
const MARKS_ATTRIBUTE = 'fountain:marks';
const ATTRIBUTE_PREFIX = 'fountain:attr:';
const HISTORY_BEFORE = Symbol('fountain-yjs-selection-before');
const HISTORY_AFTER = Symbol('fountain-yjs-selection-after');
const MAXIMUM_DEPTH = 100;
const MAXIMUM_NODES = 100_000;
const MAXIMUM_TEXT_LENGTH = 10_000_000;
const MAXIMUM_ATTRIBUTE_LENGTH = 1_000_000;
const MAXIMUM_ATTRIBUTES = 1_000;
const MAXIMUM_ALIGNMENT_CELLS = 250_000;

type SharedElement = Y.XmlElement<Record<string, any>>;

export interface YjsAwareness {
  readonly clientID?: number;
  getLocalState(): Record<string, unknown> | null;
  getStates(): Map<number, Record<string, unknown>>;
  setLocalStateField(field: string, value: unknown): void;
  on(event: 'change' | 'update', listener: (...args: any[]) => void): void;
  off(event: 'change' | 'update', listener: (...args: any[]) => void): void;
}

export interface YjsProvider {
  readonly awareness?: YjsAwareness;
  connect?(): void | Promise<void>;
  disconnect?(): void | Promise<void>;
  on?(event: 'status', listener: (event: { status?: string } | string) => void): void;
  off?(event: 'status', listener: (event: { status?: string } | string) => void): void;
}

export interface YjsCollaborationAdapterOptions {
  readonly document: Y.Doc;
  readonly user: CollaborationUser;
  readonly fragment?: Y.XmlFragment;
  readonly fragmentName?: string;
  readonly awareness?: YjsAwareness;
  readonly provider?: YjsProvider;
  readonly awarenessField?: string;
  readonly captureTimeout?: number;
  /** Minimum milliseconds between outgoing awareness writes. Defaults to 32. Set 0 to disable throttling. */
  readonly presenceThrottleMs?: number;
}

export interface YjsCollaborationExtensionOptions extends YjsCollaborationAdapterOptions {
  readonly autoConnect?: CollaborationExtensionOptions['autoConnect'];
}

interface RelativeSelectionJSON {
  readonly anchor: unknown;
  readonly head: unknown;
}

interface PendingHistorySelection {
  readonly before?: RelativeSelectionJSON;
  after?: RelativeSelectionJSON;
}

function encodeAttribute(value: unknown): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined || encoded.length > MAXIMUM_ATTRIBUTE_LENGTH) {
    throw new Error('A collaborative node attribute is not safely serializable.');
  }
  return encoded;
}

function validAttributeName(value: string): boolean {
  return /^[a-z_][\w.-]{0,127}$/i.test(value)
    && value !== '__proto__'
    && value !== 'prototype'
    && value !== 'constructor';
}

function decodeAttribute(value: unknown, label: string): unknown {
  if (typeof value !== 'string' || value.length > MAXIMUM_ATTRIBUTE_LENGTH) {
    throw new Error(`Invalid collaborative ${label}.`);
  }
  try { return JSON.parse(value); }
  catch { throw new Error(`Invalid JSON in collaborative ${label}.`); }
}

function isSharedElement(value: unknown): value is SharedElement {
  return value instanceof Y.XmlElement && value.nodeName === ELEMENT_NAME;
}

function setElementMetadata(element: SharedElement, node: Node): void {
  if (element.getAttribute(TYPE_ATTRIBUTE) !== node.type.name) {
    element.setAttribute(TYPE_ATTRIBUTE, node.type.name);
  }
  const desired = new Map(Object.entries(node.attrs).map(([name, value]) => {
    if (!validAttributeName(name)) throw new Error(`Invalid collaborative attribute name: ${name}`);
    return [`${ATTRIBUTE_PREFIX}${name}`, encodeAttribute(value)];
  }));
  const marks = node.marks.length ? encodeAttribute(node.marks.map((mark) => mark.toJSON())) : undefined;
  if (marks !== undefined) desired.set(MARKS_ATTRIBUTE, marks);
  Object.entries(element.getAttributes()).forEach(([name]) => {
    if (name !== TYPE_ATTRIBUTE && !desired.has(name)) element.removeAttribute(name);
  });
  desired.forEach((value, name) => {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  });
}

function createSharedElement(node: Node): SharedElement {
  const element = new Y.XmlElement(ELEMENT_NAME) as SharedElement;
  element.setAttribute(TYPE_ATTRIBUTE, node.type.name);
  Object.entries(node.attrs).forEach(([name, value]) => {
    if (!validAttributeName(name)) throw new Error(`Invalid collaborative attribute name: ${name}`);
    element.setAttribute(`${ATTRIBUTE_PREFIX}${name}`, encodeAttribute(value));
  });
  if (node.marks.length) {
    element.setAttribute(MARKS_ATTRIBUTE, encodeAttribute(node.marks.map((mark) => mark.toJSON())));
  }
  if (node.isText) element.insert(0, [new Y.XmlText(node.text ?? '')]);
  else element.insert(0, node.content.map(createSharedElement));
  return element;
}

function commonPrefix(left: string, right: string): number {
  const maximum = Math.min(left.length, right.length);
  let index = 0;
  while (index < maximum && left[index] === right[index]) index++;
  return index;
}

function commonSuffix(left: string, right: string, prefix: number): number {
  const maximum = Math.min(left.length, right.length) - prefix;
  let length = 0;
  while (length < maximum && left[left.length - 1 - length] === right[right.length - 1 - length]) length++;
  return length;
}

function synchronizeText(shared: Y.XmlText, desired: string): void {
  const current = shared.toString();
  if (current === desired) return;
  const prefix = commonPrefix(current, desired);
  const suffix = commonSuffix(current, desired, prefix);
  const removed = current.length - prefix - suffix;
  const inserted = desired.slice(prefix, desired.length - suffix);
  if (removed) shared.delete(prefix, removed);
  if (inserted) shared.insert(prefix, inserted);
}

function alignment(before: readonly Node[], after: readonly Node[]): ReadonlyMap<number, number> {
  if (before.length * after.length > MAXIMUM_ALIGNMENT_CELLS) return greedyAlignment(before, after);
  const rows = before.length + 1;
  const columns = after.length + 1;
  const scores = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  for (let row = 1; row < rows; row++) scores[row]![0] = -row;
  for (let column = 1; column < columns; column++) scores[0]![column] = -column;
  for (let row = 1; row < rows; row++) {
    for (let column = 1; column < columns; column++) {
      const previous = before[row - 1] as Node;
      const next = after[column - 1] as Node;
      const pair = previous.type.name === next.type.name
        ? scores[row - 1]![column - 1]! + (previous.eq(next) ? 8 : 2)
        : Number.NEGATIVE_INFINITY;
      scores[row]![column] = Math.max(pair, scores[row - 1]![column]! - 1, scores[row]![column - 1]! - 1);
    }
  }
  const matched = new Map<number, number>();
  let row = before.length;
  let column = after.length;
  while (row > 0 || column > 0) {
    const previous = row ? before[row - 1] : undefined;
    const next = column ? after[column - 1] : undefined;
    const pairScore = previous && next && previous.type.name === next.type.name
      ? scores[row - 1]![column - 1]! + (previous.eq(next) ? 8 : 2)
      : Number.NEGATIVE_INFINITY;
    if (previous && next && scores[row]![column] === pairScore) {
      matched.set(column - 1, row - 1);
      row--;
      column--;
    } else if (row > 0 && (column === 0 || scores[row]![column] === scores[row - 1]![column]! - 1)) row--;
    else column--;
  }
  return matched;
}

function greedyAlignment(before: readonly Node[], after: readonly Node[]): ReadonlyMap<number, number> {
  const candidates = new Map<string, number[]>();
  before.forEach((node, index) => {
    const fingerprint = JSON.stringify(node.toJSON());
    const indexes = candidates.get(fingerprint) ?? [];
    indexes.push(index);
    candidates.set(fingerprint, indexes);
  });
  const matched = new Map<number, number>();
  let previous = -1;
  after.forEach((node, index) => {
    const indexes = candidates.get(JSON.stringify(node.toJSON()));
    while (indexes?.length && indexes[0]! <= previous) indexes.shift();
    const candidate = indexes?.shift();
    if (candidate !== undefined) {
      matched.set(index, candidate);
      previous = candidate;
    }
  });
  const anchors = [[-1, -1], ...[...matched.entries()], [after.length, before.length]];
  for (let anchor = 1; anchor < anchors.length; anchor++) {
    const [afterStart, beforeStart] = anchors[anchor - 1] as [number, number];
    const [afterEnd, beforeEnd] = anchors[anchor] as [number, number];
    if (afterEnd - afterStart !== beforeEnd - beforeStart) continue;
    for (let offset = 1; offset < afterEnd - afterStart; offset++) {
      const afterIndex = afterStart + offset;
      const beforeIndex = beforeStart + offset;
      if (before[beforeIndex]?.type.name === after[afterIndex]?.type.name) matched.set(afterIndex, beforeIndex);
    }
  }
  return matched;
}

function synchronizeChildren(element: SharedElement, before: readonly Node[], after: readonly Node[]): void {
  const existing = element.toArray();
  const compatible = existing.length === before.length
    && existing.every((child, index) => isSharedElement(child)
      && child.getAttribute(TYPE_ATTRIBUTE) === before[index]?.type.name);
  if (!compatible) {
    if (element.length) element.delete(0, element.length);
    if (after.length) element.insert(0, after.map(createSharedElement));
    return;
  }

  const paired = alignment(before, after);
  const retained = new Set(paired.values());
  for (let index = existing.length - 1; index >= 0; index--) {
    if (!retained.has(index)) element.delete(index, 1);
  }

  let cursor = 0;
  after.forEach((node, afterIndex) => {
    const beforeIndex = paired.get(afterIndex);
    if (beforeIndex === undefined) {
      element.insert(cursor, [createSharedElement(node)]);
    } else {
      synchronizeElement(existing[beforeIndex] as SharedElement, before[beforeIndex] as Node, node);
    }
    cursor++;
  });
}

function synchronizeElement(element: SharedElement, before: Node, after: Node): void {
  setElementMetadata(element, after);
  if (after.isText) {
    const children = element.toArray();
    const sharedText = children.length === 1 && children[0] instanceof Y.XmlText
      ? children[0]
      : undefined;
    if (!sharedText || !before.isText) {
      if (element.length) element.delete(0, element.length);
      element.insert(0, [new Y.XmlText(after.text ?? '')]);
    } else synchronizeText(sharedText, after.text ?? '');
    return;
  }
  if (before.isText) {
    if (element.length) element.delete(0, element.length);
    if (after.content.length) element.insert(0, after.content.map(createSharedElement));
    return;
  }
  synchronizeChildren(element, before.content, after.content);
}

function parseSharedElement(element: SharedElement, depth: number, count: { nodes: number; text: number }): NodeJSON {
  if (depth > MAXIMUM_DEPTH || ++count.nodes > MAXIMUM_NODES) {
    throw new Error('The collaborative document exceeds FountainJS safety limits.');
  }
  const attributes = element.getAttributes();
  if (Object.keys(attributes).length > MAXIMUM_ATTRIBUTES) {
    throw new Error('A collaborative node contains too many attributes.');
  }
  const type = attributes[TYPE_ATTRIBUTE];
  if (typeof type !== 'string' || !type) throw new Error('A collaborative node is missing its type.');
  const attrs: Record<string, unknown> = {};
  let marks: NodeJSON['marks'];
  Object.entries(attributes).forEach(([name, value]) => {
    if (name === TYPE_ATTRIBUTE) return;
    if (name === MARKS_ATTRIBUTE) {
      const parsed = decodeAttribute(value, 'marks');
      if (!Array.isArray(parsed)) throw new Error('Collaborative marks must be an array.');
      marks = parsed as NodeJSON['marks'];
      return;
    }
    if (!name.startsWith(ATTRIBUTE_PREFIX) || name.length === ATTRIBUTE_PREFIX.length) {
      throw new Error(`Unknown collaborative node metadata: ${name}`);
    }
    const attributeName = name.slice(ATTRIBUTE_PREFIX.length);
    if (!validAttributeName(attributeName)) throw new Error(`Invalid collaborative attribute name: ${attributeName}`);
    attrs[attributeName] = decodeAttribute(value, `attribute ${attributeName}`);
  });

  const children = element.toArray();
  if (type === 'text') {
    if (children.length !== 1 || !(children[0] instanceof Y.XmlText)) {
      throw new Error('A collaborative text node must contain exactly one shared text value.');
    }
    const text = children[0].toString();
    count.text += text.length;
    if (count.text > MAXIMUM_TEXT_LENGTH) throw new Error('Collaborative text exceeds the safety limit.');
    return {
      type,
      text,
      ...(marks?.length ? { marks } : {}),
    };
  }
  if (marks?.length) throw new Error('Only collaborative text nodes may contain marks.');
  const content = children.map((child) => {
    if (!isSharedElement(child)) throw new Error('Collaborative container nodes may contain only FountainJS nodes.');
    return parseSharedElement(child, depth + 1, count);
  });
  return {
    type,
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(content.length ? { content } : {}),
  };
}

function readSharedDocument(fragment: Y.XmlFragment): NodeJSON {
  const children = fragment.toArray();
  if (children.length !== 1 || !isSharedElement(children[0])) {
    throw new Error('The collaborative fragment must contain exactly one FountainJS document root.');
  }
  return parseSharedElement(children[0], 0, { nodes: 0, text: 0 });
}

function sharedTextAtPath(fragment: Y.XmlFragment, path: readonly number[]): Y.XmlText | undefined {
  const root = fragment.get(0);
  if (!isSharedElement(root)) return undefined;
  let current = root;
  for (const index of path) {
    const child = current.get(index);
    if (!isSharedElement(child)) return undefined;
    current = child;
  }
  if (current.getAttribute(TYPE_ATTRIBUTE) !== 'text' || current.length !== 1) return undefined;
  const text = current.get(0);
  return text instanceof Y.XmlText ? text : undefined;
}

function findSharedTextPath(
  element: SharedElement,
  target: Y.XmlText,
  path: readonly number[] = [],
): readonly number[] | undefined {
  const children = element.toArray();
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    if (!isSharedElement(child)) continue;
    if (child.getAttribute(TYPE_ATTRIBUTE) === 'text' && child.length === 1 && child.get(0) === target) {
      return Object.freeze([...path, index]);
    }
    const nested = findSharedTextPath(child, target, [...path, index]);
    if (nested) return nested;
  }
  return undefined;
}

function providerStatus(value: { status?: string } | string): CollaborationStatus | undefined {
  const status = typeof value === 'string' ? value : value.status;
  if (status === 'connected' || status === 'connecting' || status === 'disconnected') return status;
  if (status === 'reconnecting') return 'reconnecting';
  return undefined;
}

function normalizeLocalUser(user: CollaborationUser | undefined): CollaborationUser {
  if (!user
    || typeof user.id !== 'string'
    || !/^[\w.:@/-]{1,200}$/.test(user.id)
    || typeof user.name !== 'string'
    || !user.name.trim()
    || user.name.length > 200
    || /[\u0000-\u001f\u007f]/.test(user.name)
    || typeof user.color !== 'string'
    || !/^#[\da-f]{6}$/i.test(user.color)
    || (user.avatar !== undefined
      && (typeof user.avatar !== 'string'
        || user.avatar.length > 2_048
        || !isSafeURL(user.avatar, { allowDataImage: true })))) {
    throw new TypeError('Yjs collaboration requires a valid local user identity.');
  }
  return Object.freeze({
    id: user.id.trim(),
    name: user.name.trim(),
    color: user.color.toLowerCase(),
    ...(user.avatar ? { avatar: user.avatar.trim() } : {}),
  });
}

export class YjsCollaborationAdapter implements CollaborationAdapter {
  readonly document: Y.Doc;
  readonly fragment: Y.XmlFragment;
  readonly awareness?: YjsAwareness;
  private readonly user: CollaborationUser;
  private readonly provider?: YjsProvider;
  private readonly awarenessField: string;
  private readonly localOrigin = Object.freeze({ fountain: 'local' });
  private readonly repairOrigin = Object.freeze({ fountain: 'repair' });
  private readonly captureTimeout: number;
  private readonly presenceThrottleMs: number;
  private context?: CollaborationAdapterContext;
  private undoManager?: Y.UndoManager;
  private observing = false;
  private providerActive = false;
  private pendingHistory?: PendingHistorySelection;
  private pendingRestoredSelection?: RelativeSelectionJSON;
  private localSelection?: RelativeSelectionJSON;
  private publishedPresenceSignature?: string;
  private pendingPresence?: { readonly value: Readonly<Record<string, unknown>>; readonly signature: string };
  private presenceTimer?: ReturnType<typeof setTimeout>;
  private lastPresenceAt = Number.NEGATIVE_INFINITY;

  private readonly onSharedChange = (_events: readonly unknown[], transaction: Y.Transaction): void => {
    if (!this.context || transaction.origin === this.localOrigin) return;
    try {
      this.normalizeRoots();
      const document = this.context.editor.state.schema.nodeFromJSON(readSharedDocument(this.fragment));
      const relativeSelection = this.pendingRestoredSelection ?? this.localSelection;
      const selection = relativeSelection
        ? this.resolveRelativeSelection(relativeSelection, document)
        : undefined;
      this.context.applyRemoteDocument(document, { selection, origin: transaction.origin });
      this.context.setStatus('connected');
      this.publishPresences();
    } catch (error) {
      this.context.setStatus('error', {
        message: error instanceof Error ? error.message : String(error),
        recoverable: true,
      });
    }
  };

  private readonly onAwarenessChange = (): void => {
    try { this.publishPresences(); }
    catch (error) {
      this.context?.setStatus('error', {
        message: error instanceof Error ? error.message : String(error),
        recoverable: true,
      });
    }
  };
  private readonly onProviderStatus = (event: { status?: string } | string): void => {
    const status = providerStatus(event);
    if (status) this.context?.setStatus(status);
  };

  private readonly onHistoryItem = (event: { stackItem: { meta: Map<unknown, unknown> }; origin: unknown }): void => {
    if (event.origin !== this.localOrigin || !this.pendingHistory) return;
    if (!event.stackItem.meta.has(HISTORY_BEFORE) && this.pendingHistory.before) {
      event.stackItem.meta.set(HISTORY_BEFORE, this.pendingHistory.before);
    }
    if (this.pendingHistory.after) event.stackItem.meta.set(HISTORY_AFTER, this.pendingHistory.after);
  };

  constructor(options: YjsCollaborationAdapterOptions) {
    if (!(options?.document instanceof Y.Doc)) throw new TypeError('Yjs collaboration requires a Y.Doc.');
    if (options.fragment !== undefined && !(options.fragment instanceof Y.XmlFragment)) {
      throw new TypeError('Yjs collaboration requires a Y.XmlFragment from the same Yjs installation.');
    }
    if (options.fragment && options.fragment.doc !== options.document) {
      throw new Error('The supplied Y.XmlFragment must belong to the supplied Y.Doc.');
    }
    if (options.awarenessField !== undefined
      && (typeof options.awarenessField !== 'string' || !/^[\w.-]{1,100}$/.test(options.awarenessField))) {
      throw new TypeError('The Yjs awareness field must be a safe non-empty key.');
    }
    if (options.fragmentName !== undefined
      && (typeof options.fragmentName !== 'string' || !options.fragmentName.trim())) {
      throw new TypeError('The Yjs fragment name must not be empty.');
    }
    if (options.captureTimeout !== undefined
      && (typeof options.captureTimeout !== 'number'
        || !Number.isFinite(options.captureTimeout)
        || options.captureTimeout < 0)) {
      throw new TypeError('The Yjs undo capture timeout must be a finite non-negative number.');
    }
    if (options.presenceThrottleMs !== undefined
      && (typeof options.presenceThrottleMs !== 'number'
        || !Number.isFinite(options.presenceThrottleMs)
        || options.presenceThrottleMs < 0
        || options.presenceThrottleMs > 1_000)) {
      throw new TypeError('The Yjs presence throttle must be between 0 and 1000 milliseconds.');
    }
    this.document = options.document;
    this.fragment = options.fragment ?? options.document.getXmlFragment(options.fragmentName ?? 'fountain');
    this.user = normalizeLocalUser(options.user);
    this.provider = options.provider;
    this.awareness = options.awareness ?? options.provider?.awareness;
    this.awarenessField = options.awarenessField ?? 'fountain';
    this.captureTimeout = Math.max(0, options.captureTimeout ?? 500);
    this.presenceThrottleMs = Math.max(0, options.presenceThrottleMs ?? 32);
  }

  connect(context: CollaborationAdapterContext): void | Promise<void> {
    this.context = context;
    if (!this.observing) {
      this.fragment.observeDeep(this.onSharedChange);
      this.awareness?.on('change', this.onAwarenessChange);
      this.provider?.on?.('status', this.onProviderStatus);
      this.observing = true;
    }
    if (this.fragment.length === 0) {
      this.document.transact(() => this.fragment.insert(0, [createSharedElement(context.editor.state.doc)]), this.localOrigin);
    } else {
      this.normalizeRoots();
      const shared = context.editor.state.schema.nodeFromJSON(readSharedDocument(this.fragment));
      const selection = this.localSelection ? this.resolveRelativeSelection(this.localSelection, shared) : undefined;
      context.applyRemoteDocument(shared, { selection, origin: 'initial-sync' });
    }
    if (!this.undoManager) {
      this.undoManager = new Y.UndoManager(this.fragment, {
        captureTimeout: this.captureTimeout,
        trackedOrigins: new Set([this.localOrigin]),
      });
      this.undoManager.on('stack-item-added', this.onHistoryItem);
      this.undoManager.on('stack-item-updated', this.onHistoryItem);
    }
    this.publishLocalSelection(context.editor.state.doc, context.editor.state.selection);
    this.publishPresences();
    if (!this.provider?.connect) return undefined;
    this.providerActive = true;
    return this.provider.connect();
  }

  disconnect(): void | Promise<void> {
    if (this.observing) {
      this.fragment.unobserveDeep(this.onSharedChange);
      this.awareness?.off('change', this.onAwarenessChange);
      this.provider?.off?.('status', this.onProviderStatus);
      this.observing = false;
    }
    if (this.presenceTimer !== undefined) clearTimeout(this.presenceTimer);
    this.presenceTimer = undefined;
    this.pendingPresence = undefined;
    this.publishedPresenceSignature = undefined;
    this.lastPresenceAt = Number.NEGATIVE_INFINITY;
    this.awareness?.setLocalStateField(this.awarenessField, null);
    this.context = undefined;
    if (!this.providerActive) return undefined;
    this.providerActive = false;
    return this.provider?.disconnect?.();
  }

  onLocalUpdate(update: CollaborationLocalUpdate): void {
    const root = this.fragment.get(0);
    const pending: PendingHistorySelection = {
      before: this.relativeSelection(update.beforeSelection),
    };
    this.pendingHistory = pending;
    try {
      this.document.transact(() => {
        if (!isSharedElement(root)) {
          if (this.fragment.length) this.fragment.delete(0, this.fragment.length);
          this.fragment.insert(0, [createSharedElement(update.document)]);
        } else synchronizeElement(root, update.before, update.document);
        pending.after = this.relativeSelection(update.selection);
      }, this.localOrigin);
    } finally {
      this.pendingHistory = undefined;
    }
  }

  onLocalSelection(document: Node, selection: AnySelection): void {
    this.publishLocalSelection(document, selection);
  }

  undo(): boolean {
    const manager = this.undoManager;
    const item = manager?.undoStack.at(-1);
    if (!manager || !item) return false;
    this.pendingRestoredSelection = item.meta.get(HISTORY_BEFORE) as RelativeSelectionJSON | undefined;
    try { return Boolean(manager.undo()); }
    finally { this.pendingRestoredSelection = undefined; }
  }

  redo(): boolean {
    const manager = this.undoManager;
    const item = manager?.redoStack.at(-1);
    if (!manager || !item) return false;
    this.pendingRestoredSelection = item.meta.get(HISTORY_AFTER) as RelativeSelectionJSON | undefined;
    try { return Boolean(manager.redo()); }
    finally { this.pendingRestoredSelection = undefined; }
  }

  canUndo(): boolean { return this.undoManager?.canUndo() ?? false; }
  canRedo(): boolean { return this.undoManager?.canRedo() ?? false; }
  stopCapturing(): void { this.undoManager?.stopCapturing(); }

  destroy(): void {
    const manager = this.undoManager as (Y.UndoManager & { destroy?: () => void }) | undefined;
    manager?.destroy?.();
    this.undoManager = undefined;
  }

  private normalizeRoots(): void {
    if (this.fragment.length <= 1) return;
    const children = this.fragment.toArray();
    if (!children.every(isSharedElement)) return;
    this.document.transact(() => this.fragment.delete(1, this.fragment.length - 1), this.repairOrigin);
  }

  private relativeSelection(selection: AnySelection): RelativeSelectionJSON | undefined {
    if (!isTextSelection(selection)) return undefined;
    const anchorText = sharedTextAtPath(this.fragment, selection.path);
    const headText = sharedTextAtPath(this.fragment, selection.endPath);
    if (!anchorText || !headText) return undefined;
    return Object.freeze({
      anchor: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(anchorText, selection.from, 1)),
      head: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(headText, selection.to, -1)),
    });
  }

  private resolveRelativeSelection(selection: RelativeSelectionJSON, document: Node): Selection | undefined {
    try {
      const anchor = Y.createAbsolutePositionFromRelativePosition(
        Y.createRelativePositionFromJSON(selection.anchor), this.document,
      );
      const head = Y.createAbsolutePositionFromRelativePosition(
        Y.createRelativePositionFromJSON(selection.head), this.document,
      );
      const root = this.fragment.get(0);
      if (!anchor || !head || !(anchor.type instanceof Y.XmlText) || !(head.type instanceof Y.XmlText)
        || !isSharedElement(root)) return undefined;
      const anchorPath = findSharedTextPath(root, anchor.type);
      const headPath = findSharedTextPath(root, head.type);
      if (!anchorPath || !headPath) return undefined;
      const start = { path: anchorPath, offset: anchor.index };
      const end = { path: headPath, offset: head.index };
      return textPointToPosition(document, start.path, start.offset)
        <= textPointToPosition(document, end.path, end.offset)
        ? Selection.range(start.path, start.offset, end.path, end.offset)
        : Selection.range(end.path, end.offset, start.path, start.offset);
    } catch { return undefined; }
  }

  private publishLocalSelection(document: Node, selection: AnySelection): void {
    const relative = this.relativeSelection(selection);
    this.localSelection = relative;
    if (!this.awareness) return;
    const value = Object.freeze({
      user: this.user,
      ...(relative ? { selection: relative } : {}),
    });
    const signature = JSON.stringify(value);
    if (signature === this.publishedPresenceSignature) {
      if (this.presenceTimer !== undefined) clearTimeout(this.presenceTimer);
      this.presenceTimer = undefined;
      this.pendingPresence = undefined;
    } else if (signature !== this.pendingPresence?.signature) {
      const elapsed = Date.now() - this.lastPresenceAt;
      if (this.presenceThrottleMs === 0 || elapsed >= this.presenceThrottleMs) {
        this.writeLocalPresence(value, signature);
      } else {
        this.pendingPresence = { value, signature };
        if (this.presenceTimer === undefined) {
          this.presenceTimer = setTimeout(() => {
            this.presenceTimer = undefined;
            const pending = this.pendingPresence;
            this.pendingPresence = undefined;
            if (pending && this.context) this.writeLocalPresence(pending.value, pending.signature);
          }, Math.max(0, this.presenceThrottleMs - elapsed));
        }
      }
    }
    this.publishPresences(document);
  }

  private writeLocalPresence(value: Readonly<Record<string, unknown>>, signature: string): void {
    if (!this.awareness || !this.context) return;
    this.awareness.setLocalStateField(this.awarenessField, value);
    this.publishedPresenceSignature = signature;
    this.lastPresenceAt = Date.now();
  }

  private publishPresences(document = this.context?.editor.state.doc): void {
    if (!this.context || !this.awareness || !document) return;
    const localClient = this.awareness.clientID ?? this.document.clientID;
    const presences: CollaborationPresence[] = [];
    for (const [clientId, state] of this.awareness.getStates()) {
      if (presences.length >= 1_000) break;
      if (clientId === localClient) continue;
      const value = state[this.awarenessField];
      if (!value || typeof value !== 'object') continue;
      const candidate = value as { user?: CollaborationUser; selection?: RelativeSelectionJSON };
      const selection = candidate.selection ? this.resolveRelativeSelection(candidate.selection, document) : undefined;
      presences.push({
        clientId: String(clientId),
        user: candidate.user as CollaborationUser,
        ...(selection ? {
          selection: {
            anchor: textPointToPosition(document, selection.path, selection.from),
            head: textPointToPosition(document, selection.endPath, selection.to),
          },
        } : {}),
      });
    }
    this.context.setPresences(presences);
  }
}

export function createYjsCollaborationExtension(options: YjsCollaborationExtensionOptions): FountainExtension {
  return createCollaborationExtension({
    autoConnect: options.autoConnect,
    adapter: () => new YjsCollaborationAdapter(options),
  });
}
