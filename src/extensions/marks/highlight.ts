import type { MarkSpec } from '../../core';
export const highlight: MarkSpec = {
  attrs: { color: { default: '#fff3a3', validate: (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) } },
  toDOM: (mark) => ['mark', { style: `background-color:${String(mark.attrs.color)}` }, 0],
};
