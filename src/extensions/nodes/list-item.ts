import type { NodeSpec } from '../../core';
import { textDirectionAttribute, textDirectionDOMAttributes } from '../../core/text-direction';
export const listItem: NodeSpec = { content: 'block+', attrs: { dir: textDirectionAttribute }, toDOM: node => ['li', textDirectionDOMAttributes(node.attrs), 0] };
