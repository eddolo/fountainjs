import {
  Plugin,
  PluginKey,
  type Editor,
  type Node,
  type Schema,
  type Transaction,
} from '../core';
import { getTextLeaves, replaceNodeAtPath, replaceNodeWithNodes } from '../core/transaction/path';
import { defineExtension, type FountainExtension } from './extension';

export type CharacterCountMode = 'textSize' | 'nodeSize';
export type TextCounter = (text: string) => number;
export type WordCounter = (text: string) => number;

export interface CharacterCountExtensionOptions {
  readonly limit?: number | null;
  readonly mode?: CharacterCountMode;
  readonly autoTrim?: boolean;
  readonly textCounter?: TextCounter;
  readonly wordCounter?: WordCounter;
}

export interface CharacterCountQuery {
  readonly node?: Node;
  readonly mode?: CharacterCountMode;
}

export interface CharacterCountSnapshot {
  readonly characters: number;
  readonly words: number;
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly overLimit: boolean;
  readonly mode: CharacterCountMode;
}

export interface CharacterCountState extends CharacterCountSnapshot {}

export interface CharacterCountService {
  readonly key: PluginKey<CharacterCountState>;
  readonly options: Readonly<Required<CharacterCountExtensionOptions>>;
  characters(editor: Editor, query?: CharacterCountQuery): number;
  words(editor: Editor, query?: Pick<CharacterCountQuery, 'node'>): number;
  snapshot(editor: Editor): CharacterCountSnapshot;
  trim(editor: Editor): boolean;
}

const defaultTextCounter: TextCounter = (text) => text.length;
const defaultWordCounter: WordCounter = (text) => text.trim() ? text.trim().split(/\s+/u).length : 0;

function normalizeOptions(options: CharacterCountExtensionOptions): Required<CharacterCountExtensionOptions> {
  const limit = options.limit ?? null;
  if (limit !== null && (!Number.isInteger(limit) || limit < 0)) {
    throw new RangeError('CharacterCountExtension limit must be null or a non-negative integer.');
  }
  if (options.mode && !['textSize', 'nodeSize'].includes(options.mode)) {
    throw new TypeError('CharacterCountExtension mode must be textSize or nodeSize.');
  }
  if (options.textCounter && typeof options.textCounter !== 'function') throw new TypeError('textCounter must be a function.');
  if (options.wordCounter && typeof options.wordCounter !== 'function') throw new TypeError('wordCounter must be a function.');
  return Object.freeze({
    limit,
    mode: options.mode ?? 'textSize',
    autoTrim: options.autoTrim !== false,
    textCounter: options.textCounter ?? defaultTextCounter,
    wordCounter: options.wordCounter ?? defaultWordCounter,
  });
}

function projectedText(node: Node): string {
  return node.type.name === 'doc'
    ? node.content.map((child) => child.textContent).join('\n')
    : node.textContent;
}

function countNode(node: Node, mode: CharacterCountMode, textCounter: TextCounter): number {
  const value = mode === 'nodeSize'
    ? (node.type.name === 'doc' ? Math.max(0, node.nodeSize - 2) : node.nodeSize)
    : textCounter(projectedText(node));
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Character counters must return a finite non-negative number.');
  return value;
}

function wordsInNode(node: Node, counter: WordCounter): number {
  const value = counter(projectedText(node));
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Word counters must return a finite non-negative number.');
  return value;
}

function snapshotFor(node: Node, options: Readonly<Required<CharacterCountExtensionOptions>>): CharacterCountSnapshot {
  const characters = countNode(node, options.mode, options.textCounter);
  const words = wordsInNode(node, options.wordCounter);
  return Object.freeze({
    characters,
    words,
    limit: options.limit,
    remaining: options.limit === null ? null : options.limit - characters,
    overLimit: options.limit !== null && characters > options.limit,
    mode: options.mode,
  });
}

function graphemeBoundaries(value: string): readonly number[] {
  if (typeof Intl.Segmenter !== 'function') {
    let offset = 0;
    return [0, ...Array.from(value, (character) => (offset += character.length))];
  }
  const boundaries = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
    (part) => part.index,
  );
  return Object.freeze([...new Set([0, ...boundaries, value.length])].sort((left, right) => left - right));
}

function validDocument(schema: Schema, candidate: Node): boolean {
  try { schema.validate(candidate); return true; }
  catch { return false; }
}

function withTextPrefix(doc: Node, path: readonly number[], length: number): Node {
  const leaf = getTextLeaves(doc).find((entry) => entry.path.length === path.length
    && entry.path.every((part, index) => part === path[index]));
  if (!leaf) return doc;
  return replaceNodeAtPath(doc, path, leaf.node.withText((leaf.node.text ?? '').slice(0, length)));
}

function trimTextLeaves(
  document: Node,
  schema: Schema,
  options: Readonly<Required<CharacterCountExtensionOptions>>,
): Node {
  const limit = options.limit as number;
  let current = document;
  for (const original of [...getTextLeaves(document)].reverse()) {
    if (countNode(current, options.mode, options.textCounter) <= limit) break;
    const path = original.path;
    let leaf: Node;
    try { leaf = path.reduce((node, index) => node.child(index), current); }
    catch { continue; }
    const text = leaf.text ?? '';
    if (!text) continue;
    const empty = withTextPrefix(current, path, 0);
    if (!validDocument(schema, empty)) continue;
    if (countNode(empty, options.mode, options.textCounter) > limit) {
      current = empty;
      continue;
    }

    const boundaries = graphemeBoundaries(text);
    let low = 0;
    let high = boundaries.length - 1;
    let best = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = withTextPrefix(current, path, boundaries[middle] as number);
      if (countNode(candidate, options.mode, options.textCounter) <= limit) {
        best = boundaries[middle] as number;
        low = middle + 1;
      } else high = middle - 1;
    }
    current = withTextPrefix(current, path, best);
  }
  return current;
}

