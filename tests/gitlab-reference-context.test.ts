import { expect, it } from 'vitest';
import { Schema, type Node } from 'fountainjs-editor';
import { GitLabMarkdownCodec, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import data from '../integrations/gitlab/fixtures/reference-context-live-html.json';

const schema = new Schema(createGitLabSchemaSpec());
const fixtures = new Map(data.fixtures.map(item => [item.name, item]));
async function load(name: string) {
  const fixture = fixtures.get(name)!;
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: fixture.body }) });
  const { document } = await codec.deserialize({ schema, markdown: fixture.source, signal: new AbortController().signal });
  return { codec, document, fixture };
}
const references = (document: Node): Node[] => {
  const result: Node[] = [];
  document.descendants(node => { if (node.type.name === 'gitlab_reference') result.push(node); });
  return result;
};

it.each([
  ['issue-word-before', 0], ['issue-word-after', 0], ['issue-dash-before', 0],
  ['issue-underscore-before', 0], ['issue-slash-before', 1], ['issue-unicode-before', 1],
  ['issue-mark-before', 1], ['issue-mark-after', 1], ['issue-marked', 1],
  ['issue-link-label', 0], ['issue-code', 0], ['issue-escaped', 0],
  ['mr-word-before', 0], ['mr-word-after', 1], ['user-word-before', 0],
  ['user-word-after', 0], ['label-word-before', 0], ['label-word-after', 1],
] as const)('imports actual GitLab %s context with %i references', async (name, count) => {
  const { codec, document, fixture } = await load(name);
  expect(references(document)).toHaveLength(count);
  expect(codec.serialize({ doc: document })).toBe(fixture.source);
});

it.each(['issue', 'mr', 'user', 'label'])('retains an edited %s atom between adjacent words through actual GitLab HTML', async kind => {
  const { codec, document, fixture } = await load(`${kind}-span-boundary`);
  const reference = references(document)[0]!;
  expect(reference).toBeDefined();
  // Reconstruct the real user edit, rather than accepting an untouched-source snapshot.
  const edited = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('prefix'), reference, schema.text('suffix')])]);
  const before = edited.toJSON();
  const result = codec.serializeWithReport({ doc: edited });
  expect(result.issues).toEqual([]);
  expect(result.markdown).toBe(fixture.source.replaceAll(' & ', ' &amp; '));
  expect(result.preservation).toBe('canonical');
  expect(edited.toJSON()).toEqual(before);
  const reopened = await load(`${kind}-span-boundary`);
  expect(references(reopened.document).map(node => node.attrs)).toEqual([reference.attrs]);
  expect(reopened.document.textContent).toBe(edited.textContent);
  expect(typeof globalThis.document).toBe('undefined');
});

it.each(['code', 'link'])('reports %s formatting that would turn a reference into literal text or an ordinary link', async kind => {
  const { codec, document } = await load('issue-alone');
  const reference = references(document)[0]!;
  const mark = schema.marks[kind]!.create(kind === 'link' ? { href: '/help/user/project' } : {});
  const edited = schema.node('doc', {}, [schema.node('paragraph', {}, [reference.withMarks([mark])])]);
  expect(codec.serializeWithReport({ doc: edited }).issues).toContainEqual(expect.objectContaining({
    stage: 'export', code: 'reference-mark-context', path: [0, 0],
  }));
  expect(() => codec.serialize({ doc: edited })).toThrow();
});

it.each(['issue-mark-before', 'issue-mark-after', 'issue-punctuation'])('keeps existing rendered text boundaries for %s without changing visible text', async name => {
  const { codec, document } = await load(name);
  const changed = document.copy([...document.content, schema.node('paragraph', {}, [schema.text('Added.')])]);
  const result = codec.serializeWithReport({ doc: changed });
  expect(result.issues).toEqual([]);
  if (name.startsWith('issue-mark-')) expect(result.markdown).not.toContain('<span>');
  else expect(result.markdown).toContain('See: <span>#75</span>.');
  expect(result.markdown).toContain('Added.');
});

it('isolates adjacent reference atoms and escapes HTML text rather than interpreting it', async () => {
  const { codec, document } = await load('issue-alone');
  const reference = references(document)[0]!;
  const changed = schema.node('doc', {}, [schema.node('paragraph', {}, [reference, reference])]);
  expect(codec.serialize({ doc: changed })).toBe('<span>#75</span><span>#75</span>');
  const untrusted = reference.withAttrs({ ...reference.attrs, original: '~"A &amp; <img src=x onerror=alert(1)>"' });
  const literal = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('prefix'), untrusted])]);
  const result = codec.serialize({ doc: literal });
  expect(result).toBe('prefix<span>~"A &amp;amp; &lt;img src=x onerror=alert(1)&gt;"</span>');
  expect(result).not.toContain('<img');
});

it('blocks lossy submission while keeping the document editable and recovers after removing invalid formatting', async () => {
  const fixture = fixtures.get('issue-alone')!;
  const service = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async () => ({ body: fixture.body }) });
  try {
    await service.setSerializedContent(fixture.source);
    const { editor } = service, original = editor.state.doc, schema = original.type.schema;
    const reference = references(original)[0]!;
    const marked = reference.withMarks([schema.mark('code')]);
    const invalid = schema.node('doc', {}, [schema.node('paragraph', {}, [marked])]);
    editor.dispatch(editor.createTransaction().replaceDocument(invalid));
    expect(service.status).toBe('error');
    expect(service.editable).toBe(true);
    expect(() => service.getSerializedContent()).toThrow();
    expect(editor.state.doc.toJSON()).toEqual(invalid.toJSON());
    editor.dispatch(editor.createTransaction().replaceDocument(original));
    expect(service.status).toBe('ready');
    expect(service.getSerializedContent()).toBe(fixture.source);
  } finally { service.dispose(); }
});
