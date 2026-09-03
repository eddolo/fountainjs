import type { NodeSpec } from '../../core';
import { createTableCellNodeView, tableCellAttributes, tableCellDOMAttributes } from './table-cell-view';
export const tableCell: NodeSpec = {
  content: 'block+', attrs: tableCellAttributes,
  nodeView: createTableCellNodeView('td'),
  toDOM: (node) => ['td', tableCellDOMAttributes(node), 0],
};