function removablePaths(document: Node): readonly (readonly number[])[] {
  const paths: number[][] = [];
  document.descendants((node, path) => {
    if (path.length && !node.isText) paths.push(path);
  });
  return paths.sort((left, right) => right.length - left.length || [...right].reverse().join('.').localeCompare([...left].reverse().join('.')));
}

function trimRemovableNodes(
  document: Node,
  schema: Schema,
  options: Readonly<Required<CharacterCountExtensionOptions>>,
): Node {
  const limit = options.limit as number;
  let current = document;
  for (let pass = 0; pass < 10_000 && countNode(current, options.mode, options.textCounter) > limit; pass += 1) {
    const before = countNode(current, options.mode, options.textCounter);
    let next: Node | null = null;
    for (const path of removablePaths(current)) {
      try {
        const candidate = replaceNodeWithNodes(current, path, []);
        if (validDocument(schema, candidate) && countNode(candidate, options.mode, options.textCounter) < before) {
          next = candidate;
          break;
        }
      } catch { /* Try the next removable node. */ }
    }
    if (!next) break;
    current = next;
  }
  return current;
}

/** Produces the largest valid prefix the configured counter can retain. */
export function trimDocumentToCharacterLimit(
  document: Node,
  schema: Schema,
  options: CharacterCountExtensionOptions,
): Node {
  const normalized = normalizeOptions(options);
  if (normalized.limit === null || countNode(document, normalized.mode, normalized.textCounter) <= normalized.limit) return document;
  const withoutTailText = trimTextLeaves(document, schema, normalized);
  return trimRemovableNodes(withoutTailText, schema, normalized);
}

function dispatchTrim(
  editor: Editor,
  options: Readonly<Required<CharacterCountExtensionOptions>>,
  addToHistory = false,
): boolean {
  if (options.limit === null) return false;
  const trimmed = trimDocumentToCharacterLimit(editor.state.doc, editor.state.schema, options);
  if (trimmed.eq(editor.state.doc)) return false;
  const transaction = editor.state.createTransaction()
    .replace(0, editor.state.doc.childCount, trimmed.content)
    .setMeta('characterCount$trim', true)
    .setMeta('addToHistory', addToHistory);
  return editor.dispatch(transaction);
}

function createCharacterCountExtensionWithKey(
  supplied: CharacterCountExtensionOptions,
  key: PluginKey<CharacterCountState>,
): FountainExtension {
  const options = normalizeOptions(supplied);
  const plugin = new Plugin<CharacterCountState>({
    key,
    state: {
      init: (_config, state) => snapshotFor(state.doc, options),
      apply: (_transaction, value, oldState, newState) => oldState.doc.eq(newState.doc) ? value : snapshotFor(newState.doc, options),
    },
    filterTransaction: (transaction, state) => {
      if (options.limit === null || !transaction.docChanged) return true;
      if (options.autoTrim && transaction.getMeta('content$replace') === true) return true;
      const before = countNode(state.doc, options.mode, options.textCounter);
      const after = countNode(transaction.doc, options.mode, options.textCounter);
      return after <= options.limit || after <= before;
    },
    appendTransaction: (transactions, _oldState, newState): Transaction | null => {
      if (!options.autoTrim || options.limit === null || !transactions.some((transaction) => transaction.getMeta('content$replace') === true)) return null;
      const trimmed = trimDocumentToCharacterLimit(newState.doc, newState.schema, options);
      if (trimmed.eq(newState.doc)) return null;
      return newState.createTransaction()
        .replace(0, newState.doc.childCount, trimmed.content)
        .setMeta('characterCount$trim', true)
        .setMeta('addToHistory', false);
    },
    props: {
      onCreate: (editor) => { if (options.autoTrim) dispatchTrim(editor, options); },
    },
  });

  const service: CharacterCountService = Object.freeze({
    key,
    options,
    characters: (editor: Editor, query: CharacterCountQuery = {}) => countNode(query.node ?? editor.state.doc, query.mode ?? options.mode, options.textCounter),
    words: (editor: Editor, query: Pick<CharacterCountQuery, 'node'> = {}) => wordsInNode(query.node ?? editor.state.doc, options.wordCounter),
    snapshot: (editor: Editor) => key.get(editor.state) ?? snapshotFor(editor.state.doc, options),
    trim: (editor: Editor) => dispatchTrim(editor, options, true),
  });

  return defineExtension({
    name: 'character-count',
    plugins: [plugin],
    commands: { trimToCharacterLimit: (editor) => service.trim(editor) },
    services: { characterCount: service },
  });
}

export function createCharacterCountExtension(options: CharacterCountExtensionOptions = {}): FountainExtension {
  return createCharacterCountExtensionWithKey(options, new PluginKey<CharacterCountState>('character-count'));
}

export const characterCountKey = new PluginKey<CharacterCountState>('character-count');
export const CharacterCountExtension = createCharacterCountExtensionWithKey({}, characterCountKey);
