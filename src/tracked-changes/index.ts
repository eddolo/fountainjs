import {
  AllSelection,
  Decoration,
  DecorationSet,
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  ReplaceTextRangeStep,
  ReplaceTextStep,
  positionToTextPoint,
  type AnySelection,
  type Editor,
  type Mark,
  type Node,
  type Transaction,
} from '../core';
import { defineExtension, type FountainExtension } from '../extensions/extension';
import {
  TRACKED_CHANGE_MARK,
  TRACKED_NODE_ATTRIBUTE,
  createTrackedDocument,
  findTrackedSuggestionById,
  findTrackedSuggestions,
  mapSelectionToTrackedDocument,
  normalizeTrackedChangeList,
  normalizeTrackedChangesUser,
  resolveAllTrackedSuggestions,
  resolveTrackedSuggestion,
  setSuggestionCommentThread,
  validateTrackedDocument,
  type SuggestionDecision,
  type SuggestionFilter,
  type TrackedChangeBase,
  type TrackedChangesUser,
  type TrackedSuggestion,
  type TrackedTextDiffHint,
} from './model';

export * from './model';

export const TRACKED_CHANGES_INTERNAL_META = 'fountain$trackedChangesInternal';
export const TRACKED_CHANGES_REASON_META = 'fountain$trackedChangesReason';
export const TRACKED_CHANGES_STATE_META = 'fountain$trackedChangesState';
export const PRESERVE_HISTORY_GROUP_META = 'fountain$preserveHistoryGroup';
const COLLABORATION_REMOTE_META = 'fountain$collaborationRemote';
const PREPARED_CHANGE_META = 'fountain$trackedChangesPrepared';
let generatedId = 0;

export interface TrackedChangesState {
  readonly enabled: boolean;
  readonly user: TrackedChangesUser;
  readonly suggestions: readonly TrackedSuggestion[];
  readonly selectedSuggestionId?: string;
  readonly hoveredSuggestionIds: readonly string[];
}

export interface TrackedChangesOptions {
  readonly user: TrackedChangesUser;
  readonly enabled?: boolean;
  readonly now?: () => Date | string;
  readonly idFactory?: () => string;
}

export type TrackedChangesEvent =
  | { readonly type: 'suggestion-created'; readonly suggestion: TrackedSuggestion }
  | { readonly type: 'suggestion-updated'; readonly suggestion: TrackedSuggestion }
  | { readonly type: 'suggestion-accepted'; readonly suggestion: TrackedSuggestion }
  | { readonly type: 'suggestion-rejected'; readonly suggestion: TrackedSuggestion }
  | { readonly type: 'enabled' | 'disabled' }
  | { readonly type: 'selection-changed'; readonly suggestionId?: string };

interface StatePatch {
  readonly enabled?: boolean;
  readonly user?: TrackedChangesUser;
  readonly selectedSuggestionId?: string | null;
  readonly hoveredSuggestionIds?: readonly string[];
}

interface Runtime {
  readonly key: PluginKey<TrackedChangesState>;
  readonly listeners: Set<(event: TrackedChangesEvent) => void>;
  state: TrackedChangesState;
  unsubscribe: () => void;
}

interface PreparedChange {
  readonly document: Node;
  readonly selection: AnySelection;
}

const runtimes = new WeakMap<Editor, Runtime>();
export const trackedChangesKey = new PluginKey<TrackedChangesState>('tracked-changes');

function snapshot(document: Node, value: Pick<TrackedChangesState, 'enabled' | 'user'> & Partial<TrackedChangesState>): TrackedChangesState {
  validateTrackedDocument(document);
  const suggestions = findTrackedSuggestions(document);
  const ids = new Set(suggestions.map((suggestion) => suggestion.id));
  return Object.freeze({
    enabled: value.enabled,
    user: normalizeTrackedChangesUser(value.user),
    suggestions,
    ...(value.selectedSuggestionId && ids.has(value.selectedSuggestionId) ? { selectedSuggestionId: value.selectedSuggestionId } : {}),
    hoveredSuggestionIds: Object.freeze([...(value.hoveredSuggestionIds ?? [])].filter((id) => ids.has(id))),
  });
}

