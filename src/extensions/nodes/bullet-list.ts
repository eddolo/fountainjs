import { listLayoutAttribute, listLayoutDOMAttributes } from '../../core/list-layout';
import type { NodeSpec } from '../../core';
import { textDirectionAttribute, sharedDirectionGroupAttribute, textDirectionDOMAttributes } from '../../core/text-direction';
export const bulletList: NodeSpec = { paragraphFlow: 'transparent', group: 'block', content: 'listItem+', attrs: { layout: listLayoutAttribute, dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute }, toDOM: node => ['ul', { ...textDirectionDOMAttributes(node.attrs), ...listLayoutDOMAttributes(node.attrs.layout) }, 0] };
