import type { NodeSpec } from '../../core';
import { explicitEmphasisAttribute, textBlockDOMAttributes } from '../../core/explicit-emphasis';
import { paragraphLayoutAttribute } from '../../core/paragraph-layout';
import { textAlignmentAttribute, textDirectionAttribute } from '../../core/text-direction';
export const heading: NodeSpec = {
  attrs: {
    emphasis: explicitEmphasisAttribute,
    level: { default: 1, validate: (value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6 },
    align: textAlignmentAttribute,
    dir: textDirectionAttribute,
    layout: paragraphLayoutAttribute,
  },
  content: 'inline*',
  group: 'block',
  toDOM: (node) => [`h${node.attrs.level}`, textBlockDOMAttributes(node.attrs), 0],
};
