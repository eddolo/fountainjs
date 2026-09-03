import type { NodeSpec } from '../../core';
export const imageSuper: NodeSpec = {
  group: 'block', atom: true,
  attrs: {
    src: { default: '', validate: (value) => typeof value === 'string' && /^(https?:|data:image\/(?:png|gif|jpe?g|webp);base64,|\/|#|\.)/i.test(value.trim()) },
    alt: { default: '', validate: (value) => typeof value === 'string' },
    title: { default: '', validate: (value) => typeof value === 'string' },
    width: { default: '100%', validate: (value) => typeof value === 'string' && /^(?:auto|\d+(?:\.\d+)?(?:px|%|rem|em|vw))$/.test(value) },
    caption: { default: '', validate: (value) => typeof value === 'string' },
  },
  toDOM: (node) => ['figure', { style: `max-width:${String(node.attrs.width)}` },
    ['img', { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title, loading: 'lazy' }],
    ['figcaption', String(node.attrs.caption ?? '')]],
};
