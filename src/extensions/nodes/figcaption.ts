import { NodeSpec } from '../../core';
export const figcaption: NodeSpec = {
  content: 'inline*',
  toDOM: () => { return ['figcaption', { style: 'text-align: center; color: #666; font-style: italic;' }, 0]; },
};