import type { NodeSpec } from '../../core';
import { textDirectionAttribute, textDirectionDOMAttributes } from '../../core/text-direction';
export const taskItem: NodeSpec = {
  content: 'block+', attrs: { dir: textDirectionAttribute, checked: { default: false, validate: (value) => typeof value === 'boolean' } },
  toDOM: (node) => ['li', { 'data-type': 'task-item', 'data-checked': String(Boolean(node.attrs.checked)), ...textDirectionDOMAttributes(node.attrs) },
    ['input', {
      type: 'checkbox',
      checked: Boolean(node.attrs.checked),
      'data-fountain-task-toggle': '',
      'aria-label': 'Toggle task',
      contenteditable: 'false',
    }],
    ['div', { className: 'fountain-task-item__content' }, 0]],
};
