/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { Schema, CoreSchemaSpec, createEditor, createHistoryPlugin, EditorView, Selection, AllSelection,
  insertText, undo, redo, HTMLExporter, HTMLImporter } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';
import { GitLabMarkdownCodec, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { getGitLabCodeContext } from '../integrations/gitlab/services/code_editing';
import { serializeGitLabSuggestionNode } from '../integrations/gitlab/services/code_suggestion_node';
import data from '../integrations/gitlab/fixtures/suggestion-live-html.json';
const schema = new Schema(createGitLabSchemaSpec());
const convert = async (name: string) => {
  const fixture = data.fixtures.find(item => item.name === name)!;
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: fixture.body }) });
  const { document } = await codec.deserialize({ schema, markdown: fixture.source, signal: new AbortController().signal });
  return { document, codec, fixture };
};
it.each(data.fixtures.filter(item => !['invalid-offset', 'offset-spaces'].includes(item.name)))('imports and serializes actual $name suggestions after unrelated edits', async value => {
  const { document, codec } = await convert(value.name);
  const suggestions: string[] = [];
  document.descendants(node => { if (node.type.name === 'gitlab_code_suggestion') suggestions.push(serializeGitLabSuggestionNode(node)); });
  expect(suggestions).toHaveLength(value.name === 'two' ? 2 : 1);
  expect(codec.serialize({ doc: document })).toBe(value.source);
  const edited = document.copy([...document.content, schema.node('paragraph', {}, [schema.text('Other edit.')])]);
  const canonical = codec.serializeWithReport({ doc: edited });
  expect(canonical.issues).toEqual([]);
  expect(canonical.markdown).toContain('suggestion');
  expect(canonical.markdown).toContain('Other edit.');
  if (value.name === 'quoted') expect(canonical.markdown).toContain('> ```suggestion:-0+0\n> replacement\n> ```');
  if (value.name === 'nested-list') expect(canonical.markdown).toContain('  ```suggestion:-0+0\n  replacement\n  ```');
  if (value.name === 'empty') expect(canonical.markdown).toContain('```suggestion:-0+0\n```');
  if (value.name === 'one-blank-line') expect(canonical.markdown).toContain('```suggestion:-0+0\n\n```');
  const html = HTMLExporter.export(document, { document: false });
  expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(document.toJSON());
  expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(document.toJSON());
});
it.each(['invalid-offset', 'offset-spaces'])('refuses unsupported source metadata: %s', async name => {
  await expect(convert(name)).rejects.toMatchObject({ name: 'GitLabMarkdownConversionError' });
});
it('edits source with normal history and recognizes the specialized code context', async () => {
  const { document, codec } = await convert('range');
  const editor = createEditor({ schema: createGitLabSchemaSpec(), plugins: [createHistoryPlugin()], content: document.toJSON() });
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    expect(getGitLabCodeContext(editor)).toMatchObject({ suggestion: true, language: 'suggestion' });
    expect(insertText(editor, 'changed();\n')).toBe(true);
    expect(codec.serialize({ doc: editor.state.doc })).toContain('suggestion:-2+1\nchanged();');
    expect(undo(editor)).toBe(true); expect(redo(editor)).toBe(true);
  } finally { editor.destroy(); }
});
it.each(['native', 'html'])('copies and pastes the %s suggestion without losing source or offsets', async format => {
  const { document } = await convert('blank-lines');
  const editor = createEditor({ schema: createGitLabSchemaSpec(), content: document.toJSON() });
  const mount = window.document.createElement('div'); window.document.body.append(mount);
  const view = new EditorView(mount, editor), values = new Map<string, string>();
  const event = (type: string) => {
    const value = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(value, 'clipboardData', { value: { files: [], getData: (key: string) => values.get(key) ?? '', setData: (key: string, text: string) => values.set(key, text) } });
    return value;
  };
  try {
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    view.dom.dispatchEvent(event('copy'));
    if (format === 'html') values.delete('application/x-fountainjs+json');
    view.dom.dispatchEvent(event('paste'));
    expect(editor.state.doc.toJSON()).toEqual(document.toJSON());
  } finally { view.destroy(); editor.destroy(); mount.remove(); }
});
