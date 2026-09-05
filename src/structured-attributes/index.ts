import type { Editor, Node } from '../core';
import { getNodeAtPath } from '../core/transaction/path';

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAXIMUM_PATH_LENGTH = 64;

export const STRUCTURED_ATTRIBUTE_TRANSACTION_META = 'fountain$structuredAttribute';

export type StructuredAttributePrimitive = null | boolean | number | string;
export type StructuredAttributeValue =
  | StructuredAttributePrimitive
  | { readonly [name: string]: StructuredAttributeValue }
  | readonly StructuredAttributeValue[];
export type StructuredAttributePath = readonly (string | number)[];
export type StructuredAttributeRoot = 'object' | 'array' | 'either';
export type StructuredAttributeAction = 'set' | 'delete' | 'insert' | 'delete-range';

export interface StructuredAttributeLimits {
  /** Maximum nested object/array levels. Defaults to 32. */
  readonly maxDepth?: number;
  /** Maximum combined object properties and array items. Defaults to 10,000. */
  readonly maxEntries?: number;
  /** Maximum length of one object key. Defaults to 128. */
  readonly maxKeyLength?: number;
  /** Maximum length of one string. Defaults to 1,000,000. */
  readonly maxStringLength?: number;
  /** Maximum JSON representation length. Defaults to 1,000,000. */
  readonly maxEncodedLength?: number;
}

export interface ResolvedStructuredAttributeLimits {
  readonly maxDepth: number;
  readonly maxEntries: number;
  readonly maxKeyLength: number;
  readonly maxStringLength: number;
  readonly maxEncodedLength: number;
}

export type StructuredAttributeValidationResult =
  | boolean
  | string
  | readonly string[]
  | null
  | undefined;

export interface StructuredAttributeValidationContext {
  readonly node?: Node;
  readonly path: StructuredAttributePath;
  readonly action: StructuredAttributeAction | 'synchronize';
}

export interface StructuredAttributeDefinitionOptions {
  readonly nodeType: string;
  readonly attribute: string;
  readonly root?: StructuredAttributeRoot;
  readonly limits?: StructuredAttributeLimits;
  readonly validate?: (
    value: StructuredAttributeValue,
    context: StructuredAttributeValidationContext,
  ) => StructuredAttributeValidationResult;
}

export interface StructuredAttributeDefinition {
  readonly nodeType: string;
  readonly attribute: string;
  readonly root: StructuredAttributeRoot;
  readonly limits: ResolvedStructuredAttributeLimits;
  readonly validate?: StructuredAttributeDefinitionOptions['validate'];
}

export interface StructuredAttributeValidationReport {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly value?: StructuredAttributeValue;
}

export interface StructuredAttributeTransactionMeta {
  readonly action: StructuredAttributeAction;
  readonly nodePath: readonly number[];
  readonly nodeType: string;
  readonly attribute: string;
  readonly path: StructuredAttributePath;
  readonly index?: number;
  readonly count?: number;
}

const DEFAULT_LIMITS: ResolvedStructuredAttributeLimits = Object.freeze({
  maxDepth: 32,
  maxEntries: 10_000,
  maxKeyLength: 128,
  maxStringLength: 1_000_000,
  maxEncodedLength: 1_000_000,
});

function safeName(value: string): boolean {
  return NAME_PATTERN.test(value) && !UNSAFE_KEYS.has(value);
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || Number(resolved) < minimum || Number(resolved) > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return Number(resolved);
}

