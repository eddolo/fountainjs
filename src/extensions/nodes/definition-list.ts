import type { NodeSpec } from '../../core/schema';

/** Incomplete groups are allowed while authoring; term/description order is retained. */
export const definitionList: NodeSpec = {
  group: 'block', content: '(definition_term | definition_description)*', toDOM: () => ['dl', 0],
};
export const definitionTerm: NodeSpec = { content: 'block+', toDOM: () => ['dt', 0] };
export const definitionDescription: NodeSpec = { content: 'block+', toDOM: () => ['dd', 0] };
