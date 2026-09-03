import type { NodeSpec } from '../../core';
export const hardBreak: NodeSpec = { group: 'inline', inline: true, atom: true, toDOM: () => ['br'] };
