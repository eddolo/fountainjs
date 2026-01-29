import { NodeSpec } from '../../core';

export const listItem: NodeSpec = {
  // A list item can contain paragraphs, and even nested lists.
  content: 'paragraph+ (bullet_list)?',
  toDOM() {
    return ['li', 0];
  },
};