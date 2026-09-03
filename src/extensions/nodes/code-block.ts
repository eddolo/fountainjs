import type { NodeSpec } from '../../core';
export const codeBlock: NodeSpec = {
  group: 'block', content: 'text*', code: true,
  attrs: { language: { default: 'text' }, lineNumbers: { default: true } },
  toDOM: (node) => ['pre', { 'data-language': node.attrs.language, 'data-line-numbers': String(Boolean(node.attrs.lineNumbers)) }, ['code', 0]],
};
