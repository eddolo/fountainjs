import type { NodeSpec } from '../../core';
import { readTableRow, tableRowDOMSpec } from '../../core/table-layout';
// Rows covered completely by a rowspan are valid HTML table geometry and own no cells.
export const tableRow: NodeSpec = {
  content: '(table_header | table_cell)*',
  attrs: { repeatHeader: { default: undefined, validate: value => value === undefined || typeof value === 'boolean' } },
  parseDOM: [{ tag: 'tr', getAttrs: readTableRow }],
  toDOM: tableRowDOMSpec,
};
