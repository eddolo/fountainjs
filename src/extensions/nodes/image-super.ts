import { Node, NodeSpec } from '../../core';
import { ImageSuperNodeView } from './image-super-view';
export const imageSuper: NodeSpec = {
  group: 'block', content: 'figcaption?', attrs: { src: { default: '' }, alt: { default: '' }, title: { default: '' }, width: { default: '100%' }, },
  toDOM: (node: Node) => { const { src, alt, title, width } = node.attrs; return ['figure', { style: `width: ${width};` }, ['img', { src, alt, title }], 0]; },
  nodeView: ImageSuperNodeView,
};