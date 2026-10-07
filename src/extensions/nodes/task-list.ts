import type { NodeSpec } from '../../core';
import { textDirectionAttribute, textDirectionDOMAttributes } from '../../core/text-direction';
export const taskList: NodeSpec = { group: 'block', content: 'task_item+', attrs: { dir: textDirectionAttribute }, toDOM: node => ['ul', { 'data-type': 'task-list', ...textDirectionDOMAttributes(node.attrs) }, 0] };
