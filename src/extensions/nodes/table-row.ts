import { NodeSpec } from '../../core';
export const tableRow: NodeSpec = { content: 'table_cell+', toDOM() { return ['tr', 0]; }, };