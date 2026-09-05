import * as Y from 'yjs';
import type { Node, NodeJSON } from '../core';
import { STABLE_NODE_ID_PATTERN } from '../node-ids';
import {
  defineStructuredAttribute,
  validateStructuredAttributeValue,
  type ResolvedStructuredAttributeLimits,
  type StructuredAttributeDefinition,
  type StructuredAttributeValue,
} from '../structured-attributes';

const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/;
const SAFE_MAP_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAXIMUM_SHARED_ENTRIES = 100_000;

export interface YjsStructuredAttributesOptions {
  /** Structured node attributes that should merge below their JSON root. */
  readonly definitions: readonly StructuredAttributeDefinition[];
  /** Stable identity attribute used to address nodes. Defaults to `nodeId`. */
  readonly identityAttribute?: string;
  /** Dedicated Y.Map owned by this adapter. Must belong to the same Y.Doc. */
  readonly map?: Y.Map<unknown>;
  /** Top-level Y.Map name. Defaults to `<fragmentName>:structured-attributes`. */
  readonly mapName?: string;
}

interface StructuredEntry {
  readonly key: string;
  readonly definition: StructuredAttributeDefinition;
  readonly node: Node;
  readonly path: readonly number[];
  readonly value: StructuredAttributeValue;
}

interface DecodeState {
  entries: number;
}

function plainObject(value: unknown): value is Record<string, StructuredAttributeValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function equalValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => equalValue(value, right[index]));
  }
  if (!plainObject(left) || !plainObject(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key)
      && equalValue(left[key], right[key]));
}

function safeStructuredKey(key: string, limits: ResolvedStructuredAttributeLimits): boolean {
  return Boolean(key)
    && key.length <= limits.maxKeyLength
    && !/[\u0000-\u001f\u007f]/.test(key)
    && !UNSAFE_KEYS.has(key);
}

function incrementEntries(state: DecodeState, count: number, limits: ResolvedStructuredAttributeLimits): void {
  state.entries += count;
  if (state.entries > limits.maxEntries) {
    throw new Error('A collaborative structured attribute exceeds its entry limit.');
  }
}

function decodeSharedValue(
  value: unknown,
  limits: ResolvedStructuredAttributeLimits,
  depth: number,
  state: DecodeState,
): StructuredAttributeValue {
  if (depth > limits.maxDepth) {
    throw new Error('A collaborative structured attribute exceeds its depth limit.');
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('A collaborative structured attribute contains a non-finite number.');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > limits.maxStringLength) {
      throw new Error('A collaborative structured attribute string exceeds its length limit.');
    }
    return value;
  }
  if (value instanceof Y.Map) {
    incrementEntries(state, value.size, limits);
    const result: Record<string, StructuredAttributeValue> = Object.create(null) as Record<string, StructuredAttributeValue>;
    value.forEach((item, key) => {
      if (!safeStructuredKey(key, limits)) throw new Error(`Unsafe collaborative structured attribute key: ${key || '(empty)'}.`);
      result[key] = decodeSharedValue(item, limits, depth + 1, state);
    });
    return Object.freeze(result);
  }
  if (value instanceof Y.Array) {
    const items = value.toArray();
    incrementEntries(state, items.length, limits);
    return Object.freeze(items.map((item) => decodeSharedValue(item, limits, depth + 1, state)));
  }
  throw new Error('Collaborative structured attributes may contain only nested Y.Map/Y.Array values and JSON primitives.');
}

function sharedValue(value: StructuredAttributeValue): unknown {
  if (Array.isArray(value)) {
    const result = new Y.Array<unknown>();
    if (value.length) result.insert(0, value.map(sharedValue));
    return result;
  }
  if (plainObject(value)) {
    const result = new Y.Map<unknown>();
    Object.entries(value).forEach(([key, item]) => result.set(key, sharedValue(item)));
    return result;
  }
  return value;
}

function replaceArrayValue(array: Y.Array<unknown>, index: number, value: StructuredAttributeValue): void {
  array.delete(index, 1);
  array.insert(index, [sharedValue(value)]);
}

function synchronizeMap(
  map: Y.Map<unknown>,
  desired: Record<string, StructuredAttributeValue>,
  limits: ResolvedStructuredAttributeLimits,
): void {
  [...map.keys()].forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(desired, key)) map.delete(key);
  });
  Object.entries(desired).forEach(([key, value]) => {
    const current = map.get(key);
    if (Array.isArray(value)) {
      if (current instanceof Y.Array) synchronizeArray(current, value, limits);
      else map.set(key, sharedValue(value));
    } else if (plainObject(value)) {
      if (current instanceof Y.Map) synchronizeMap(current, value, limits);
      else map.set(key, sharedValue(value));
    } else if (!Object.is(current, value)) map.set(key, value);
  });
}

