import type { NodeSpec } from '../../core';
import { textDirectionAttribute, sharedDirectionGroupAttribute, textDirectionDOMAttributes } from '../../core/text-direction';
export const taskList: NodeSpec = { paragraphFlow: 'transparent', group: 'block', content: 'task_item+', attrs: { dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute }, toDOM: node => ['ul', { 'data-type': 'task-list', ...textDirectionDOMAttributes(node.attrs) }, 0] };
