import type { MarkSpec } from '../../core';
import { normalizeLineHeight } from '../../text-style/values';

export const lineHeight: MarkSpec = {
  attrs: {
    lineHeight: {
      default: '1.5',
      validate: (value) => normalizeLineHeight(value) === value,
    },
  },
  parseDOM: [{
    tag: '[style]',
    getAttrs: (element) => {
      const lineHeight = normalizeLineHeight(element.style.lineHeight);
      return lineHeight ? { lineHeight } : false;
    },
  }],
  toDOM: (mark) => ['span', { style: `line-height:${String(mark.attrs.lineHeight)}` }, 0],
};
