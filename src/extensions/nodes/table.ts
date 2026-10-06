import type { NodeSpec } from '../../core';
import { tableDOMSpec, tableLayoutAttribute } from '../../core/table-layout';
import { tableAppearanceAttribute } from '../../core/table-appearance';
import { tablePreferredWidthAttribute } from '../../core/table-width';
export const table: NodeSpec = { group: 'block', content: 'table_row+', attrs: { layout: tableLayoutAttribute, appearance: tableAppearanceAttribute, preferredWidth: tablePreferredWidthAttribute }, toDOM: tableDOMSpec };
