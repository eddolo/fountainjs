import type { NodeSpec } from '../../core';
export const imageSuper: NodeSpec = {
  group: 'block', atom: true,
  attrs: {
    src: { default: '' }, alt: { default: '' }, title: { default: '' },
    width: { default: '100%' }, caption: { default: '' },
  },
  toDOM: (node) => ['figure', { style: `max-width:${String(node.attrs.width)}` },
    ['img', { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title, loading: 'lazy' }],
    ['figcaption', String(node.attrs.caption ?? '')]],
};
