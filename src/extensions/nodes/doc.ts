import { NodeSpec } from '../../core';
export const doc: NodeSpec = { content: 'block+', toDOM() { return ['div', 0]; } };