function resolveLimits(limits: StructuredAttributeLimits = {}): ResolvedStructuredAttributeLimits {
  return Object.freeze({
    maxDepth: boundedInteger(limits.maxDepth, DEFAULT_LIMITS.maxDepth, 1, 100, 'Structured attribute maxDepth'),
    maxEntries: boundedInteger(limits.maxEntries, DEFAULT_LIMITS.maxEntries, 1, 100_000, 'Structured attribute maxEntries'),
    maxKeyLength: boundedInteger(limits.maxKeyLength, DEFAULT_LIMITS.maxKeyLength, 1, 1_024, 'Structured attribute maxKeyLength'),
    maxStringLength: boundedInteger(limits.maxStringLength, DEFAULT_LIMITS.maxStringLength, 0, 10_000_000, 'Structured attribute maxStringLength'),
    maxEncodedLength: boundedInteger(limits.maxEncodedLength, DEFAULT_LIMITS.maxEncodedLength, 2, 10_000_000, 'Structured attribute maxEncodedLength'),
  });
}

function normalizeIssues(result: StructuredAttributeValidationResult): readonly string[] {
  if (result == null || result === true) return Object.freeze([]);
  if (result === false) return Object.freeze(['Structured attribute validation rejected this value.']);
  const issues = typeof result === 'string' ? [result] : [...result];
  return Object.freeze(issues
    .filter((issue) => typeof issue === 'string' && issue.trim())
    .map((issue) => issue.trim()));
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneStructuredValue(
  value: unknown,
  limits: ResolvedStructuredAttributeLimits,
  depth: number,
  state: { entries: number; readonly ancestors: Set<object> },
): StructuredAttributeValue {
  if (depth > limits.maxDepth) throw new RangeError('Structured attribute value exceeds its depth limit.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Structured attribute numbers must be finite.');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > limits.maxStringLength) throw new RangeError('Structured attribute string exceeds its length limit.');
    return value;
  }
  if (!Array.isArray(value) && !plainObject(value)) {
    throw new TypeError('Structured attributes may contain only JSON objects, arrays, strings, finite numbers, booleans, and null.');
  }
  if (state.ancestors.has(value)) throw new TypeError('Structured attributes cannot contain circular values.');
  state.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      state.entries += value.length;
      if (state.entries > limits.maxEntries) throw new RangeError('Structured attribute value exceeds its entry limit.');
      return Object.freeze(value.map((item) => cloneStructuredValue(item, limits, depth + 1, state)));
    }
    const entries = Object.entries(value);
    state.entries += entries.length;
    if (state.entries > limits.maxEntries) throw new RangeError('Structured attribute value exceeds its entry limit.');
    const cloned: Record<string, StructuredAttributeValue> = Object.create(null) as Record<string, StructuredAttributeValue>;
    for (const [name, item] of entries) {
      if (!name || name.length > limits.maxKeyLength || /[\u0000-\u001f\u007f]/.test(name) || UNSAFE_KEYS.has(name)) {
        throw new TypeError(`Unsafe structured attribute key: ${name || '(empty)'}.`);
      }
      cloned[name] = cloneStructuredValue(item, limits, depth + 1, state);
    }
    return Object.freeze(cloned);
  } finally {
    state.ancestors.delete(value);
  }
}

function validRoot(value: StructuredAttributeValue, root: StructuredAttributeRoot): boolean {
  if (root === 'array') return Array.isArray(value);
  if (root === 'object') return plainObject(value);
  return Array.isArray(value) || plainObject(value);
}

