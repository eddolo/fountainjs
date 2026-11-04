import type { NodeSpec } from '../../core';
import { explicitEmphasisAttribute, textBlockDOMAttributes } from '../../core/explicit-emphasis';
import { paragraphLayoutAttribute } from '../../core/paragraph-layout';
import { explicitTextAlignmentAttribute, textAlignmentAttribute, textDirectionAttribute, sharedDirectionGroupAttribute } from '../../core/text-direction';
export const heading: NodeSpec = {
  paragraphFlow: 'text',
  attrs: {
    emphasis: explicitEmphasisAttribute,
    level: { default: 1, validate: (value) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6 },
    align: textAlignmentAttribute,
    alignExplicit: explicitTextAlignmentAttribute,
    dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute,
    layout: paragraphLayoutAttribute,
  },
  content: 'inline*',
  group: 'block',
  toDOM: (node) => [`h${node.attrs.level}`, textBlockDOMAttributes(node.attrs), 0],
};
