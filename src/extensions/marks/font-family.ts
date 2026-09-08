import type { MarkSpec } from '../../core';
import { fontFamilyCSS, normalizeFontFamily } from '../../text-style/values';

const styleRule = {
  tag: '[style]',
  getAttrs(element: { style: { fontFamily?: string } }): { family: string } | false {
    const family = normalizeFontFamily(element.style.fontFamily);
    return family ? { family } : false;
  },
};

export const fontFamily: MarkSpec = {
  attrs: {
    family: {
      default: 'system-ui',
      validate: (value) => normalizeFontFamily(value) === value,
    },
  },
  parseHTML: [styleRule],
  parseDOM: [styleRule],
  toDOM: (mark) => ['span', { style: `font-family:${fontFamilyCSS(mark.attrs.family)}` }, 0],
};
