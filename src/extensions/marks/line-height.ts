import type { MarkSpec } from '../../core';
import { normalizeLineHeight } from '../../text-style/values';

const styleRule = {
  tag: '[style]',
  getAttrs(element: { style: { lineHeight?: string } }): { lineHeight: string } | false {
    const lineHeight = normalizeLineHeight(element.style.lineHeight);
    return lineHeight ? { lineHeight } : false;
  },
};

export const lineHeight: MarkSpec = {
  attrs: {
    lineHeight: {
      default: '1.5',
      validate: (value) => normalizeLineHeight(value) === value,
    },
  },
  parseHTML: [styleRule],
  parseDOM: [styleRule],
  toDOM: (mark) => ['span', { style: `line-height:${String(mark.attrs.lineHeight)}` }, 0],
};
