import type { NodeSpec } from '../../core';

export const codeBlock: NodeSpec = {
  group: 'block', content: 'text*', code: true,
  attrs: {
    language: { default: 'text', validate: (value) => typeof value === 'string' && /^[^\s<>&"']{0,50}$/.test(value) },
    lineNumbers: { default: true, validate: (value) => typeof value === 'boolean' },
  },
  toDOM: (node) => ['pre', { 'data-language': node.attrs.language, 'data-line-numbers': String(Boolean(node.attrs.lineNumbers)) }, ['code', 0]],
};
