import {
  Node,
  NodeSelection,
  Plugin,
  PluginKey,
  REBROADCAST_APPEND_TRANSACTION_META,
  Step,
  type NodeJSON,
  type Schema,
  type Attributes,
  type Editor,
} from '../core';
import { defineExtension, type FountainExtension } from '../extensions/extension';

export const DEFAULT_STABLE_NODE_ID_ATTRIBUTE = 'nodeId';
export const STABLE_NODE_ID_REPAIR_META = 'fountain$stableNodeIdRepair';
export const STABLE_NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

const ATTRIBUTE_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/;
const MAXIMUM_GENERATION_ATTEMPTS = 100;

export type StableNodeIdRepairReason = 'missing' | 'invalid' | 'duplicate';

export interface StableNodeIdEligibilityContext {
  readonly node: Node;
  readonly path: readonly number[];
  readonly parent: Node | null;
}

export interface StableNodeIdGenerationContext extends StableNodeIdEligibilityContext {
  readonly attribute: string;
  readonly reason: StableNodeIdRepairReason;
  readonly previousId?: unknown;
  readonly attempt: number;
}

export interface StableNodeIdOptions {
  /** Portable node attribute used for identity. Defaults to `nodeId`. */
  readonly attribute?: string;
  /** Eligible node types. By default every non-root block node is eligible. */
  readonly types?: readonly string[];
  /** Additional eligibility predicate. Text nodes and the root are never eligible. */
  readonly filter?: (context: StableNodeIdEligibilityContext) => boolean;
  /** Injectable synchronous generator for deterministic tests or application-owned IDs. */
  readonly generateId?: (context: StableNodeIdGenerationContext) => string;
}

export interface StableNodeIdEntry {
  readonly id: string;
  readonly path: readonly number[];
  readonly node: Node;
}

export interface StableNodeIdIssue {
  readonly reason: StableNodeIdRepairReason;
  readonly path: readonly number[];
  readonly nodeType: string;
  readonly value?: unknown;
  readonly duplicateOf?: readonly number[];
}

export interface StableNodeIdRepair extends StableNodeIdIssue {
  readonly id: string;
}

export interface StableNodeIdNormalizationResult {
  readonly document: Node;
  readonly repairs: readonly StableNodeIdRepair[];
  readonly index: StableNodeIdIndex;
}

export interface StableNodeIdJSONNormalizationResult {
  readonly document: NodeJSON;
  readonly repairs: readonly StableNodeIdRepair[];
}

interface ResolvedStableNodeIdOptions {
  readonly attribute: string;
  readonly types?: ReadonlySet<string>;
  readonly filter?: StableNodeIdOptions['filter'];
  readonly generateId?: StableNodeIdOptions['generateId'];
}

function immutablePath(path: readonly number[]): readonly number[] {
  return Object.freeze([...path]);
}

function resolveOptions(options: StableNodeIdOptions = {}): ResolvedStableNodeIdOptions {
  const attribute = options.attribute ?? DEFAULT_STABLE_NODE_ID_ATTRIBUTE;
  if (!ATTRIBUTE_PATTERN.test(attribute) || ['__proto__', 'prototype', 'constructor'].includes(attribute)) {
    throw new TypeError('Stable node ID attributes must be safe names containing 1-64 letters, numbers, dot, colon, underscore, or hyphen.');
  }
  if (options.types !== undefined && !Array.isArray(options.types)) {
    throw new TypeError('Stable node ID types must be a list of unique node type names.');
  }
  const types = options.types === undefined ? undefined : new Set(options.types);
  if (types && (types.size !== options.types?.length
    || [...types].some((name) => typeof name !== 'string' || !name || name.length > 128))) {
    throw new TypeError('Stable node ID types must be a list of unique node type names.');
  }
  if (options.filter !== undefined && typeof options.filter !== 'function') {
    throw new TypeError('Stable node ID filter must be a function.');
  }
  if (options.generateId !== undefined && typeof options.generateId !== 'function') {
    throw new TypeError('Stable node ID generator must be a function.');
  }
  return Object.freeze({
    attribute,
    ...(types ? { types } : {}),
    ...(options.filter ? { filter: options.filter } : {}),
    ...(options.generateId ? { generateId: options.generateId } : {}),
  });
}

function eligible(
  node: Node,
  path: readonly number[],
  parent: Node | null,
  options: ResolvedStableNodeIdOptions,
): boolean {
  if (!path.length || node.isText) return false;
  if (options.types ? !options.types.has(node.type.name) : !node.isBlock) return false;
  return options.filter?.(Object.freeze({ node, path: immutablePath(path), parent })) ?? true;
}

