import type { NodeSpec } from '../../core';
import { explicitQuoteAppearanceAttribute, quoteDOMAttributes } from '../../core/explicit-emphasis';
import { textDirectionAttribute } from '../../core/text-direction';
export const blockquote: NodeSpec = {
  content: 'block+', group: 'block', attrs: { appearance: explicitQuoteAppearanceAttribute, dir: textDirectionAttribute },
  toDOM: node => ['blockquote', quoteDOMAttributes(node.attrs), 0],
};
