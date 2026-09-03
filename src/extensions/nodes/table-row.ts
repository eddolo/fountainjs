import type { NodeSpec } from '../../core';
// Rows covered completely by a rowspan are valid HTML table geometry and own no cells.
export const tableRow: NodeSpec = { content: '(table_header | table_cell)*', toDOM: () => ['tr', 0] };
