import { afterEach, expect, it } from 'vitest';
import { Schema, Selection, RangeSelection, NodeSelection, textPointToPosition, selectAll, insertText, undo, redo, type Node } from 'fountainjs-editor';
import { GitLabMarkdownCodec, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { getGitLabCodeContext } from '../integrations/gitlab/services/code_editing';
import { insertGitLabFrontmatter } from '../integrations/gitlab/services/code_editing';
import live from '../integrations/gitlab/fixtures/frontmatter-live-html.json';

const schema = new Schema(createGitLabSchemaSpec());
const fixture = (name: string) => {
  const value = live.fixtures.find(item => item.name === name);
  if (!value) throw new Error(`Missing actual GitLab fixture: ${name}`);
  return value;
};
async function convert(name: string) {
  const value = fixture(name);
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: value.body }) });
  const { document } = await codec.deserialize({ schema, markdown: value.source, signal: new AbortController().signal });
  return { document, codec, ...value };
}
const append = (doc: Node) => doc.copy([...doc.content, schema.node('paragraph', {}, [schema.text('Added.')])]);

it.each(['yaml', 'toml', 'json', 'yaml-empty', 'toml-empty', 'json-empty', 'yaml-only',
  'yaml-crlf', 'yaml-close-dots', 'yaml-bom', 'yaml-invalid', 'yaml-literal', 'encoding', 'blank-prefix',
  'explicit-language', 'different-close', 'unknown-language', 'yaml-blank-content', 'yaml-trailing-blank'])
('imports actual GitLab %s header as literal editable source, retaining its delimiters after another edit', async name => {
  const { document, codec, source } = await convert(name);
  const header = document.child(0);
  expect(header.type.name).toBe('code_block');
  expect(header.attrs.gitlabFrontmatter).toMatchObject({ kind: 'header' });
  expect(header.content.every(child => child.isText && !child.marks.length)).toBe(true);
  expect(codec.serialize({ doc: document })).toBe(source);
  const output = codec.serialize({ doc: append(document) });
  const originalHeader = source.split(/(?:\r?\n){2}Body/u)[0]!;
  expect(output.startsWith(originalHeader)).toBe(true);
  expect(output).toContain('Added.');
  expect(output).not.toContain('```');
  expect(typeof globalThis.document).toBe('undefined');
});

it.each(['fenced-param', 'fenced-param-nested', 'fenced-colon', 'fenced-after-prose', 'two-fenced'])('retains %s as a fence instead of inventing document metadata', async name => {
  const { document, codec, source } = await convert(name);
  const nodes: Node[] = [];
  document.descendants(node => { if (node.type.name === 'code_block') nodes.push(node); });
  expect(nodes).toHaveLength(name === 'two-fenced' ? 2 : 1);
  for (const node of nodes) expect(node.attrs.gitlabFrontmatter).toEqual({ kind: 'fence' });
  expect(codec.serialize({ doc: document })).toBe(source);
  expect(codec.serialize({ doc: append(document) })).toBe(source.replace('yaml:frontmatter', 'yaml frontmatter') + '\n\nAdded.');
});

it.each(['nested', 'after-prose'])('does not misclassify %s delimiter text as metadata', async name => {
  const { document, codec, source } = await convert(name);
  expect(codec.serialize({ doc: document })).toBe(source);
  document.descendants(node => { expect(node.attrs.gitlabFrontmatter).toBeFalsy(); });
});

