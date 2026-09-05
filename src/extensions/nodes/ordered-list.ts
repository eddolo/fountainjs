import type { NodeSpec } from '../../core';
export const orderedList: NodeSpec = {
  group: 'block', content: 'list_item+', attrs: { start: { default: 1, validate: (value) => Number.isInteger(value) && (value as number) >= 0 } },
  toDOM: (node) => ['ol', node.attrs.start === 1 ? {} : { start: node.attrs.start }, 0],
};
