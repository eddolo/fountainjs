import type { MarkSpec } from '../../core';
import { normalizeTextStyleColor } from '../../text-style/values';

export const highlight: MarkSpec = {
  attrs: { color: { default: '#fff3a3', validate: (value) => normalizeTextStyleColor(value) === value } },
  toDOM: (mark) => ['mark', { style: `background-color:${String(mark.attrs.color)}` }, 0],
};
