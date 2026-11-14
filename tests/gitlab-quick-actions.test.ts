import { expect, it } from 'vitest';
import { Schema, type Node } from 'fountainjs-editor';
import { GitLabMarkdownCodec, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { transformGitLabQuickActions } from '../integrations/gitlab/services/quick_actions';
import live from '../integrations/gitlab/fixtures/quick-actions-live-html.json';

const schema = new Schema(createGitLabSchemaSpec());
const append = (document: Node) => document.copy([...document.content,
  schema.node('paragraph', {}, [schema.text('Added.')])]);
const fixture = (name: string) => {
  const value = live.fixtures.find(item => item.name === name);
  if (!value) throw new Error(`Missing actual GitLab fixture: ${name}`);
  return value;
};
async function convert(name: string) {
  const value = fixture(name);
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async source => {
    expect(source).toBe(value.renderedSource);
    return value;
  } });
  const { document } = await codec.deserialize({ schema, markdown: value.source, signal: new AbortController().signal });
  return { ...value, codec, document };
}

it.each(live.fixtures)('matches the pinned host transform for $name', value => {
  expect(transformGitLabQuickActions(value.source)).toBe(value.renderedSource);
});

it.each(['close', 'close-newline', 'reopen', 'confidential', 'title', 'due', 'assign', 'label',
  'unknown', 'slash', 'paragraph-lines', 'multiple', 'reference-definition', 'code', 'tilde-code',
  'long-fence', 'quote', 'list', 'indented', 'marked', 'inline-code', 'crlf',
  'escaped', 'entity', 'html', 'two-commands-paragraph', 'after-command-alert',
  'after-command-frontmatter', 'after-command-audio'])
('round-trips actual GitLab %s source and permits an unrelated edit', async name => {
  const { codec, document, source } = await convert(name);
  expect(codec.serialize({ doc: document })).toBe(source);
  const result = codec.serializeWithReport({ doc: append(document) });
  expect(result.issues).toEqual([]);
  expect(result.markdown).toContain('Added.');
  expect(typeof globalThis.document).toBe('undefined');
});

it.each(['close', 'reopen', 'confidential', 'title', 'due', 'assign', 'label', 'unknown'])
('retains %s as an unescaped authored command after an edit', async name => {
  const { codec, document, source } = await convert(name);
  expect(codec.serialize({ doc: append(document) })).toBe(source + '\n\nAdded.');
  expect(document.child(0).attrs.gitlabLiteralSlash).toBe(false);
});

it.each(['escaped', 'entity', 'html'])('does not activate the literal slash in %s after another edit', async name => {
  const { codec, document } = await convert(name);
  expect(document.child(0).attrs.gitlabLiteralSlash).toBe(true);
  expect(codec.serialize({ doc: append(document) })).toBe('\\/close\n\nAdded.');
});

it('preserves a reference definition after an action using the real host isolation', async () => {
  const { codec, document } = await convert('reference-definition');
  expect(document.child(0).textContent).toBe('Link to help');
  expect(document.child(0).child(1).marks[0]!.attrs.href).toBe('https://example.com');
  expect(codec.serialize({ doc: append(document) })).toBe('Link to [help](https://example.com)\n\n/close\n\nAdded.');
});

it('retains distinct commands and a reference atom after an unrelated edit', async () => {
  const { codec, document } = await convert('multiple');
  expect(codec.serialize({ doc: append(document) })).toBe('/close\n\n/assign @root\n\nAfter.\n\nAdded.');
});

it.each(['marked', 'inline-code'])('keeps %s inert when an author removes inline formatting', async name => {
  const { codec, document } = await convert(name);
  const plain = schema.node('paragraph', document.child(0).attrs, [schema.text('/close')]);
  expect(codec.serialize({ doc: schema.node('doc', {}, [plain]) })).toBe('\\/close');
});

it.each(['quote', 'list'])('keeps a %s command inert when its imported paragraph moves to the root', async name => {
  const { codec, document } = await convert(name);
  let paragraph: Node | undefined;
  document.descendants(node => { if (node.type.name === 'paragraph' && node.textContent === '/close') paragraph = node; });
  expect(paragraph).toBeDefined();
  expect(codec.serialize({ doc: schema.node('doc', {}, [paragraph!]) })).toBe('\\/close');
});

it('serializes a newly typed command as literal command arguments rather than Markdown escapes', () => {
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: '' }) });
  const source = '/title Value_with_underscores *asterisk* \\path';
  const document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text(source)])]);
  expect(codec.serialize({ doc: document })).toBe(source);
});

it('refuses ambiguous literal/command ownership instead of activating identical HTML text', async () => {
  const source = '/close\n\n<p>/close</p>';
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({
    body: '<p dir="auto">/close</p><p dir="auto">/close</p>',
    references: { commands: '<p>Closes this item.</p>' },
  }) });
  await expect(codec.deserialize({ schema, markdown: source, signal: new AbortController().signal }))
    .rejects.toMatchObject({ originalMarkdown: source, issues: [expect.objectContaining({ code: 'quick-action-source' })] });
});

it('retains source when the actual renderer strips HTML-like command arguments', async () => {
  const value = fixture('unicode');
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => value });
  await expect(codec.deserialize({ schema, markdown: value.source, signal: new AbortController().signal }))
    .rejects.toMatchObject({ originalMarkdown: value.source, issues: [expect.objectContaining({ code: 'quick-action-source' })] });
});

it('refuses uncertain ownership across inline HTML instead of silently disabling a raw command', async () => {
  const source = '<span>Lead</span>\n/close';
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: '<p>Lead</p><p>/close</p>' }) });
  await expect(codec.deserialize({ schema, markdown: source, signal: new AbortController().signal }))
    .rejects.toMatchObject({ originalMarkdown: source, issues: [expect.objectContaining({ code: 'quick-action-source' })] });
});

it.each(['code', 'tilde-code', 'long-fence', 'indented'])('retains slash lines as code in %s after another edit', async name => {
  const { codec, document } = await convert(name);
  const blocks = document.content.filter(node => node.type.name === 'code_block');
  expect(blocks).toHaveLength(1);
  expect(blocks[0]!.textContent).toContain('/close');
  expect(codec.serialize({ doc: append(document) })).toContain('\n' + blocks[0]!.textContent + '\n');
});

it('matches an alert title against the shifted renderer coordinates after an isolated command', async () => {
  const { codec, document } = await convert('after-command-alert');
  const alert = document.content.find(node => node.type.name === 'gitlab_alert');
  expect(alert?.child(0).textContent).toBe('Note');
  expect(codec.serialize({ doc: append(document) })).toContain('> [!note] Note');
});

it('matches fenced metadata against the actual renderer input after a command', async () => {
  const { codec, document } = await convert('after-command-frontmatter');
  const metadata = document.content.find(node => node.type.name === 'code_block');
  expect(metadata?.attrs.gitlabFrontmatter).toEqual({ kind: 'fence' });
  expect(metadata?.textContent).toBe('title: Paper');
  expect(codec.serialize({ doc: append(document) })).toContain('```yaml frontmatter\ntitle: Paper\n```');
});

it('retains the separate media description and title after a command', async () => {
  const { codec, document } = await convert('after-command-audio');
  let audio: Node | undefined;
  document.descendants(node => { if (node.type.name === 'gitlab_media') audio = node; });
  expect(audio?.attrs).toMatchObject({ alt: 'Audio description', title: 'Retained audio title' });
  expect(codec.serialize({ doc: append(document) })).toContain('![Audio description](/uploads/media-fixture/recording.wav "Retained audio title")');
});
