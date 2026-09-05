import { isSafeURL, type MarkSpec } from '../../core';
export const link: MarkSpec = {
  attrs: {
    href: { validate: (value) => typeof value === 'string' && value.length <= 2_048 && isSafeURL(value, { allowEmpty: true }) },
    title: { default: '', validate: (value) => typeof value === 'string' && value.length <= 1_000 },
    target: { default: '_blank', validate: (value) => value === '_blank' || value === '_self' },
  },
  toDOM: (mark) => ['a', { href: mark.attrs.href, title: mark.attrs.title, target: mark.attrs.target, rel: 'noopener noreferrer nofollow' }, 0],
};
