import {
  AllSelection,
  GapSelection,
  NodeSelection,
  Selection,
  freezeAttributes,
  removeNode,
  type AttributeSpec,
  type Attributes,
  type DOMOutputSpec,
  type DOMParseRule,
  type Editor,
  type Node,
  type NodeDOMContext,
  type NodeSpec,
  type NodeViewConstructor,
} from '../core';
import { comparePaths, getNodeAtPath, getTextLeaves } from '../core/transaction/path';
import { defineExtension, type FountainExtension } from '../extensions';

const WIDGET_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const ATTRIBUTE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/;
const UNSAFE_ATTRIBUTE_NAMES = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_EMBEDDED_WIDGET_STATE = 64 * 1024;

/** Identifies transactions produced through the public widget state contract. */
export const WIDGET_TRANSACTION_META = 'fountain$widget';

export type WidgetAttributes = Attributes;
export type WidgetExitAction = 'before' | 'after' | 'select';
export type WidgetKeyAction = WidgetExitAction | 'cycle' | 'allow';
export type WidgetKeyName = 'Tab' | 'Enter' | 'Escape';
export type WidgetKeyPolicy = Readonly<Record<WidgetKeyName, WidgetKeyAction>>;

/**
 * Tab moves in document order, Enter keeps the native control behavior, and
 * Escape returns selection ownership to the widget node. Every action can be
 * replaced per definition.
 */
export const DEFAULT_WIDGET_KEY_POLICY: WidgetKeyPolicy = Object.freeze({
  Tab: 'cycle',
  Enter: 'allow',
  Escape: 'select',
});

export type WidgetValidationResult = boolean | string | readonly string[] | null | undefined;

export interface WidgetValidationReport {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly attributes: Readonly<WidgetAttributes>;
}

export interface WidgetValidationContext {
  readonly name: string;
  readonly attributes: Readonly<WidgetAttributes>;
}

export interface WidgetDefinitionOptions {
  /** Schema node name and stable widget kind. */
  name: string;
  label?: string;
  attributes?: Readonly<Record<string, AttributeSpec>>;
  group?: string;
  inline?: boolean;
  /** Child-content expression. Supplying content makes the widget non-atomic. */
  content?: string;
  atom?: boolean;
  /** Attributes that a normal widget update cannot replace. Defaults to `nodeId`. */
  protectedAttributes?: readonly string[];
  keyPolicy?: Partial<WidgetKeyPolicy>;
  validate?: (context: WidgetValidationContext) => WidgetValidationResult;
  toText?: (node: Node) => string;
  toDOM?: (node: Node, context?: NodeDOMContext) => DOMOutputSpec;
  parseDOM?: readonly DOMParseRule[];
}

export interface WidgetDefinition {
  readonly name: string;
  readonly label: string;
  readonly attributes: Readonly<Record<string, AttributeSpec>>;
  readonly group: string;
  readonly inline: boolean;
  readonly atom: boolean;
  readonly content?: string;
  readonly protectedAttributes: readonly string[];
  readonly keyPolicy: WidgetKeyPolicy;
  readonly nodeSpec: NodeSpec;
  readonly validate?: (context: WidgetValidationContext) => WidgetValidationResult;
}

export interface WidgetExtensionOptions {
  extensionName?: string;
  nodeView?: NodeViewConstructor;
}

export interface WidgetTransactionMeta {
  readonly action: 'insert' | 'update';
  readonly widget: string;
  readonly path: readonly number[];
  readonly attributes?: readonly string[];
}

function safeAttributeName(name: string): boolean {
  return ATTRIBUTE_NAME_PATTERN.test(name) && !UNSAFE_ATTRIBUTE_NAMES.has(name);
}

function normalizeIssues(result: WidgetValidationResult): readonly string[] {
  if (result === true || result == null) return Object.freeze([]);
  if (result === false) return Object.freeze(['Widget validation rejected these attributes.']);
  const issues = typeof result === 'string' ? [result] : [...result];
  return Object.freeze(issues.filter((issue) => typeof issue === 'string' && issue.trim()).map((issue) => issue.trim()));
}

function embeddedState(node: Node): string {
  const serialized = JSON.stringify(node.attrs);
  if (serialized.length > MAX_EMBEDDED_WIDGET_STATE) {
    throw new RangeError(`Widget ${node.type.name} HTML state exceeds ${MAX_EMBEDDED_WIDGET_STATE} characters.`);
  }
  return serialized;
}

