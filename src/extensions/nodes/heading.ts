import type { NodeSpec } from '../../core';
export const heading: NodeSpec = {
  attrs: { level: { default: 1, validate: (value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6 } },
  content: 'inline*',
  group: 'block',
  toDOM: (node) => [`h${node.attrs.level}`, 0],
};