const services: GitLabContentEditor[] = [];
afterEach(() => services.splice(0).forEach(service => service.dispose()));
async function setup(name = 'yaml') {
  const value = fixture(name);
  const service = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async () => ({ body: value.body }) });
  services.push(service); await service.setSerializedContent(value.source);
  const { editor } = service;
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  return { service, editor, ...value };
}
it('edits the actual header with ordinary editor input, deletes it and restores exact source through undo', async () => {
  const { service, editor, source } = await setup();
  expect(getGitLabCodeContext(editor)).toMatchObject({ frontmatter: 'header', language: 'yaml' });
  expect(insertText(editor, '# New comment\n')).toBe(true);
  expect(service.getSerializedContent()).toContain('---\n# New comment\ntitle: Paper');
  expect(undo(editor)).toBe(true);
  expect(service.getSerializedContent()).toBe(source);
  expect(redo(editor)).toBe(true);
  expect(service.beginCodeEdit().remove()).toBe(true);
  expect(service.getSerializedContent()).not.toContain('title: Paper');
  expect(undo(editor)).toBe(true);
  expect(service.getSerializedContent()).toContain('# New comment');
});
it('changes header format deliberately, preserves source and retains one-step undo', async () => {
  const { service, editor, source } = await setup();
  expect(service.beginCodeEdit().applyLanguage('toml')).toBe(true);
  expect(service.getSerializedContent()).toMatch(/^\+\+\+\ntitle: Paper/u);
  expect(getGitLabCodeContext(editor)).toMatchObject({ frontmatter: 'header', language: 'toml' });
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(source);
  expect(() => service.beginCodeEdit().applyLanguage('javascript')).toThrow('GITLAB_FRONTMATTER_LANGUAGE');
  expect(service.getSerializedContent()).toBe(source);
});
it('refuses a source edit that would prematurely close the header without publishing partial content', async () => {
  const { service, editor, source } = await setup();
  const before = editor.state.doc;
  expect(() => service.beginCodeEdit().applySource('title: Paper\n---\nInjected body')).toThrow();
  expect(editor.state.doc).toBe(before);
  expect(service.getSerializedContent()).toBe(source);
});
it('refuses moving or duplicating a header instead of silently changing it into body text', async () => {
  const { document, codec } = await convert('yaml');
  expect(() => codec.serialize({ doc: document.copy([...document.content.slice(1), document.child(0)]) })).toThrow();
  expect(() => codec.serialize({ doc: document.copy([document.child(0), ...document.content]) })).toThrow();
});

it.each(['yaml', 'toml', 'json'])('inserts %s frontmatter without replacing body text, selects it and preserves undo/redo', async language => {
  const { service, editor } = await setup('after-prose');
  const before = editor.state.doc, original = service.getSerializedContent();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
  expect(service.insertFrontmatter(language)).toBe(true);
  expect(editor.state.doc.content.slice(1)).toEqual(before.content);
  expect(getGitLabCodeContext(editor)).toMatchObject({ frontmatter: 'header', language, text: '' });
  expect(() => service.insertFrontmatter()).toThrow('GITLAB_FRONTMATTER_EXISTS');
  expect(service.getSerializedContent()).toMatch(new RegExp(`^${({ yaml: '---', toml: '\\+\\+\\+', json: ';;;' })[language as 'yaml']}\\n`));
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(original);
  expect(redo(editor)).toBe(true); expect(getGitLabCodeContext(editor)?.frontmatter).toBe('header');
});

it('converts a header into ordinary code explicitly, preserving content, deletion and undo', async () => {
  const { service, editor, source } = await setup();
  const text = editor.state.doc.child(0).textContent;
  expect(service.beginCodeEdit().convertToCode()).toBe(true);
  expect(getGitLabCodeContext(editor)?.frontmatter).toBeUndefined();
  expect(service.getSerializedContent()).toContain('```yaml\n' + text + '\n```');
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(source);
  expect(service.setCodeBlock('mermaid')).toBe(true);
  expect(getGitLabCodeContext(editor)).toMatchObject({ language: 'mermaid' });
  expect(service.getSerializedContent()).toContain('```mermaid\n' + text);
});

