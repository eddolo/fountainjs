import type { NodeSpec } from '../../core';
export const heading: NodeSpec = {
  attrs: {
    level: { default: 1, validate: (value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6 },
    align: { default: 'left', validate: (value) => ['left', 'center', 'right', 'justify'].includes(String(value)) },
  },
  content: 'inline*',
  group: 'block',
  toDOM: (node) => [`h${node.attrs.level}`, node.attrs.align === 'left' ? {} : { style: `text-align:${String(node.attrs.align)}` }, 0],
};
