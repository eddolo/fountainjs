import { expect, it } from 'vitest';
import { createEditor, StarterKit, Selection, insertText, splitBlock, undo, redo } from 'fountainjs-editor';
import captures from '../integrations/gitlab/fixtures/footnote-editing-live-html.json';
import probe from '../integrations/gitlab/fixtures/footnote-probe-live-html.json';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { gitLabFootnoteBoundary } from '../integrations/gitlab/services/footnote_boundary';

const fixtures = [...captures.fixtures, ...probe.fixtures];
async function setup(name = 'insert') {
  const item = fixtures.find(value => value.name === name)!;
  const bridge = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async source => {
    const normal = fixtures.find(value => value.source === source);
    if (normal) return { body: normal.body };
    const hidden = fixtures.find(value => value.probe?.source === source);
    if (hidden) return { body: hidden.probeBody! };
    throw new Error('No actual host fixture for this exact source.');
  } });
  await bridge.setSerializedContent(item.source);
  return { bridge, editor: bridge.editor, source: item.source };
}

it('keeps the public default repair while the private host omits a root paragraph after terminal editable notes', async () => {
  const { bridge, editor, source } = await setup();
  const ordinary = createEditor({ schema: createGitLabSchemaSpec(), plugins: StarterKit.plugins,
    content: editor.state.doc.toJSON() });
  expect(ordinary.state.doc.content.at(-1)!.type.name).toBe('paragraph');
  expect(ordinary.state.doc.childCount).toBe(editor.state.doc.childCount + 1);
  expect(editor.state.doc.content.at(-1)!.type.name).toBe('footnote_definition');
  expect(bridge.getSerializedContent()).toBe(source);
  ordinary.destroy(); bridge.dispose();
});

it.each(['insert', 'empty', 'mixed', 'shared'])('reopens %s notes without manufacturing prose after the endnote boundary', async name => {
  const { bridge, editor, source } = await setup(name);
  expect(editor.state.doc.content.at(-1)!.type.name).toBe('footnote_definition');
  expect(bridge.getSerializedContent()).toBe(source);
  await bridge.setSerializedContent(source);
  expect(editor.state.doc.content.at(-1)!.type.name).toBe('footnote_definition');
  bridge.dispose();
});

it('continues prose with Enter before the notes and preserves typing through undo/redo', async () => {
  const { bridge, editor } = await setup('simple');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 2], 1)));
  expect(splitBlock(editor)).toBe(true);
  expect(insertText(editor, 'Continue the body.')).toBe(true);
  expect(editor.state.doc.child(1).textContent).toBe('Continue the body.');
  expect(editor.state.doc.content.at(-1)!.type.name).toBe('footnote_definition');
  const source = bridge.getSerializedContent();
  expect(source.indexOf('Continue the body.')).toBeLessThan(source.indexOf('[^alpha]:'));
  expect(undo(editor)).toBe(true); expect(redo(editor)).toBe(true);
  expect(bridge.getSerializedContent()).toBe(source);
  bridge.dispose();
});

it('still supplies an editable paragraph after an atomic block', async () => {
  const { bridge, editor } = await setup();
  const { schema } = editor.state;
  editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [schema.node('horizontal_rule')])));
  expect(editor.state.doc.content.map(node => node.type.name)).toEqual(['horizontal_rule', 'paragraph']);
  expect(editor.state.doc.child(1).textContent).toBe('');
  bridge.dispose();
});

it('keeps the normal repair when the terminal note itself ends in an atomic block', async () => {
  const { bridge, editor } = await setup();
  const note = editor.state.doc.child(1);
  editor.dispatch(editor.createTransaction().replaceNode([1], [note.copy([editor.state.schema.node('horizontal_rule')])]));
  expect(editor.state.doc.child(1).type.name).toBe('footnote_definition');
  expect(editor.state.doc.child(1).child(0).type.name).toBe('horizontal_rule');
  expect(editor.state.doc.content.at(-1)!.type.name).toBe('paragraph');
  bridge.dispose();
});

it('never removes an authored paragraph or an authored empty paragraph after a note', async () => {
  const { bridge, editor } = await setup();
  const { schema } = editor.state;
  const blank = schema.node('paragraph', {}, [schema.text('')]);
  const authored = schema.node('paragraph', {}, [schema.text('Authored content after the definition.')]);
  editor.dispatch(editor.createTransaction().replace(editor.state.doc.childCount, editor.state.doc.childCount, [blank, authored]));
  expect(editor.state.doc.content.at(-2)).toBe(blank);
  expect(editor.state.doc.content.at(-1)).toBe(authored);
  expect(bridge.getSerializedContent()).toContain('Authored content after the definition.');
  bridge.dispose();
});

it('refuses wrapping an unrelated extension', () => {
  expect(() => gitLabFootnoteBoundary({ name: 'other' })).toThrow('GITLAB_FOOTNOTE_BOUNDARY_EXTENSION');
});
