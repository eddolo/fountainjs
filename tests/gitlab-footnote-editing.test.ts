import { expect, it, vi } from 'vitest';
import { Selection, insertText, undo, redo } from 'fountainjs-editor';
import { inspectFootnotes, selectFootnoteDefinition } from 'fountainjs-editor/pages';
import notes from '../integrations/gitlab/fixtures/footnote-probe-live-html.json';
import editing from '../integrations/gitlab/fixtures/footnote-editing-live-html.json';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { getGitLabFootnoteContext, deleteGitLabFootnote, deleteGitLabFootnoteReference } from '../integrations/gitlab/services/footnote_editing';

const fixtures = [...notes.fixtures, ...editing.fixtures];
const get = (name: string) => fixtures.find(item => item.name === name)!;
async function setup(name = 'simple') {
  const bridge = new GitLabContentEditor({ describeLabels: (_action, count) => String(count), renderMarkdown: async source => {
    const original = fixtures.find(item => item.source === source);
    if (original) return { body: original.body };
    const probe = fixtures.find(item => item.probe?.source === source);
    if (probe) return { body: probe.probeBody! };
    throw new Error('No actual host capture for the requested input.');
  } });
  await bridge.setSerializedContent(get(name).source);
  return { bridge, editor: bridge.editor };
}
it('inserts at the selected text end, retains existing text, namespaces the note, and undoes/redoes atomically', async () => {
  const { bridge, editor } = await setup();
  editor.dispatch(editor.createTransaction().setSelection(new Selection([0, 0], 0, 6)));
  const before = bridge.getSerializedContent();
  const session = bridge.beginFootnoteInsertion();
  expect((await session.apply('A service reliability note.')).status).toBe('applied');
  const report = inspectFootnotes(editor.state.doc);
  expect(report.valid).toBe(true);
  expect(report.definitions).toHaveLength(2);
  expect(editor.state.doc.textContent).toContain('A note');
  expect(editor.state.doc.textContent).toContain('A service reliability note.');
  const source = bridge.getSerializedContent();
  expect(source).toContain('[^1]'); expect(source).toContain('[^alpha]');
  expect(source).not.toContain('<p data-fountain-empty=');
  expect(getGitLabFootnoteContext(editor)?.label).toBe('1');
  expect(undo(editor)).toBe(true); expect(bridge.getSerializedContent()).toBe(before);
  expect(redo(editor)).toBe(true); expect(bridge.getSerializedContent()).toBe(source);
  bridge.dispose();
});
it('pastes the same named note without merging it with an existing note', async () => {
  const { bridge, editor } = await setup();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  await bridge.pasteMarkdown(get('simple').source);
  const report = inspectFootnotes(editor.state.doc);
  expect(report.valid).toBe(true);
  expect(new Set(report.definitions.map(note => note.id)).size).toBe(2);
  const source = bridge.getSerializedContent();
  expect(source).toContain('[^alpha]:'); expect(source).toContain('[^1]:');
  expect(source).not.toContain('<p data-fountain-empty=');
  bridge.dispose();
});
it('retains an authored empty paragraph after existing definitions when adding another note', async () => {
  const { bridge, editor } = await setup();
  const { schema } = editor.state;
  const authored = schema.node('paragraph', {}, [schema.text('')]);
  const ending = schema.node('paragraph', {}, [schema.text('Retained ending.')]);
  const doc = editor.state.doc.copy([editor.state.doc.child(0), editor.state.doc.child(1), authored, ending]);
  editor.dispatch(editor.createTransaction().replaceDocument(doc).setSelection(Selection.cursor([0, 0], 0)));
  await bridge.beginFootnoteInsertion().apply('A service reliability note.');
  expect(bridge.getSerializedContent().match(/<p data-fountain-empty=/gu)).toHaveLength(1);
  expect(bridge.getSerializedContent()).toContain('Retained ending.');
  expect(editor.state.doc.content).toContain(authored);
  bridge.dispose();
});
it('avoids conservative numeric collisions without inferring existing Unicode aliases', async () => {
  const { bridge, editor } = await setup('compatibility-numeric');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  await bridge.beginFootnoteInsertion().apply('A service reliability note.');
  const source = bridge.getSerializedContent();
  expect(source).toContain('[^①]:'); expect(source).toContain('[^2]:');
  bridge.dispose();
});
it('cancels an unresolved insertion without changing the document or blocking later insertions', async () => {
  const { bridge, editor } = await setup();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  const before = bridge.getSerializedContent();
  const session = bridge.beginFootnoteInsertion(); session.cancel();
  await vi.waitFor(() => expect(bridge.pendingInsertions).toBe(0));
  expect(bridge.getSerializedContent()).toBe(before);
  expect((await bridge.beginFootnoteInsertion().apply('A service reliability note.')).status).toBe('applied');
  bridge.dispose();
});
it('rebases the captured insertion through an unrelated edit while the author writes the note', async () => {
  const { bridge, editor } = await setup();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
  const session = bridge.beginFootnoteInsertion();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  expect(insertText(editor, 'Prefix ')).toBe(true);
  await session.apply('A service reliability note.');
  expect(bridge.getSerializedContent()).toContain('Prefix A note[^1][^alpha]');
  bridge.dispose();
});
it('removes a reference without deleting its retained body, then deletes the full note and restores it with undo', async () => {
  const { bridge, editor } = await setup();
  const report = inspectFootnotes(editor.state.doc), reference = report.references[0]!;
  expect(deleteGitLabFootnoteReference(editor, reference.path, reference.id)).toBe(true);
  expect(inspectFootnotes(editor.state.doc).references).toHaveLength(0);
  expect(bridge.getSerializedContent()).toContain('[^alpha]:');
  expect(deleteGitLabFootnote(editor, reference.id)).toBe(true);
  expect(inspectFootnotes(editor.state.doc).definitions).toHaveLength(0);
  expect(undo(editor)).toBe(true);
  expect(inspectFootnotes(editor.state.doc).definitions).toHaveLength(1);
  bridge.dispose();
});
it('places an editable caret in an imported empty definition', async () => {
  const { bridge, editor } = await setup('empty');
  const note = inspectFootnotes(editor.state.doc).definitions[0]!;
  expect(selectFootnoteDefinition(editor, note.id)).toBe(true);
  expect(insertText(editor, 'Now documented.')).toBe(true);
  expect(bridge.getSerializedContent()).toContain('[^empty]: Now documented.');
  bridge.dispose();
});
it('inserts a shared reference without a second definition or a backend render', async () => {
  const { bridge, editor } = await setup();
  const id = inspectFootnotes(editor.state.doc).definitions[0]!.id;
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  expect((await bridge.beginFootnoteInsertion().applyExisting(id)).status).toBe('applied');
  expect(inspectFootnotes(editor.state.doc).definitions).toHaveLength(1);
  expect(inspectFootnotes(editor.state.doc).references.map(note => note.id)).toEqual([id, id]);
  expect(bridge.getSerializedContent().match(/\[\^alpha\]/gu)).toHaveLength(3);
  bridge.dispose();
});
