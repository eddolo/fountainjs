import type { NodeSpec } from '../../core';
import { readTableRow, tableRowDOMSpec } from '../../core/table-layout';
import { textDirectionAttribute } from '../../core/text-direction';
// Rows covered completely by a rowspan are valid HTML table geometry and own no cells.
export const tableRow: NodeSpec = {
  content: '(table_header | table_cell)*',
  attrs: { dir: textDirectionAttribute, repeatHeader: { default: undefined, validate: value => value === undefined || typeof value === 'boolean' } },
  parseDOM: [{ tag: 'tr', getAttrs: readTableRow }],
  toDOM: tableRowDOMSpec,
};
