import type { MarkSpec } from '../../core';
import { normalizeTextStyleColor } from '../../text-style/values';

export const textColor: MarkSpec = {
  attrs: { color: { default: '#171923', validate: (value) => normalizeTextStyleColor(value) === value } },
  toDOM: (mark) => ['span', { style: `color:${String(mark.attrs.color)}` }, 0],
};
