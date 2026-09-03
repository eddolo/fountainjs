import type { NodeSpec } from '../../core';
export const tableRow: NodeSpec = { content: '(table_header | table_cell)+', toDOM: () => ['tr', 0] };
