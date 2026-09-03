import type { MarkSpec } from '../../core';
export const link: MarkSpec = {
  attrs: {
    href: { validate: (value) => typeof value === 'string' && /^(https?:|mailto:|tel:|\/|#|\.)/i.test(value.trim()) },
    title: { default: '', validate: (value) => typeof value === 'string' },
    target: { default: '_blank', validate: (value) => typeof value === 'string' },
  },
  toDOM: (mark) => ['a', { href: mark.attrs.href, title: mark.attrs.title, target: mark.attrs.target, rel: 'noopener noreferrer nofollow' }, 0],
};
