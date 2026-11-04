import { listLayoutAttribute, listLayoutDOMAttributes } from '../../core/list-layout';
import type { NodeSpec } from '../../core';
import { textDirectionAttribute, sharedDirectionGroupAttribute, textDirectionDOMAttributes } from '../../core/text-direction';
export const orderedList: NodeSpec = {
  paragraphFlow: 'transparent',
  group: 'block', content: 'list_item+', attrs: { layout: listLayoutAttribute, dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute, start: { default: 1, validate: (value) => Number.isInteger(value) && (value as number) >= 0 } },
  toDOM: (node) => ['ol', { ...textDirectionDOMAttributes(node.attrs), ...listLayoutDOMAttributes(node.attrs.layout), ...(node.attrs.start === 1 ? {} : { start: node.attrs.start }) }, 0],
};
