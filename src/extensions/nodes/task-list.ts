import type { NodeSpec } from '../../core';
export const taskList: NodeSpec = { group: 'block', content: 'task_item+', toDOM: () => ['ul', { 'data-type': 'task-list' }, 0] };
