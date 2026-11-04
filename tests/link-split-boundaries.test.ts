import { describe, expect, it } from 'vitest';
import { CoreExtension, HistoryExtension, Schema, Selection, composeExtensions, createEditor,
  insertText, redo, splitBlock, undo, type Node } from '../src';

const kit = composeExtensions([CoreExtension, HistoryExtension]);
const schema = new Schema(kit.schema);
const leaf = (document: Node, path: readonly number[]) => path.reduce((node, index) => node.child(index), document);
const markedText = () => schema.text('Linked', [schema.mark('strong'), schema.mark('link', { href: '/target', title: 'Original' })]);

describe('Enter at the end of a link', () => {
  for (const container of ['paragraph', 'heading', 'quote', 'list', 'task', 'table']) {
    it(`starts unlinked text after a terminal link in a ${container}, retaining emphasis and history`, () => {
      const paragraph = schema.node('paragraph', {}, [markedText()]);
      const block = container === 'heading' ? schema.node('heading', { level: 1 }, [markedText()])
        : container === 'quote' ? schema.node('blockquote', {}, [paragraph])
          : container === 'list' ? schema.node('bullet_list', {}, [schema.node('list_item', {}, [paragraph])])
            : container === 'task' ? schema.node('task_list', {}, [schema.node('task_item', { checked: true }, [paragraph])])
              : container === 'table' ? schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_cell', {}, [paragraph])])]) : paragraph;
      const document = schema.node('doc', {}, [block]);
      const path = container === 'quote' ? [0, 0, 0] : ['list', 'task'].includes(container) ? [0, 0, 0, 0]
        : container === 'table' ? [0, 0, 0, 0, 0] : [0, 0];
      const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: document.toJSON() });
      try {
        editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor(path, 6)));
        expect(editor.runCommandBatch(() => {
          expect(splitBlock(editor)).toBe(true);
          expect(insertText(editor, 'New')).toBe(true);
          expect(insertText(editor, ' text')).toBe(true);
          return true;
        })).toBe(true);
        const current = leaf(editor.state.doc, editor.state.selection.path);
        expect(current.text).toBe('New text');
        expect(current.marks.some(mark => mark.type.name === 'link')).toBe(false);
        expect(current.marks.some(mark => mark.type.name === 'strong')).toBe(true);
        expect(leaf(editor.state.doc, path).marks.find(mark => mark.type.name === 'link')?.attrs).toMatchObject({ href: '/target', title: 'Original' });
        const changed = editor.state.doc.toJSON();
        expect(undo(editor)).toBe(true);
        expect(editor.state.doc.toJSON()).toEqual(document.toJSON());
        expect(redo(editor)).toBe(true);
        expect(editor.state.doc.toJSON()).toEqual(changed);
      } finally { editor.destroy(); }
    });
  }

  it('retains both halves of an existing link when splitting its text', () => {
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins,
      content: schema.node('doc', {}, [schema.node('paragraph', {}, [markedText()])]).toJSON() });
    try {
      editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
      expect(splitBlock(editor)).toBe(true);
      expect(insertText(editor, 'New ')).toBe(true);
      expect(editor.state.doc.child(0).textContent).toBe('Lin');
      expect(editor.state.doc.child(1).textContent).toBe('New ked');
      for (const block of editor.state.doc.content) {
        expect(block.content.every(node => node.marks.some(mark => mark.type.name === 'link'))).toBe(true);
      }
    } finally { editor.destroy(); }
  });
});
