import { expect, it } from 'vitest';
import { Schema, type Node } from 'fountainjs-editor';
import { GitLabMarkdownCodec, createGitLabSchemaSpec, GitLabMarkdownConversionError } from '../integrations/gitlab/services/markdown_codec';
import { GITLAB_ALERT_TYPES, GITLAB_ALERT_TITLES } from '../integrations/gitlab/services/alerts';
import live from '../integrations/gitlab/fixtures/alert-live-html.json';
const schema = new Schema(createGitLabSchemaSpec());
async function convert(name: string, change?: (html: string) => string) {
  const fixture = live.fixtures.find(value => value.name === name)!;
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: change ? change(fixture.body) : fixture.body }) });
  const { document } = await codec.deserialize({ schema, markdown: fixture.source, signal: new AbortController().signal });
  return { fixture, codec, document };
}
const append = (doc: Node): Node => doc.copy([...doc.content, schema.node('paragraph', {}, [schema.text('Added')])]);

it.each(live.fixtures.map(value => value.name))('imports actual GitLab %s without a DOM and retains untouched source exactly', async name => {
  expect(typeof document).toBe('undefined');
  const { codec, fixture, document: doc } = await convert(name);
  expect(codec.serialize({ doc })).toBe(fixture.source);
  expect(() => schema.validate(doc)).not.toThrow();
});

it.each(GITLAB_ALERT_TYPES)('retains the %s kind, generated title and marked body through unrelated edits', async kind => {
  const { codec, document: doc } = await convert('default-' + kind);
  const alert = doc.child(0);
  expect(alert.type.name).toBe('gitlab_alert'); expect(alert.attrs.kind).toBe(kind);
  expect(alert.child(0).type.name).toBe('gitlab_alert_title');
  expect(alert.child(0).content).toHaveLength(1); expect(alert.child(0).textContent).toBe('');
  expect(codec.serialize({ doc: append(doc) })).toBe(`> [!${kind}]\n> \n> Body **with marks**.\n\nAdded`);
  expect(alert.child(0).type.spec.toDOM?.(alert.child(0), { document: doc, path: [0, 0] }))
    .toEqual(expect.arrayContaining([expect.objectContaining({ 'data-fountain-default-title': GITLAB_ALERT_TITLES[kind] })]));
});

it.each(['custom', 'custom-default-word', 'other-default-word', 'formatted-title'])('preserves the explicit literal title of %s after a kind change', async name => {
  const { codec, document: doc } = await convert(name);
  const alert = doc.child(0), title = alert.child(0).textContent;
  expect(title.length).toBeGreaterThan(0);
  expect(alert.child(0).content.every(child => child.isText && !child.marks.length)).toBe(true);
  const changed = alert.withAttrs({ ...alert.attrs, kind: 'caution' });
  expect(codec.serialize({ doc: doc.copy([changed]) })).toContain(`> [!caution] ${title}`);
});

it('changes an automatic title together with its kind without saving a fake custom title', async () => {
  const { codec, document: doc } = await convert('default-note');
  const changed = doc.copy([doc.child(0).withAttrs({ kind: 'warning' })]);
  const markdown = codec.serialize({ doc: changed });
  expect(markdown).toContain('> [!warning]\n'); expect(markdown).not.toContain('Note');
});

it('preserves nested alert structure, source markers and body text during export', async () => {
  const { codec, document: doc } = await convert('nested');
  const markdown = codec.serialize({ doc: append(doc) });
  expect(markdown).toBe('> [!note] Outer\n> \n> First.\n> \n> > [!warning] Inner\n> > \n> > Nested.\n\nAdded');
});

it('keeps alert quote prefixes inside list indentation after edits', async () => {
  const { codec, document: doc } = await convert('list');
  const markdown = codec.serialize({ doc: append(doc) });
  expect(markdown).toContain('- > [!important] In a list\n  > \n  > Body.\n- Neighbor.');
});

it('retains nested math and code through the same adapter pipeline', async () => {
  const { codec, document: doc } = await convert('code-math');
  const markdown = codec.serialize({ doc: append(doc) });
  expect(markdown).toContain('> Inline $x^2$.'); expect(markdown).toContain('> ```js\n> const x = 1;\n> ```');
  expect(markdown).not.toContain('FOUNTAINGITLAB');
});

it('retains an empty alert title as an editable real model leaf', async () => {
  const { codec, document: doc } = await convert('empty');
  expect(doc.child(0).child(0).child(0).isText).toBe(true);
  expect(codec.serialize({ doc: append(doc) })).toBe('> [!tip]\n\nAdded');
});

it('keeps every fenced-math line inside nested alert/list containers', () => {
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: '' }) });
  const title = schema.node('gitlab_alert_title', {}, [schema.text('Equation')]);
  const math = schema.node('math_block', { latex: 'x = y\nz = 2\n', gitlabMathSyntax: 'fenced' });
  const alert = schema.node('gitlab_alert', { kind: 'note' }, [title, math]);
  const doc = schema.node('doc', {}, [schema.node('bullet_list', {}, [schema.node('list_item', {}, [alert])])]);
  expect(codec.serialize({ doc })).toBe('- > [!note] Equation\n  > \n  > ```math\n  > x = y\n  > z = 2\n  > ```');
});

it.each([
  (html: string) => html.replace('markdown-alert-note', 'markdown-alert-unknown'),
  (html: string) => html.replace('markdown-alert-note', 'markdown-alert-note markdown-alert-warning'),
  (html: string) => html.replace('class="markdown-alert-title"', 'class="markdown-alert-title" style="color:red"'),
  (html: string) => html.replace('>Note</p>', '><strong>Note</strong></p>'),
  (html: string) => html.replace('>Note</p>', '>Different</p>'),
  (html: string) => html.replace('<p class="markdown-alert-title">Note</p>', ''),
])('refuses ambiguous or mismatched alert markup rather than flattening it', async change => {
  await expect(convert('default-note', change)).rejects.toBeInstanceOf(GitLabMarkdownConversionError);
});

it('retains explicit raw-HTML titles without source marker metadata', async () => {
  const { codec, document: doc } = await convert('custom-default-word', html => html.replace(/ data-sourcepos="[^"]*"/gu, ''));
  expect(doc.child(0).child(0).textContent).toBe('Note');
  expect(codec.serialize({ doc: append(doc) })).toContain('> [!note] Note');
});
