import type { NodeSpec } from '../../core';
export const taskItem: NodeSpec = {
  content: 'block+', attrs: { checked: { default: false, validate: (value) => typeof value === 'boolean' } },
  toDOM: (node) => ['li', { 'data-type': 'task-item', 'data-checked': String(Boolean(node.attrs.checked)) },
    ['input', {
      type: 'checkbox',
      checked: Boolean(node.attrs.checked),
      'data-fountain-task-toggle': '',
      'aria-label': 'Toggle task',
      contenteditable: 'false',
    }],
    ['div', { className: 'fountain-task-item__content' }, 0]],
};