function normalizeStructuredFragment(
  definition: StructuredAttributeDefinition,
  value: unknown,
): StructuredAttributeValue | undefined {
  try {
    const normalized = cloneStructuredValue(value, definition.limits, 0, { entries: 0, ancestors: new Set() });
    return JSON.stringify(normalized).length <= definition.limits.maxEncodedLength ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function validPath(path: StructuredAttributePath, limits: ResolvedStructuredAttributeLimits): boolean {
  return Array.isArray(path)
    && path.length <= Math.min(MAXIMUM_PATH_LENGTH, limits.maxDepth)
    && path.every((part) => typeof part === 'number'
      ? Number.isInteger(part) && part >= 0 && part < limits.maxEntries
      : typeof part === 'string'
        && Boolean(part)
        && part.length <= limits.maxKeyLength
        && !/[\u0000-\u001f\u007f]/.test(part)
        && !UNSAFE_KEYS.has(part)
      );
}

/** Defines one structured node attribute and snapshots every safety limit. */
export function defineStructuredAttribute(
  options: StructuredAttributeDefinitionOptions,
): StructuredAttributeDefinition {
  if (!options || !safeName(options.nodeType)) {
    throw new TypeError('Structured attribute nodeType must be a safe non-empty node name.');
  }
  if (!safeName(options.attribute)) {
    throw new TypeError('Structured attribute names must be safe non-empty attribute names.');
  }
  const root = options.root ?? 'either';
  if (root !== 'object' && root !== 'array' && root !== 'either') {
    throw new TypeError('Structured attribute root must be object, array, or either.');
  }
  if (options.validate !== undefined && typeof options.validate !== 'function') {
    throw new TypeError('Structured attribute validate must be a function.');
  }
  return Object.freeze({
    nodeType: options.nodeType,
    attribute: options.attribute,
    root,
    limits: resolveLimits(options.limits),
    ...(options.validate ? { validate: options.validate } : {}),
  });
}

/** Validates, clones, and recursively freezes one portable structured value. */
export function validateStructuredAttributeValue(
  definition: StructuredAttributeDefinition,
  value: unknown,
  context: StructuredAttributeValidationContext = Object.freeze({ path: [], action: 'synchronize' }),
): StructuredAttributeValidationReport {
  const issues: string[] = [];
  let normalized: StructuredAttributeValue | undefined;
  if (!validPath(context.path, definition.limits)) {
    issues.push('Structured attribute path is invalid or exceeds its limit.');
  } else {
    try {
      normalized = cloneStructuredValue(value, definition.limits, 0, { entries: 0, ancestors: new Set() });
      const encoded = JSON.stringify(normalized);
      if (encoded.length > definition.limits.maxEncodedLength) {
        issues.push('Structured attribute value exceeds its encoded length limit.');
      }
      if (!validRoot(normalized, definition.root)) {
        const expectedRoot = definition.root === 'either'
          ? 'an object or array'
          : definition.root === 'object' ? 'an object' : 'an array';
        issues.push(`Structured attribute ${definition.attribute} must have ${expectedRoot} root.`);
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : 'Structured attribute validation failed.');
    }
  }
  if (!issues.length && normalized !== undefined && definition.validate) {
    try {
      issues.push(...normalizeIssues(definition.validate(normalized, Object.freeze({
        ...(context.node ? { node: context.node } : {}),
        path: Object.freeze([...context.path]),
        action: context.action,
      }))));
    } catch (error) {
      issues.push(error instanceof Error ? error.message : 'Structured attribute validation failed.');
    }
  }
  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
    ...(issues.length || normalized === undefined ? {} : { value: normalized }),
  });
}

