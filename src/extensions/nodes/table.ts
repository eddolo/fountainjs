import type { NodeSpec } from '../../core';
import { tableDOMSpec, tableLayoutAttribute } from '../../core/table-layout';
import { tableAppearanceAttribute } from '../../core/table-appearance';
import { tablePreferredWidthAttribute } from '../../core/table-width';
import { textDirectionAttribute } from '../../core/text-direction';
export const table: NodeSpec = { group: 'block', content: 'table_row+', attrs: { dir: textDirectionAttribute, layout: tableLayoutAttribute, appearance: tableAppearanceAttribute, preferredWidth: tablePreferredWidthAttribute }, toDOM: tableDOMSpec };
