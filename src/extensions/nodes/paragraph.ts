import { NodeSpec } from '../../core';
export const paragraph: NodeSpec = { content: 'inline*', group: 'block', toDOM() { return ['p', 0]; } };