function synchronizeArray(
  array: Y.Array<unknown>,
  desired: readonly StructuredAttributeValue[],
  limits: ResolvedStructuredAttributeLimits,
): void {
  const current = decodeSharedValue(array, limits, 0, { entries: 0 });
  if (!Array.isArray(current)) throw new Error('A collaborative structured attribute array became invalid.');

  if (current.length === desired.length) {
    desired.forEach((value, index) => {
      const existing = array.get(index);
      if (Array.isArray(value)) {
        if (existing instanceof Y.Array) synchronizeArray(existing, value, limits);
        else replaceArrayValue(array, index, value);
      } else if (plainObject(value)) {
        if (existing instanceof Y.Map) synchronizeMap(existing, value, limits);
        else replaceArrayValue(array, index, value);
      } else if (!Object.is(existing, value)) replaceArrayValue(array, index, value);
    });
    return;
  }

  let prefix = 0;
  while (prefix < current.length && prefix < desired.length && equalValue(current[prefix], desired[prefix])) prefix++;
  let suffix = 0;
  while (suffix < current.length - prefix
    && suffix < desired.length - prefix
    && equalValue(current[current.length - 1 - suffix], desired[desired.length - 1 - suffix])) suffix++;
  const removed = current.length - prefix - suffix;
  const inserted = desired.slice(prefix, desired.length - suffix);
  if (removed) array.delete(prefix, removed);
  if (inserted.length) array.insert(prefix, inserted.map(sharedValue));
}

function synchronizeRoot(
  current: unknown,
  desired: StructuredAttributeValue,
  limits: ResolvedStructuredAttributeLimits,
): boolean {
  if (Array.isArray(desired)) {
    if (!(current instanceof Y.Array)) return false;
    synchronizeArray(current, desired, limits);
    return true;
  }
  if (!plainObject(desired) || !(current instanceof Y.Map)) return false;
  synchronizeMap(current, desired, limits);
  return true;
}

function normalizedDefinition(definition: StructuredAttributeDefinition): StructuredAttributeDefinition {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('Yjs structured attribute definitions must be created with defineStructuredAttribute().');
  }
  return defineStructuredAttribute({
    nodeType: definition.nodeType,
    attribute: definition.attribute,
    root: definition.root,
    limits: definition.limits,
    ...(definition.validate ? { validate: definition.validate } : {}),
  });
}

function structuredKey(nodeType: string, nodeId: string, attribute: string): string {
  return `v1:${JSON.stringify([nodeType, nodeId, attribute])}`;
}

function nodeJSONAtPath(document: NodeJSON, path: readonly number[]): NodeJSON {
  let current = document;
  for (const index of path) {
    const child = current.content?.[index];
    if (!child) throw new Error(`A collaborative structured attribute points to a stale node path: ${path.join('.')}.`);
    current = child;
  }
  return current;
}

/** Internal bridge kept separate from the portable structured-attribute package. */
export class YjsStructuredAttributeStore {
  readonly map: Y.Map<unknown>;
  readonly identityAttribute: string;
  readonly definitions: readonly StructuredAttributeDefinition[];
  private readonly byNodeType: ReadonlyMap<string, readonly StructuredAttributeDefinition[]>;

  constructor(
    document: Y.Doc,
    options: YjsStructuredAttributesOptions,
    defaultMapName: string,
  ) {
    if (!options || !Array.isArray(options.definitions) || options.definitions.length === 0) {
      throw new TypeError('Yjs structured attributes require at least one definition.');
    }
    this.identityAttribute = options.identityAttribute ?? 'nodeId';
    if (!SAFE_NAME.test(this.identityAttribute) || UNSAFE_KEYS.has(this.identityAttribute)) {
      throw new TypeError('The Yjs structured attribute identity attribute must be a safe node attribute name.');
    }
    if (options.map !== undefined && !(options.map instanceof Y.Map)) {
      throw new TypeError('The Yjs structured attribute map must be a Y.Map from the same Yjs installation.');
    }
    if (options.map && options.map.doc !== document) {
      throw new Error('The Yjs structured attribute map must belong to the supplied Y.Doc.');
    }
    if (options.mapName !== undefined && !SAFE_MAP_NAME.test(options.mapName)) {
      throw new TypeError('The Yjs structured attribute map name must be a safe non-empty name of at most 200 characters.');
    }
    const definitions = options.definitions.map(normalizedDefinition);
    const keys = new Set<string>();
    definitions.forEach((definition) => {
      const key = `${definition.nodeType}:${definition.attribute}`;
      if (keys.has(key)) throw new Error(`Duplicate Yjs structured attribute definition: ${key}.`);
      keys.add(key);
    });
    const byNodeType = new Map<string, StructuredAttributeDefinition[]>();
    definitions.forEach((definition) => {
      byNodeType.set(definition.nodeType, [...(byNodeType.get(definition.nodeType) ?? []), definition]);
    });
    this.definitions = Object.freeze(definitions);
    this.byNodeType = new Map([...byNodeType].map(([type, values]) => [type, Object.freeze(values)]));
    const mapName = options.mapName ?? defaultMapName;
    if (!SAFE_MAP_NAME.test(mapName)) {
      throw new TypeError('The derived Yjs structured attribute map name is invalid; supply an explicit mapName.');
    }
    this.map = options.map ?? document.getMap(mapName);
  }