function parseEmbeddedState(element: HTMLElement): Attributes | false {
  const source = element.getAttribute('data-fountain-widget-state');
  if (!source || source.length > MAX_EMBEDDED_WIDGET_STATE) return false;
  try {
    const value = JSON.parse(source) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return value as Attributes;
  } catch {
    return false;
  }
}

function defaultDOM(definition: Pick<WidgetDefinition, 'name' | 'label' | 'inline' | 'content'>) {
  return (node: Node): DOMOutputSpec => {
    const tag = definition.inline ? 'span' : 'div';
    const attrs = {
      'data-fountain-widget': definition.name,
      'data-fountain-widget-state': embeddedState(node),
    };
    return definition.content ? [tag, attrs, 0] : [tag, attrs, definition.label];
  };
}

function defaultParseDOM(name: string): readonly DOMParseRule[] {
  return Object.freeze([{
    tag: `[data-fountain-widget="${name}"]`,
    getAttrs: parseEmbeddedState,
  }]);
}

/** Defines an immutable, portable widget schema without importing a renderer. */
export function defineWidget(options: WidgetDefinitionOptions): WidgetDefinition {
  if (!WIDGET_NAME_PATTERN.test(options.name)) {
    throw new TypeError('Widget names must start with a lowercase letter and contain only lowercase letters, numbers, or underscores.');
  }
  const attributes = Object.fromEntries(
    Object.entries(options.attributes ?? {}).map(([name, spec]) => [name, Object.freeze({
      ...spec,
      ...(Object.prototype.hasOwnProperty.call(spec, 'default')
        ? { default: freezeAttributes({ value: spec.default }).value }
        : {}),
    })]),
  );
  for (const name of Object.keys(attributes)) {
    if (!safeAttributeName(name)) throw new TypeError(`Unsafe widget attribute name: ${name}`);
  }
  const protectedAttributes = [...new Set(options.protectedAttributes ?? ['nodeId'])];
  if (protectedAttributes.some((name) => !safeAttributeName(name))) {
    throw new TypeError('Protected widget attributes must use safe attribute names.');
  }
  if (options.content && options.atom === true) {
    throw new TypeError('A widget with editable child content cannot be atomic.');
  }
  const inline = options.inline ?? false;
  const atom = options.content ? false : options.atom ?? true;
  const keyPolicy = Object.freeze({ ...DEFAULT_WIDGET_KEY_POLICY, ...options.keyPolicy });
  const actions = new Set<WidgetKeyAction>(['before', 'after', 'select', 'cycle', 'allow']);
  if (Object.values(keyPolicy).some((action) => !actions.has(action))) {
    throw new TypeError('Widget key actions must be before, after, select, cycle, or allow.');
  }
  const definitionBase = {
    name: options.name,
    label: options.label?.trim() || options.name.replace(/_/g, ' '),
    attributes: Object.freeze(attributes),
    group: options.group ?? (inline ? 'inline' : 'block'),
    inline,
    atom,
    content: options.content,
    protectedAttributes: Object.freeze(protectedAttributes),
    keyPolicy,
    validate: options.validate,
  };
  let definition!: WidgetDefinition;
  const nodeSpec: NodeSpec = Object.freeze({
    group: definitionBase.group,
    inline,
    atom,
    ...(options.content ? { content: options.content } : {}),
    attrs: definitionBase.attributes,
    validate: (node: Node) => validateWidgetAttributes(definition, node.attrs).valid,
    toText: options.toText ?? (() => definitionBase.label),
    toDOM: options.toDOM ?? defaultDOM(definitionBase),
    parseDOM: options.parseDOM
      ? Object.freeze(options.parseDOM.map((rule) => Object.freeze({ ...rule })))
      : defaultParseDOM(options.name),
  });
  definition = Object.freeze({ ...definitionBase, nodeSpec });
  return definition;
}

/** Validates defaults, attribute validators, and the widget-level invariant. */
export function validateWidgetAttributes(
  definition: WidgetDefinition,
  supplied: WidgetAttributes,
): WidgetValidationReport {
  const attributes: WidgetAttributes = { ...supplied };
  const issues: string[] = [];
  for (const [name, spec] of Object.entries(definition.attributes)) {
    const value = name in attributes ? attributes[name] : spec.default;
    if (value === undefined && !('default' in spec)) issues.push(`Missing required widget attribute: ${name}.`);
    else {
      attributes[name] = value;
      if (spec.validate && !spec.validate(value)) issues.push(`Invalid widget attribute: ${name}.`);
    }
  }
  for (const name of Object.keys(attributes)) {
    if (!safeAttributeName(name)) issues.push(`Unsafe widget attribute: ${name}.`);
  }
  if (!issues.length && definition.validate) {
    try { issues.push(...normalizeIssues(definition.validate({ name: definition.name, attributes: Object.freeze({ ...attributes }) }))); }
    catch (error) { issues.push(error instanceof Error ? error.message : 'Widget validation failed.'); }
  }
  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
    attributes: Object.freeze(attributes),
  });
}

