import { Node, Plugin, Selection } from '../../core';
import { getNodeAtPath } from '../../core/transaction/path';

function paragraph(schema: import('../../core').Schema, text = ''): Node {
  return schema.node('paragraph', {}, [schema.text(text)]);
}

export const markdownShortcutsPlugin = new Plugin({
  props: {
    handleTextInput: (editor, from, to, input) => {
      if (input !== ' ' || from !== to) return false;
      const { state } = editor;
      const path = state.selection.path;
      const blockIndex = path[0];
      const target = getNodeAtPath(state.doc, path);
      const prefix = (target.text ?? '').slice(0, from) + input;
      const headingMatch = /^(#{1,6}) $/.exec(prefix);
      let replacement: Node | undefined;
      let selectionPath: number[] = [blockIndex, 0];

      if (headingMatch) {
        replacement = state.schema.node('heading', { level: headingMatch[1].length }, [state.schema.text('')]);
      } else if (/^[-*] $/.test(prefix)) {
        replacement = state.schema.node('bullet_list', {}, [state.schema.node('list_item', {}, [paragraph(state.schema)])]);
        selectionPath = [blockIndex, 0, 0, 0];
      } else if (/^1\. $/.test(prefix)) {
        replacement = state.schema.node('ordered_list', { start: 1 }, [state.schema.node('list_item', {}, [paragraph(state.schema)])]);
        selectionPath = [blockIndex, 0, 0, 0];
      } else if (/^\[[ xX]\] $/.test(prefix)) {
        replacement = state.schema.node('task_list', {}, [
          state.schema.node('task_item', { checked: /[xX]/.test(prefix) }, [paragraph(state.schema)]),
        ]);
        selectionPath = [blockIndex, 0, 0, 0];
      } else if (/^> $/.test(prefix)) {
        replacement = state.schema.node('blockquote', {}, [paragraph(state.schema)]);
        selectionPath = [blockIndex, 0, 0];
      } else if (/^``` $/.test(prefix)) {
        replacement = state.schema.node('code_block', { language: 'text', lineNumbers: true }, [state.schema.text('')]);
      }

      if (!replacement) return false;
      const transaction = state.createTransaction()
        .replace(blockIndex, blockIndex + 1, [replacement])
        .setSelection(Selection.cursor(selectionPath, 0));
      editor.dispatch(transaction);
      return true;
    },
  },
});
