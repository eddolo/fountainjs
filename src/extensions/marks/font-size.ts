import type { MarkSpec } from '../../core';
import { normalizeFontSize } from '../../text-style/values';

const styleRule = {
  tag: '[style]',
  getAttrs(element: { style: { fontSize?: string } }): { size: string } | false {
    const size = normalizeFontSize(element.style.fontSize);
    return size ? { size } : false;
  },
};

export const fontSize: MarkSpec = {
  attrs: {
    size: {
      default: '16px',
      validate: (value) => normalizeFontSize(value) === value,
    },
  },
  parseHTML: [styleRule],
  parseDOM: [styleRule],
  toDOM: (mark) => ['span', { style: `font-size:${String(mark.attrs.size)}` }, 0],
};
