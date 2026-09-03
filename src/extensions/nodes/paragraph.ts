import type { NodeSpec } from '../../core';
export const paragraph: NodeSpec = { content: 'inline*', group: 'block', toDOM: () => ['p', 0] };
