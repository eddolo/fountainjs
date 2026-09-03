import {
  AllSelection,
  CellSelection,
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  insertPlainText,
  serializeTableSelection,
  type Editor,
  type EditorState,
} from '../core';
import { comparePaths, getNodeAtPath, getTextLeaves } from '../core/transaction/path';
import { defineExtension } from './extension';

const META = 'clipboardHistory$action';
let entrySequence = 0;
const persistenceByEditor = new WeakMap<Editor, Pick<ClipboardHistoryOptions, 'persistence' | 'onPersistenceError'>>();

export interface ClipboardHistoryEntry {
  readonly id: string;
  readonly text: string;
  readonly copiedAt: number;
}

export interface ClipboardHistoryState {
  readonly entries: readonly ClipboardHistoryEntry[];
  readonly open: boolean;
}

export interface ClipboardHistoryPersistence {
  /** Explicit, synchronous host storage. FountainJS never selects storage itself. */
  load(): readonly ClipboardHistoryEntry[];
  save(entries: readonly ClipboardHistoryEntry[]): void;
}

export interface ClipboardHistoryOptions {
  /** Maximum entries retained, from 1 to 100. Defaults to 20. */
  readonly maxEntries?: number;
  /** Maximum UTF-16 characters retained per entry. Defaults to 100,000. */
  readonly maxEntryLength?: number;
  /** Defaults to Mod-Alt-V. Accepts strings such as Mod-Shift-Y or a matcher. */
  readonly shortcut?: string | ((event: KeyboardEvent) => boolean) | false;
  /** Optional host-owned persistence. Without this, history exists in memory only. */
  readonly persistence?: ClipboardHistoryPersistence;
  readonly onPersistenceError?: (error: unknown) => void;
}

type ClipboardAction =
  | { readonly type: 'add'; readonly entry: ClipboardHistoryEntry; readonly maxEntries: number }
  | { readonly type: 'replace'; readonly entries: readonly ClipboardHistoryEntry[]; readonly maxEntries: number }
  | { readonly type: 'remove'; readonly id: string }
  | { readonly type: 'clear' }
  | { readonly type: 'open' }
  | { readonly type: 'close' };

export const clipboardHistoryPluginKey = new PluginKey<ClipboardHistoryState>('clipboard-history');

function freezeEntry(entry: ClipboardHistoryEntry): ClipboardHistoryEntry {
  return Object.freeze({ id: entry.id, text: entry.text, copiedAt: entry.copiedAt });
}

function nextState(state: ClipboardHistoryState, action?: ClipboardAction): ClipboardHistoryState {
  if (!action) return state;
  if (action.type === 'open') return state.open ? state : Object.freeze({ ...state, open: true });
  if (action.type === 'close') return !state.open ? state : Object.freeze({ ...state, open: false });
  if (action.type === 'clear') return Object.freeze({ entries: Object.freeze([]), open: state.open });
  if (action.type === 'remove') {
    return Object.freeze({ entries: Object.freeze(state.entries.filter((entry) => entry.id !== action.id)), open: state.open });
  }
  const incoming = action.type === 'replace'
    ? action.entries
    : [action.entry, ...state.entries.filter((entry) => entry.text !== action.entry.text)];
  const unique: ClipboardHistoryEntry[] = [];
  const texts = new Set<string>();
  for (const raw of incoming) {
    if (!raw.text || texts.has(raw.text)) continue;
    texts.add(raw.text);
    unique.push(freezeEntry(raw));
    if (unique.length === action.maxEntries) break;
  }
  return Object.freeze({ entries: Object.freeze(unique), open: state.open });
}

function selectionText(editor: Editor): string {
  const { doc, selection } = editor.state;
  if (selection instanceof CellSelection) return serializeTableSelection(doc, selection)?.text ?? '';
  if (selection instanceof AllSelection) return editor.getText();
  if (selection instanceof NodeSelection) return getNodeAtPath(doc, selection.nodePath).textContent;
  if (!(selection instanceof Selection) || selection.isCollapsed) return '';
  const leaves = getTextLeaves(doc);
  const selected = leaves.filter(({ path }) => comparePaths(path, selection.path) >= 0 && comparePaths(path, selection.endPath) <= 0);
  let previousParent: string | undefined;
  return selected.map(({ node, path }) => {
    const from = comparePaths(path, selection.path) === 0 ? selection.from : 0;
    const to = comparePaths(path, selection.endPath) === 0 ? selection.to : node.text?.length ?? 0;
    const parent = path.slice(0, -1).join('.');
    const prefix = previousParent !== undefined && previousParent !== parent ? '\n' : '';
    previousParent = parent;
    return prefix + (node.text ?? '').slice(from, to);
  }).join('');
}

function normalizeLoaded(value: readonly ClipboardHistoryEntry[], maxEntries: number, maxEntryLength: number): readonly ClipboardHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => (
    entry && typeof entry.id === 'string' && typeof entry.text === 'string' && entry.text.length <= maxEntryLength
      && Number.isFinite(entry.copiedAt)
      ? [freezeEntry(entry)]
      : []
  )).slice(0, maxEntries);
}

