import {
  Decoration,
  PluginKey,
  Selection,
  textPointToPosition,
  type Editor,
  type EditorState,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import type { InlineAtomRange } from './inline-atom';

export interface SuggestionTrigger {
  readonly char: string;
  readonly allowSpaces?: boolean;
  readonly allowedPrefixes?: readonly string[] | null;
  readonly startOfLine?: boolean;
}

export interface SuggestionMatch {
  readonly trigger: string;
  readonly query: string;
  readonly text: string;
  readonly range: InlineAtomRange;
}

export interface SuggestionPluginState {
  readonly match: SuggestionMatch | null;
}

export interface SuggestionItemBase {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SuggestionProviderContext {
  readonly editor: Editor;
  readonly match: SuggestionMatch;
  readonly signal: AbortSignal;
}

export type SuggestionProvider<Item extends SuggestionItemBase> = (
  context: SuggestionProviderContext,
) => readonly Item[] | Promise<readonly Item[]>;

export type SuggestionStatus = 'closed' | 'loading' | 'ready' | 'error';

export interface SuggestionSnapshot<Item extends SuggestionItemBase> {
  readonly open: boolean;
  readonly status: SuggestionStatus;
  readonly match: SuggestionMatch | null;
  readonly items: readonly Item[];
  readonly selectedIndex: number;
  readonly error?: string;
}

export type SuggestionListener<Item extends SuggestionItemBase> = (
  snapshot: SuggestionSnapshot<Item>,
) => void;

const DEFAULT_PREFIXES = Object.freeze([' ', '\t', '\n', '(', '[', '{']);

function escapeExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validTrigger(trigger: SuggestionTrigger): void {
  if (!trigger.char || trigger.char.length > 8 || /\s/.test(trigger.char)) {
    throw new TypeError('Suggestion triggers require one to eight non-whitespace characters.');
  }
}

function candidateMatch(
  value: string,
  offset: number,
  path: readonly number[],
  config: SuggestionTrigger,
): SuggestionMatch | null {
  validTrigger(config);
  const source = value.slice(0, offset);
  const queryPattern = config.allowSpaces ? '[^\\n]*?' : '[^\\s]*';
  const expression = new RegExp(`${escapeExpression(config.char)}(${queryPattern})$`, 'u');
  const match = expression.exec(source);
  if (!match) return null;
  const from = match.index;
  const prefix = source.slice(Math.max(0, from - 1), from);
  if (config.startOfLine && from !== 0) return null;
  const allowedPrefixes = config.allowedPrefixes === undefined ? DEFAULT_PREFIXES : config.allowedPrefixes;
  if (from > 0 && allowedPrefixes && !allowedPrefixes.includes(prefix)) return null;
  const query = match[1] ?? '';
  return Object.freeze({
    trigger: config.char,
    query,
    text: `${config.char}${query}`,
    range: Object.freeze({ path: Object.freeze([...path]), from, to: offset }),
  });
}

/** Finds the nearest configured trigger immediately before a collapsed text cursor. */
export function findSuggestionMatch(
  state: EditorState,
  triggers: readonly SuggestionTrigger[],
): SuggestionMatch | null {
  const selection = state.selection;
  if (!(selection instanceof Selection) || !selection.isCollapsed || !selection.isSingleText) return null;
  let target;
  try { target = getNodeAtPath(state.doc, selection.path); }
  catch { return null; }
  if (!target.isText) return null;
  const matches = triggers
    .map((trigger) => candidateMatch(target.text ?? '', selection.from, selection.path, trigger))
    .filter((match): match is SuggestionMatch => Boolean(match));
  return matches.sort((left, right) => right.range.from - left.range.from || right.trigger.length - left.trigger.length)[0] ?? null;
}

export function createSuggestionStateSpec(triggers: readonly SuggestionTrigger[]) {
  const frozen = Object.freeze(triggers.map((trigger) => Object.freeze({ ...trigger })));
  frozen.forEach(validTrigger);
  return {
    init: (_config: unknown, state: EditorState): SuggestionPluginState => ({ match: findSuggestionMatch(state, frozen) }),
    apply: (_transaction: unknown, _value: SuggestionPluginState, _oldState: EditorState, newState: EditorState): SuggestionPluginState => ({
      match: findSuggestionMatch(newState, frozen),
    }),
  };
}

/** View-only decoration used by any suggestion UI, regardless of framework. */
export function suggestionDecorations(
  state: EditorState,
  key: PluginKey<SuggestionPluginState>,
  className = 'fountain-suggestion-query',
): readonly Decoration[] {
  const match = key.get(state)?.match;
  if (!match || match.range.from === match.range.to) return [];
  try {
    const from = textPointToPosition(state.doc, match.range.path, match.range.from);
    const to = textPointToPosition(state.doc, match.range.path, match.range.to);
    return [Decoration.inline(from, to, {
      class: className,
      'data-fountain-suggestion-query': match.trigger,
    }, { key: `suggestion:${match.trigger}` })];
  } catch { return []; }
}

function matchIdentity(match: SuggestionMatch | null): string {
  return match
    ? `${match.range.path.join('.')}:${match.range.from}:${match.range.to}:${match.trigger}:${match.query}`
    : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Suggestions could not be loaded.';
}

/**
 * Framework-neutral async suggestion state. It aborts obsolete requests and
 * ignores stale results, while leaving rendering and positioning to the host.
 */
export class SuggestionController<Item extends SuggestionItemBase> {
  private readonly listeners = new Set<SuggestionListener<Item>>();
  private readonly unsubscribe: () => void;
  private request?: AbortController;
  private requestId = 0;
  private dismissedIdentity = '';
  private currentIdentity = '';
  private destroyed = false;
  private snapshot: SuggestionSnapshot<Item> = Object.freeze({
    open: false,
    status: 'closed',
    match: null,
    items: Object.freeze([]),
    selectedIndex: -1,
  });

  constructor(
    private readonly editor: Editor,
    private readonly key: PluginKey<SuggestionPluginState>,
    private readonly provider: SuggestionProvider<Item>,
    private readonly acceptItem: (editor: Editor, item: Item, match: SuggestionMatch) => boolean,
    private readonly maximumItems = 50,
  ) {
    if (!Number.isInteger(maximumItems) || maximumItems < 1 || maximumItems > 1_000) {
      throw new RangeError('Suggestion controllers require a maximumItems value between 1 and 1000.');
    }
    this.unsubscribe = editor.subscribe(() => this.refresh());
    this.refresh();
  }

  getSnapshot = (): SuggestionSnapshot<Item> => this.snapshot;

  subscribe = (listener: SuggestionListener<Item>): (() => void) => {
    if (this.destroyed) throw new Error('This suggestion controller has been destroyed.');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  select(index: number): boolean {
    const selectable = this.selectableIndexes();
    if (!selectable.includes(index)) return false;
    this.publish({ ...this.snapshot, selectedIndex: index });
    return true;
  }

  move(direction: 1 | -1): boolean {
    const selectable = this.selectableIndexes();
    if (!this.snapshot.open || !selectable.length) return false;
    const current = selectable.indexOf(this.snapshot.selectedIndex);
    const index = current < 0
      ? (direction > 0 ? 0 : selectable.length - 1)
      : (current + direction + selectable.length) % selectable.length;
    return this.select(selectable[index] as number);
  }

  accept(index = this.snapshot.selectedIndex): boolean {
    const item = this.snapshot.items[index];
    const match = this.snapshot.match;
    if (!item || item.disabled || !match) return false;
    return this.acceptItem(this.editor, item, match);
  }

  dismiss(): boolean {
    if (!this.snapshot.open) return false;
    this.dismissedIdentity = this.currentIdentity;
    this.request?.abort();
    this.publish({ open: false, status: 'closed', match: null, items: Object.freeze([]), selectedIndex: -1 });
    return true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.request?.abort();
    this.unsubscribe();
    this.listeners.clear();
  }

  private refresh(): void {
    if (this.destroyed) return;
    const match = this.key.get(this.editor.state)?.match ?? null;
    const identity = matchIdentity(match);
    if (identity === this.currentIdentity) return;
    this.currentIdentity = identity;
    this.request?.abort();
    if (!match || identity === this.dismissedIdentity) {
      this.publish({ open: false, status: 'closed', match: null, items: Object.freeze([]), selectedIndex: -1 });
      return;
    }
    this.dismissedIdentity = '';
    const controller = new AbortController();
    const requestId = ++this.requestId;
    this.request = controller;
    this.publish({ open: true, status: 'loading', match, items: Object.freeze([]), selectedIndex: -1 });

    let result: readonly Item[] | Promise<readonly Item[]>;
    try { result = this.provider({ editor: this.editor, match, signal: controller.signal }); }
    catch (error) {
      this.failRequest(requestId, match, error);
      return;
    }
    void Promise.resolve(result).then((items) => {
      if (controller.signal.aborted || requestId !== this.requestId || matchIdentity(match) !== this.currentIdentity) return;
      const normalized = Object.freeze([...items].slice(0, this.maximumItems).map((item) => Object.freeze({ ...item })));
      const selectedIndex = normalized.findIndex((item) => !item.disabled);
      this.publish({ open: true, status: 'ready', match, items: normalized, selectedIndex });
    }).catch((error) => this.failRequest(requestId, match, error));
  }

  private failRequest(requestId: number, match: SuggestionMatch, error: unknown): void {
    if (requestId !== this.requestId || matchIdentity(match) !== this.currentIdentity) return;
    if (error instanceof DOMException && error.name === 'AbortError') return;
    this.publish({
      open: true,
      status: 'error',
      match,
      items: Object.freeze([]),
      selectedIndex: -1,
      error: errorMessage(error),
    });
  }

  private selectableIndexes(): number[] {
    return this.snapshot.items.flatMap((item, index) => item.disabled ? [] : [index]);
  }

  private publish(snapshot: SuggestionSnapshot<Item>): void {
    this.snapshot = Object.freeze({ ...snapshot, items: Object.freeze([...snapshot.items]) });
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

export function handleSuggestionKeyDown<Item extends SuggestionItemBase>(
  controller: SuggestionController<Item> | undefined,
  event: KeyboardEvent,
): boolean {
  if (!controller?.getSnapshot().open || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key === 'ArrowDown') return controller.move(1);
  if (event.key === 'ArrowUp') return controller.move(-1);
  if (event.key === 'Enter') return controller.accept();
  if (event.key === 'Escape') return controller.dismiss();
  return false;
}
