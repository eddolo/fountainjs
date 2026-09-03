import type { NodeSpec } from '../../core';
export const listItem: NodeSpec = { content: 'paragraph+ block*', toDOM: () => ['li', 0] };
