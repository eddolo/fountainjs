import type { NodeSpec } from '../../core';
import { tableDOMSpec, tableLayoutAttribute } from '../../core/table-layout';
import { tableAppearanceAttribute } from '../../core/table-appearance';
import { tablePreferredWidthAttribute } from '../../core/table-width';
import { textDirectionAttribute, sharedDirectionGroupAttribute } from '../../core/text-direction';
export const table: NodeSpec = { group: 'block', content: 'table_row+', attrs: { dir: textDirectionAttribute, directionGroup: sharedDirectionGroupAttribute, layout: tableLayoutAttribute, appearance: tableAppearanceAttribute, preferredWidth: tablePreferredWidthAttribute }, toDOM: tableDOMSpec };
