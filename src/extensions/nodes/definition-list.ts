import type { NodeSpec } from '../../core/schema';
import { textDirectionAttribute, sharedDirectionGroupAttribute, textDirectionDOMAttributes } from '../../core/text-direction';

/** Incomplete groups are allowed while authoring; term/description order is retained. */
export const definitionList: NodeSpec = {
  paragraphFlow: 'transparent',
  group: 'block', content: '(definition_term | definition_description)*', attrs: { dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute }, toDOM: node => ['dl', textDirectionDOMAttributes(node.attrs), 0],
};
export const definitionTerm: NodeSpec = { paragraphFlow: 'transparent', content: 'block+', attrs: { dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute }, toDOM: node => ['dt', textDirectionDOMAttributes(node.attrs), 0] };
export const definitionDescription: NodeSpec = { paragraphFlow: 'transparent', content: 'block+', attrs: { dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute }, toDOM: node => ['dd', textDirectionDOMAttributes(node.attrs), 0] };