/** Creates one schema-owned widget node; throws on absent schema support or invalid state. */
export function createWidgetNode(
  editor: Editor,
  definition: WidgetDefinition,
  attrs: WidgetAttributes = {},
  content: readonly Node[] = [],
): Node {
  const type = editor.state.schema.nodes[definition.name];
  if (!type) throw new Error(`The active schema does not include widget ${definition.name}.`);
  return type.create(attrs, content);
}

/** Inserts an inline or block widget and selects the inserted widget node. */
export function insertWidget(
  editor: Editor,
  definition: WidgetDefinition,
  attrs: WidgetAttributes = {},
  content: readonly Node[] = [],
): boolean {
  if (!editor.editable) return false;
  let node: Node;
  try { node = createWidgetNode(editor, definition, attrs, content); }
  catch { return false; }
  if (!node.type.isInline) {
    const { selection, schema } = editor.state;
    const allSelected = selection instanceof AllSelection;
    const index = allSelected
      ? 0
      : selection instanceof GapSelection && selection.parentPath.length === 0
        ? selection.index
        : Math.min(editor.state.doc.childCount, (selection.endPath[0] ?? editor.state.doc.childCount - 1) + 1);
    const trailing = getTextLeaves(node).length === 0
      ? schema.nodes.paragraph?.create({}, [schema.text('')])
      : undefined;
    const transaction = editor.state.createTransaction().replace(
      index,
      allSelected ? editor.state.doc.childCount : index,
      trailing ? [node, trailing] : [node],
    );
    const path = [index];
    const meta: WidgetTransactionMeta = Object.freeze({ action: 'insert', widget: definition.name, path: Object.freeze(path) });
    transaction.setSelection(new NodeSelection(transaction.doc, path)).setMeta(WIDGET_TRANSACTION_META, meta);
    editor.dispatch(transaction);
    return true;
  }
  const { selection } = editor.state;
  if (selection.kind !== 'text' || !selection.isSingleText) return false;
  let target: Node;
  try { target = getNodeAtPath(editor.state.doc, selection.path); }
  catch { return false; }
  if (!target.isText) return false;
  const index = selection.path.at(-1) as number;
  const before = (target.text ?? '').slice(0, selection.from);
  const after = (target.text ?? '').slice(selection.to);
  const replacement = [
    ...(before ? [target.withText(before)] : []),
    node,
    target.withText(after),
  ];
  const path = [...selection.path.slice(0, -1), index + (before ? 1 : 0)];
  const meta: WidgetTransactionMeta = Object.freeze({ action: 'insert', widget: definition.name, path: Object.freeze(path) });
  const transaction = editor.state.createTransaction().replaceNode(selection.path, replacement);
  transaction.setSelection(new NodeSelection(transaction.doc, path)).setMeta(WIDGET_TRANSACTION_META, meta);
  editor.dispatch(transaction);
  return true;
}

/** Returns a widget node at a path, or null for a stale path or different node kind. */
export function getWidgetNode(
  editor: Editor,
  definition: WidgetDefinition,
  path: readonly number[],
): Node | null {
  try {
    const node = getNodeAtPath(editor.state.doc, path);
    return node.type.name === definition.name ? node : null;
  } catch {
    return null;
  }
}

/** Applies a validated attribute patch as exactly one undoable transaction. */
export function updateWidget(
  editor: Editor,
  definition: WidgetDefinition,
  path: readonly number[],
  patch: WidgetAttributes,
): boolean {
  if (!editor.editable || Object.keys(patch).some((name) => !safeAttributeName(name))) return false;
  const node = getWidgetNode(editor, definition, path);
  if (!node) return false;
  for (const name of definition.protectedAttributes) {
    if (Object.prototype.hasOwnProperty.call(patch, name) && !Object.is(patch[name], node.attrs[name])) return false;
  }
  const changed = Object.keys(patch).filter((name) => !Object.is(node.attrs[name], patch[name]));
  if (!changed.length) return false;
  const attributes = { ...node.attrs, ...patch };
  try { node.type.create(attributes, node.content, node.text, node.marks); }
  catch { return false; }
  const meta: WidgetTransactionMeta = Object.freeze({
    action: 'update',
    widget: definition.name,
    path: Object.freeze([...path]),
    attributes: Object.freeze(changed),
  });
  const transaction = editor.state.createTransaction()
    .setNodeAttrs(path, attributes)
    .setMeta(WIDGET_TRANSACTION_META, meta);
  editor.dispatch(transaction);
  return true;
}

