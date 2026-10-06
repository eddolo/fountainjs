import type { NodeSpec } from '../../core';
import { explicitEmphasisAttribute, textBlockDOMAttributes } from '../../core/explicit-emphasis';
import { paragraphLayoutAttribute } from '../../core/paragraph-layout';
const alignment = { default: 'left', validate: (value: unknown) => ['left', 'center', 'right', 'justify'].includes(String(value)) };
export const paragraph: NodeSpec = {
  content: 'inline*',
  group: 'block',
  attrs: { align: alignment, emphasis: explicitEmphasisAttribute, layout: paragraphLayoutAttribute },
  toDOM: (node) => ['p', textBlockDOMAttributes(node.attrs), 0],
};
