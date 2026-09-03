import type { NodeSpec } from '../../core';
export const figcaption: NodeSpec = { content: 'inline*', toDOM: () => ['figcaption', 0] };
