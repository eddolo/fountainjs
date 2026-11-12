import { expect, it } from 'vitest';
import { CoreExtension, HistoryExtension, TrailingEditableBlockExtension, composeExtensions, createEditor,
  MarkdownExporter, Selection, insertText, undo, redo } from '../src';
const kit = () => composeExtensions([CoreExtension, HistoryExtension, TrailingEditableBlockExtension]);
function setup() {
  const extensions = kit();
  return createEditor({ schema: extensions.schema, plugins: extensions.plugins,
    content: { type: 'doc', content: [{ type: 'horizontal_rule' }] } });
}

it('omits only an automatic trailing caret when explicitly requested, without mutating state', () => {
  const editor = setup(), exporter = new MarkdownExporter(), before = editor.state;
  expect(editor.state.doc.childCount).toBe(2);
  expect(exporter.export(editor.state)).toContain('data-fountain-empty');
  expect(exporter.exportWithReport(editor.state, { omitTrailingCaret: true })).toEqual({ markdown: '* * *', losses: [] });
  expect(editor.state).toBe(before); editor.destroy();
});
it('preserves authored and JSON-reopened blank paragraphs even with the option enabled', () => {
  const editor = setup(), json = editor.getJSON(), exporter = new MarkdownExporter();
  const extensions = kit(), reopened = createEditor({ schema: extensions.schema, plugins: extensions.plugins, content: json });
  expect(exporter.export(reopened.state, { omitTrailingCaret: true })).toContain('data-fountain-empty');
  editor.destroy(); reopened.destroy();
});
it('never omits a repair paragraph after it becomes authored text, including undo and redo', () => {
  const editor = setup(), exporter = new MarkdownExporter();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 0)));
  expect(insertText(editor, 'Authored')).toBe(true);
  expect(exporter.export(editor.state, { omitTrailingCaret: true })).toContain('Authored');
  expect(undo(editor)).toBe(true); expect(exporter.export(editor.state, { omitTrailingCaret: true })).toBe('* * *');
  expect(redo(editor)).toBe(true); expect(exporter.export(editor.state, { omitTrailingCaret: true })).toContain('Authored');
  editor.destroy();
});
it('preserves an authored empty paragraph before the automatic caret', () => {
  const extensions = kit(); const editor = createEditor({ schema: extensions.schema, plugins: extensions.plugins,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }, { type: 'horizontal_rule' }] } });
  const result = new MarkdownExporter().exportWithReport(editor.state, { omitTrailingCaret: true });
  expect(result.markdown).toBe('<p data-fountain-empty="text"></p>\n\n* * *'); expect(result.losses).toEqual([]);
  editor.destroy();
});
it('does not treat a copied empty paragraph as a new automatic caret owner', () => {
  const editor = setup(), doc = editor.state.doc;
  const copied = doc.copy([doc.child(0), doc.child(1).copy()]);
  expect(new MarkdownExporter().export(copied, { omitTrailingCaret: true })).toContain('data-fountain-empty');
  editor.destroy();
});
