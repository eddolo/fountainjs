import { Mark, type MarkJSON } from './mark';
import { Node, type NodeJSON } from './node';
import type { Attributes, NodeSpec } from './node-spec';
import type { MarkSpec } from './mark-spec';
import { matchesContentExpression } from './content-expression';

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
    const node = new Node(this, computeAttrs(this.spec.attrs, attrs), content, text, marks);
    if (this.spec.validate && !this.spec.validate(node)) throw new Error(`Invalid node invariant: ${this.name}`);
    return node;
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
    const node = Node.fromJSON(this, json);
    this.validate(node);
    return node;
  }

  markFromJSON(json: MarkJSON): Mark {
    return Mark.fromJSON(this, json);
  }

  validate(node: Node): void {
    const visit = (current: Node, path: readonly number[]): void => {
      if (current.type.schema !== this) throw new Error(`Node at ${path.join('.') || 'root'} belongs to another schema.`);
      computeAttrs(current.type.spec.attrs, current.attrs);
      if (current.type.spec.validate && !current.type.spec.validate(current)) {
        throw new Error(`Invalid node invariant: ${current.type.name} at ${path.join('.') || 'root'}`);
      }
      current.marks.forEach((mark) => {
        if (mark.type.schema !== this) throw new Error(`Mark on ${path.join('.') || 'root'} belongs to another schema.`);
        computeAttrs(mark.type.spec.attrs, mark.attrs);
      });
      if (current.isText) {
        if (current.content.length) throw new Error(`Text node at ${path.join('.')} cannot contain children.`);
        return;
      }
      if (current.marks.length) throw new Error(`Only text nodes may carry marks (${path.join('.') || 'root'}).`);
      if (current.type.spec.atom && current.content.length) throw new Error(`Atom node ${current.type.name} cannot contain children.`);
      const expression = current.type.spec.content;
      if (expression) {
        if (!matchesContentExpression(current.content, expression)) {
          throw new Error(`Content of ${current.type.name} at ${path.join('.') || 'root'} does not match "${expression}".`);
        }
      } else if (current.content.length) {
        throw new Error(`Node ${current.type.name} does not allow child content.`);
      }
      current.content.forEach((child, index) => visit(child, [...path, index]));
    };
    visit(node, []);
  }
}
