import type { Node } from './node';

export type Attributes = Record<string, unknown>;
export type DOMOutputSpec = string | [string, ...(Attributes | DOMOutputSpec | 0)[]];

function freezeAttributeValue(value: unknown, ancestors: ReadonlySet<object>): unknown {
  if (!value || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new TypeError('Node and mark attributes cannot contain circular values.');
  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) return Object.freeze(value.map((item) => freezeAttributeValue(item, nextAncestors)));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.freeze(Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([name, item]) => [name, freezeAttributeValue(item, nextAncestors)]),
  ));
}

/** Clones and recursively freezes portable attribute arrays and plain objects. */
export function freezeAttributes(attrs: Attributes): Readonly<Attributes> {
  return Object.freeze(Object.fromEntries(
    Object.entries(attrs).map(([name, value]) => [name, freezeAttributeValue(value, new Set())]),
  ));
}

export interface AttributeSpec {
  default?: unknown;
  validate?: (value: unknown) => boolean;
}

export interface NodeViewLike {
  dom: HTMLElement;
  contentDOM?: HTMLElement;
  update?(node: Node): boolean;
  selectNode?(): void;
  deselectNode?(): void;
  stopEvent?(event: Event): boolean;
  ignoreMutation?(mutation: MutationRecord): boolean;
  destroy?(): void;
}

export type NodeViewConstructor = new (
  node: Node,
  view: unknown,
  getPath: () => number[],
) => NodeViewLike;

export interface NodeSpec {
  content?: string;
  attrs?: Record<string, AttributeSpec>;
  group?: string;
  inline?: boolean;
  atom?: boolean;
  code?: boolean;
  /** Optional plain-text projection for atoms or other non-text content. */
  toText?: (node: Node) => string;
  /** Optional whole-node invariant for relationships between attributes. */
  validate?: (node: Node) => boolean;
  toDOM?: (node: Node) => DOMOutputSpec;
  nodeView?: NodeViewConstructor;
}
