import { NodeSpec } from '../../core';

export const bulletList: NodeSpec = {
  group: 'block',
  content: 'list_item+', // Must contain one or more list_item nodes
  toDOM() {
    return ['ul', 0];
  },
};