function changesForMark(mark: Mark): ReturnType<typeof normalizeTrackedChangeList> {
  return mark.type.name === TRACKED_CHANGE_MARK ? normalizeTrackedChangeList(mark.attrs.changes) : Object.freeze([]);
}

function markPresentation(mark: Mark): [string, Record<string, string>, 0] {
  const changes = changesForMark(mark);
  const components = new Set(changes.map((change) => change.component));
  const deletion = components.has('delete') || components.has('replacementDeletion');
  const insertion = components.has('insert') || components.has('replacementInsertion');
  const kind = deletion ? 'delete' : insertion ? 'insert' : 'mark-change';
  const people = [...new Set(changes.map((change) => change.user.name))].join(', ');
  const reasons = [...new Set(changes.flatMap((change) => change.reason ? [change.reason] : []))].join(' · ');
  const title = `${deletion ? 'Suggested deletion' : insertion ? 'Suggested insertion' : 'Suggested formatting change'} by ${people}${reasons ? ` — ${reasons}` : ''}`;
  return [deletion ? 'del' : insertion ? 'ins' : 'span', {
    class: `fountain-tracked-change fountain-tracked-change--${kind}`,
    'data-fountain-suggestion': [...new Set(changes.map((change) => change.id))].join(' '),
    title,
  }, 0];
}

function decorations(document: Node, state: TrackedChangesState | undefined): DecorationSet {
  if (!state) return DecorationSet.empty;
  return DecorationSet.create(document, state.suggestions.flatMap((suggestion) => {
    const selected = suggestion.id === state.selectedSuggestionId;
    const hovered = state.hoveredSuggestionIds.includes(suggestion.id);
    const classes = [
      'fountain-tracked-suggestion',
      `fountain-tracked-suggestion--${suggestion.type}`,
      selected ? 'is-selected' : '',
      hovered ? 'is-hovered' : '',
    ].filter(Boolean).join(' ');
    if (suggestion.from === suggestion.to) return [];
    const attrs = {
      class: classes,
      'data-fountain-suggestion-id': suggestion.id,
      'aria-label': `${suggestion.type} suggestion by ${suggestion.user.name}`,
    };
    return suggestion.type === 'structure' || suggestion.type === 'attributeChange'
      ? [Decoration.node(suggestion.from, suggestion.to, attrs, { key: suggestion.id })]
      : [Decoration.inline(suggestion.from, suggestion.to, attrs, { key: suggestion.id })];
  }));
}

function timestamp(options: TrackedChangesOptions): string {
  const value = options.now?.() ?? new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Tracked changes require a valid timestamp.');
  return date.toISOString();
}

function identifier(options: TrackedChangesOptions): string {
  const supplied = options.idFactory?.();
  if (supplied) return supplied;
  generatedId += 1;
  return `suggestion-${Date.now().toString(36)}-${generatedId.toString(36)}`;
}

function dispatchDocument(
  editor: Editor,
  document: Node,
  selection: AnySelection,
  meta: Readonly<Record<string, unknown>> = {},
): boolean {
  let transaction = editor.state.createTransaction()
    .replace(0, editor.state.doc.childCount, document.content)
    .setSelection(selection)
    .setMeta(TRACKED_CHANGES_INTERNAL_META, true);
  Object.entries(meta).forEach(([name, value]) => { transaction = transaction.setMeta(name, value); });
  return editor.dispatch(transaction);
}

function statePatch(editor: Editor, patch: StatePatch): boolean {
  const runtime = runtimes.get(editor);
  const state = runtime?.key.get(editor.state);
  if (!state) return false;
  return editor.dispatch(editor.state.createTransaction()
    .setMeta(TRACKED_CHANGES_STATE_META, patch)
    .setMeta('addToHistory', false)
    .setMeta('force', true));
}

