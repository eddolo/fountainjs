import { NodeSpec } from './node-spec';
import { MarkSpec } from './mark-spec';
export interface SchemaSpec { nodes: { [name: string]: NodeSpec }; marks?: { [name: string]: MarkSpec }; }
export class NodeType {
  public readonly name: string; public readonly spec: NodeSpec; public readonly isBlock: boolean; public readonly isInline: boolean;
  constructor(name: string, spec: NodeSpec) { this.name = name; this.spec = spec; this.isInline = !!spec.inline; this.isBlock = !this.isInline; }
}
export class MarkType {
  public readonly name: string; public readonly spec: MarkSpec;
  constructor(name: string, spec: MarkSpec) { this.name = name; this.spec = spec; }
}
export class Schema {
  public readonly spec: SchemaSpec; public readonly nodes: { [name: string]: NodeType }; public readonly marks: { [name: string]: MarkType };
  constructor(spec: SchemaSpec) { this.spec = spec; this.nodes = this.compileNodes(spec.nodes); this.marks = this.compileMarks(spec.marks || {}); }
  private compileNodes(nodes: { [name: string]: NodeSpec }): { [name: string]: NodeType; } { const nodeTypes: { [name: string]: NodeType } = {}; for (const name in nodes) { nodeTypes[name] = new NodeType(name, nodes[name]); } return nodeTypes; }
  private compileMarks(marks: { [name: string]: MarkSpec }): { [name: string]: MarkType; } { const markTypes: { [name: string]: MarkType } = {}; for (const name in marks) { markTypes[name] = new MarkType(name, marks[name]); } return markTypes; }
}