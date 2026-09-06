import type { NodeSpec } from '../../core';
export const listItem: NodeSpec = { content: 'block+', toDOM: () => ['li', 0] };
