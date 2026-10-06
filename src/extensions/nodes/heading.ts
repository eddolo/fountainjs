import type { NodeSpec } from '../../core';
import { explicitEmphasisAttribute, textBlockDOMAttributes } from '../../core/explicit-emphasis';
import { paragraphLayoutAttribute } from '../../core/paragraph-layout';
export const heading: NodeSpec = {
  attrs: {
    emphasis: explicitEmphasisAttribute,
    level: { default: 1, validate: (value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6 },
    align: { default: 'left', validate: (value) => ['left', 'center', 'right', 'justify'].includes(String(value)) },
    layout: paragraphLayoutAttribute,
  },
  content: 'inline*',
  group: 'block',
  toDOM: (node) => [`h${node.attrs.level}`, textBlockDOMAttributes(node.attrs), 0],
};
