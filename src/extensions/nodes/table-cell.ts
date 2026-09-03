import type { NodeSpec } from '../../core';
export const tableCell: NodeSpec = {
  content: 'block+', attrs: {
    colspan: { default: 1, validate: (value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100 },
    rowspan: { default: 1, validate: (value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100 },
  },
  toDOM: (node) => ['td', { colspan: node.attrs.colspan, rowspan: node.attrs.rowspan }, 0],
};
