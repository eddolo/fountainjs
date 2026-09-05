import type { MarkSpec } from '../../core';
import { normalizeFontSize } from '../../text-style/values';

export const fontSize: MarkSpec = {
  attrs: {
    size: {
      default: '16px',
      validate: (value) => normalizeFontSize(value) === value,
    },
  },
  parseHTML: [{
    tag: '[style]',
    getAttrs: (element) => {
      const size = normalizeFontSize(element.style.fontSize);
      return size ? { size } : false;
    },
  }],
  parseDOM: [{
    tag: '[style]',
    getAttrs: (element) => {
      const size = normalizeFontSize(element.style.fontSize);
      return size ? { size } : false;
    },
  }],
  toDOM: (mark) => ['span', { style: `font-size:${String(mark.attrs.size)}` }, 0],
};