  initialize(document: Node): void {
    this.synchronizeEntries(this.entries(document), true, false);
  }

  synchronize(document: Node): void {
    this.synchronizeEntries(this.entries(document), false, true);
  }

  overlay(document: Node): NodeJSON {
    if (this.map.size > MAXIMUM_SHARED_ENTRIES) {
      throw new Error('The collaborative structured attribute store exceeds its entry limit.');
    }
    const json = document.toJSON();
    for (const entry of this.entries(document)) {
      const shared = this.map.get(entry.key);
      if (shared === undefined) continue;
      const decoded = decodeSharedValue(shared, entry.definition.limits, 0, { entries: 0 });
      const report = validateStructuredAttributeValue(entry.definition, decoded, {
        node: entry.node,
        path: [],
        action: 'synchronize',
      });
      if (!report.valid || report.value === undefined) {
        throw new Error(`Invalid collaborative structured attribute ${entry.definition.nodeType}.${entry.definition.attribute}: ${report.issues.join(' ')}`);
      }
      const target = nodeJSONAtPath(json, entry.path);
      target.attrs = { ...(target.attrs ?? {}), [entry.definition.attribute]: report.value };
    }
    return json;
  }

  private entries(document: Node): readonly StructuredEntry[] {
    const result: StructuredEntry[] = [];
    const ids = new Map<string, readonly number[]>();
    const visit = (node: Node, path: readonly number[]): void => {
      const definitions = this.byNodeType.get(node.type.name);
      if (definitions?.length) {
        const id = node.attrs[this.identityAttribute];
        if (typeof id !== 'string' || !STABLE_NODE_ID_PATTERN.test(id)) {
          throw new Error(`Node ${node.type.name} at ${path.join('.') || '(root)'} needs a valid ${this.identityAttribute} for granular collaboration.`);
        }
        const duplicate = ids.get(id);
        if (duplicate) {
          throw new Error(`Duplicate structured collaboration node ID ${id} at ${duplicate.join('.')} and ${path.join('.')}.`);
        }
        ids.set(id, path);
        definitions.forEach((definition) => {
          const report = validateStructuredAttributeValue(definition, node.attrs[definition.attribute], {
            node,
            path: [],
            action: 'synchronize',
          });
          if (!report.valid || report.value === undefined) {
            throw new Error(`Invalid structured attribute ${definition.nodeType}.${definition.attribute}: ${report.issues.join(' ')}`);
          }
          result.push(Object.freeze({
            key: structuredKey(node.type.name, id, definition.attribute),
            definition,
            node,
            path: Object.freeze([...path]),
            value: report.value,
          }));
        });
      }
      node.content.forEach((child, index) => visit(child, [...path, index]));
    };
    visit(document, []);
    return Object.freeze(result);
  }

  private synchronizeEntries(entries: readonly StructuredEntry[], onlyMissing: boolean, removeStale: boolean): void {
    if (this.map.size > MAXIMUM_SHARED_ENTRIES) {
      throw new Error('The collaborative structured attribute store exceeds its entry limit.');
    }
    const expected = new Set(entries.map((entry) => entry.key));
    if (removeStale) [...this.map.keys()].forEach((key) => {
      if (!expected.has(key)) this.map.delete(key);
    });
    entries.forEach((entry) => {
      const current = this.map.get(entry.key);
      if (current === undefined) {
        this.map.set(entry.key, sharedValue(entry.value));
        return;
      }
      if (onlyMissing) {
        decodeSharedValue(current, entry.definition.limits, 0, { entries: 0 });
        return;
      }
      if (!synchronizeRoot(current, entry.value, entry.definition.limits)) {
        this.map.set(entry.key, sharedValue(entry.value));
      }
    });
  }
}