function snapshotOptions(options: StableNodeIdOptions): StableNodeIdOptions {
  const resolved = resolveOptions(options);
  return Object.freeze({
    attribute: resolved.attribute,
    ...(resolved.types ? { types: Object.freeze([...resolved.types]) } : {}),
    ...(resolved.filter ? { filter: resolved.filter } : {}),
    ...(resolved.generateId ? { generateId: resolved.generateId } : {}),
  });
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && STABLE_NODE_ID_PATTERN.test(value);
}

function canonicalValue(value: unknown, omittedAttribute: string, key?: string): string {
  if (key === omittedAttribute) return '';
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : JSON.stringify(String(value));
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map((item) => canonicalValue(item, omittedAttribute)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((name) => name !== omittedAttribute)
      .sort()
      .map((name) => `${JSON.stringify(name)}:${canonicalValue((value as Record<string, unknown>)[name], omittedAttribute, name)}`)
      .join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function hash32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function defaultId(context: StableNodeIdGenerationContext): string {
  const source = [
    context.reason,
    String(context.previousId ?? ''),
    context.path.join('.'),
    String(context.attempt),
    canonicalValue(context.node.toJSON(), context.attribute),
  ].join('|');
  const left = hash32(source, 0x811c9dc5).toString(36).padStart(7, '0');
  const right = hash32(source, 0x9e3779b9).toString(36).padStart(7, '0');
  return `fjs-${left}${right}`;
}

function entriesAndIssues(document: Node, options: ResolvedStableNodeIdOptions): {
  entries: StableNodeIdEntry[];
  issues: StableNodeIdIssue[];
} {
  const entries: StableNodeIdEntry[] = [];
  const issues: StableNodeIdIssue[] = [];
  const firstPaths = new Map<string, readonly number[]>();
  document.descendants((node, path, parent) => {
    if (!eligible(node, path, parent, options)) return;
    const immutable = immutablePath(path);
    const value = node.attrs[options.attribute];
    if (value === undefined || value === null || value === '') {
      issues.push(Object.freeze({ reason: 'missing', path: immutable, nodeType: node.type.name }));
      return;
    }
    if (!validId(value)) {
      issues.push(Object.freeze({ reason: 'invalid', path: immutable, nodeType: node.type.name, value }));
      return;
    }
    const entry = Object.freeze({ id: value, path: immutable, node });
    entries.push(entry);
    const first = firstPaths.get(value);
    if (first) {
      issues.push(Object.freeze({
        reason: 'duplicate', path: immutable, nodeType: node.type.name, value, duplicateOf: first,
      }));
    } else firstPaths.set(value, immutable);
  });
  return { entries, issues };
}

/** Immutable O(1) lookup index. Duplicate IDs deliberately resolve to `undefined`. */
export class StableNodeIdIndex {
  readonly entries: readonly StableNodeIdEntry[];
  readonly issues: readonly StableNodeIdIssue[];
  private readonly byId: ReadonlyMap<string, readonly StableNodeIdEntry[]>;

  constructor(document: Node, options: StableNodeIdOptions = {}) {
    const inspected = entriesAndIssues(document, resolveOptions(options));
    const mutable = new Map<string, StableNodeIdEntry[]>();
    inspected.entries.forEach((entry) => mutable.set(entry.id, [...(mutable.get(entry.id) ?? []), entry]));
    this.entries = Object.freeze(inspected.entries);
    this.issues = Object.freeze(inspected.issues);
    this.byId = new Map([...mutable].map(([id, entries]) => [id, Object.freeze(entries)]));
    Object.freeze(this);
  }

  /** Number of distinct valid identifiers, including ambiguous duplicate keys. */
  get size(): number { return this.byId.size; }

  get(id: string): StableNodeIdEntry | undefined {
    const entries = this.byId.get(id);
    return entries?.length === 1 ? entries[0] : undefined;
  }

  getAll(id: string): readonly StableNodeIdEntry[] {
    return this.byId.get(id) ?? Object.freeze([]);
  }

  has(id: string): boolean { return this.get(id) !== undefined; }
}

export function createStableNodeIdIndex(document: Node, options: StableNodeIdOptions = {}): StableNodeIdIndex {
  return new StableNodeIdIndex(document, options);
}

export function inspectStableNodeIds(document: Node, options: StableNodeIdOptions = {}): readonly StableNodeIdIssue[] {
  return createStableNodeIdIndex(document, options).issues;
}

function nextUniqueId(
  context: Omit<StableNodeIdGenerationContext, 'attempt'>,
  used: ReadonlySet<string>,
  generator?: StableNodeIdOptions['generateId'],
): string {
  for (let attempt = 0; attempt < MAXIMUM_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = (generator ?? defaultId)({ ...context, attempt });
    if (validId(candidate) && !used.has(candidate)) return candidate;
  }
  throw new Error(`Stable node ID generation failed after ${MAXIMUM_GENERATION_ATTEMPTS} attempts at ${context.path.join('.')}.`);
}

export function planStableNodeIdRepairs(
  document: Node,
  options: StableNodeIdOptions = {},
): readonly StableNodeIdRepair[] {
  const resolved = resolveOptions(options);
  const inspected = entriesAndIssues(document, resolved);
  const used = new Set(inspected.entries.map((entry) => entry.id));
  const firstPaths = new Map<string, readonly number[]>();
  const repairs: StableNodeIdRepair[] = [];
  document.descendants((node, path, parent) => {
    if (!eligible(node, path, parent, resolved)) return;
    const value = node.attrs[resolved.attribute];
    const reason: StableNodeIdRepairReason | undefined = !validId(value)
      ? (value === undefined || value === null || value === '' ? 'missing' : 'invalid')
      : firstPaths.has(value) ? 'duplicate' : undefined;
    if (validId(value) && !firstPaths.has(value)) firstPaths.set(value, immutablePath(path));
    if (!reason) return;
    const id = nextUniqueId({
      node,
      path: immutablePath(path),
      parent,
      attribute: resolved.attribute,
      reason,
      ...(value !== undefined ? { previousId: value } : {}),
    }, used, resolved.generateId);
    used.add(id);
    repairs.push(Object.freeze({
      id,
      reason,
      path: immutablePath(path),
      nodeType: node.type.name,
      ...(value !== undefined ? { value } : {}),
      ...(reason === 'duplicate' && typeof value === 'string'
        ? { duplicateOf: firstPaths.get(value) }
        : {}),
    }));
  });
  return Object.freeze(repairs);
}

export function normalizeStableNodeIds(
  document: Node,
  options: StableNodeIdOptions = {},
): StableNodeIdNormalizationResult {
  const resolved = resolveOptions(options);
  const repairs = planStableNodeIdRepairs(document, options);
  const normalized = applyRepairs(document, repairs, resolved.attribute);
  return Object.freeze({
    document: normalized,
    repairs,
    index: createStableNodeIdIndex(normalized, options),
  });
}

function applyRepairs(document: Node, repairs: readonly StableNodeIdRepair[], attribute: string): Node {
  if (!repairs.length) return document;
  const byPath = new Map(repairs.map((repair) => [repair.path.join('/'), repair.id]));
  const rebuild = (node: Node, path: readonly number[]): Node => {
    let next = node;
    if (node.content.length) {
      const content = node.content.map((child, index) => rebuild(child, [...path, index]));
      if (content.some((child, index) => child !== node.content[index])) next = next.copy(content);
    }
    const id = byPath.get(path.join('/'));
    return id === undefined ? next : next.withAttrs({ ...next.attrs, [attribute]: id });
  };
  return rebuild(document, []);
}

class StableNodeIdRepairStep extends Step {
  constructor(
    private readonly repairs: readonly StableNodeIdRepair[],
    private readonly attribute: string,
  ) { super(); }

  apply(document: Node): Node {
    return applyRepairs(document, this.repairs, this.attribute);
  }
}

/**
 * Schema-valid JSON migration helper for databases and versioned document
 * migrations. It performs no browser work and does not mutate the input JSON.
 */
export function normalizeStableNodeIdJSON(
  schema: Schema,
  document: NodeJSON,
  options: StableNodeIdOptions = {},
): StableNodeIdJSONNormalizationResult {
  const normalized = normalizeStableNodeIds(schema.nodeFromJSON(document), options);
  return Object.freeze({ document: normalized.document.toJSON(), repairs: normalized.repairs });
}

/** Pure document lookup. Build and retain an index for repeated queries. */
export function nodeById(document: Node, id: string, options: StableNodeIdOptions = {}): Node | undefined {
  return createStableNodeIdIndex(document, options).get(id)?.node;
}

export const stableNodeIdsKey = new PluginKey<StableNodeIdIndex>('stable-node-ids');
const editorOptions = new WeakMap<Editor, StableNodeIdOptions>();

function optionsForEditor(editor: Editor, options?: StableNodeIdOptions): StableNodeIdOptions {
  return options ?? editorOptions.get(editor) ?? {};
}

export function getStableNodeIdIndex(editor: Editor): StableNodeIdIndex | undefined {
  return stableNodeIdsKey.get(editor.state);
}

export function getNodeById(editor: Editor, id: string): Node | undefined {
  return getStableNodeIdIndex(editor)?.get(id)?.node;
}

export function repairStableNodeIds(editor: Editor, options?: StableNodeIdOptions): boolean {
  const selected = optionsForEditor(editor, options);
  const resolved = resolveOptions(selected);
  const repairs = planStableNodeIdRepairs(editor.state.doc, selected);
  if (!repairs.length) return false;
  const transaction = editor.state.createTransaction()
    .step(new StableNodeIdRepairStep(repairs, resolved.attribute));
  transaction
    .setMeta('addToHistory', false)
    .setMeta(STABLE_NODE_ID_REPAIR_META, repairs)
    .setMeta(REBROADCAST_APPEND_TRANSACTION_META, true);
  return editor.dispatch(transaction);
}

export function updateNodeById(
  editor: Editor,
  id: string,
  attrs: Attributes,
  options?: StableNodeIdOptions,
): boolean {
  const selected = optionsForEditor(editor, options);
  const resolved = resolveOptions(selected);
  const entry = (options ? createStableNodeIdIndex(editor.state.doc, selected) : getStableNodeIdIndex(editor))?.get(id);
  if (!entry) return false;
  const next = { ...attrs };
  delete next[resolved.attribute];
  if (!Object.keys(next).length) return false;
  return editor.dispatch(editor.state.createTransaction().setNodeAttrs(entry.path, next));
}

export function selectNodeById(editor: Editor, id: string, options?: StableNodeIdOptions): boolean {
  const selected = optionsForEditor(editor, options);
  const entry = (options ? createStableNodeIdIndex(editor.state.doc, selected) : getStableNodeIdIndex(editor))?.get(id);
  if (!entry) return false;
  return editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, entry.path)));
}