function equalValue(left: StructuredAttributeValue, right: StructuredAttributeValue): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => equalValue(item, right[index] as StructuredAttributeValue));
  }
  if (!plainObject(left) || !plainObject(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((name) => Object.prototype.hasOwnProperty.call(right, name)
      && equalValue(left[name] as StructuredAttributeValue, right[name] as StructuredAttributeValue));
}

function valueAt(root: StructuredAttributeValue, path: StructuredAttributePath): StructuredAttributeValue | undefined {
  let current: StructuredAttributeValue | undefined = root;
  for (const part of path) {
    if (typeof part === 'number') {
      if (!Array.isArray(current) || part >= current.length) return undefined;
      current = current[part];
    } else {
      if (!plainObject(current) || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
      current = current[part] as StructuredAttributeValue;
    }
  }
  return current;
}

function replaceAt(
  root: StructuredAttributeValue,
  path: StructuredAttributePath,
  replace: (parent: StructuredAttributeValue, part: string | number) => StructuredAttributeValue | undefined,
): StructuredAttributeValue | undefined {
  if (!path.length) return undefined;
  const [part, ...rest] = path;
  if (!rest.length) return replace(root, part as string | number);
  if (typeof part === 'number') {
    if (!Array.isArray(root) || part >= root.length) return undefined;
    const child = replaceAt(root[part] as StructuredAttributeValue, rest, replace);
    if (child === undefined) return undefined;
    const next = [...root];
    next[part] = child;
    return Object.freeze(next);
  }
  if (!plainObject(root) || !Object.prototype.hasOwnProperty.call(root, part)) return undefined;
  const child = replaceAt(root[part] as StructuredAttributeValue, rest, replace);
  if (child === undefined) return undefined;
  return Object.freeze(Object.assign(Object.create(null), root, { [part]: child })) as StructuredAttributeValue;
}

function setAt(root: StructuredAttributeValue, path: StructuredAttributePath, value: StructuredAttributeValue): StructuredAttributeValue | undefined {
  if (!path.length) return value;
  return replaceAt(root, path, (parent, part) => {
    if (typeof part === 'number') {
      if (!Array.isArray(parent) || part >= parent.length) return undefined;
      const next = [...parent];
      next[part] = value;
      return Object.freeze(next);
    }
    if (!plainObject(parent)) return undefined;
    return Object.freeze(Object.assign(Object.create(null), parent, { [part]: value })) as StructuredAttributeValue;
  });
}

function deleteAt(root: StructuredAttributeValue, path: StructuredAttributePath): StructuredAttributeValue | undefined {
  return replaceAt(root, path, (parent, part) => {
    if (typeof part === 'number') {
      if (!Array.isArray(parent) || part >= parent.length) return undefined;
      const next = [...parent];
      next.splice(part, 1);
      return Object.freeze(next);
    }
    if (!plainObject(parent) || !Object.prototype.hasOwnProperty.call(parent, part)) return undefined;
    const next: Record<string, StructuredAttributeValue> = Object.assign(Object.create(null), parent);
    delete next[part];
    return Object.freeze(next);
  });
}

function changeArray(
  root: StructuredAttributeValue,
  path: StructuredAttributePath,
  update: (value: readonly StructuredAttributeValue[]) => readonly StructuredAttributeValue[] | undefined,
): StructuredAttributeValue | undefined {
  const target = valueAt(root, path);
  if (!Array.isArray(target)) return undefined;
  const changed = update(target);
  if (!changed) return undefined;
  return path.length ? setAt(root, path, Object.freeze([...changed])) : Object.freeze([...changed]);
}

function transactionMeta(
  action: StructuredAttributeAction,
  nodePath: readonly number[],
  definition: StructuredAttributeDefinition,
  path: StructuredAttributePath,
  details: { readonly index?: number; readonly count?: number } = {},
): StructuredAttributeTransactionMeta {
  return Object.freeze({
    action,
    nodePath: Object.freeze([...nodePath]),
    nodeType: definition.nodeType,
    attribute: definition.attribute,
    path: Object.freeze([...path]),
    ...details,
  });
}

function commit(
  editor: Editor,
  nodePath: readonly number[],
  definition: StructuredAttributeDefinition,
  nextValue: StructuredAttributeValue | undefined,
  meta: StructuredAttributeTransactionMeta,
): boolean {
  if (!editor.editable || nextValue === undefined) return false;
  let node: Node;
  try { node = getNodeAtPath(editor.state.doc, nodePath); }
  catch { return false; }
  if (node.type.name !== definition.nodeType) return false;
  const report = validateStructuredAttributeValue(definition, nextValue, {
    node,
    path: meta.path,
    action: meta.action,
  });
  if (!report.valid || report.value === undefined) return false;
  if (equalValue(node.attrs[definition.attribute] as StructuredAttributeValue, report.value)) return false;
  try {
    node.type.create(
      { ...node.attrs, [definition.attribute]: report.value },
      node.content,
      node.text,
      node.marks,
    );
  } catch { return false; }
  return editor.dispatch(editor.state.createTransaction()
    .setNodeAttrs(nodePath, { [definition.attribute]: report.value })
    .setMeta(STRUCTURED_ATTRIBUTE_TRANSACTION_META, meta));
}

/** Returns a validated structured attribute, or undefined for a stale/wrong node. */
export function getStructuredAttribute(
  editor: Editor,
  nodePath: readonly number[],
  definition: StructuredAttributeDefinition,
): StructuredAttributeValue | undefined {
  try {
    const node = getNodeAtPath(editor.state.doc, nodePath);
    if (node.type.name !== definition.nodeType) return undefined;
    return validateStructuredAttributeValue(definition, node.attrs[definition.attribute], {
      node,
      path: [],
      action: 'synchronize',
    }).value;
  } catch { return undefined; }
}

/** Sets one object property, array item, or the complete root in one transaction. */
export function setStructuredAttribute(
  editor: Editor,
  nodePath: readonly number[],
  definition: StructuredAttributeDefinition,
  path: StructuredAttributePath,
  value: unknown,
): boolean {
  if (!validPath(path, definition.limits)) return false;
  const current = getStructuredAttribute(editor, nodePath, definition);
  if (current === undefined) return false;
  const normalized = normalizeStructuredFragment(definition, value);
  if (normalized === undefined) return false;
  const next = setAt(current, path, normalized);
  return commit(editor, nodePath, definition, next, transactionMeta('set', nodePath, definition, path));
}

/** Deletes one object property or array item. The structured root itself cannot be deleted. */
export function deleteStructuredAttribute(
  editor: Editor,
  nodePath: readonly number[],
  definition: StructuredAttributeDefinition,
  path: StructuredAttributePath,
): boolean {
  if (!path.length || !validPath(path, definition.limits)) return false;
  const current = getStructuredAttribute(editor, nodePath, definition);
  const next = current === undefined ? undefined : deleteAt(current, path);
  return commit(editor, nodePath, definition, next, transactionMeta('delete', nodePath, definition, path));
}

/** Inserts portable items into a nested array without replacing the array root. */
export function insertStructuredAttributeItems(
  editor: Editor,
  nodePath: readonly number[],
  definition: StructuredAttributeDefinition,
  path: StructuredAttributePath,
  index: number,
  values: readonly unknown[],
): boolean {
  if (!validPath(path, definition.limits) || !Number.isInteger(index) || index < 0 || !values.length) return false;
  const normalized = values.map((value) => normalizeStructuredFragment(definition, value));
  if (normalized.some((value) => value === undefined)) return false;
  const current = getStructuredAttribute(editor, nodePath, definition);
  const next = current === undefined ? undefined : changeArray(current, path, (array) => {
    if (index > array.length || array.length + normalized.length > definition.limits.maxEntries) return undefined;
    const changed = [...array];
    changed.splice(index, 0, ...(normalized as StructuredAttributeValue[]));
    return changed;
  });
  return commit(editor, nodePath, definition, next, transactionMeta(
    'insert', nodePath, definition, path, { index, count: normalized.length },
  ));
}

/** Deletes a bounded contiguous range from a nested array. */
export function deleteStructuredAttributeItems(
  editor: Editor,
  nodePath: readonly number[],
  definition: StructuredAttributeDefinition,
  path: StructuredAttributePath,
  index: number,
  count = 1,
): boolean {
  if (!validPath(path, definition.limits)
    || !Number.isInteger(index) || index < 0
    || !Number.isInteger(count) || count < 1) return false;
  const current = getStructuredAttribute(editor, nodePath, definition);
  const next = current === undefined ? undefined : changeArray(current, path, (array) => {
    if (index >= array.length || index + count > array.length) return undefined;
    const changed = [...array];
    changed.splice(index, count);
    return changed;
  });
  return commit(editor, nodePath, definition, next, transactionMeta(
    'delete-range', nodePath, definition, path, { index, count },
  ));
}
