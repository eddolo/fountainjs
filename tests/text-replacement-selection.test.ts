import { expect, it } from 'vitest';
import { CoreExtension, HTMLAnchorExtension, Selection, composeExtensions, createEditor, createHistoryPlugin, insertText, undo, redo } from '../src';
import { textReplacementSelection } from '../src/core/text-replacement-selection';

const kit = composeExtensions([CoreExtension, HTMLAnchorExtension]);

it('keeps replacement text inside an inline bookmark when Firefox selects from the preceding run end', () => {
  const editor = createEditor({ schema: kit.schema, plugins: [createHistoryPlugin()], content: { type: 'doc', content: [
    { type: 'paragraph', content: [
      { type: 'text', text: 'Before ' },
      { type: 'html_anchor', attrs: { id: 'chapter' }, content: [{ type: 'text', text: 'Chapter one' }] },
      { type: 'text', text: ' after.' },
    ] },
  ] } });
  const original = editor.getJSON();
  editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 7, [0, 1, 0], 8)));
  expect(insertText(editor, 'Section ')).toBe(true);
  expect(editor.state.doc.child(0).child(1).textContent).toBe('Section one');
  expect(editor.state.doc.child(0).child(0).textContent).toBe('Before ');
  expect(editor.state.selection.path).toEqual([0, 1, 0]);
  const edited = editor.getJSON();
  expect(undo(editor)).toBe(true);
  expect(editor.getJSON()).toEqual(original);
  expect(redo(editor)).toBe(true);
  expect(editor.getJSON()).toEqual(edited);
  editor.destroy();
});

it.each(['atom', 'empty', 'outside', 'collapsed'])('does not relocate a %s selection across a structural boundary', kind => {
  const editor = createEditor({ schema: kit.schema });
  const schema = editor.state.schema;
  const child = kind === 'atom' ? schema.node('hard_break') : schema.node('html_anchor', {}, kind === 'empty' ? [] : [schema.text('Chapter')]);
  const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Before '), child, schema.text('After')])]);
  const selection = kind === 'collapsed' ? Selection.cursor([0, 0], 7) : Selection.range([0, 0], 7, [0, 2], 3);
  expect(textReplacementSelection(doc, selection)).toBe(selection);
  editor.destroy();
});
