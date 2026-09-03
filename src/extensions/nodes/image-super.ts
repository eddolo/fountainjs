import type { NodeSpec } from '../../core';
import { ImageNodeView } from './image-node-view';
import { imageAttributes, imageDOMAttributes, imageText } from './image-attributes';

export const imageSuper: NodeSpec = {
  group: 'block', atom: true,
  attrs: {
    ...imageAttributes,
    caption: { default: '', validate: (value: unknown) => typeof value === 'string' && value.length <= 20_000 },
  },
  toText: (node) => imageText(node.attrs),
  toDOM: (node) => ['figure', {
    'data-align': node.attrs.align,
    style: `width:${String(node.attrs.width)};max-width:100%`,
  },
    ['img', { ...imageDOMAttributes(node.attrs), style: `width:100%;height:${String(node.attrs.height)}` }],
    ['figcaption', String(node.attrs.caption ?? '')]],
  nodeView: ImageNodeView,
};
