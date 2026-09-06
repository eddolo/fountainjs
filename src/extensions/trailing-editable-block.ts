import {
  Plugin,
  PluginKey,
  REBROADCAST_APPEND_TRANSACTION_META,
  type Attributes,
  type Editor,
  type EditorState,
  type Node,
  type Schema,
  type Transaction,
} from '../core';
import { defineExtension, type FountainExtension } from './extension';

export const TRAILING_EDITABLE_BLOCK_META = 'fountain$trailingEditableBlock';

export interface TrailingEditableBlockOptions {
  /** Block created when a configured root has no directly editable final child. Defaults to `paragraph`. */
  readonly nodeType?: string;
  /** Attributes passed to the created block. Defaults to the node type's schema defaults. */
  readonly nodeAttributes?: Attributes;
  /** Container node types to maintain. Defaults to the schema's top node type. */
  readonly rootTypes?: readonly string[];
}

interface ResolvedTrailingEditableBlockOptions {
  readonly nodeType: string;
  readonly nodeAttributes: Attributes;
  readonly rootTypes?: readonly string[];
}

function normalizeOptions(options: TrailingEditableBlockOptions): ResolvedTrailingEditableBlockOptions {
  const nodeType = options.nodeType?.trim() || 'paragraph';
  const rootTypes = options.rootTypes === undefined
    ? undefined
    : Object.freeze([...new Set(options.rootTypes.map((name) => name.trim()))]);
  if (!/^[A-Za-z_][\w-]*$/.test(nodeType)) throw new TypeError('Trailing editable block nodeType must be a node name.');
  if (rootTypes?.length === 0 || rootTypes?.some((name) => !/^[A-Za-z_][\w-]*$/.test(name))) {
    throw new TypeError('Trailing editable block rootTypes must contain valid node names.');
  }
  return Object.freeze({
    nodeType,
    nodeAttributes: Object.freeze({ ...(options.nodeAttributes ?? {}) }),
    rootTypes,
  });
}

function nodeAtPath(document: Node, path: readonly number[]): Node {
  let node = document;
  for (const index of path) node = node.child(index);
  return node;
}

function configuredRootTypes(schema: Schema, options: ResolvedTrailingEditableBlockOptions): ReadonlySet<string> {
  const names = new Set(options.rootTypes ?? [schema.topNodeType.name]);
  for (const name of names) {
    const type = schema.nodes[name];
    if (!type || type.spec.atom || !type.isBlock || !type.spec.content) {
      throw new TypeError(`Trailing editable block root type ${name} must be a non-atomic container node.`);
    }
  }
  return names;
}

function createEditableBlock(schema: Schema, options: ResolvedTrailingEditableBlockOptions): Node {
  const type = schema.nodes[options.nodeType];
  if (!type || type.spec.atom || !type.isBlock) {
    throw new TypeError(`Trailing editable block node type ${options.nodeType} must be a non-atomic block.`);
  }
  try {
    const node = type.create(options.nodeAttributes, [schema.text('')]);
    schema.validate(node);
    return node;
  } catch {
    throw new TypeError(`Trailing editable block node type ${options.nodeType} must accept direct editable text.`);
  }
}

function isDirectlyEditableBlock(node: Node, schema: Schema): boolean {
  if (!node.isBlock || node.type.spec.atom) return false;
  try {
    const candidate = node.type.create(node.attrs, [schema.text('')]);
    schema.validate(candidate);
    return true;
  } catch { return false; }
}

function repairPaths(
  document: Node,
  schema: Schema,
  rootTypes: ReadonlySet<string>,
): readonly number[][] {
  const paths: number[][] = [];
  document.descendants((node, path) => {
    if (!rootTypes.has(node.type.name)) return;
    const last = node.content.at(-1);
    if (!last || !isDirectlyEditableBlock(last, schema)) paths.push(path);
  });
  return paths.sort((left, right) => right.length - left.length);
}

/** Creates one history-neutral repair transaction, or `null` when every configured root already ends editably. */
export function createTrailingEditableBlockTransaction(
  state: EditorState,
  supplied: TrailingEditableBlockOptions = {},
): Transaction | null {
  const options = normalizeOptions(supplied);
  const roots = configuredRootTypes(state.schema, options);
  createEditableBlock(state.schema, options);
  const paths = repairPaths(state.doc, state.schema, roots);
  if (!paths.length) return null;
  const transaction = state.createTransaction();
  for (const path of paths) {
    const root = nodeAtPath(transaction.doc, path);
    const trailing = createEditableBlock(state.schema, options);
    if (!path.length) transaction.replace(root.childCount, root.childCount, [trailing]);
    else transaction.replaceNode(path, [root.copy([...root.content, trailing])]);
  }
  try { state.schema.validate(transaction.doc); }
  catch {
    throw new TypeError(`Trailing editable block ${options.nodeType} is not valid at the end of every configured root.`);
  }
  return transaction
    .setMeta('addToHistory', false)
    .setMeta(TRAILING_EDITABLE_BLOCK_META, Object.freeze(paths.map((path) => Object.freeze([...path]))))
    .setMeta(REBROADCAST_APPEND_TRANSACTION_META, true);
}

/** Restores the configured trailing-editable-block invariant immediately. */
export function ensureTrailingEditableBlocks(
  editor: Editor,
  options: TrailingEditableBlockOptions = {},
): boolean {
  const transaction = createTrailingEditableBlockTransaction(editor.state, options);
  return transaction ? editor.dispatch(transaction) : false;
}

function createTrailingEditableBlockExtensionWithKey(
  supplied: TrailingEditableBlockOptions,
  key: PluginKey<null>,
): FountainExtension {
  const options = normalizeOptions(supplied);
  const plugin = new Plugin<null>({
    key,
    state: {
      init: (_config, state) => {
        configuredRootTypes(state.schema, options);
        createEditableBlock(state.schema, options);
        return null;
      },
      apply: () => null,
    },
    appendTransaction: (transactions, _oldState, newState) => {
      if (!transactions.some((transaction) => transaction.docChanged)) return null;
      if (transactions.some((transaction) => transaction.getMeta(TRAILING_EDITABLE_BLOCK_META) !== undefined)) return null;
      return createTrailingEditableBlockTransaction(newState, options);
    },
    props: {
      onCreate: (editor) => { ensureTrailingEditableBlocks(editor, options); },
    },
  });
  return defineExtension({
    name: 'trailing-editable-block',
    plugins: [plugin],
    commands: { ensureTrailingEditableBlocks: (editor) => ensureTrailingEditableBlocks(editor, options) },
  });
}

export function createTrailingEditableBlockExtension(
  options: TrailingEditableBlockOptions = {},
): FountainExtension {
  return createTrailingEditableBlockExtensionWithKey(options, new PluginKey<null>('trailing-editable-block'));
}

export const trailingEditableBlockKey = new PluginKey<null>('trailing-editable-block');
export const TrailingEditableBlockExtension = createTrailingEditableBlockExtensionWithKey({}, trailingEditableBlockKey);
