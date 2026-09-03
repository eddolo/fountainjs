import { Mark, type MarkJSON } from './mark';
import { Node, type NodeJSON } from './node';
import type { Attributes, NodeSpec } from './node-spec';
import type { MarkSpec } from './mark-spec';

export interface SchemaSpec {
  nodes: Record<string, NodeSpec>;
  marks?: Record<string, MarkSpec>;
  topNode?: string;
}

function computeAttrs(
  specs: Record<string, { default?: unknown; validate?: (value: unknown) => boolean }> = {},
  supplied: Attributes = {},
): Attributes {
  const result: Attributes = {};
  for (const [name, spec] of Object.entries(specs)) {
    const value = name in supplied ? supplied[name] : spec.default;
    if (value === undefined && !('default' in spec)) throw new Error(`Missing required attribute: ${name}`);
    if (spec.validate && !spec.validate(value)) throw new Error(`Invalid value for attribute: ${name}`);
    result[name] = value;
  }
  for (const [name, value] of Object.entries(supplied)) {
    if (!(name in result)) result[name] = value;
  }
  return result;
}

export class NodeType {
  readonly isInline: boolean;
  readonly isBlock: boolean;

  constructor(
    public readonly name: string,
    public readonly spec: NodeSpec,
    public readonly schema: Schema,
  ) {
    this.isInline = spec.inline === true || spec.group?.split(/\s+/).includes('inline') === true;
    this.isBlock = !this.isInline;
  }

  create(attrs: Attributes = {}, content: readonly Node[] = [], text?: string, marks: readonly Mark[] = []): Node {
    return new Node(this, computeAttrs(this.spec.attrs, attrs), content, text, marks);
  }
}

export class MarkType {
  constructor(
    public readonly name: string,
    public readonly spec: MarkSpec,
    public readonly schema: Schema,
  ) {}

  create(attrs: Attributes = {}): Mark {
    return new Mark(this, computeAttrs(this.spec.attrs, attrs));
  }
}

export class Schema {
  readonly nodes: Record<string, NodeType>;
  readonly marks: Record<string, MarkType>;
  readonly topNodeType: NodeType;

  constructor(public readonly spec: SchemaSpec) {
    this.nodes = Object.fromEntries(
      Object.entries(spec.nodes).map(([name, nodeSpec]) => [name, new NodeType(name, nodeSpec, this)]),
    );
    this.marks = Object.fromEntries(
      Object.entries(spec.marks ?? {}).map(([name, markSpec]) => [name, new MarkType(name, markSpec, this)]),
    );
    const topNodeName = spec.topNode ?? 'doc';
    const topNodeType = this.nodes[topNodeName];
    if (!topNodeType) throw new Error(`Schema is missing its top node type: ${topNodeName}`);
    if (!this.nodes.text) throw new Error('Schema must define a text node type.');
    this.topNodeType = topNodeType;
  }

  node(
    type: string | NodeType,
    attrs: Attributes = {},
    content: readonly Node[] = [],
    text?: string,
    marks: readonly Mark[] = [],
  ): Node {
    const nodeType = typeof type === 'string' ? this.nodes[type] : type;
    if (!nodeType || nodeType.schema !== this) throw new Error(`Unknown node type: ${String(type)}`);
    return nodeType.create(attrs, content, text, marks);
  }

  text(value: string, marks: readonly Mark[] = []): Node {
    return this.nodes.text.create({}, [], value, marks);
  }

  mark(type: string | MarkType, attrs: Attributes = {}): Mark {
    const markType = typeof type === 'string' ? this.marks[type] : type;
    if (!markType || markType.schema !== this) throw new Error(`Unknown mark type: ${String(type)}`);
    return markType.create(attrs);
  }

  nodeFromJSON(json: NodeJSON): Node {
    return Node.fromJSON(this, json);
  }

  markFromJSON(json: MarkJSON): Mark {
    return Mark.fromJSON(this, json);
  }
}
