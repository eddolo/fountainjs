import { expect, it } from 'vitest';
import { Schema, type Node } from 'fountainjs-editor';
import { GitLabMarkdownCodec, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import data from '../integrations/gitlab/fixtures/task-live-html.json';

async function convert(source: string, body: string) {
  const schema = new Schema(createGitLabSchemaSpec());
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body }) });
  const { document } = await codec.deserialize({ schema, markdown: source, signal: new AbortController().signal });
  return { codec, document };
}
function taskText(document: Node): string[] {
  const result: string[] = [];
  document.descendants(node => {
    if (node.type.name === 'task_item') result.push(node.child(0).textContent);
  });
  return result;
}
const expected: Record<string, string[]> = {
  plain: ['Verify deployment', 'Review migration'],
  marked: ['Bold and code', 'Link'],
  nested: ['Parent', 'Child', 'Leaf'],
  loose: ['First', 'Second'],
  empty: ['', ''],
  'extra-source-spaces': ['  Keep extra source spaces'],
  quote: ['First'],
  'nested-authored-newline': ['Parent\n', 'Child'],
  'nested-hex-newline': ['Parent\n', 'Child'],
  'nested-named-newline': ['Parent\n', 'Child'],
  'nested-escaped-newline': ['Parent&#10;', 'Child'],
  'nested-marked': ['Parent', 'Child'],
  'tight-quote': ['First'],
  'authored-space-entities': ['  Keep two spaces'],
  'authored-nbsp': ['\u00a0Keep NBSP'],
  'authored-tab': ['\tKeep tab'],
};

it.each(Object.keys(expected))('imports task content without its generated checkbox separator: %s', async name => {
  const item = data.fixtures.find(item => item.name === name)!;
  expect(item).toBeDefined();
  const { codec, document } = await convert(item.source, item.body);
  expect(taskText(document)).toEqual(expected[item.name]);
  expect(codec.serialize({ doc: document })).toBe(item.source);
  const schema = document.type.schema;
  const edited = document.copy([...document.content, schema.node('paragraph', {}, [schema.text('Unrelated edit.')])]);
  const markdown = codec.serialize({ doc: edited });
  if (['plain', 'nested', 'nested-authored-newline', 'nested-marked', 'authored-space-entities'].includes(item.name))
    expect(markdown).toBe(item.source + '\n\nUnrelated edit.');
  if (item.name === 'loose') expect(markdown).toContain('Follow-up paragraph.');
  if (item.name === 'nested') expect(markdown).toContain('- [x] Child');
});

it.each([
  ['untagged input', '<input type="checkbox" data-checkbox-sourcepos="1:4-1:4"> Keep', ' Keep'],
  ['unowned tagged input', '<input type="checkbox" class="task-list-item-checkbox"> Keep', ' Keep'],
  ['no generated separator', '<input type="checkbox" class="task-list-item-checkbox" data-checkbox-sourcepos="1:4-1:4">Keep', 'Keep'],
  ['non-ASCII prefix', '<input type="checkbox" class="task-list-item-checkbox" data-checkbox-sourcepos="1:4-1:4">&#160;Keep', '\u00a0Keep'],
])('does not blindly trim task content: %s', async (_name, content, text) => {
  const html = `<ul class="task-list"><li class="task-list-item">${content}</li></ul>`;
  const { document } = await convert('- [ ] Keep', html);
  expect(taskText(document)).toEqual([text]);
});

it('retains a soft continuation and nested quote while dropping only the checkbox separator', async () => {
  for (const name of ['continuation', 'quote']) {
    const item = data.fixtures.find(item => item.name === name)!;
    const { codec, document } = await convert(item.source, item.body);
    expect(taskText(document)[0]).toMatch(/^First/);
    expect(document.textContent).toContain(name === 'quote' ? 'Quoted follow-up' : 'second line');
    expect(codec.serialize({ doc: document })).toBe(item.source);
  }
});
