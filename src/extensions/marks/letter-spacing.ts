import type { MarkSpec } from '../../core';
import { normalizeLetterSpacing } from '../../text-style/values';

const styleRule = {
  tag: '[style]',
  getAttrs(element: { style: { letterSpacing?: string } }): { spacing: string } | false {
    const spacing = normalizeLetterSpacing(element.style.letterSpacing);
    return spacing !== null ? { spacing } : false;
  },
};

export const letterSpacing: MarkSpec = {
  attrs: { spacing: { default: '0pt', validate: value => normalizeLetterSpacing(value) === value } },
  parseHTML: [styleRule], parseDOM: [styleRule],
  toDOM: mark => ['span', { style: `letter-spacing:${String(mark.attrs.spacing)}` }, 0],
};