function changeState(previous: TrackedChangesState, patch: StatePatch, document: Node): TrackedChangesState {
  return snapshot(document, {
    ...previous,
    ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
    ...(patch.user ? { user: normalizeTrackedChangesUser(patch.user) } : {}),
    ...(patch.selectedSuggestionId === undefined ? {} : { selectedSuggestionId: patch.selectedSuggestionId ?? undefined }),
    ...(patch.hoveredSuggestionIds ? { hoveredSuggestionIds: Object.freeze([...new Set(patch.hoveredSuggestionIds)]) } : {}),
  });
}

function createBase(options: TrackedChangesOptions, user: TrackedChangesUser, reason?: string): TrackedChangeBase {
  const at = timestamp(options);
  return Object.freeze({ id: identifier(options), user, createdAt: at, updatedAt: at, ...(reason ? { reason } : {}) });
}

function textDiffHint(transaction: Transaction): TrackedTextDiffHint | undefined {
  if (transaction.steps.length !== 1) return undefined;
  const step = transaction.steps[0];
  if (step instanceof ReplaceTextStep) return { path: step.path, from: step.from, to: step.to, text: step.text };
  if (step instanceof ReplaceTextRangeStep
    && step.startPath.length === step.endPath.length
    && step.startPath.every((part, index) => part === step.endPath[index])) {
    return { path: step.startPath, from: step.from, to: step.to, text: step.text };
  }
  return undefined;
}

function emit(editor: Editor, event: TrackedChangesEvent): void {
  runtimes.get(editor)?.listeners.forEach((listener) => {
    try { listener(event); } catch { /* Event consumers do not own editor state. */ }
  });
}

function compareAndEmit(editor: Editor, before: readonly TrackedSuggestion[], after: readonly TrackedSuggestion[], transaction: Transaction): void {
  const old = new Map(before.map((suggestion) => [suggestion.id, suggestion]));
  const next = new Map(after.map((suggestion) => [suggestion.id, suggestion]));
  const decision = transaction.getMeta<{ id: string; decision: SuggestionDecision }>('fountain$trackedChangesDecision');
  const batch = transaction.getMeta<{ ids: readonly string[]; decision: SuggestionDecision }>('fountain$trackedChangesBatchDecision');
  before.forEach((suggestion) => {
    const appliedDecision = decision?.id === suggestion.id ? decision.decision : batch?.ids.includes(suggestion.id) ? batch.decision : undefined;
    if (!next.has(suggestion.id) && appliedDecision) {
      emit(editor, { type: appliedDecision === 'accept' ? 'suggestion-accepted' : 'suggestion-rejected', suggestion });
    }
  });
  after.forEach((suggestion) => {
    const previous = old.get(suggestion.id);
    if (!previous) emit(editor, { type: 'suggestion-created', suggestion });
    else if (JSON.stringify(previous) !== JSON.stringify(suggestion)) emit(editor, { type: 'suggestion-updated', suggestion });
  });
}