/** Removes a widget through the normal schema-aware structural command. */
export function removeWidget(editor: Editor, definition: WidgetDefinition, path: readonly number[]): boolean {
  if (!getWidgetNode(editor, definition, path)) return false;
  return removeNode(editor, path);
}

function pathStartsWith(path: readonly number[], prefix: readonly number[]): boolean {
  return prefix.length <= path.length && prefix.every((part, index) => path[index] === part);
}

/** Moves model selection before/after a widget or selects the widget itself. */
export function exitWidget(
  editor: Editor,
  definition: WidgetDefinition,
  path: readonly number[],
  action: WidgetExitAction,
): boolean {
  if (!getWidgetNode(editor, definition, path)) return false;
  try {
    if (action === 'select') {
      editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, path)));
      return true;
    }
    const candidates = getTextLeaves(editor.state.doc).filter((leaf) => !pathStartsWith(leaf.path, path));
    const target = action === 'before'
      ? [...candidates].reverse().find((leaf) => comparePaths(leaf.path, path) < 0)
      : candidates.find((leaf) => comparePaths(leaf.path, path) > 0);
    if (!target) {
      editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, path)));
      return true;
    }
    const offset = action === 'before' ? target.node.text?.length ?? 0 : 0;
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor(target.path, offset)));
    return true;
  } catch {
    return false;
  }
}

export interface WidgetController {
  readonly editor: Editor;
  readonly definition: WidgetDefinition;
  readonly editable: boolean;
  getPath(): readonly number[];
  getNode(): Node | null;
  getAttributes(): Readonly<WidgetAttributes> | null;
  validate(patch?: WidgetAttributes): WidgetValidationReport;
  update(patch: WidgetAttributes): boolean;
  set(name: string, value: unknown): boolean;
  remove(): boolean;
  select(): boolean;
  exit(action: WidgetExitAction): boolean;
}

/** Creates a renderer-independent controller whose path accessor may follow mappings. */
export function createWidgetController(
  editor: Editor,
  definition: WidgetDefinition,
  getPath: () => readonly number[],
): WidgetController {
  return Object.freeze({
    editor,
    definition,
    get editable() { return editor.editable; },
    getPath: () => Object.freeze([...getPath()]),
    getNode: () => getWidgetNode(editor, definition, getPath()),
    getAttributes: () => getWidgetNode(editor, definition, getPath())?.attrs ?? null,
    validate: (patch: WidgetAttributes = {}) => {
      const current = getWidgetNode(editor, definition, getPath());
      return validateWidgetAttributes(definition, { ...(current?.attrs ?? {}), ...patch });
    },
    update: (patch: WidgetAttributes) => updateWidget(editor, definition, getPath(), patch),
    set: (name: string, value: unknown) => updateWidget(editor, definition, getPath(), { [name]: value }),
    remove: () => removeWidget(editor, definition, getPath()),
    select: () => exitWidget(editor, definition, getPath(), 'select'),
    exit: (action: WidgetExitAction) => exitWidget(editor, definition, getPath(), action),
  });
}

/** Turns a widget definition into a normal independently composable extension. */
export function createWidgetExtension(
  definition: WidgetDefinition,
  options: WidgetExtensionOptions = {},
): FountainExtension {
  const extensionName = options.extensionName ?? `widget:${definition.name}`;
  return defineExtension({
    name: extensionName,
    nodes: {
      [definition.name]: Object.freeze({
        ...definition.nodeSpec,
        ...(options.nodeView ? { nodeView: options.nodeView } : {}),
      }),
    },
    commands: {
      [`insertWidget:${definition.name}`]: (editor: Editor, attrs?: Attributes, content?: readonly Node[]) => (
        insertWidget(editor, definition, attrs, content)
      ),
      [`updateWidget:${definition.name}`]: (editor: Editor, path: readonly number[], attrs: Attributes) => (
        updateWidget(editor, definition, path, attrs)
      ),
      [`removeWidget:${definition.name}`]: (editor: Editor, path: readonly number[]) => (
        removeWidget(editor, definition, path)
      ),
    },
    services: { [`widget:${definition.name}`]: definition },
  });
}
