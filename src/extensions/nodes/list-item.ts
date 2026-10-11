import type { NodeSpec } from '../../core';
import { textDirectionAttribute, sharedDirectionGroupAttribute, textDirectionDOMAttributes } from '../../core/text-direction';
export const listItem: NodeSpec = { content: 'block+', attrs: { dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute }, toDOM: node => ['li', textDirectionDOMAttributes(node.attrs), 0] };