it('keeps header characters including original CRLF after changing the body and after a source edit', async () => {
  const { service, editor, source } = await setup('yaml-crlf');
  const originalHeader = source.slice(0, source.indexOf('\r\n\r\nBody'));
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 5)));
  expect(insertText(editor, ' Extra.')).toBe(true);
  expect(service.getSerializedContent()).toBe(originalHeader + '\n\nBody. Extra.');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  expect(service.beginCodeEdit().applySource('title: Paper\r\n# Exact\r\n')).toBe(true);
  expect(service.getSerializedContent()).toContain('---\r\ntitle: Paper\r\n# Exact\r\n\r\n---');
});

it('rejects unmatched renderer/source metadata, unsafe carriers and unknown fence parameters', async () => {
  const value = fixture('yaml');
  for (const body of [value.body.replace('title</span>', 'wrong</span>'),
    value.body.replace('data-canonical-lang="yaml"', 'data-canonical-lang="json"'),
    value.body.replace('<code>', '<code data-unknown="retained">'),
    value.body.replace('data-sourcepos="1:1-6:3"', 'data-sourcepos="8:1-13:3"')]) {
    const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body }) });
    await expect(codec.deserialize({ schema, markdown: value.source, signal: new AbortController().signal }))
      .rejects.toMatchObject({ originalMarkdown: value.source });
  }
  const unrendered = fixture('yaml-cr');
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: unrendered.body }) });
  await expect(codec.deserialize({ schema, markdown: unrendered.source, signal: new AbortController().signal }))
    .rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ code: 'frontmatter-source' })]) });
});

it('inserts no header and publishes no content when validation refuses a completed insertion', async () => {
  const { service, editor } = await setup('after-prose');
  const before = editor.state.doc, original = service.getSerializedContent();
  expect(() => insertGitLabFrontmatter(editor, 'yaml', () => { throw new Error('REFUSED'); })).toThrow('REFUSED');
  expect(editor.state.doc).toBe(before); expect(service.getSerializedContent()).toBe(original);
  expect(undo(editor)).toBe(false);
  service.setEditable(false);
  expect(() => service.insertFrontmatter()).toThrow('GITLAB_EDITOR_NOT_READY');
  expect(editor.state.doc).toBe(before);
});
it('serializes a large literal frontmatter fence without an argument-spread limit or delimiter collision', () => {
  const text = 'value ` '.repeat(140_000) + '\n````';
  const doc = schema.node('doc', {}, [schema.node('code_block', { language: 'yaml', gitlabFrontmatter: { kind: 'fence' } }, [schema.text(text)])]);
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: '' }) });
  expect(codec.serialize({ doc })).toBe('`````yaml frontmatter\n' + text + '\n`````');
});
it.each(['all', 'range', 'backward', 'node'])('protects %s header selection from formatting keys and beforeinput while leaving body/IME input available', async kind => {
  const { editor } = await setup();
  if (kind === 'all') selectAll(editor);
  else editor.dispatch(editor.createTransaction().setSelection(kind === 'node' ? new NodeSelection(editor.state.doc, [0])
    : kind === 'backward' ? new RangeSelection(editor.state.doc, textPointToPosition(editor.state.doc, [1, 0], 3),
      textPointToPosition(editor.state.doc, [0, 0], 1)) : Selection.range([0, 0], 1, [1, 0], 3)));
  const plugin = editor.state.plugins[0]!;
  for (const key of ['b', 'i', 'u'])
    expect(plugin.spec.props!.handleKeyDown!(editor, { key, ctrlKey: true } as KeyboardEvent)).toBe(true);
  expect(plugin.spec.props!.handleBeforeInput!(editor, { inputType: 'formatBold' } as InputEvent)).toBe(true);
  expect(plugin.spec.props!.handleKeyDown!(editor, { key: 'b', ctrlKey: true, isComposing: true } as KeyboardEvent)).toBe(false);
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 2)));
  expect(plugin.spec.props!.handleKeyDown!(editor, { key: 'b', ctrlKey: true } as KeyboardEvent)).toBe(false);
  expect(plugin.spec.props!.handleBeforeInput!(editor, { inputType: 'formatBold' } as InputEvent)).toBe(false);
});
