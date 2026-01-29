import { Node } from './node';

export type DOMOutputSpec = string | [string, any?, ...any[]];
export interface AttributeSpec { default?: any; }
export interface NodeSpec {
  content?: string;
  attrs?: { [name: string]: AttributeSpec };
  group?: string;
  inline?: boolean;
  toDOM?: (node: Node) => DOMOutputSpec;
  nodeView?: new (node: Node, view: any, getPos: () => number) => any;
}