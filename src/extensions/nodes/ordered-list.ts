import type { NodeSpec } from '../../core';
export const orderedList: NodeSpec = {
  group: 'block', content: 'list_item+', attrs: { start: { default: 1, validate: (value) => Number.isInteger(value) && Number(value) >= 1 } },
  toDOM: (node) => ['ol', Number(node.attrs.start) === 1 ? {} : { start: node.attrs.start }, 0],
};