export interface StableNodeIdsService {
  readonly key: typeof stableNodeIdsKey;
  getIndex(editor: Editor): StableNodeIdIndex | undefined;
  get(editor: Editor, id: string): Node | undefined;
  update(editor: Editor, id: string, attrs: Attributes): boolean;
  select(editor: Editor, id: string): boolean;
  repair(editor: Editor): boolean;
}

export function createStableNodeIdsExtension(options: StableNodeIdOptions = {}): FountainExtension {
  const configured = snapshotOptions(options);
  const plugin = new Plugin<StableNodeIdIndex>({
    key: stableNodeIdsKey,
    state: {
      init: (_config, state) => createStableNodeIdIndex(state.doc, configured),
      apply: (transaction, value, _oldState, newState) => transaction.docChanged
        ? createStableNodeIdIndex(newState.doc, configured)
        : value,
    },
    appendTransaction: (_transactions, _oldState, newState) => {
      const repairs = planStableNodeIdRepairs(newState.doc, configured);
      if (!repairs.length) return null;
      const resolved = resolveOptions(configured);
      const transaction = newState.createTransaction()
        .step(new StableNodeIdRepairStep(repairs, resolved.attribute));
      return transaction
        .setMeta('addToHistory', false)
        .setMeta(STABLE_NODE_ID_REPAIR_META, repairs)
        .setMeta(REBROADCAST_APPEND_TRANSACTION_META, true);
    },
    props: {
      onCreate: (editor) => {
        editorOptions.set(editor, configured);
        repairStableNodeIds(editor, configured);
      },
      onDestroy: (editor) => { editorOptions.delete(editor); },
    },
  });
  const service: StableNodeIdsService = Object.freeze({
    key: stableNodeIdsKey,
    getIndex: getStableNodeIdIndex,
    get: getNodeById,
    update: (editor: Editor, id: string, attrs: Attributes) => updateNodeById(editor, id, attrs, configured),
    select: (editor: Editor, id: string) => selectNodeById(editor, id, configured),
    repair: (editor: Editor) => repairStableNodeIds(editor, configured),
  });
  return defineExtension({
    name: 'stable-node-ids',
    plugins: [plugin],
    commands: {
      repairStableNodeIds: (editor) => repairStableNodeIds(editor, configured),
      updateNodeById: (editor, id: string, attrs: Attributes) => updateNodeById(editor, id, attrs, configured),
      selectNodeById: (editor, id: string) => selectNodeById(editor, id, configured),
    },
    services: { stableNodeIds: service },
  });
}

export const StableNodeIdsExtension = createStableNodeIdsExtension();
