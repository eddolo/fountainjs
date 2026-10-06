import type { NodeSpec } from '../../core';
import { ImageNodeView } from './image-node-view';
import { imageAttributes, imageDOMAttributes, imageText } from './image-attributes';
import { imageCaptionAttributes, imageCaptionDOMAttributes } from '../../core/image-caption';

export const imageSuper: NodeSpec = {
  group: 'block', content: 'inline*', selectable: true,
  attrs: {
    ...imageAttributes,
    ...imageCaptionAttributes,
    caption: { default: '', validate: (value: unknown) => typeof value === 'string' && value.length <= 20_000 },
  },
  toText: (node) => imageText({
    ...node.attrs,
    caption: node.content.map((child) => child.textContent).join('') || node.attrs.caption,
  }),
  toDOM: (node) => ['figure', {
    'data-align': node.attrs.align,
    style: `width:${String(node.attrs.width)};max-width:100%`,
  },
    ['img', { ...imageDOMAttributes(node.attrs), style: `width:100%;height:${String(node.attrs.height)}` }],
    ['figcaption', imageCaptionDOMAttributes(node.attrs), 0]],
  nodeView: ImageNodeView,
};
