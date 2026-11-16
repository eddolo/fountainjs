import type { NodeSpec } from '../../core';
import { taskCheckboxLabel } from '../../core/task-label';
import { textDirectionAttribute, sharedDirectionGroupAttribute, textDirectionDOMAttributes } from '../../core/text-direction';
export const taskItem: NodeSpec = {
  paragraphFlow: 'transparent', group: 'listItem',
  content: 'block+', attrs: { dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute, checked: { default: false, validate: (value) => typeof value === 'boolean' } },
  toDOM: (node) => ['li', { 'data-type': 'task-item', 'data-checked': String(Boolean(node.attrs.checked)), ...textDirectionDOMAttributes(node.attrs) },
    ['input', {
      type: 'checkbox',
      checked: Boolean(node.attrs.checked),
      'data-fountain-task-toggle': '',
      'aria-label': taskCheckboxLabel(node),
      contenteditable: 'false',
    }],
    ['div', { className: 'fountain-task-item__content' }, 0]],
};
