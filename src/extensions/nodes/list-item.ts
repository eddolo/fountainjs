import { listLayoutAttribute, listItemDOMAttributes } from '../../core/list-layout';
import type { NodeSpec } from '../../core';
import { textDirectionAttribute, sharedDirectionGroupAttribute, textDirectionDOMAttributes } from '../../core/text-direction';
export const listItem: NodeSpec = { paragraphFlow: 'transparent', content: 'block+', attrs: { layout: listLayoutAttribute, dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute }, toDOM: node => ['li', { ...textDirectionDOMAttributes(node.attrs), ...listItemDOMAttributes(node) }, 0] };
