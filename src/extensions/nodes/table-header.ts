import type { NodeSpec } from '../../core';
export const tableHeader: NodeSpec = {
  content: 'block+', attrs: {
    colspan: { default: 1, validate: (value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100 },
    rowspan: { default: 1, validate: (value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100 },
    scope: { default: 'col', validate: (value) => ['col', 'row', 'colgroup', 'rowgroup'].includes(String(value)) },
  },
  toDOM: (node) => ['th', { colspan: node.attrs.colspan, rowspan: node.attrs.rowspan, scope: node.attrs.scope }, 0],
};
