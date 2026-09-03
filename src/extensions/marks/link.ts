import type { MarkSpec } from '../../core';
export const link: MarkSpec = {
  attrs: { href: {}, title: { default: '' }, target: { default: '_blank' } },
  toDOM: (mark) => ['a', { href: mark.attrs.href, title: mark.attrs.title, target: mark.attrs.target, rel: 'noopener noreferrer nofollow' }, 0],
};