function shortcutMatches(event: KeyboardEvent, shortcut: Exclude<ClipboardHistoryOptions['shortcut'], false | undefined>): boolean {
  if (typeof shortcut === 'function') return shortcut(event);
  const parts = shortcut.toLocaleLowerCase().split('-').filter(Boolean);
  const key = parts.at(-1);
  if (!key) return false;
  const mod = parts.includes('mod');
  const ctrl = parts.includes('ctrl') || parts.includes('control');
  const meta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command');
  const alt = parts.includes('alt') || parts.includes('option');
  const shift = parts.includes('shift');
  if (event.key.toLocaleLowerCase() !== key) return false;
  if (mod && !(event.ctrlKey || event.metaKey)) return false;
  if (!mod && event.ctrlKey !== ctrl) return false;
  if (!mod && event.metaKey !== meta) return false;
  if (event.altKey !== alt || event.shiftKey !== shift) return false;
  return true;
}

function dispatchAction(editor: Editor, action: ClipboardAction): void {
  editor.dispatch(editor.state.createTransaction()
    .setMeta(META, action)
    .setMeta('addToHistory', false)
    .setMeta('force', true));
}

function persist(editor: Editor, adapter?: ClipboardHistoryPersistence, onError?: (error: unknown) => void): void {
  const configured = persistenceByEditor.get(editor);
  const target = adapter ?? configured?.persistence;
  const handleError = onError ?? configured?.onPersistenceError;
  if (!target) return;
  try { target.save(getClipboardHistoryState(editor)?.entries ?? []); }
  catch (error) { handleError?.(error); }
}

export function getClipboardHistoryState(editorOrState: Editor | EditorState): ClipboardHistoryState | null {
  const state = 'state' in editorOrState ? editorOrState.state : editorOrState;
  return clipboardHistoryPluginKey.get(state) ?? null;
}

export function openClipboardHistory(editor: Editor): boolean {
  if (!getClipboardHistoryState(editor)) return false;
  dispatchAction(editor, { type: 'open' });
  return true;
}

export function closeClipboardHistory(editor: Editor): boolean {
  if (!getClipboardHistoryState(editor)) return false;
  dispatchAction(editor, { type: 'close' });
  return true;
}

export function pasteClipboardHistoryEntry(editor: Editor, id: string): boolean {
  const entry = getClipboardHistoryState(editor)?.entries.find((candidate) => candidate.id === id);
  if (!entry || !editor.editable) return false;
  const inserted = editor.runCommandBatch(() => insertPlainText(editor, entry.text));
  if (inserted) closeClipboardHistory(editor);
  return inserted;
}

export function removeClipboardHistoryEntry(editor: Editor, id: string): boolean {
  const state = getClipboardHistoryState(editor);
  if (!state?.entries.some((entry) => entry.id === id)) return false;
  dispatchAction(editor, { type: 'remove', id });
  persist(editor);
  return true;
}

export function clearClipboardHistory(editor: Editor): boolean {
  if (!getClipboardHistoryState(editor)) return false;
  dispatchAction(editor, { type: 'clear' });
  persist(editor);
  return true;
}

export function createClipboardHistoryExtension(options: ClipboardHistoryOptions = {}) {
  const maxEntries = Math.max(1, Math.min(100, Math.trunc(options.maxEntries ?? 20)));
  const maxEntryLength = Math.max(1, Math.min(1_000_000, Math.trunc(options.maxEntryLength ?? 100_000)));
  const addSelection = (editor: Editor): void => {
    const text = selectionText(editor);
    if (!text || text.length > maxEntryLength) return;
    const entry = freezeEntry({ id: `${Date.now().toString(36)}-${(entrySequence += 1).toString(36)}`, text, copiedAt: Date.now() });
    // Let the browser finish its native copy/cut before an editor render can replace DOM selection nodes.
    setTimeout(() => {
      if (editor.isDestroyed || !getClipboardHistoryState(editor)) return;
      dispatchAction(editor, { type: 'add', maxEntries, entry });
      persist(editor);
    }, 0);
  };
  const plugin = new Plugin<ClipboardHistoryState>({
    key: clipboardHistoryPluginKey,
    state: {
      init: () => Object.freeze({ entries: Object.freeze([]), open: false }),
      apply: (transaction, value) => nextState(value, transaction.getMeta<ClipboardAction>(META)),
    },
    props: {
      handleCopy: (editor) => { addSelection(editor); return false; },
      handleCut: (editor) => { addSelection(editor); return false; },
      handleKeyDown: (editor, event) => {
        if (options.shortcut === false) return false;
        if (!shortcutMatches(event, options.shortcut ?? 'Mod-Alt-V')) return false;
        return openClipboardHistory(editor);
      },
      onCreate: (editor) => {
        persistenceByEditor.set(editor, { persistence: options.persistence, onPersistenceError: options.onPersistenceError });
        if (!options.persistence) return;
        try {
          const entries = normalizeLoaded(options.persistence.load(), maxEntries, maxEntryLength);
          if (entries.length) dispatchAction(editor, { type: 'replace', entries, maxEntries });
        } catch (error) { options.onPersistenceError?.(error); }
      },
      onDestroy: (editor) => { persistenceByEditor.delete(editor); },
    },
  });
  return defineExtension({
    name: 'clipboard-history',
    plugins: [plugin],
    commands: {
      openClipboardHistory,
      closeClipboardHistory,
      pasteClipboardHistoryEntry,
      removeClipboardHistoryEntry,
      clearClipboardHistory,
    },
  });
}

/** Optional, memory-only clipboard history with a Mod-Alt-V picker shortcut. */
export const ClipboardHistoryExtension = createClipboardHistoryExtension();
