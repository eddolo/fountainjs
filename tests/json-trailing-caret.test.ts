import { expect, it } from 'vitest';
import { CoreExtension, HistoryExtension, TrailingEditableBlockExtension, composeExtensions, createEditor,
  JSONExporter, Selection, insertText, undo, redo } from '../src';
const kit = () => composeExtensions([CoreExtension, HistoryExtension, TrailingEditableBlockExtension]);
const make = () => {
  const config = kit();
  return createEditor({ schema: { ...config.schema, nodes: { ...config.schema.nodes,
    doc: { ...config.schema.nodes.doc, attrs: { ...config.schema.nodes.doc.attrs, label: { default: '' } } },
  } }, plugins: config.plugins, content: { type: 'doc', attrs: { label: 'Retain root metadata' }, content: [{ type: 'horizontal_rule' }] } });
};
it('omits only the proven automatic repair on explicit persistence export, retaining root metadata and live state', () => {
  const editor = make();
  try {
    const document = editor.state.doc;
    expect(JSON.parse(JSONExporter.export(document)).content).toHaveLength(2);
    const saved = JSON.parse(JSONExporter.export(document, 0, { omitTrailingCaret: true }));
    expect(saved.content).toEqual([{ type: 'horizontal_rule' }]);
    expect(saved.attrs).toEqual({ label: 'Retain root metadata' });
    expect(editor.state.doc).toBe(document);
    const reopened = JSONExporter.import(JSONExporter.export(document), editor.state.schema);
    expect(JSON.parse(JSONExporter.export(reopened, 0, { omitTrailingCaret: true })).content).toHaveLength(2);
  } finally { editor.destroy(); }
});
it('retains typed repair content and authored/copy blanks across history', () => {
  const editor = make();
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 0)));
    expect(insertText(editor, 'Authored')).toBe(true);
    expect(JSONExporter.export(editor.state, 0, { omitTrailingCaret: true })).toContain('Authored');
    expect(undo(editor)).toBe(true);
    expect(JSON.parse(JSONExporter.export(editor.state, 0, { omitTrailingCaret: true })).content).toHaveLength(1);
    expect(redo(editor)).toBe(true);
    expect(JSONExporter.export(editor.state, 0, { omitTrailingCaret: true })).toContain('Authored');
    const doc = editor.state.doc.copy([editor.state.doc.child(0), editor.state.schema.node('paragraph', {}, [editor.state.schema.text('')])]);
    expect(JSON.parse(JSONExporter.export(doc, 0, { omitTrailingCaret: true })).content).toHaveLength(2);
  } finally { editor.destroy(); }
});
