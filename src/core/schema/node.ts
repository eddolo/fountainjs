import { Mark, type MarkJSON } from './mark';
import type { Attributes } from './node-spec';
import type { NodeType, Schema } from './schema';

export interface NodeJSON {
  type: string;
  attrs?: Attributes;
  content?: readonly NodeJSON[];
  text?: string;
  marks?: readonly MarkJSON[];
}

export type DescendantVisitor = (node: Node, path: number[], parent: Node | null) => boolean | void;

export class Node {
  readonly attrs: Readonly<Attributes>;
  readonly content: readonly Node[];
  readonly marks: readonly Mark[];

  constructor(
    public readonly type: NodeType,
    attrs: Attributes = {},
    content: readonly Node[] = [],
    public readonly text?: string,
    marks: readonly Mark[] = [],
  ) {
    if (type.name === 'text' && text === undefined) throw new Error('Text nodes require a text value.');
    if (type.name === 'text' && content.length) throw new Error('Text nodes cannot contain child nodes.');
    if (type.name !== 'text' && text !== undefined) throw new Error(`${type.name} nodes cannot carry text directly.`);
    this.attrs = Object.freeze({ ...attrs });
    this.content = Object.freeze([...content]);
    this.marks = Object.freeze([...marks]);
  }

  get isText(): boolean { return this.type.name === 'text'; }
  get isBlock(): boolean { return this.type.isBlock; }
  get childCount(): number { return this.content.length; }
  get textContent(): string {
    if (this.isText) return this.text ?? '';
    return this.type.spec.toText?.(this) ?? this.content.map((child) => child.textContent).join('');
  }
  get nodeSize(): number { return this.isText ? (this.text?.length ?? 0) : 2 + this.content.reduce((size, child) => size + child.nodeSize, 0); }

  child(index: number): Node {
    const child = this.content[index];
    if (!child) throw new RangeError(`No child at index ${index}.`);
    return child;
  }

  copy(content: readonly Node[] = this.content): Node {
    return new Node(this.type, this.attrs, content, undefined, this.marks);
  }

  withText(text: string): Node {
    if (!this.isText) throw new Error('Cannot set text on a non-text node.');
    return new Node(this.type, this.attrs, [], text, this.marks);
  }

  withMarks(marks: readonly Mark[]): Node {
    if (!this.isText) throw new Error('Marks can only be applied to text nodes.');
    return new Node(this.type, this.attrs, [], this.text, marks);
  }

  withAttrs(attrs: Attributes): Node {
    return new Node(this.type, attrs, this.content, this.text, this.marks);
  }

  descendants(visitor: DescendantVisitor, path: number[] = [], parent: Node | null = null): void {
    if (visitor(this, path, parent) === false) return;
    this.content.forEach((child, index) => child.descendants(visitor, [...path, index], this));
  }

  eq(other: Node): boolean {
    return this.type === other.type
      && this.text === other.text
      && JSON.stringify(this.attrs) === JSON.stringify(other.attrs)
      && this.marks.length === other.marks.length
      && this.marks.every((mark, index) => mark.eq(other.marks[index]))
      && this.content.length === other.content.length
      && this.content.every((child, index) => child.eq(other.content[index]));
  }

  toJSON(): NodeJSON {
    const json: NodeJSON = { type: this.type.name };
    if (Object.keys(this.attrs).length) json.attrs = { ...this.attrs };
    if (this.isText) json.text = this.text ?? '';
    if (this.marks.length) json.marks = this.marks.map((mark) => mark.toJSON());
    if (this.content.length) json.content = this.content.map((child) => child.toJSON());
    return json;
  }

  static fromJSON(schema: Schema, json: NodeJSON): Node {
    if (!json || typeof json.type !== 'string') throw new TypeError('Invalid node JSON.');
    const marks = (json.marks ?? []).map((mark) => Mark.fromJSON(schema, mark));
    if (json.type === 'text') {
      if (typeof json.text !== 'string') throw new TypeError('Text node JSON requires a string value.');
      return schema.text(json.text, marks);
    }
    if (json.text !== undefined) throw new TypeError(`Non-text node ${json.type} cannot contain a text property.`);
    return schema.node(json.type, json.attrs ?? {}, (json.content ?? []).map((child) => Node.fromJSON(schema, child)), undefined, marks);
  }
}
