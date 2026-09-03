import type { NodeSpec } from '../../core';
export const bulletList: NodeSpec = { group: 'block', content: 'list_item+', toDOM: () => ['ul', 0] };
