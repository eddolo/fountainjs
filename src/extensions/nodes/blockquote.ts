import type { NodeSpec } from '../../core';
export const blockquote: NodeSpec = { content: 'block+', group: 'block', toDOM: () => ['blockquote', 0] };
