import { createTableRepairTransaction, Plugin } from '../../core';
import { defineExtension } from '../extension';

export const tableEditingPlugin = new Plugin({
  appendTransaction: (transactions, _oldState, newState) => {
    if (!transactions.some((transaction) => transaction.docChanged)) return null;
    if (transactions.some((transaction) => transaction.getMeta('table$repair') === true)) return null;
    return createTableRepairTransaction(newState);
  },
  props: {
    onCreate: (editor) => {
      const repair = createTableRepairTransaction(editor.state);
      if (repair) editor.dispatch(repair);
    },
  },
});

/** Maintains rectangular table geometry after arbitrary host transactions. */
export const TableEditingExtension = defineExtension({
  name: 'table-editing',
  plugins: [tableEditingPlugin],
});
