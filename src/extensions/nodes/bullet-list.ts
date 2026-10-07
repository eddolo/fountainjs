import type { NodeSpec } from '../../core';
import { textDirectionAttribute, textDirectionDOMAttributes } from '../../core/text-direction';
export const bulletList: NodeSpec = { group: 'block', content: 'list_item+', attrs: { dir: textDirectionAttribute }, toDOM: node => ['ul', textDirectionDOMAttributes(node.attrs), 0] };
