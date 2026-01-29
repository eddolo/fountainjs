import { NodeSpec } from '../../core';
export const table: NodeSpec = {
  group: 'block', content: 'table_row+',
  toDOM() { return ['table', { style: 'border-collapse: collapse; width: 100%;' }, ['tbody', 0]]; },
};