import type { NodeSpec } from '../../core';
import { ImageNodeView } from './image-node-view';
import { imageAttributes, imageDOMAttributes, imageText } from './image-attributes';
import { imageCaptionAttributes, imageCaptionDOMAttributes, imageFigureStyles, imageParagraphAttributes, imageParagraphDOMAttributes } from '../../core/image-caption';

export const imageSuper: NodeSpec = {
  group: 'block', content: 'inline*', selectable: true,
  attrs: {
    ...imageAttributes,
    ...imageParagraphAttributes,
    ...imageCaptionAttributes,
    caption: { default: '', validate: (value: unknown) => typeof value === 'string' && value.length <= 20_000 },
  },
  toText: (node) => imageText({
    ...node.attrs,
    caption: node.content.map((child) => child.textContent).join('') || node.attrs.caption,
  }),
  toDOM: (node) => {
    const layout = imageParagraphDOMAttributes(node.attrs);
    const styles = imageFigureStyles(node.attrs, String(node.attrs.width));
    return ['figure', { 'data-align': node.attrs.align, style: styles.figure },
      ['img', { ...imageDOMAttributes(node.attrs), ...layout,
        style: [styles.image, layout.style, `height:${String(node.attrs.height)}`].filter(Boolean).join(';') }],
      ['figcaption', imageCaptionDOMAttributes(node.attrs), 0]];
  },
  nodeView: ImageNodeView,
};
