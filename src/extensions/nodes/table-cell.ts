import { NodeSpec } from '../../core';
export const tableCell: NodeSpec = {
  content: 'paragraph+', attrs: { colspan: { default: 1 }, rowspan: { default: 1 }, },
  toDOM(node) { const attrs = { style: 'border: 1px solid #ddd; padding: 8px;', ...node.attrs, }; return ['td', attrs, 0]; },
};