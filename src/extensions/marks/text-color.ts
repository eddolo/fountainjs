import type { MarkSpec } from '../../core';

export const textColor: MarkSpec = {
  attrs: { color: { default: '#171923', validate: (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) } },
  toDOM: (mark) => ['span', { style: `color:${String(mark.attrs.color)}` }, 0],
};
