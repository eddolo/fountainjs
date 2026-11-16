import { expect, it } from 'vitest';
import { Schema, EditorState, createEditor, createHistoryPlugin, Selection, insertText, undo } from 'fountainjs-editor';
import { GitLabMarkdownCodec, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { serializeGitLabSuggestionNode } from '../integrations/gitlab/services/code_suggestion_node';
import captures from '../integrations/gitlab/fixtures/suggestion-preview-live.json';

it.each(captures.fixtures)('retains actual context-aware $name replacement source through editing and undo in Node', async fixture => {
  expect(typeof document).toBe('undefined');
  const schema = new Schema(createGitLabSchemaSpec());
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async source => {
    expect(source).toBe(fixture.source); return { body: fixture.body };
  } });
  const { document: doc } = await codec.deserialize({ schema, markdown: fixture.source, signal: new AbortController().signal });
  const proposals: { path: number[]; text: string; source: string }[] = [];
  doc.descendants((node, path) => { if (node.type.name === 'gitlab_code_suggestion') proposals.push({ path: [...path], text: node.textContent, source: serializeGitLabSuggestionNode(node) }); });
  expect(proposals).toHaveLength(fixture.name === 'two' ? 2 : 1);
  expect(codec.serialize({ doc })).toBe(fixture.source);
  if (fixture.name === 'empty') expect(proposals[0]!.text).toBe('');
  if (fixture.name === 'one-blank-line') expect(proposals[0]!.text).toBe('\n');
  if (fixture.name === 'two-blank-lines') expect(proposals[0]!.text).toBe('\n\n');
  if (fixture.name === 'literal-unicode') expect(proposals[0]!.text).toBe('const key = "A\u200bB";\n');
  if (fixture.name === 'trailing-spaces') expect(proposals[0]!.text).toBe('  keep();  \n');
  const editor = createEditor({ schema: createGitLabSchemaSpec(), state: EditorState.create({ schema, doc, plugins: [createHistoryPlugin()] }) });
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([...proposals[0]!.path, 0], 0)));
    expect(insertText(editor, 'edited();\n')).toBe(true);
    expect(codec.serialize({ doc: editor.state.doc })).toContain('edited();');
    expect(undo(editor)).toBe(true);
    expect(codec.serialize({ doc: editor.state.doc })).toBe(fixture.source);
    const appended = doc.copy([...doc.content, schema.node('paragraph', {}, [schema.text('Unrelated review note.')])]);
    const output = codec.serializeWithReport({ doc: appended }); expect(output.issues).toEqual([]);
    for (const proposal of proposals) {
      const node = proposal.path.reduce((owner, index) => owner.child(index), appended);
      expect(serializeGitLabSuggestionNode(node)).toBe(proposal.source);
    }
    expect(output.markdown).toContain('Unrelated review note.');
    if (fixture.name === 'quoted') expect(output.markdown).toContain('> ```suggestion:-0+0\n> return 42;\n> ```');
    if (fixture.name === 'nested-list') expect(output.markdown).toContain('  ```suggestion:-0+0\n  return 42;\n  ```');
  } finally { editor.destroy(); }
});
