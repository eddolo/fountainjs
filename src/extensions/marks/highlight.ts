import type { MarkSpec } from '../../core';
export const highlight: MarkSpec = {
  attrs: { color: { default: '#fff3a3' } },
  toDOM: (mark) => ['mark', { style: `background-color:${String(mark.attrs.color)}` }, 0],
};
