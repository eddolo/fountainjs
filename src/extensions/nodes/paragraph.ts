import type { NodeSpec } from '../../core';
const alignment = { default: 'left', validate: (value: unknown) => ['left', 'center', 'right', 'justify'].includes(String(value)) };
export const paragraph: NodeSpec = {
  content: 'inline*',
  group: 'block',
  attrs: { align: alignment },
  toDOM: (node) => ['p', node.attrs.align === 'left' ? {} : { style: `text-align:${String(node.attrs.align)}` }, 0],
};
