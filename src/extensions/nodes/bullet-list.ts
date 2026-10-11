import type { NodeSpec } from '../../core';
import { textDirectionAttribute, sharedDirectionGroupAttribute, textDirectionDOMAttributes } from '../../core/text-direction';
export const bulletList: NodeSpec = { group: 'block', content: 'list_item+', attrs: { dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute }, toDOM: node => ['ul', textDirectionDOMAttributes(node.attrs), 0] };
