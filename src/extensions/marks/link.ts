import { isSafeURL, type MarkSpec } from '../../core';
import { literalLinkAttributes, validHTMLLinkSource } from '../../core/link-destination';
export const link: MarkSpec = {
  attrs: {
    href: { validate: (value) => typeof value === 'string' && value.length <= 2_048 && isSafeURL(value, { allowEmpty: true }) },
    title: { default: '', validate: (value) => typeof value === 'string' && value.length <= 1_000 },
    target: { default: '_blank', validate: (value) => value === '_blank' || value === '_self' },
    // Absent on ordinary/manual/Markdown links; preserves HTML URL interpretation.
    htmlHref: { default: undefined, validate: value => value === undefined || validHTMLLinkSource(value) },
  },
  toDOM: (mark) => ['a', { ...literalLinkAttributes(String(mark.attrs.href), mark.attrs.htmlHref), title: mark.attrs.title, target: mark.attrs.target, rel: 'noopener noreferrer nofollow' }, 0],
};