function createTrackedChangesExtensionWithKey(optionsValue: TrackedChangesOptions, key: PluginKey<TrackedChangesState>): FountainExtension {
  const options = Object.freeze({ ...optionsValue, user: normalizeTrackedChangesUser(optionsValue.user) });
  const plugin = new Plugin<TrackedChangesState>({
    key,
    state: {
      init: (_config, state) => snapshot(state.doc, {
        enabled: options.enabled ?? true,
        user: options.user,
        hoveredSuggestionIds: [],
      }),
      apply: (transaction, value, _oldState, newState) => {
        const patch = transaction.getMeta<StatePatch>(TRACKED_CHANGES_STATE_META);
        return patch ? changeState(value, patch, newState.doc) : snapshot(newState.doc, value);
      },
    },
    filterTransaction: (transaction, state) => {
      if (!transaction.docChanged) return true;
      try {
        validateTrackedDocument(transaction.doc);
        const current = key.get(state);
        if (current?.enabled
          && transaction.getMeta(TRACKED_CHANGES_INTERNAL_META) !== true
          && transaction.getMeta(COLLABORATION_REMOTE_META) !== true
          && transaction.getMeta('addToHistory') !== false) {
          const reason = transaction.getMeta(TRACKED_CHANGES_REASON_META);
          if (reason !== undefined && typeof reason !== 'string') return false;
          const tracked = createTrackedDocument(state.doc, transaction.doc, createBase(
            options,
            current.user,
            reason,
          ), textDiffHint(transaction));
          transaction.setMeta(PREPARED_CHANGE_META, Object.freeze({
            document: tracked,
            selection: mapSelectionToTrackedDocument(transaction.doc, tracked, transaction.selection),
          } satisfies PreparedChange));
        }
        return true;
      }
      catch { return false; }
    },
    appendTransaction: (transactions, oldState, newState) => {
      const latest = transactions.at(-1);
      const state = key.get(newState);
      if (!latest || !state?.enabled || !latest.docChanged
        || latest.getMeta(TRACKED_CHANGES_INTERNAL_META) === true
        || latest.getMeta(COLLABORATION_REMOTE_META) === true
        || latest.getMeta('addToHistory') === false) return null;
      const prepared = latest.getMeta<PreparedChange>(PREPARED_CHANGE_META);
      const tracked = prepared?.document ?? createTrackedDocument(oldState.doc, newState.doc, createBase(
        options,
        state.user,
        latest.getMeta<string>(TRACKED_CHANGES_REASON_META),
      ), textDiffHint(latest));
      if (tracked.eq(newState.doc)) return null;
      return newState.createTransaction()
        .replace(0, newState.doc.childCount, tracked.content)
        .setSelection(prepared?.selection ?? mapSelectionToTrackedDocument(newState.doc, tracked, newState.selection))
        .setMeta(TRACKED_CHANGES_INTERNAL_META, true)
        .setMeta(PRESERVE_HISTORY_GROUP_META, true)
        .setMeta('addToHistory', false);
    },
    props: {
      decorations: (state) => decorations(state.doc, key.get(state)),
      onCreate: (editor) => {
        const initial = key.get(editor.state) as TrackedChangesState;
        const runtime: Runtime = { key, listeners: new Set(), state: initial, unsubscribe: () => {} };
        runtime.unsubscribe = editor.subscribe((state, transaction) => {
          const next = key.get(state) as TrackedChangesState;
          compareAndEmit(editor, runtime.state.suggestions, next.suggestions, transaction);
          if (runtime.state.enabled !== next.enabled) emit(editor, { type: next.enabled ? 'enabled' : 'disabled' });
          if (runtime.state.selectedSuggestionId !== next.selectedSuggestionId) {
            emit(editor, { type: 'selection-changed', ...(next.selectedSuggestionId ? { suggestionId: next.selectedSuggestionId } : {}) });
          }
          runtime.state = next;
        });
        runtimes.set(editor, runtime);
      },
      onDestroy: (editor) => {
        const runtime = runtimes.get(editor);
        runtime?.unsubscribe();
        runtime?.listeners.clear();
        runtimes.delete(editor);
      },
    },
  });

  return defineExtension({
    name: 'tracked-changes',
    marks: {
      [TRACKED_CHANGE_MARK]: {
        attrs: { changes: { default: [], validate: (value) => { try { normalizeTrackedChangeList(value); return true; } catch { return false; } } } },
        toDOM: markPresentation,
      },
    },
    plugins: [plugin],
    commands: {
      enableTrackedChanges: (editor) => enableTrackedChanges(editor),
      disableTrackedChanges: (editor) => disableTrackedChanges(editor),
      toggleTrackedChanges: (editor, enabled?: boolean) => toggleTrackedChanges(editor, enabled),
      acceptTrackedSuggestion: (editor, id: string) => acceptTrackedSuggestion(editor, id),
      rejectTrackedSuggestion: (editor, id: string) => rejectTrackedSuggestion(editor, id),
      acceptAllTrackedSuggestions: (editor, filter?: SuggestionFilter) => acceptAllTrackedSuggestions(editor, filter),
      rejectAllTrackedSuggestions: (editor, filter?: SuggestionFilter) => rejectAllTrackedSuggestions(editor, filter),
    },
    services: { trackedChanges: Object.freeze({ key, options }) },
  });
}

