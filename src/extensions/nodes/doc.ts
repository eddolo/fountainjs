import type { NodeSpec } from '../../core';
import { isDocumentPageSettings } from '../../core/page-settings';
export const doc: NodeSpec = {
  content: 'block+', toDOM: () => ['div', 0],
  validate: node => node.attrs.pageSettings == null || isDocumentPageSettings(node.attrs.pageSettings),
};
