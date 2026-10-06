import type { NodeSpec } from '../../core';
import { createTableCellNodeView, tableCellAttributes, tableCellDOMAttributes } from './table-cell-view';
export const tableHeader: NodeSpec = {
  content: 'block+', attrs: {
    ...tableCellAttributes,
    scope: { default: 'col', validate: (value) => ['col', 'row', 'colgroup', 'rowgroup'].includes(String(value)) },
  },
  nodeView: createTableCellNodeView('th'),
  toDOM: (node, context) => ['th', { ...tableCellDOMAttributes(node, context), scope: node.attrs.scope }, 0],
};
