import {
  Decoration,
  DecorationSet,
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  isSafeURL,
  nodeRangeAtPath,
  positionToTextPoint,
  textPointToPosition,
  type AnySelection,
  type Editor,
  type Node,
  type NodeJSON,
  type PositionMapping,
  type Transaction,
} from '../core';
import { getNodeAtPath, getTextLeaves } from '../core/transaction/path';
import { defineExtension, type FountainExtension } from '../extensions/extension';

const STATE_META = 'fountain$commentsState';
const MAX_THREADS = 5_000;
const MAX_COMMENTS_PER_THREAD = 1_000;
const MAX_CONTENT_LENGTH = 100_000;
const MAX_DATA_LENGTH = 1_000_000;
const MAX_ID_LENGTH = 200;
const MAX_NAME_LENGTH = 200;
const MAX_ANCHOR_QUOTE = 10_000;
const CONTEXT_LENGTH = 32;
let generatedId = 0;

export type CommentsStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type CommentThreadType = 'inline' | 'block' | 'document';
export type CommentAnchorStatus = 'attached' | 'orphaned';
export type CommentContent = string | NodeJSON;
export type CommentAction =
  | 'create-thread'
  | 'reply'
  | 'edit-comment'
  | 'delete-comment'
  | 'resolve-thread'
  | 'archive-thread'
  | 'delete-thread'
  | 'reattach-thread'
  | 'react';

export interface CommentAuthor {
  readonly id: string;
  readonly name: string;
  readonly avatar?: string;
}

export interface CommentReaction {
  readonly emoji: string;
  readonly userIds: readonly string[];
}

