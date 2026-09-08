import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, Selection, Plugin, createEditor, historyPlugin, undo, redo, ReplaceDocumentStep, setContent } from '../src';

function setup() {
  return createEditor({ schema: CoreSchemaSpec, plugins: [historyPlugin], content: {
    type: 'doc', attrs: { notebook: 'original' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }],
  } });
}
describe('whole-document replacement', () => {
  it('routes the public setContent command through whole-document replacement', () => {
    const editor = setup();
    const original = editor.getJSON();
    const next = editor.state.doc.withAttrs({ experiment: 'replacement' });
    expect(setContent(editor, next)).toBe(true);
    expect(editor.getJSON()).toEqual(next.toJSON());
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    editor.destroy();
  });
  it('reports rejected setContent commands instead of claiming a replacement happened', () => {
    const editor = createEditor({ schema: CoreSchemaSpec, plugins: [new Plugin({ filterTransaction: () => false })] });
    const original = editor.getJSON();
    expect(setContent(editor, editor.state.doc.withAttrs({ rejected: true }))).toBe(false);
    expect(editor.getJSON()).toEqual(original);
    editor.destroy();
  });
  it('replaces rather than merges root attributes, and restores the entire snapshot with history', () => {
    const editor = setup();
    const original = editor.getJSON();
    const doc = editor.state.schema.node('doc', { experiment: 'next' }, [editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Second')])]);
    editor.dispatch(editor.state.createTransaction().replaceDocument(doc));
    expect(editor.getJSON()).toEqual(doc.toJSON());
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    expect(redo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(doc.toJSON());
    editor.destroy();
  });
  it('does not move text selections when only root attributes change', () => {
    const editor = setup();
    const selection = Selection.cursor([0, 0], 2);
    editor.dispatch(editor.state.createTransaction().setSelection(selection));
    const doc = editor.state.doc.withAttrs({ notebook: 'renamed' });
    const transaction = editor.state.createTransaction().replaceDocument(doc);
    expect(transaction.selection.eq(selection)).toBe(true);
    expect(transaction.mapping.map(3)).toBe(3);
    editor.dispatch(transaction);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.attrs.notebook).toBe('original');
    expect(editor.state.selection.eq(selection)).toBe(true);
    editor.destroy();
  });
  it('rejects foreign roots, non-root nodes and invalid content before mutating a transaction', () => {
    const editor = setup();
    const foreign = setup();
    const transaction = editor.state.createTransaction();
    const before = transaction.doc;
    for (const candidate of [foreign.state.doc, before.child(0), before.copy([editor.state.schema.text('invalid')])]) {
      expect(() => transaction.step(new ReplaceDocumentStep(candidate))).toThrow();
      expect(transaction.doc).toBe(before);
      expect(transaction.steps).toHaveLength(0);
    }
    editor.destroy(); foreign.destroy();
  });
});
