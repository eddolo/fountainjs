import type { NodeSpec } from '../../core';
export const taskItem: NodeSpec = {
  content: 'paragraph+ block*', attrs: { checked: { default: false } },
  toDOM: (node) => ['li', { 'data-type': 'task-item', 'data-checked': String(Boolean(node.attrs.checked)) }, 0],
};
