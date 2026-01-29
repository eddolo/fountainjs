import type { NodeType } from './schema';
import type { Mark } from './mark';
export class Node {
  public readonly type: NodeType;
  public readonly attrs: { [name: string]: any };
  public readonly content: Node[];
  public readonly text?: string;
  public readonly marks: readonly Mark[];
  constructor(type: NodeType, attrs: { [name:string]: any }, content: Node[] = [], text?: string, marks: readonly Mark[] = [],) { this.type = type; this.attrs = attrs; this.content = content; this.text = text; this.marks = marks; }
  get isText(): boolean { return this.type.name === 'text'; }
  withText(text: string): Node { if (!this.isText) throw new Error('Cannot call withText on a non-text node.'); return new Node(this.type, this.attrs, [], text, this.marks); }
}