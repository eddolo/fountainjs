import type { NodeSpec } from '../../core';
export const table: NodeSpec = { group: 'block', content: 'table_row+', toDOM: () => ['table', ['tbody', 0]] };
