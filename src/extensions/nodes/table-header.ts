import type { NodeSpec } from '../../core';
import { createTableCellNodeView, tableCellAttributes, tableCellDOMAttributes } from './table-cell-view';
export const tableHeader: NodeSpec = {
  content: 'block+', attrs: {
    ...tableCellAttributes,
    scope: { default: 'col', validate: (value) => ['col', 'row', 'colgroup', 'rowgroup'].includes(String(value)) },
  },
  nodeView: createTableCellNodeView('th'),
  toDOM: (node) => ['th', { ...tableCellDOMAttributes(node), scope: node.attrs.scope }, 0],
};
