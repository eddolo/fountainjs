import type { NodeSpec } from '../../core';
import { imageAttributes, imageDOMAttributes, imageText } from './image-attributes';

/** A portable atomic image that can live between text fragments. */
export const inlineImage: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  attrs: imageAttributes,
  toText: (node) => imageText(node.attrs),
  toDOM: (node) => ['img', {
    ...imageDOMAttributes(node.attrs),
    'data-fountain-inline-image': 'true',
    style: `width:${String(node.attrs.width)};height:${String(node.attrs.height)}`,
  }],
};
