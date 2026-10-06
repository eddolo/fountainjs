import type { NodeSpec } from '../../core';
import { explicitQuoteAppearanceAttribute, quoteDOMAttributes } from '../../core/explicit-emphasis';
export const blockquote: NodeSpec = {
  content: 'block+', group: 'block', attrs: { appearance: explicitQuoteAppearanceAttribute },
  toDOM: node => node.attrs.appearance === 'explicit' ? ['blockquote', quoteDOMAttributes(node.attrs), 0] : ['blockquote', 0],
};
