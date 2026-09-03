import type { NodeSpec } from '../../core';
export const tableHeader: NodeSpec = {
  content: 'block+', attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, scope: { default: 'col' } },
  toDOM: (node) => ['th', { colspan: node.attrs.colspan, rowspan: node.attrs.rowspan, scope: node.attrs.scope }, 0],
};
