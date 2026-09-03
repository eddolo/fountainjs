import type { NodeSpec } from '../../core';
export const horizontalRule: NodeSpec = { group: 'block', atom: true, toDOM: () => ['hr'] };
