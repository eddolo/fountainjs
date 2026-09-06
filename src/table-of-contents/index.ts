import {
  Decoration,
  DecorationSet,
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  nodeRangeAtPath,
  textPointToPosition,
  type AnySelection,
  type Editor,
  type EditorState,
  type Node,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import {
  FOUNTAIN_EXTENSION_API_VERSION,
  defineExtension,
  type FountainExtension,
} from '../extensions/extension';

const DEFAULT_ID_ATTRIBUTE = 'nodeId';
const DEFAULT_ANCHOR_PREFIX = 'fountain-heading-';
const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_PREFIX = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/;
const MAXIMUM_TITLE_LENGTH = 500;

export interface TableOfContentsOptions {
  /** Node types treated as headings. Defaults to `heading`. */
  readonly types?: readonly string[];
  /** Inclusive minimum heading level. Defaults to 1. */
  readonly minLevel?: number;
  /** Inclusive maximum heading level. Defaults to 6. */
  readonly maxLevel?: number;
  /** Stable identity attribute supplied by the node-ID extension. Defaults to `nodeId`. */
  readonly identityAttribute?: string;
  /** Prefix for view-only DOM anchors. Defaults to `fountain-heading-`. */
  readonly anchorPrefix?: string;
  /** Maximum exposed title length. Defaults to 500. */
  readonly maxTitleLength?: number;
}

export interface TableOfContentsEntry {
  /** Stable node identity, or an explicit path fallback when IDs are unavailable. */
  readonly id: string;
  /** View-only DOM id generated from `id`. */
  readonly anchor: string;
  readonly title: string;
  readonly level: number;
  /** Normalized hierarchy depth; unlike `level`, it never contains skipped gaps. */
  readonly depth: number;
  readonly path: readonly number[];
  readonly from: number;
  readonly to: number;
  /** False only for the path-based compatibility fallback. */
  readonly stable: boolean;
}

export interface TableOfContentsTreeEntry extends TableOfContentsEntry {
  readonly children: readonly TableOfContentsTreeEntry[];
}

export interface TableOfContentsState {
  readonly entries: readonly TableOfContentsEntry[];
  readonly tree: readonly TableOfContentsTreeEntry[];
  readonly activeId: string | null;
}

interface ResolvedOptions {
  readonly types: ReadonlySet<string>;
  readonly minLevel: number;
  readonly maxLevel: number;
  readonly identityAttribute: string;
  readonly anchorPrefix: string;
  readonly maxTitleLength: number;
}

function integer(value: number | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  const selected = value ?? fallback;
  if (!Number.isInteger(selected) || selected < minimum || selected > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return selected;
}

function resolveOptions(options: TableOfContentsOptions = {}): ResolvedOptions {
  const names = options.types ?? ['heading'];
  if (!Array.isArray(names) || !names.length || new Set(names).size !== names.length
    || names.some((name) => typeof name !== 'string' || !SAFE_NAME.test(name))) {
    throw new TypeError('Table-of-contents node types must be a non-empty list of unique safe names.');
  }
  const minLevel = integer(options.minLevel, 1, 1, 99, 'Minimum heading level');
  const maxLevel = integer(options.maxLevel, 6, 1, 99, 'Maximum heading level');
  if (minLevel > maxLevel) throw new RangeError('Minimum heading level cannot exceed the maximum.');
  const identityAttribute = options.identityAttribute ?? DEFAULT_ID_ATTRIBUTE;
  if (!SAFE_NAME.test(identityAttribute)) throw new TypeError('Table-of-contents identityAttribute must be a safe name.');
  const anchorPrefix = options.anchorPrefix ?? DEFAULT_ANCHOR_PREFIX;
  if (!SAFE_PREFIX.test(anchorPrefix)) throw new TypeError('Table-of-contents anchorPrefix must be a safe DOM id prefix.');
  return Object.freeze({
    types: new Set(names),
    minLevel,
    maxLevel,
    identityAttribute,
    anchorPrefix,
    maxTitleLength: integer(options.maxTitleLength, MAXIMUM_TITLE_LENGTH, 1, 10_000, 'Maximum heading title length'),
  });
}

function snapshotOptions(options: TableOfContentsOptions): TableOfContentsOptions {
  const resolved = resolveOptions(options);
  return Object.freeze({
    types: Object.freeze([...resolved.types]),
    minLevel: resolved.minLevel,
    maxLevel: resolved.maxLevel,
    identityAttribute: resolved.identityAttribute,
    anchorPrefix: resolved.anchorPrefix,
    maxTitleLength: resolved.maxTitleLength,
  });
}

function normalizedTitle(node: Node, maximum: number): string {
  const title = node.textContent.replace(/\s+/gu, ' ').trim() || 'Untitled';
  return title.length <= maximum ? title : `${title.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`;
}

function safeIdentity(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
}

function freezeTree(entries: readonly TableOfContentsEntry[]): readonly TableOfContentsTreeEntry[] {
  type MutableTree = TableOfContentsEntry & { children: MutableTree[] };
  const roots: MutableTree[] = [];
  const stack: MutableTree[] = [];
  entries.forEach((entry) => {
    while (stack.length > entry.depth) stack.pop();
    const item: MutableTree = { ...entry, children: [] };
    const parent = stack.at(-1);
    if (parent) parent.children.push(item);
    else roots.push(item);
    stack.push(item);
  });
  const freeze = (item: MutableTree): TableOfContentsTreeEntry => Object.freeze({
    ...item,
    children: Object.freeze(item.children.map(freeze)),
  });
  return Object.freeze(roots.map(freeze));
}

/** Builds immutable flat and hierarchical indexes from any Fountain document. */
export function buildTableOfContents(
  document: Node,
  options: TableOfContentsOptions = {},
): Pick<TableOfContentsState, 'entries' | 'tree'> {
  const resolved = resolveOptions(options);
  const entries: TableOfContentsEntry[] = [];
  const levels: number[] = [];
  const identities = new Map<string, number>();
  document.descendants((node, path) => {
    if (!path.length || !resolved.types.has(node.type.name)) return;
    const level = Number(node.attrs.level ?? 1);
    if (!Number.isInteger(level) || level < resolved.minLevel || level > resolved.maxLevel) return;
    while (levels.length && (levels.at(-1) ?? 0) >= level) levels.pop();
    const rawIdentity = node.attrs[resolved.identityAttribute];
    const stable = safeIdentity(rawIdentity) && !identities.has(rawIdentity);
    const fallback = `path-${path.join('-') || 'root'}`;
    const baseIdentity = stable ? rawIdentity : fallback;
    const count = (identities.get(baseIdentity) ?? 0) + 1;
    identities.set(baseIdentity, count);
    const id = count === 1 ? baseIdentity : `${baseIdentity}--${count}`;
    const range = nodeRangeAtPath(document, path);
    entries.push(Object.freeze({
      id,
      anchor: `${resolved.anchorPrefix}${id}`,
      title: normalizedTitle(node, resolved.maxTitleLength),
      level,
      depth: levels.length,
      path: Object.freeze([...path]),
      from: range.from,
      to: range.to,
      stable,
    }));
    levels.push(level);
  });
  const frozen = Object.freeze(entries);
  return Object.freeze({ entries: frozen, tree: freezeTree(frozen) });
}

function selectionPosition(document: Node, selection: AnySelection): number {
  if (selection.kind === 'all') return 0;
  if (selection.kind === 'node') return selection.structuralFrom;
  if (selection.kind === 'gap') return selection.position;
  try { return textPointToPosition(document, selection.path, selection.from); }
  catch { return 0; }
}

function activeEntry(entries: readonly TableOfContentsEntry[], position: number): TableOfContentsEntry | undefined {
  return [...entries].reverse().find((entry) => entry.from <= position) ?? entries[0];
}

function updateActiveEntry(
  value: TableOfContentsState,
  document: Node,
  selection: AnySelection,
): TableOfContentsState {
  const activeId = activeEntry(value.entries, selectionPosition(document, selection))?.id ?? null;
  return activeId === value.activeId ? value : Object.freeze({ ...value, activeId });
}

/** Produces a complete immutable state snapshot without requiring an editor or DOM. */
export function createTableOfContentsState(
  document: Node,
  selection: AnySelection,
  options: TableOfContentsOptions = {},
): TableOfContentsState {
  const index = buildTableOfContents(document, options);
  return Object.freeze({
    ...index,
    activeId: activeEntry(index.entries, selectionPosition(document, selection))?.id ?? null,
  });
}

export const tableOfContentsKey = new PluginKey<TableOfContentsState>('table-of-contents');

/** Returns live extension state, or undefined when the extension is not installed. */
export function getTableOfContentsState(editor: Editor): TableOfContentsState | undefined {
  return tableOfContentsKey.get(editor.state);
}

function firstTextPath(document: Node, path: readonly number[]): readonly number[] | null {
  const result = [...path];
  let node = getNodeAtPath(document, path);
  while (!node.isText && node.childCount) {
    result.push(0);
    node = node.child(0);
  }
  return node.isText ? Object.freeze(result) : null;
}

/** Selects a heading start through the model; a renderer may scroll its exposed anchor. */
export function navigateTableOfContents(editor: Editor, id: string): boolean {
  const state = getTableOfContentsState(editor);
  const entry = state?.entries.find((candidate) => candidate.id === id || candidate.anchor === id);
  if (!entry) return false;
  const path = firstTextPath(editor.state.doc, entry.path);
  const selection = path
    ? Selection.cursor(path, 0)
    : new NodeSelection(editor.state.doc, entry.path);
  return editor.dispatch(editor.state.createTransaction().setSelection(selection));
}

function decorations(state: TableOfContentsState, document: Node): DecorationSet {
  return DecorationSet.create(document, state.entries.map((entry) => Decoration.node(
    entry.from,
    entry.to,
    {
      id: entry.anchor,
      'data-fountain-toc-id': entry.id,
      'data-fountain-toc-level': entry.level,
      class: 'fountain-toc-heading',
    },
    { key: `table-of-contents-${entry.id}` },
  )));
}

export interface TableOfContentsService {
  readonly key: typeof tableOfContentsKey;
  getState(editor: Editor): TableOfContentsState | undefined;
  navigate(editor: Editor, id: string): boolean;
}

/** Creates the platform-neutral live index. Compose it after `StableNodeIdsExtension`. */
export function createTableOfContentsExtension(options: TableOfContentsOptions = {}): FountainExtension {
  const configured = snapshotOptions(options);
  const plugin = new Plugin<TableOfContentsState>({
    key: tableOfContentsKey,
    state: {
      init: (_config, state) => createTableOfContentsState(state.doc, state.selection, configured),
      apply: (transaction, value, _oldState, newState) => {
        if (transaction.docChanged) return createTableOfContentsState(newState.doc, newState.selection, configured);
        return transaction.selectionSet ? updateActiveEntry(value, newState.doc, newState.selection) : value;
      },
    },
    props: {
      decorations: (state: EditorState) => {
        const current = tableOfContentsKey.get(state);
        return current ? decorations(current, state.doc) : DecorationSet.empty;
      },
    },
  });
  const service: TableOfContentsService = Object.freeze({
    key: tableOfContentsKey,
    getState: getTableOfContentsState,
    navigate: navigateTableOfContents,
  });
  return defineExtension({
    name: 'table-of-contents',
    manifest: {
      version: '0.3.0',
      apiVersion: FOUNTAIN_EXTENSION_API_VERSION,
      displayName: 'Table of contents',
      description: 'Stable heading anchors, flat/tree indexes, active section state, and model navigation.',
      license: 'MIT',
      requires: ['stable-node-ids'],
    },
    plugins: [plugin],
    commands: { navigateTableOfContents },
    services: { tableOfContents: service },
  });
}

export const TableOfContentsExtension = createTableOfContentsExtension();
