import type { NodeSpec } from '../../core';
import { textDirectionAttribute, sharedDirectionGroupAttribute, textDirectionDOMAttributes } from '../../core/text-direction';
export const taskList: NodeSpec = { paragraphFlow: 'transparent', group: 'block', content: 'listItem+', attrs: { dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute }, toDOM: node => ['ul', { 'data-type': 'task-list', ...textDirectionDOMAttributes(node.attrs) }, 0] };
