import type { NodeSpec } from '../../core';
import { textDirectionAttribute, textDirectionDOMAttributes } from '../../core/text-direction';
export const orderedList: NodeSpec = {
  group: 'block', content: 'list_item+', attrs: { dir: textDirectionAttribute, start: { default: 1, validate: (value) => Number.isInteger(value) && (value as number) >= 0 } },
  toDOM: (node) => ['ol', { ...textDirectionDOMAttributes(node.attrs), ...(node.attrs.start === 1 ? {} : { start: node.attrs.start }) }, 0],
};
