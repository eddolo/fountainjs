import { Node, NodeSpec } from '../../core';
export const heading: NodeSpec = {
  attrs: { level: { default: 1 } },
  content: 'inline*',
  group: 'block',
  toDOM(node: Node) { return [`h${node.attrs.level}`, 0]; },
};