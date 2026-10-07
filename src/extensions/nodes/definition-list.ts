import type { NodeSpec } from '../../core/schema';
import { textDirectionAttribute, textDirectionDOMAttributes } from '../../core/text-direction';

/** Incomplete groups are allowed while authoring; term/description order is retained. */
export const definitionList: NodeSpec = {
  group: 'block', content: '(definition_term | definition_description)*', attrs: { dir: textDirectionAttribute }, toDOM: node => ['dl', textDirectionDOMAttributes(node.attrs), 0],
};
export const definitionTerm: NodeSpec = { content: 'block+', attrs: { dir: textDirectionAttribute }, toDOM: node => ['dt', textDirectionDOMAttributes(node.attrs), 0] };
export const definitionDescription: NodeSpec = { content: 'block+', attrs: { dir: textDirectionAttribute }, toDOM: node => ['dd', textDirectionDOMAttributes(node.attrs), 0] };
