import type { Node } from './node';

export type Attributes = Record<string, unknown>;
export type DOMOutputSpec = string | [string, ...(Attributes | DOMOutputSpec | 0)[]];

export interface AttributeSpec {
  default?: unknown;
  validate?: (value: unknown) => boolean;
}

export interface NodeViewLike {
  dom: HTMLElement;
  contentDOM?: HTMLElement;
  update?(node: Node): boolean;
  destroy?(): void;
}

export interface NodeSpec {
  content?: string;
  attrs?: Record<string, AttributeSpec>;
  group?: string;
  inline?: boolean;
  atom?: boolean;
  code?: boolean;
  toDOM?: (node: Node) => DOMOutputSpec;
  nodeView?: new (node: Node, view: unknown, getPath: () => number[]) => NodeViewLike;
}
