import type { NodeSpec } from '../../core';
export const tableCell: NodeSpec = {
  content: 'block+', attrs: { colspan: { default: 1 }, rowspan: { default: 1 } },
  toDOM: (node) => ['td', { colspan: node.attrs.colspan, rowspan: node.attrs.rowspan }, 0],
};
