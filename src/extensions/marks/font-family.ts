import type { MarkSpec } from '../../core';
import { fontFamilyCSS, normalizeFontFamily } from '../../text-style/values';

export const fontFamily: MarkSpec = {
  attrs: {
    family: {
      default: 'system-ui',
      validate: (value) => normalizeFontFamily(value) === value,
    },
  },
  parseDOM: [{
    tag: '[style]',
    getAttrs: (element) => {
      const family = normalizeFontFamily(element.style.fontFamily);
      return family ? { family } : false;
    },
  }],
  toDOM: (mark) => ['span', { style: `font-family:${fontFamilyCSS(mark.attrs.family)}` }, 0],
};
