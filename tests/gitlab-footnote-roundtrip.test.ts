import { expect, it } from 'vitest';
import { Selection, insertText } from 'fountainjs-editor';
import { inspectFootnotes } from 'fountainjs-editor/pages';
import captures from '../integrations/gitlab/fixtures/footnote-roundtrip-live-html.json';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { footnoteRoundtripProjection } from '../scripts/capture-gitlab-footnote-roundtrip.mjs';

// Expected unsupported inputs are explicit, not copied from diagnostic outcomes.
const refused = new Set(['duplicate', 'raw-html', 'emoji-prefix', 'escaped-opening-label', 'entity-label',
  'crlf-unicode', 'cr-unicode', 'comment-candidate-and-unused', 'body-backref-lookalike',
  'ascii-entity-label', 'decoded-bracket-entity', 'bom-unused']);
const responses = new Map(captures.renders.map(item => [item.source, item.body]));
const create = () => new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async source => {
  const body = responses.get(source);
  if (body === undefined) throw new Error('No actual Rails response for this exact source.');
  return { body };
} });
type Action = { kind: string; path: number[] };
function edit(bridge: GitLabContentEditor, action: Action, text: string) {
  const { editor } = bridge, { schema } = editor.state;
  if (action.kind === 'insert-text') {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor(action.path, 0)));
    expect(insertText(editor, text + ' ')).toBe(true); return;
  }
  if (action.kind === 'insert-paragraph') {
    const [index] = action.path;
    editor.dispatch(editor.createTransaction().replace(index!, index!,
      [schema.node('paragraph', { dir: 'auto', align: 'start' }, [schema.text(text)])])); return;
  }
  expect(action.kind).toBe('edit-empty-body');
  const paragraph = action.path.reduce((node, index) => node.child(index), editor.state.doc);
  editor.dispatch(editor.createTransaction().replaceNode(action.path, [paragraph.copy([schema.text(text)])]));
}

it('covers the complete declared corpus rather than silently skipping captured failures', () => {
  expect(captures.fixtures).toHaveLength(65);
  expect(new Set(captures.fixtures.map(item => item.name)).size).toBe(65);
  expect(captures.fixtures.filter(item => refused.has(item.name))).toHaveLength(12);
  expect(captures.overlay.readOnly).toBe(true);
});

it.each(captures.fixtures)('re-renders and reopens the declared $name source without changing the supported native graph', async item => {
  expect(typeof globalThis.document).toBe('undefined');
  const first = create(), second = create(), third = create();
  try {
    if (refused.has(item.name)) {
      const before = first.editor.state.doc;
      await expect(first.setSerializedContent(item.source)).rejects.toMatchObject({ originalMarkdown: item.source });
      expect(first.editor.state.doc).toBe(before); return;
    }
    await first.setSerializedContent(item.source);
    expect(first.getSerializedContent()).toBe(item.source);
    const initialNotes = inspectFootnotes(first.editor.state.doc);
    for (const reference of initialNotes.references)
      expect(initialNotes.definitions.filter(note => note.id === reference.id)).toHaveLength(1);
    if (initialNotes.definitions.length) expect(first.editor.state.doc.content.at(-1)!.type.name).toBe('footnote_definition');
    edit(first, item.action!, 'First round-trip edit.');
    const source = first.getSerializedContent();
    expect(source).toBe(item.canonical);
    const expected = footnoteRoundtripProjection(first.editor.state.doc);
    await second.setSerializedContent(source);
    expect(footnoteRoundtripProjection(second.editor.state.doc)).toEqual(expected);
    expect(second.getSerializedContent()).toBe(source);
    edit(second, item.secondAction!, 'Second round-trip edit.');
    const secondSource = second.getSerializedContent();
    expect(secondSource).toBe(item.secondCanonical);
    const secondExpected = footnoteRoundtripProjection(second.editor.state.doc);
    await third.setSerializedContent(secondSource);
    expect(footnoteRoundtripProjection(third.editor.state.doc)).toEqual(secondExpected);
    expect(third.getSerializedContent()).toBe(secondSource);
  } finally { first.dispose(); second.dispose(); third.dispose(); }
});