export interface CommentMessage {
  readonly id: string;
  readonly author: CommentAuthor;
  readonly content: CommentContent;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly reactions: readonly CommentReaction[];
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface CommentAnchor {
  readonly type: CommentThreadType;
  readonly status: CommentAnchorStatus;
  readonly from?: number;
  readonly to?: number;
  readonly quote?: string;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly nodeType?: string;
  readonly fingerprint?: string;
}

export interface CommentThread {
  readonly id: string;
  readonly anchor: CommentAnchor;
  readonly author: CommentAuthor;
  readonly comments: readonly CommentMessage[];
  readonly resolved: boolean;
  readonly resolvedBy?: CommentAuthor;
  readonly resolvedAt?: string;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revision: number;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface CommentsError {
  readonly message: string;
  readonly recoverable: boolean;
}

export interface CommentsState {
  readonly status: CommentsStatus;
  readonly threads: readonly CommentThread[];
  readonly selectedThreadId?: string;
  readonly hoveredThreadIds: readonly string[];
  readonly pendingThreadIds: readonly string[];
  readonly error?: CommentsError;
}

interface CommentOperationBase {
  readonly operationId: string;
  readonly actor: CommentAuthor;
  readonly at: string;
}

export type CommentOperation =
  | (CommentOperationBase & { readonly type: 'create-thread'; readonly thread: CommentThread })
  | (CommentOperationBase & { readonly type: 'add-comment'; readonly threadId: string; readonly comment: CommentMessage })
  | (CommentOperationBase & { readonly type: 'update-comment'; readonly threadId: string; readonly commentId: string; readonly content: CommentContent; readonly data?: Readonly<Record<string, unknown>> })
  | (CommentOperationBase & { readonly type: 'remove-comment'; readonly threadId: string; readonly commentId: string })
  | (CommentOperationBase & { readonly type: 'set-resolved'; readonly threadId: string; readonly resolved: boolean })
  | (CommentOperationBase & { readonly type: 'set-archived'; readonly threadId: string; readonly archived: boolean })
  | (CommentOperationBase & { readonly type: 'remove-thread'; readonly threadId: string })
  | (CommentOperationBase & { readonly type: 'update-anchor'; readonly threadId: string; readonly anchor: CommentAnchor; readonly reason: 'mapped' | 'reattached' })
  | (CommentOperationBase & { readonly type: 'toggle-reaction'; readonly threadId: string; readonly commentId: string; readonly emoji: string });

export interface CommentAdapterResult {
  readonly thread?: CommentThread;
  readonly removedThreadId?: string;
}

export interface CommentsAdapterContext {
  readonly editor: Editor;
  replaceThreads(threads: readonly CommentThread[]): void;
  setStatus(status: CommentsStatus, error?: CommentsError | string): void;
}

/** Storage/synchronization boundary. The backing service must enforce permissions. */
export interface CommentsAdapter {
  connect(context: CommentsAdapterContext): void | Promise<void>;
  apply(operation: CommentOperation): CommentAdapterResult | Promise<CommentAdapterResult>;
  disconnect?(): void | Promise<void>;
  destroy?(): void;
}

export interface CommentPermissionContext {
  readonly user: CommentAuthor;
  readonly thread?: CommentThread;
  readonly comment?: CommentMessage;
}

export type CommentPermission = (context: CommentPermissionContext) => boolean;

export interface CommentPermissions {
  readonly createThread?: CommentPermission;
  readonly reply?: CommentPermission;
  readonly editComment?: CommentPermission;
  readonly deleteComment?: CommentPermission;
  readonly resolveThread?: CommentPermission;
  readonly archiveThread?: CommentPermission;
  readonly deleteThread?: CommentPermission;
  readonly reattachThread?: CommentPermission;
  readonly react?: CommentPermission;
}

export interface CommentsExtensionOptions {
  readonly adapter: (editor: Editor) => CommentsAdapter;
  readonly user: CommentAuthor;
  readonly permissions?: CommentPermissions;
  readonly autoConnect?: boolean;
  readonly idFactory?: (kind: 'thread' | 'comment' | 'operation') => string;
  readonly now?: () => Date | string;
}

export interface CreateCommentThreadInput {
  readonly content: CommentContent;
  readonly type?: CommentThreadType;
  readonly threadId?: string;
  readonly commentId?: string;
  readonly selection?: AnySelection;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly commentData?: Readonly<Record<string, unknown>>;
}

export interface AddCommentInput {
  readonly content: CommentContent;
  readonly commentId?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export type CommentEvent =
  | { readonly type: 'thread-created'; readonly thread: CommentThread }
  | { readonly type: 'thread-updated'; readonly thread: CommentThread; readonly operation: CommentOperation['type'] }
  | { readonly type: 'thread-removed'; readonly threadId: string }
  | { readonly type: 'thread-selected'; readonly threadId: string }
  | { readonly type: 'thread-unselected'; readonly threadId?: string }
  | { readonly type: 'threads-hovered'; readonly threadIds: readonly string[] }
  | { readonly type: 'anchor-orphaned'; readonly thread: CommentThread }
  | { readonly type: 'anchor-restored'; readonly thread: CommentThread }
  | { readonly type: 'error'; readonly error: CommentsError };

interface CommentsRuntime {
  readonly editor: Editor;
  readonly adapter: CommentsAdapter;
  readonly context: CommentsAdapterContext;
  readonly user: CommentAuthor;
  readonly permissions: CommentPermissions;
  readonly idFactory: NonNullable<CommentsExtensionOptions['idFactory']>;
  readonly now: NonNullable<CommentsExtensionOptions['now']>;
  readonly listeners: Set<(event: CommentEvent) => void>;
  readonly queuedAnchors: Map<string, CommentAnchor>;
  anchorSnapshot: ReadonlyMap<string, CommentAnchor>;
  unsubscribe: () => void;
  generation: number;
  connected: boolean;
  destroyed: boolean;
}

interface TextSpan {
  readonly flatFrom: number;
  readonly flatTo: number;
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly topLevel: number;
}

interface FlatText {
  readonly text: string;
  readonly spans: readonly TextSpan[];
}

const runtimes = new WeakMap<Editor, CommentsRuntime>();
export const commentsKey = new PluginKey<CommentsState>('comments');

function validId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_ID_LENGTH
    && /^[\w.:@/-]+$/.test(value);
}

function normalizeAuthor(value: CommentAuthor | undefined): CommentAuthor {
  if (!value
    || !validId(value.id)
    || typeof value.name !== 'string'
    || !value.name.trim()
    || value.name.length > MAX_NAME_LENGTH
    || /[\u0000-\u001f\u007f]/.test(value.name)
    || (value.avatar !== undefined
      && (typeof value.avatar !== 'string'
        || value.avatar.length > 2_048
        || !isSafeURL(value.avatar, { allowDataImage: true })))) {
    throw new TypeError('Comments require a valid author identity.');
  }
  return Object.freeze({
    id: value.id.trim(),
    name: value.name.trim(),
    ...(value.avatar ? { avatar: value.avatar.trim() } : {}),
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

function normalizedJSON<T>(value: T, label: string, maximum = MAX_DATA_LENGTH): T {
  let encoded: string | undefined;
  try { encoded = JSON.stringify(value); }
  catch { throw new TypeError(`${label} must be JSON serializable.`); }
  if (encoded === undefined || encoded.length > maximum) throw new RangeError(`${label} exceeds the safety limit.`);
  return deepFreeze(JSON.parse(encoded) as T);
}

function normalizeData(value: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Comment data must be an object.');
  return normalizedJSON(value, 'Comment data');
}

function normalizeContent(value: CommentContent): CommentContent {
  if (typeof value === 'string') {
    if (!value.trim()) throw new TypeError('Comment content must not be empty.');
    if (value.length > MAX_CONTENT_LENGTH) throw new RangeError('Comment content exceeds the safety limit.');
    return value;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Comment content must be text or document JSON.');
  return normalizedJSON(value, 'Comment content', MAX_CONTENT_LENGTH);
}

function normalizeTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > 50 || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`Invalid ${label} timestamp.`);
  }
  return new Date(value).toISOString();
}

function normalizeReaction(value: CommentReaction): CommentReaction {
  if (typeof value?.emoji !== 'string' || !value.emoji.trim() || value.emoji.length > 32) {
    throw new TypeError('A comment reaction requires a short emoji value.');
  }
  const users = [...new Set((Array.isArray(value.userIds) ? value.userIds : []).filter(validId))].slice(0, 10_000).sort();
  return Object.freeze({ emoji: value.emoji, userIds: Object.freeze(users) });
}

function normalizeMessage(value: CommentMessage): CommentMessage {
  if (!validId(value?.id)) throw new TypeError('A comment requires a valid id.');
  const reactions = (Array.isArray(value.reactions) ? value.reactions : []).slice(0, 1_000).map(normalizeReaction);
  return Object.freeze({
    id: value.id,
    author: normalizeAuthor(value.author),
    content: normalizeContent(value.content),
    createdAt: normalizeTimestamp(value.createdAt, 'comment creation'),
    ...(value.updatedAt ? { updatedAt: normalizeTimestamp(value.updatedAt, 'comment update') } : {}),
    reactions: Object.freeze(reactions),
    ...(value.data ? { data: normalizeData(value.data) } : {}),
  });
}

function normalizeAnchor(value: CommentAnchor, document?: Node): CommentAnchor {
  if (!value || !['inline', 'block', 'document'].includes(value.type)) throw new TypeError('Invalid comment anchor type.');
  if (!['attached', 'orphaned'].includes(value.status)) throw new TypeError('Invalid comment anchor status.');
  if (value.type === 'document') return Object.freeze({ type: 'document', status: 'attached' });
  if (!Number.isInteger(value.from) || !Number.isInteger(value.to) || (value.from as number) < 0 || (value.to as number) < (value.from as number)) {
    throw new RangeError('A range comment requires ordered non-negative positions.');
  }
  const maximum = document ? Math.max(0, document.nodeSize - 2) : Number.MAX_SAFE_INTEGER;
  const from = Math.min(value.from as number, maximum);
  const to = Math.min(value.to as number, maximum);
  const safeText = (candidate: unknown, maximumLength: number): string | undefined => (
    typeof candidate === 'string' && candidate.length <= maximumLength ? candidate : undefined
  );
  const nodeType = safeText(value.nodeType, 200);
  const fingerprint = safeText(value.fingerprint, 100_000);
  return Object.freeze({
    type: value.type,
    status: value.status,
    from,
    to,
    ...(safeText(value.quote, MAX_ANCHOR_QUOTE) !== undefined ? { quote: value.quote } : {}),
    ...(safeText(value.prefix, CONTEXT_LENGTH) !== undefined ? { prefix: value.prefix } : {}),
    ...(safeText(value.suffix, CONTEXT_LENGTH) !== undefined ? { suffix: value.suffix } : {}),
    ...(nodeType ? { nodeType } : {}),
    ...(fingerprint ? { fingerprint } : {}),
  });
}

function normalizeThread(value: CommentThread, document?: Node): CommentThread {
  if (!validId(value?.id)) throw new TypeError('A comment thread requires a valid id.');
  if (!Number.isInteger(value.revision) || value.revision < 1) throw new TypeError('A comment thread requires a positive revision.');
  const supplied = Array.isArray(value.comments) ? value.comments : [];
  if (supplied.length > MAX_COMMENTS_PER_THREAD) throw new RangeError('A comment thread contains too many comments.');
  const comments = supplied.map(normalizeMessage);
  if (new Set(comments.map((comment) => comment.id)).size !== comments.length) throw new Error('Comment ids must be unique within a thread.');
  return Object.freeze({
    id: value.id,
    anchor: normalizeAnchor(value.anchor, document),
    author: normalizeAuthor(value.author),
    comments: Object.freeze(comments),
    resolved: Boolean(value.resolved),
    ...(value.resolved && value.resolvedBy ? { resolvedBy: normalizeAuthor(value.resolvedBy) } : {}),
    ...(value.resolved && value.resolvedAt ? { resolvedAt: normalizeTimestamp(value.resolvedAt, 'thread resolution') } : {}),
    archived: Boolean(value.archived),
    createdAt: normalizeTimestamp(value.createdAt, 'thread creation'),
    updatedAt: normalizeTimestamp(value.updatedAt, 'thread update'),
    revision: value.revision,
    ...(value.data ? { data: normalizeData(value.data) } : {}),
  });
}

function normalizeThreads(values: readonly CommentThread[], document?: Node): readonly CommentThread[] {
  if (!Array.isArray(values) || values.length > MAX_THREADS) throw new RangeError('The comment store returned too many threads.');
  const unique = new Map<string, CommentThread>();
  values.forEach((value) => {
    const thread = normalizeThread(value, document);
    const previous = unique.get(thread.id);
    if (!previous || previous.revision < thread.revision) unique.set(thread.id, thread);
  });
  return Object.freeze([...unique.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)));
}

function immutableError(error?: CommentsError | string): CommentsError | undefined {
  if (!error) return undefined;
  const value = typeof error === 'string' ? { message: error, recoverable: true } : error;
  return Object.freeze({ message: String(value.message).slice(0, 2_000), recoverable: Boolean(value.recoverable) });
}

function stateSnapshot(value: Partial<CommentsState> = {}): CommentsState {
  return Object.freeze({
    status: value.status ?? 'disconnected',
    threads: Object.freeze([...(value.threads ?? [])]),
    ...(value.selectedThreadId ? { selectedThreadId: value.selectedThreadId } : {}),
    hoveredThreadIds: Object.freeze([...(value.hoveredThreadIds ?? [])]),
    pendingThreadIds: Object.freeze([...(value.pendingThreadIds ?? [])]),
    ...(value.error ? { error: immutableError(value.error) } : {}),
  });
}

function setState(editor: Editor, state: CommentsState, transaction?: Transaction): boolean {
  if (editor.isDestroyed) return false;
  return editor.dispatch((transaction ?? editor.state.createTransaction())
    .setMeta(STATE_META, state)
    .setMeta('addToHistory', false)
    .setMeta('force', true));
}

function textProjection(document: Node): FlatText {
  const spans: TextSpan[] = [];
  let text = '';
  let previousTopLevel: number | undefined;
  getTextLeaves(document).forEach((leaf) => {
    const value = leaf.node.text ?? '';
    const topLevel = leaf.path[0] ?? 0;
    if (text && previousTopLevel !== undefined && previousTopLevel !== topLevel) text += '\n';
    const from = textPointToPosition(document, leaf.path, 0);
    spans.push(Object.freeze({
      flatFrom: text.length,
      flatTo: text.length + value.length,
      from,
      to: from + value.length,
      text: value,
      topLevel,
    }));
    text += value;
    previousTopLevel = topLevel;
  });
  return Object.freeze({ text, spans: Object.freeze(spans) });
}

function projectionOffset(projection: FlatText, position: number, association: -1 | 1): number {
  const inside = projection.spans.find((span) => position >= span.from && position <= span.to);
  if (inside) return inside.flatFrom + Math.max(0, Math.min(position - inside.from, inside.text.length));
  if (association < 0) return [...projection.spans].reverse().find((span) => span.to <= position)?.flatTo ?? 0;
  return projection.spans.find((span) => span.from >= position)?.flatFrom ?? projection.text.length;
}

function positionAtProjectionOffset(projection: FlatText, offset: number, association: -1 | 1): number | undefined {
  const inside = projection.spans.find((span) => offset >= span.flatFrom && offset <= span.flatTo);
  if (inside) return inside.from + Math.max(0, Math.min(offset - inside.flatFrom, inside.text.length));
  if (association < 0) return [...projection.spans].reverse().find((span) => span.flatTo <= offset)?.to;
  return projection.spans.find((span) => span.flatFrom >= offset)?.from;
}

function contextForRange(document: Node, from: number, to: number): Pick<CommentAnchor, 'quote' | 'prefix' | 'suffix'> {
  const projection = textProjection(document);
  const start = projectionOffset(projection, from, 1);
  const end = projectionOffset(projection, to, -1);
  return {
    quote: projection.text.slice(start, end).slice(0, MAX_ANCHOR_QUOTE),
    prefix: projection.text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: projection.text.slice(end, end + CONTEXT_LENGTH),
  };
}

function nodePathForRange(document: Node, from: number, to: number, nodeType?: string): readonly number[] | undefined {
  let result: readonly number[] | undefined;
  document.descendants((node, path) => {
    if (result || node.isText || (nodeType && node.type.name !== nodeType)) return !result;
    const range = nodeRangeAtPath(document, path);
    if (range.from === from && range.to === to) {
      result = Object.freeze([...path]);
      return false;
    }
    return true;
  });
  return result;
}

function attachedRangeAnchor(document: Node, type: 'inline' | 'block', from: number, to: number, path?: readonly number[]): CommentAnchor {
  const context = contextForRange(document, from, to);
  if (type === 'block' && path) {
    const node = getNodeAtPath(document, path);
    const fingerprint = JSON.stringify(node.toJSON());
    return normalizeAnchor({
      type,
      status: 'attached',
      from,
      to,
      ...context,
      nodeType: node.type.name,
      ...(fingerprint.length <= 100_000 ? { fingerprint } : {}),
    }, document);
  }
  return normalizeAnchor({ type, status: 'attached', from, to, ...context }, document);
}

export function createCommentAnchor(editor: Editor, type: CommentThreadType, selection: AnySelection = editor.state.selection): CommentAnchor {
  const document = editor.state.doc;
  if (type === 'document') return Object.freeze({ type, status: 'attached' });
  if (type === 'block') {
    const path = selection instanceof NodeSelection
      ? selection.nodePath
      : selection.path.length > 1
        ? selection.path.slice(0, -1)
        : [selection.path[0] ?? 0];
    const node = getNodeAtPath(document, path);
    if (node.isText) throw new Error('A block comment must target a non-text node.');
    const range = nodeRangeAtPath(document, path);
    return attachedRangeAnchor(document, 'block', range.from, range.to, path);
  }
  const from = textPointToPosition(document, selection.path, selection.from);
  const to = textPointToPosition(document, selection.endPath, selection.to);
  return attachedRangeAnchor(document, 'inline', from, to);
}

function recoverBlockAnchor(anchor: CommentAnchor, document: Node): CommentAnchor | undefined {
  const candidates: { path: readonly number[]; from: number; to: number; score: number }[] = [];
  document.descendants((node, path) => {
    if (node.isText || (anchor.nodeType && node.type.name !== anchor.nodeType)) return;
    const fingerprint = JSON.stringify(node.toJSON());
    const quote = node.textContent.slice(0, MAX_ANCHOR_QUOTE);
    if ((anchor.fingerprint && fingerprint === anchor.fingerprint) || (anchor.quote && quote === anchor.quote)) {
      const range = nodeRangeAtPath(document, path);
      candidates.push({ path: Object.freeze([...path]), ...range, score: Math.abs(range.from - (anchor.from ?? 0)) });
    }
  });
  candidates.sort((left, right) => left.score - right.score || left.from - right.from);
  if (!candidates.length || (candidates[1] && candidates[1].score === candidates[0]?.score)) return undefined;
  const winner = candidates[0] as (typeof candidates)[number];
  return attachedRangeAnchor(document, 'block', winner.from, winner.to, winner.path);
}

function recoverInlineAnchor(anchor: CommentAnchor, document: Node): CommentAnchor | undefined {
  if (!anchor.quote) return undefined;
  const projection = textProjection(document);
  const candidates: { from: number; to: number; score: number }[] = [];
  let offset = projection.text.indexOf(anchor.quote);
  while (offset >= 0 && candidates.length < 1_000) {
    const from = positionAtProjectionOffset(projection, offset, 1);
    const to = positionAtProjectionOffset(projection, offset + anchor.quote.length, -1);
    if (from !== undefined && to !== undefined && from <= to) {
      const prefix = projection.text.slice(Math.max(0, offset - CONTEXT_LENGTH), offset);
      const suffix = projection.text.slice(offset + anchor.quote.length, offset + anchor.quote.length + CONTEXT_LENGTH);
      const prefixScore = anchor.prefix && prefix.endsWith(anchor.prefix) ? anchor.prefix.length * 4 : 0;
      const suffixScore = anchor.suffix && suffix.startsWith(anchor.suffix) ? anchor.suffix.length * 4 : 0;
      candidates.push({ from, to, score: prefixScore + suffixScore - Math.min(10_000, Math.abs(from - (anchor.from ?? 0))) });
    }
    offset = projection.text.indexOf(anchor.quote, offset + Math.max(1, anchor.quote.length));
  }
  candidates.sort((left, right) => right.score - left.score || left.from - right.from);
  if (!candidates.length || (candidates[1] && candidates[1].score === candidates[0]?.score)) return undefined;
  const winner = candidates[0] as (typeof candidates)[number];
  return attachedRangeAnchor(document, 'inline', winner.from, winner.to);
}

function orphanAnchor(anchor: CommentAnchor, document: Node): CommentAnchor {
  const maximum = Math.max(0, document.nodeSize - 2);
  return normalizeAnchor({
    ...anchor,
    status: 'orphaned',
    from: Math.min(anchor.from ?? 0, maximum),
    to: Math.min(anchor.to ?? anchor.from ?? 0, maximum),
  }, document);
}

function mapAnchor(anchor: CommentAnchor, before: Node, after: Node, mapping: PositionMapping): CommentAnchor {
  if (anchor.type === 'document') return anchor;
  const start = mapping.mapResult(anchor.from ?? 0, 1);
  const end = mapping.mapResult(anchor.to ?? anchor.from ?? 0, -1);
  if (!start.deletedAcross && !end.deletedAcross && start.position <= end.position) {
    if (anchor.type === 'block') {
      const path = nodePathForRange(after, start.position, end.position, anchor.nodeType);
      if (path) return attachedRangeAnchor(after, 'block', start.position, end.position, path);
    } else if (start.position < end.position || (anchor.from === anchor.to && start.position === end.position)) {
      return attachedRangeAnchor(after, 'inline', start.position, end.position);
    }
  }
  const recovered = anchor.type === 'block' ? recoverBlockAnchor(anchor, after) : recoverInlineAnchor(anchor, after);
  return recovered ?? orphanAnchor(anchor, after);
}

function sameAnchor(left: CommentAnchor, right: CommentAnchor): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mapThreads(value: CommentsState, transaction: Transaction, oldDocument: Node, newDocument: Node): CommentsState {
  if (!transaction.docChanged) return value;
  const threads = value.threads.map((thread) => {
    const anchor = mapAnchor(thread.anchor, oldDocument, newDocument, transaction.mapping);
    return sameAnchor(anchor, thread.anchor) ? thread : Object.freeze({ ...thread, anchor });
  });
  return stateSnapshot({ ...value, threads });
}

function threadDecorations(state: CommentsState, document: Node): DecorationSet {
  if (typeof globalThis.document === 'undefined') return DecorationSet.empty;
  const decorations: Decoration[] = [];
  state.threads.forEach((thread) => {
    const anchor = thread.anchor;
    if (thread.archived || anchor.status === 'orphaned' || anchor.type === 'document' || anchor.from === undefined || anchor.to === undefined) return;
    const classes = [
      'fountain-comment-thread',
      `fountain-comment-thread--${anchor.type}`,
      thread.resolved ? 'is-resolved' : '',
      state.selectedThreadId === thread.id ? 'is-selected' : '',
      state.hoveredThreadIds.includes(thread.id) ? 'is-hovered' : '',
    ].filter(Boolean).join(' ');
    const attrs = {
      class: classes,
      'data-fountain-comment-thread': thread.id,
      'aria-label': `Comment thread by ${thread.author.name}`,
      title: `Comment by ${thread.author.name}`,
    };
    if (anchor.type === 'block' && nodePathForRange(document, anchor.from, anchor.to, anchor.nodeType)) {
      decorations.push(Decoration.node(anchor.from, anchor.to, attrs, { key: `comment-${thread.id}` }));
    } else if (anchor.from < anchor.to) {
      decorations.push(Decoration.inline(anchor.from, anchor.to, attrs, {
        key: `comment-${thread.id}`,
        inclusiveStart: false,
        inclusiveEnd: false,
      }));
    } else {
      decorations.push(Decoration.widget(anchor.from, () => {
        const button = globalThis.document.createElement('button');
        button.type = 'button';
        button.className = `${classes} fountain-comment-thread--point`;
        button.dataset.fountainCommentThread = thread.id;
        button.setAttribute('aria-label', `Open comment thread by ${thread.author.name}`);
        button.title = `Comment by ${thread.author.name}`;
        button.textContent = 'Comment';
        return button;
      }, { key: `comment-${thread.id}`, side: 1 }));
    }
  });
  return DecorationSet.create(document, decorations);
}

function defaultId(kind: 'thread' | 'comment' | 'operation'): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `${kind}-${random}`;
  generatedId += 1;
  return `${kind}-${Date.now().toString(36)}-${generatedId.toString(36)}`;
}

function timestamp(runtime: CommentsRuntime): string {
  const value = runtime.now();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new TypeError('The comments clock returned an invalid date.');
  return date.toISOString();
}

function identifier(runtime: CommentsRuntime, kind: 'thread' | 'comment' | 'operation', supplied?: string): string {
  const value = supplied ?? runtime.idFactory(kind);
  if (!validId(value)) throw new TypeError(`The comments ${kind} id is invalid.`);
  return value;
}

function emit(runtime: CommentsRuntime, event: CommentEvent): void {
  runtime.listeners.forEach((listener) => {
    try { listener(event); } catch { /* Event consumers do not own editor state. */ }
  });
}

function contain(runtime: CommentsRuntime, operation: () => void | Promise<void>): void {
  try {
    const result = operation();
    if (result && typeof result.then === 'function') void result.catch((error) => reportError(runtime, error));
  } catch (error) { reportError(runtime, error); }
}

function reportError(runtime: CommentsRuntime, error: unknown, recoverable = true): CommentsError {
  const normalized = immutableError({ message: error instanceof Error ? error.message : String(error), recoverable }) as CommentsError;
  const current = commentsKey.get(runtime.editor.state) ?? stateSnapshot();
  setState(runtime.editor, stateSnapshot({ ...current, status: 'error', error: normalized }));
  emit(runtime, { type: 'error', error: normalized });
  return normalized;
}

function replaceThreads(runtime: CommentsRuntime, values: readonly CommentThread[]): void {
  if (runtime.destroyed) return;
  try {
    const current = commentsKey.get(runtime.editor.state) ?? stateSnapshot();
    const threads = normalizeThreads(values, runtime.editor.state.doc);
    const ids = new Set(threads.map((thread) => thread.id));
    runtime.anchorSnapshot = new Map(threads.map((thread) => [thread.id, thread.anchor]));
    setState(runtime.editor, stateSnapshot({
      ...current,
      threads,
      selectedThreadId: current.selectedThreadId && ids.has(current.selectedThreadId) ? current.selectedThreadId : undefined,
      hoveredThreadIds: current.hoveredThreadIds.filter((id) => ids.has(id)),
    }));
  } catch (error) { reportError(runtime, error); }
}

function setStatus(runtime: CommentsRuntime, status: CommentsStatus, error?: CommentsError | string): void {
  if (runtime.destroyed) return;
  const current = commentsKey.get(runtime.editor.state) ?? stateSnapshot();
  setState(runtime.editor, stateSnapshot({ ...current, status, error: immutableError(error) }));
}

function operationThreadId(operation: CommentOperation): string {
  return operation.type === 'create-thread' ? operation.thread.id : operation.threadId;
}

function permissionName(action: CommentAction): keyof CommentPermissions {
  return ({
    'create-thread': 'createThread',
    reply: 'reply',
    'edit-comment': 'editComment',
    'delete-comment': 'deleteComment',
    'resolve-thread': 'resolveThread',
    'archive-thread': 'archiveThread',
    'delete-thread': 'deleteThread',
    'reattach-thread': 'reattachThread',
    react: 'react',
  } as const)[action];
}

function defaultAllowed(action: CommentAction, context: CommentPermissionContext): boolean {
  if (action === 'create-thread' || action === 'reply' || action === 'react') return true;
  if (action === 'edit-comment' || action === 'delete-comment') return context.comment?.author.id === context.user.id;
  if (action === 'resolve-thread') return true;
  return context.thread?.author.id === context.user.id;
}

function allowed(runtime: CommentsRuntime, action: CommentAction, thread?: CommentThread, comment?: CommentMessage): boolean {
  const check = runtime.permissions[permissionName(action)];
  try { return check ? Boolean(check({ user: runtime.user, thread, comment })) : defaultAllowed(action, { user: runtime.user, thread, comment }); }
  catch { return false; }
}

function runtimeFor(editor: Editor): CommentsRuntime {
  const runtime = runtimes.get(editor);
  if (!runtime || runtime.destroyed) throw new Error('This editor does not have an active comments extension.');
  return runtime;
}

function currentThread(runtime: CommentsRuntime, threadId: string): CommentThread {
  const thread = commentsKey.get(runtime.editor.state)?.threads.find((candidate) => candidate.id === threadId);
  if (!thread) throw new Error(`Unknown comment thread: ${threadId}`);
  return thread;
}

function currentComment(thread: CommentThread, commentId: string): CommentMessage {
  const comment = thread.comments.find((candidate) => candidate.id === commentId);
  if (!comment) throw new Error(`Unknown comment: ${commentId}`);
  return comment;
}

function withPending(runtime: CommentsRuntime, threadId: string, pending: boolean): void {
  const current = commentsKey.get(runtime.editor.state) ?? stateSnapshot();
  const ids = new Set(current.pendingThreadIds);
  if (pending) ids.add(threadId); else ids.delete(threadId);
  setState(runtime.editor, stateSnapshot({ ...current, pendingThreadIds: [...ids].sort() }));
}

function applyAdapterResult(runtime: CommentsRuntime, result: CommentAdapterResult): CommentThread | undefined {
  const current = commentsKey.get(runtime.editor.state) ?? stateSnapshot();
  if (result.removedThreadId) {
    if (!validId(result.removedThreadId)) throw new TypeError('The comment adapter returned an invalid removed thread id.');
    const threads = current.threads.filter((thread) => thread.id !== result.removedThreadId);
    replaceThreads(runtime, threads);
    return undefined;
  }
  if (!result.thread) throw new Error('The comment adapter did not return an authoritative result.');
  const thread = normalizeThread(result.thread, runtime.editor.state.doc);
  const threads = [...current.threads.filter((candidate) => candidate.id !== thread.id), thread];
  replaceThreads(runtime, threads);
  return thread;
}

async function runOperation(
  runtime: CommentsRuntime,
  action: CommentAction,
  operation: CommentOperation,
  thread?: CommentThread,
  comment?: CommentMessage,
): Promise<CommentThread | undefined> {
  if (!allowed(runtime, action, thread, comment)) throw new Error(`Comment permission denied: ${action}.`);
  const threadId = operationThreadId(operation);
  withPending(runtime, threadId, true);
  try {
    const result = await runtime.adapter.apply(operation);
    const next = applyAdapterResult(runtime, result);
    if (runtime.connected && commentsKey.get(runtime.editor.state)?.status === 'error') {
      setStatus(runtime, 'connected');
    }
    if (operation.type === 'create-thread' && next) emit(runtime, { type: 'thread-created', thread: next });
    else if (operation.type === 'remove-thread') emit(runtime, { type: 'thread-removed', threadId });
    else if (next) emit(runtime, { type: 'thread-updated', thread: next, operation: operation.type });
    return next;
  } catch (error) {
    reportError(runtime, error);
    throw error;
  } finally { withPending(runtime, threadId, false); }
}

function operationBase(runtime: CommentsRuntime): CommentOperationBase {
  return Object.freeze({ operationId: identifier(runtime, 'operation'), actor: runtime.user, at: timestamp(runtime) });
}

export function getCommentsState(editor: Editor): CommentsState | undefined {
  return commentsKey.get(editor.state);
}

export function subscribeCommentEvents(editor: Editor, listener: (event: CommentEvent) => void): () => void {
  const runtime = runtimeFor(editor);
  runtime.listeners.add(listener);
  return () => runtime.listeners.delete(listener);
}

export function canComment(editor: Editor, action: CommentAction, threadId?: string, commentId?: string): boolean {
  const runtime = runtimes.get(editor);
  if (!runtime || runtime.destroyed) return false;
  const thread = threadId ? commentsKey.get(editor.state)?.threads.find((candidate) => candidate.id === threadId) : undefined;
  const comment = thread && commentId ? thread.comments.find((candidate) => candidate.id === commentId) : undefined;
  return allowed(runtime, action, thread, comment);
}

export async function createCommentThread(editor: Editor, input: CreateCommentThreadInput): Promise<CommentThread> {
  const runtime = runtimeFor(editor);
  const at = timestamp(runtime);
  const type = input.type ?? (editor.state.selection instanceof NodeSelection ? 'block' : 'inline');
  const threadId = identifier(runtime, 'thread', input.threadId);
  const commentId = identifier(runtime, 'comment', input.commentId);
  const comment = normalizeMessage({
    id: commentId,
    author: runtime.user,
    content: input.content,
    createdAt: at,
    reactions: [],
    ...(input.commentData ? { data: input.commentData } : {}),
  });
  const thread = normalizeThread({
    id: threadId,
    anchor: createCommentAnchor(editor, type, input.selection),
    author: runtime.user,
    comments: [comment],
    resolved: false,
    archived: false,
    createdAt: at,
    updatedAt: at,
    revision: 1,
    ...(input.data ? { data: input.data } : {}),
  }, editor.state.doc);
  const result = await runOperation(runtime, 'create-thread', Object.freeze({ ...operationBase(runtime), type: 'create-thread', thread }));
  if (!result) throw new Error('The comment adapter removed a newly created thread.');
  return result;
}

export async function addComment(editor: Editor, threadId: string, input: AddCommentInput): Promise<CommentThread> {
  const runtime = runtimeFor(editor);
  const thread = currentThread(runtime, threadId);
  const comment = normalizeMessage({
    id: identifier(runtime, 'comment', input.commentId),
    author: runtime.user,
    content: input.content,
    createdAt: timestamp(runtime),
    reactions: [],
    ...(input.data ? { data: input.data } : {}),
  });
  const result = await runOperation(runtime, 'reply', Object.freeze({
    ...operationBase(runtime), type: 'add-comment', threadId: thread.id, comment,
  }), thread);
  if (!result) throw new Error('The comment adapter removed the replied-to thread.');
  return result;
}

export async function updateComment(
  editor: Editor,
  threadId: string,
  commentId: string,
  content: CommentContent,
  data?: Readonly<Record<string, unknown>>,
): Promise<CommentThread> {
  const runtime = runtimeFor(editor);
  const thread = currentThread(runtime, threadId);
  const comment = currentComment(thread, commentId);
  const result = await runOperation(runtime, 'edit-comment', Object.freeze({
    ...operationBase(runtime),
    type: 'update-comment',
    threadId,
    commentId,
    content: normalizeContent(content),
    ...(data ? { data: normalizeData(data) } : {}),
  }), thread, comment);
  if (!result) throw new Error('The comment adapter removed the edited thread.');
  return result;
}

export async function removeComment(editor: Editor, threadId: string, commentId: string): Promise<CommentThread> {
  const runtime = runtimeFor(editor);
  const thread = currentThread(runtime, threadId);
  const comment = currentComment(thread, commentId);
  const result = await runOperation(runtime, 'delete-comment', Object.freeze({
    ...operationBase(runtime), type: 'remove-comment', threadId, commentId,
  }), thread, comment);
  if (!result) throw new Error('The comment adapter removed the edited thread.');
  return result;
}

export async function setCommentThreadResolved(editor: Editor, threadId: string, resolved: boolean): Promise<CommentThread> {
  const runtime = runtimeFor(editor);
  const thread = currentThread(runtime, threadId);
  const result = await runOperation(runtime, 'resolve-thread', Object.freeze({
    ...operationBase(runtime), type: 'set-resolved', threadId, resolved,
  }), thread);
  if (!result) throw new Error('The comment adapter removed the resolved thread.');
  return result;
}

export async function setCommentThreadArchived(editor: Editor, threadId: string, archived: boolean): Promise<CommentThread> {
  const runtime = runtimeFor(editor);
  const thread = currentThread(runtime, threadId);
  const result = await runOperation(runtime, 'archive-thread', Object.freeze({
    ...operationBase(runtime), type: 'set-archived', threadId, archived,
  }), thread);
  if (!result) throw new Error('The comment adapter removed the archived thread.');
  return result;
}

export async function removeCommentThread(editor: Editor, threadId: string): Promise<void> {
  const runtime = runtimeFor(editor);
  const thread = currentThread(runtime, threadId);
  await runOperation(runtime, 'delete-thread', Object.freeze({
    ...operationBase(runtime), type: 'remove-thread', threadId,
  }), thread);
}

export async function reattachCommentThread(
  editor: Editor,
  threadId: string,
  selection: AnySelection = editor.state.selection,
  type?: CommentThreadType,
): Promise<CommentThread> {
  const runtime = runtimeFor(editor);
  const thread = currentThread(runtime, threadId);
  const anchor = createCommentAnchor(editor, type ?? thread.anchor.type, selection);
  const result = await runOperation(runtime, 'reattach-thread', Object.freeze({
    ...operationBase(runtime), type: 'update-anchor', threadId, anchor, reason: 'reattached',
  }), thread);
  if (!result) throw new Error('The comment adapter removed the reattached thread.');
  emit(runtime, { type: 'anchor-restored', thread: result });
  return result;
}

export async function toggleCommentReaction(editor: Editor, threadId: string, commentId: string, emoji: string): Promise<CommentThread> {
  const runtime = runtimeFor(editor);
  const thread = currentThread(runtime, threadId);
  const comment = currentComment(thread, commentId);
  if (typeof emoji !== 'string' || !emoji.trim() || emoji.length > 32) throw new TypeError('A reaction requires a short emoji value.');
  const result = await runOperation(runtime, 'react', Object.freeze({
    ...operationBase(runtime), type: 'toggle-reaction', threadId, commentId, emoji,
  }), thread, comment);
  if (!result) throw new Error('The comment adapter removed the reacted-to thread.');
  return result;
}

export function selectCommentThread(editor: Editor, threadId: string, selectAnchor = true): boolean {
  const runtime = runtimes.get(editor);
  const state = commentsKey.get(editor.state);
  const thread = state?.threads.find((candidate) => candidate.id === threadId);
  if (!runtime || !state || !thread) return false;
  let transaction = editor.state.createTransaction();
  const anchor = thread.anchor;
  if (selectAnchor && anchor.status === 'attached' && anchor.type !== 'document'
    && anchor.from !== undefined && anchor.to !== undefined) {
    try {
      if (anchor.type === 'block') {
        const path = nodePathForRange(editor.state.doc, anchor.from, anchor.to, anchor.nodeType);
        if (path) transaction = transaction.setSelection(new NodeSelection(editor.state.doc, path));
      } else {
        const start = positionToTextPoint(editor.state.doc, anchor.from, 1);
        const end = positionToTextPoint(editor.state.doc, anchor.to, -1);
        transaction = transaction.setSelection(anchor.from === anchor.to
          ? Selection.cursor(start.path, start.offset)
          : Selection.range(start.path, start.offset, end.path, end.offset));
      }
    } catch { /* Keep thread selection even if a stale host anchor cannot resolve. */ }
  }
  const changed = setState(editor, stateSnapshot({ ...state, selectedThreadId: threadId }), transaction);
  if (changed) emit(runtime, { type: 'thread-selected', threadId });
  return changed;
}

export function unselectCommentThread(editor: Editor): boolean {
  const runtime = runtimes.get(editor);
  const state = commentsKey.get(editor.state);
  if (!runtime || !state || !state.selectedThreadId) return false;
  const previous = state.selectedThreadId;
  const changed = setState(editor, stateSnapshot({ ...state, selectedThreadId: undefined }));
  if (changed) emit(runtime, { type: 'thread-unselected', threadId: previous });
  return changed;
}

export function hoverCommentThreads(editor: Editor, threadIds: readonly string[]): boolean {
  const runtime = runtimes.get(editor);
  const state = commentsKey.get(editor.state);
  if (!runtime || !state) return false;
  const known = new Set(state.threads.map((thread) => thread.id));
  const next = [...new Set(threadIds.filter((id) => validId(id) && known.has(id)))].sort();
  if (next.length === state.hoveredThreadIds.length && next.every((id, index) => id === state.hoveredThreadIds[index])) return false;
  const changed = setState(editor, stateSnapshot({ ...state, hoveredThreadIds: next }));
  if (changed) emit(runtime, { type: 'threads-hovered', threadIds: Object.freeze(next) });
  return changed;
}

function start(runtime: CommentsRuntime, reconnecting = false): boolean {
  if (runtime.destroyed || runtime.connected) return false;
  runtime.connected = true;
  const generation = ++runtime.generation;
  setStatus(runtime, reconnecting ? 'reconnecting' : 'connecting');
  try {
    const result = runtime.adapter.connect(runtime.context);
    const finish = () => {
      if (runtime.destroyed || !runtime.connected || runtime.generation !== generation) return;
      setStatus(runtime, 'connected');
      const queued = [...runtime.queuedAnchors.entries()];
      runtime.queuedAnchors.clear();
      queued.forEach(([threadId, anchor]) => {
        const thread = commentsKey.get(runtime.editor.state)?.threads.find((candidate) => candidate.id === threadId);
        if (!thread) return;
        contain(runtime, async () => {
          const operation: CommentOperation = Object.freeze({
            ...operationBase(runtime), type: 'update-anchor', threadId, anchor, reason: 'mapped',
          });
          applyAdapterResult(runtime, await runtime.adapter.apply(operation));
        });
      });
    };
    if (result && typeof result.then === 'function') {
      void result.then(finish).catch((error) => {
        if (runtime.generation !== generation) return;
        runtime.connected = false;
        contain(runtime, () => runtime.adapter.disconnect?.());
        reportError(runtime, error);
      });
    } else finish();
    return true;
  } catch (error) {
    runtime.connected = false;
    contain(runtime, () => runtime.adapter.disconnect?.());
    reportError(runtime, error);
    return false;
  }
}

function stop(runtime: CommentsRuntime, destroyed = false): boolean {
  if (!runtime.connected && !destroyed) return false;
  runtime.connected = false;
  runtime.generation += 1;
  contain(runtime, () => runtime.adapter.disconnect?.());
  if (!destroyed) setStatus(runtime, 'disconnected');
  return true;
}

export function connectComments(editor: Editor): boolean {
  const runtime = runtimes.get(editor);
  return runtime ? start(runtime) : false;
}

export function disconnectComments(editor: Editor): boolean {
  const runtime = runtimes.get(editor);
  return runtime ? stop(runtime) : false;
}

export function reconnectComments(editor: Editor): boolean {
  const runtime = runtimes.get(editor);
  if (!runtime || runtime.destroyed) return false;
  stop(runtime);
  return start(runtime, true);
}

function mappedAnchorChanges(runtime: CommentsRuntime, state: CommentsState, transaction: Transaction): void {
  const previous = runtime.anchorSnapshot;
  runtime.anchorSnapshot = new Map(state.threads.map((thread) => [thread.id, thread.anchor]));
  if (!transaction.docChanged || transaction.getMeta(STATE_META)) return;
  state.threads.forEach((thread) => {
    const before = previous.get(thread.id);
    if (!before || sameAnchor(before, thread.anchor)) return;
    if (before.status !== thread.anchor.status) {
      emit(runtime, { type: thread.anchor.status === 'orphaned' ? 'anchor-orphaned' : 'anchor-restored', thread });
    }
    if (transaction.getMeta('fountain$collaborationRemote') === true) return;
    runtime.queuedAnchors.set(thread.id, thread.anchor);
    if (!runtime.connected) return;
    runtime.queuedAnchors.delete(thread.id);
    contain(runtime, async () => {
      const operation: CommentOperation = Object.freeze({
        ...operationBase(runtime), type: 'update-anchor', threadId: thread.id, anchor: thread.anchor, reason: 'mapped',
      });
      applyAdapterResult(runtime, await runtime.adapter.apply(operation));
    });
  });
}

export function createCommentsExtension(options: CommentsExtensionOptions): FountainExtension {
  if (typeof options?.adapter !== 'function') throw new TypeError('Comments require an adapter factory.');
  const user = normalizeAuthor(options.user);
  const idFactory = options.idFactory ?? defaultId;
  const now = options.now ?? (() => new Date());
  const plugin = new Plugin<CommentsState>({
    key: commentsKey,
    state: {
      init: () => stateSnapshot(),
      apply: (transaction, value, oldState, newState) => {
        const replacement = transaction.getMeta<CommentsState>(STATE_META);
        if (replacement) return stateSnapshot({
          ...replacement,
          threads: normalizeThreads(replacement.threads, newState.doc),
        });
        return mapThreads(value, transaction, oldState.doc, newState.doc);
      },
    },
    props: {
      decorations: (state) => threadDecorations(commentsKey.get(state) ?? stateSnapshot(), state.doc),
      handleClick: (editor, event) => {
        const element = event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-fountain-comment-thread]')
          : null;
        const id = element?.dataset.fountainCommentThread;
        if (id) selectCommentThread(editor, id, false);
        return false;
      },
      onCreate: (editor) => {
        let adapter: CommentsAdapter;
        try { adapter = options.adapter(editor); }
        catch (error) {
          setState(editor, stateSnapshot({ status: 'error', error: immutableError({
            message: error instanceof Error ? error.message : String(error), recoverable: false,
          }) }));
          return;
        }
        if (!adapter || typeof adapter.connect !== 'function' || typeof adapter.apply !== 'function') {
          setState(editor, stateSnapshot({ status: 'error', error: immutableError({
            message: 'The comments adapter is invalid.', recoverable: false,
          }) }));
          return;
        }
        let runtime: CommentsRuntime;
        const context: CommentsAdapterContext = {
          editor,
          replaceThreads: (threads) => replaceThreads(runtime, threads),
          setStatus: (status, error) => setStatus(runtime, status, error),
        };
        runtime = {
          editor,
          adapter,
          context,
          user,
          permissions: options.permissions ?? {},
          idFactory,
          now,
          listeners: new Set(),
          queuedAnchors: new Map(),
          anchorSnapshot: new Map(),
          unsubscribe: () => {},
          generation: 0,
          connected: false,
          destroyed: false,
        };
        runtime.unsubscribe = editor.subscribe((state, transaction) => {
          mappedAnchorChanges(runtime, commentsKey.get(state) ?? stateSnapshot(), transaction);
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
        runtime.listeners.clear();
        runtimes.delete(editor);
      },
    },
  });
  return defineExtension({
    name: 'comments',
    plugins: [plugin],
    commands: {
      connectComments,
      disconnectComments,
      reconnectComments,
      selectCommentThread,
      unselectCommentThread,
    },
    services: { comments: Object.freeze({ key: commentsKey }) },
  });
}

function bumped(thread: CommentThread, at: string, values: Partial<CommentThread>): CommentThread {
  return normalizeThread({ ...thread, ...values, updatedAt: at, revision: thread.revision + 1 });
}

/** Pure operation reducer useful to REST, local, worker, and test adapters. */
export function reduceCommentOperation(threads: readonly CommentThread[], operation: CommentOperation): CommentAdapterResult {
  const values = normalizeThreads(threads);
  if (operation.type === 'create-thread') {
    const existing = values.find((thread) => thread.id === operation.thread.id);
    return { thread: existing ?? normalizeThread(operation.thread) };
  }
  const thread = values.find((candidate) => candidate.id === operation.threadId);
  if (!thread) throw new Error(`Unknown comment thread: ${operation.threadId}`);
  if (operation.type === 'remove-thread') return Object.freeze({ removedThreadId: thread.id });
  if (operation.type === 'add-comment') {
    const existing = thread.comments.find((comment) => comment.id === operation.comment.id);
    return { thread: existing ? thread : bumped(thread, operation.at, { comments: [...thread.comments, operation.comment], resolved: false, resolvedAt: undefined, resolvedBy: undefined }) };
  }
  if (operation.type === 'update-comment') {
    const found = currentComment(thread, operation.commentId);
    const comments = thread.comments.map((comment) => comment.id === found.id ? normalizeMessage({
      ...comment,
      content: operation.content,
      updatedAt: operation.at,
      ...(operation.data ? { data: operation.data } : {}),
    }) : comment);
    return { thread: bumped(thread, operation.at, { comments, resolved: false, resolvedAt: undefined, resolvedBy: undefined }) };
  }
  if (operation.type === 'remove-comment') {
    currentComment(thread, operation.commentId);
    return { thread: bumped(thread, operation.at, { comments: thread.comments.filter((comment) => comment.id !== operation.commentId) }) };
  }
  if (operation.type === 'set-resolved') return { thread: bumped(thread, operation.at, {
    resolved: operation.resolved,
    resolvedBy: operation.resolved ? operation.actor : undefined,
    resolvedAt: operation.resolved ? operation.at : undefined,
  }) };
  if (operation.type === 'set-archived') return { thread: bumped(thread, operation.at, { archived: operation.archived }) };
  if (operation.type === 'update-anchor') return { thread: bumped(thread, operation.at, { anchor: operation.anchor }) };
  const comment = currentComment(thread, operation.commentId);
  const existing = comment.reactions.find((reaction) => reaction.emoji === operation.emoji);
  const includes = existing?.userIds.includes(operation.actor.id) ?? false;
  const reactions = existing
    ? comment.reactions.flatMap((reaction) => {
      if (reaction.emoji !== operation.emoji) return [reaction];
      const userIds = includes
        ? reaction.userIds.filter((id) => id !== operation.actor.id)
        : [...reaction.userIds, operation.actor.id];
      return userIds.length ? [normalizeReaction({ emoji: reaction.emoji, userIds })] : [];
    })
    : [...comment.reactions, normalizeReaction({ emoji: operation.emoji, userIds: [operation.actor.id] })];
  const comments = thread.comments.map((candidate) => candidate.id === comment.id
    ? normalizeMessage({ ...comment, reactions, updatedAt: operation.at })
    : candidate);
  return { thread: bumped(thread, operation.at, { comments }) };
}

/** Shared in-memory adapter for demos, tests, prototypes, and offline-first hosts. */
export class InMemoryCommentsStore {
  private readonly threads = new Map<string, CommentThread>();
  private readonly contexts = new Set<CommentsAdapterContext>();
  private readonly results = new Map<string, CommentAdapterResult>();

  constructor(initialThreads: readonly CommentThread[] = []) {
    initialThreads.forEach((thread) => {
      const normalized = normalizeThread(thread);
      this.threads.set(normalized.id, normalized);
    });
  }

  get snapshot(): readonly CommentThread[] {
    return Object.freeze([...this.threads.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)));
  }

  createAdapter(): CommentsAdapter {
    let context: CommentsAdapterContext | undefined;
    return {
      connect: (next) => {
        context = next;
        this.contexts.add(next);
        next.replaceThreads(this.snapshot);
      },
      disconnect: () => {
        if (context) this.contexts.delete(context);
        context = undefined;
      },
      apply: (operation) => {
        const previous = this.results.get(operation.operationId);
        if (previous) return previous;
        const result = reduceCommentOperation(this.snapshot, operation);
        if (result.removedThreadId) this.threads.delete(result.removedThreadId);
        else if (result.thread) this.threads.set(result.thread.id, result.thread);
        const immutable = Object.freeze({ ...result });
        this.results.set(operation.operationId, immutable);
        if (this.results.size > 10_000) this.results.delete(this.results.keys().next().value as string);
        this.contexts.forEach((listener) => listener.replaceThreads(this.snapshot));
        return immutable;
      },
    };
  }
}