export function createTrackedChangesExtension(options: TrackedChangesOptions): FountainExtension {
  if (!options?.user) throw new TypeError('Tracked changes require a user.');
  return createTrackedChangesExtensionWithKey(options, trackedChangesKey);
}

export function getTrackedChangesState(editor: Editor): TrackedChangesState | undefined {
  return runtimes.get(editor)?.key.get(editor.state) ?? trackedChangesKey.get(editor.state);
}

export function subscribeTrackedChanges(editor: Editor, listener: (event: TrackedChangesEvent) => void): () => void {
  const runtime = runtimes.get(editor);
  if (!runtime) throw new Error('The editor does not include a tracked-changes extension.');
  runtime.listeners.add(listener);
  return () => runtime.listeners.delete(listener);
}

export function enableTrackedChanges(editor: Editor): boolean { return statePatch(editor, { enabled: true }); }
export function disableTrackedChanges(editor: Editor): boolean { return statePatch(editor, { enabled: false }); }
export function toggleTrackedChanges(editor: Editor, enabled?: boolean): boolean {
  const state = getTrackedChangesState(editor);
  return state ? statePatch(editor, { enabled: enabled ?? !state.enabled }) : false;
}
export function setTrackedChangesUser(editor: Editor, user: TrackedChangesUser): boolean {
  return statePatch(editor, { user: normalizeTrackedChangesUser(user) });
}

export function selectTrackedSuggestion(editor: Editor, id?: string, selectRange = true): boolean {
  const state = getTrackedChangesState(editor);
  const suggestion = id ? state?.suggestions.find((candidate) => candidate.id === id) : undefined;
  if (!state || (id && !suggestion)) return false;
  let transaction = editor.state.createTransaction();
  if (suggestion && selectRange && suggestion.from < suggestion.to) {
    try {
      const start = positionToTextPoint(editor.state.doc, suggestion.from, 1);
      const end = positionToTextPoint(editor.state.doc, suggestion.to, -1);
      transaction = transaction.setSelection(Selection.range(start.path, start.offset, end.path, end.offset));
    } catch { /* State selection remains usable for atom-only suggestions. */ }
  }
  return editor.dispatch(transaction
    .setMeta(TRACKED_CHANGES_STATE_META, { selectedSuggestionId: id ?? null })
    .setMeta('addToHistory', false)
    .setMeta('force', true));
}

export function hoverTrackedSuggestions(editor: Editor, ids: readonly string[]): boolean {
  return statePatch(editor, { hoveredSuggestionIds: ids });
}

function resolve(editor: Editor, id: string, decision: SuggestionDecision): boolean {
  const suggestion = findTrackedSuggestionById(editor.state.doc, id);
  if (!suggestion) return false;
  const document = resolveTrackedSuggestion(editor.state.doc, id, decision);
  const selection = mapSelectionToTrackedDocument(editor.state.doc, document, editor.state.selection);
  const result = dispatchDocument(editor, document, selection, {
    'fountain$trackedChangesDecision': Object.freeze({ id, decision }),
  });
  return result;
}

export function acceptTrackedSuggestion(editor: Editor, id: string): boolean { return resolve(editor, id, 'accept'); }
export function rejectTrackedSuggestion(editor: Editor, id: string): boolean { return resolve(editor, id, 'reject'); }

