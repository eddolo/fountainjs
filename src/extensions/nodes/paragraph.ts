import type { NodeSpec } from '../../core';
import { explicitEmphasisAttribute, textBlockDOMAttributes } from '../../core/explicit-emphasis';
import { paragraphLayoutAttribute } from '../../core/paragraph-layout';
import { textAlignmentAttribute, textDirectionAttribute } from '../../core/text-direction';
export const paragraph: NodeSpec = {
  content: 'inline*',
  group: 'block',
  attrs: { align: textAlignmentAttribute, dir: textDirectionAttribute, emphasis: explicitEmphasisAttribute, layout: paragraphLayoutAttribute },
  toDOM: (node) => ['p', textBlockDOMAttributes(node.attrs), 0],
};