function resolveMany(editor: Editor, decision: SuggestionDecision, filter: SuggestionFilter = {}): boolean {
  const suggestions = findTrackedSuggestions(editor.state.doc, filter);
  if (!suggestions.length) return false;
  const document = suggestions.reduce((current, suggestion) => resolveTrackedSuggestion(current, suggestion.id, decision), editor.state.doc);
  return dispatchDocument(editor, document, mapSelectionToTrackedDocument(editor.state.doc, document, editor.state.selection), {
    'fountain$trackedChangesBatchDecision': Object.freeze({ ids: suggestions.map((suggestion) => suggestion.id), decision }),
  });
}

export function acceptAllTrackedSuggestions(editor: Editor, filter: SuggestionFilter = {}): boolean { return resolveMany(editor, 'accept', filter); }
export function rejectAllTrackedSuggestions(editor: Editor, filter: SuggestionFilter = {}): boolean { return resolveMany(editor, 'reject', filter); }
export function acceptTrackedSuggestionsInRange(editor: Editor, from: number, to: number): boolean { return resolveMany(editor, 'accept', { from, to }); }
export function rejectTrackedSuggestionsInRange(editor: Editor, from: number, to: number): boolean { return resolveMany(editor, 'reject', { from, to }); }
export function acceptTrackedSuggestionsByUser(editor: Editor, userId: string): boolean { return resolveMany(editor, 'accept', { userId }); }
export function rejectTrackedSuggestionsByUser(editor: Editor, userId: string): boolean { return resolveMany(editor, 'reject', { userId }); }

export function linkTrackedSuggestionToComment(editor: Editor, suggestionId: string, commentThreadId?: string): boolean {
  const document = setSuggestionCommentThread(editor.state.doc, suggestionId, commentThreadId);
  return dispatchDocument(editor, document, editor.state.selection, { addToHistory: false });
}

/** Runs any normal Fountain transaction through tracking with an optional human-readable reason. */
export function dispatchTrackedTransaction(
  editor: Editor,
  edit: (transaction: Transaction) => Transaction | void,
  reason?: string,
): boolean {
  const transaction = editor.state.createTransaction();
  const result = edit(transaction) ?? transaction;
  if (reason) result.setMeta(TRACKED_CHANGES_REASON_META, reason);
  return editor.dispatch(result);
}

export function addTrackedInsertion(editor: Editor, path: readonly number[], offset: number, text: string, reason?: string): boolean {
  return dispatchTrackedTransaction(editor, (transaction) => transaction
    .insertText(path, offset, text)
    .setSelection(Selection.cursor(path, offset + text.length)), reason);
}
export function addTrackedDeletion(editor: Editor, path: readonly number[], from: number, to: number, reason?: string): boolean {
  return dispatchTrackedTransaction(editor, (transaction) => transaction
    .replaceText(path, from, to, '')
    .setSelection(Selection.cursor(path, from)), reason);
}
export function addTrackedReplacement(editor: Editor, path: readonly number[], from: number, to: number, text: string, reason?: string): boolean {
  return dispatchTrackedTransaction(editor, (transaction) => transaction
    .replaceText(path, from, to, text)
    .setSelection(Selection.cursor(path, from + text.length)), reason);
}
export function addTrackedMarkChange(editor: Editor, path: readonly number[], from: number, to: number, mark: Mark, reason?: string): boolean {
  return dispatchTrackedTransaction(editor, (transaction) => transaction.addMark(path, from, to, mark), reason);
}
export function addTrackedNodeAttributeChange(editor: Editor, path: readonly number[], attrs: Readonly<Record<string, unknown>>, reason?: string): boolean {
  return dispatchTrackedTransaction(editor, (transaction) => transaction.setNodeAttrs(path, { ...attrs }), reason);
}

/** Low-level helper for read-only projections or server-side review workflows. */
export function resolveTrackedDocument(document: Node, decision: SuggestionDecision): Node {
  return resolveAllTrackedSuggestions(document, decision);
}
