import { expect, it } from 'vitest';
import { Schema } from 'fountainjs-editor';
import { GitLabMarkdownCodec, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import data from '../integrations/gitlab/fixtures/task-live-html.json';

const shapes: Record<string, unknown> = {
  mixed: ['task_list', ['list_item', 'task_item', 'task_item', 'list_item']],
  'mixed-nested': ['task_list', ['list_item', 'task_item']],
  'mixed-loose': ['task_list', ['list_item', 'task_item']],
  'ordered-tasks': ['ordered_list', ['task_item', 'list_item', 'task_item']],
};
it.each(Object.keys(shapes))('retains actual GitLab mixed-list semantics after an unrelated edit: %s', async name => {
  const fixture = data.fixtures.find(item => item.name === name)!;
  const schema = new Schema(createGitLabSchemaSpec());
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: fixture.body }) });
  const { document } = await codec.deserialize({ schema, markdown: fixture.source, signal: new AbortController().signal });
  expect(document.childCount).toBe(1);
  const list = document.child(0);
  expect([list.type.name, list.content.map(node => node.type.name)]).toEqual(shapes[name]);
  if (name === 'ordered-tasks') expect(list.attrs.start).toBe(3);
  const states: boolean[] = [];
  document.descendants(node => { if (node.type.name === 'task_item') states.push(Boolean(node.attrs.checked)); });
  expect(states).toEqual(name === 'mixed-nested' ? [false, true, false] : name === 'mixed-loose' ? [false] : [false, true]);
  expect(codec.serialize({ doc: document })).toBe(fixture.source);
  const edited = document.copy([...document.content, schema.node('paragraph', {}, [schema.text('Unrelated edit.')])]);
  const report = codec.serializeWithReport({ doc: edited });
  expect(report.issues).toEqual([]);
  const canonical = name === 'mixed-loose'
    ? '- Plain paragraph\n  \n  Follow-up.\n- [ ] Task paragraph\n  \n  Task follow-up.' : fixture.source;
  expect(report.markdown).toBe(canonical + '\n\nUnrelated edit.');
});

it.each(data.fixtures.filter(item => item.name.startsWith('inapplicable')))('retains original source until the not-applicable state has its own editing adapter: $name', async fixture => {
  const schema = new Schema(createGitLabSchemaSpec());
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: fixture.body }) });
  await expect(codec.deserialize({ schema, markdown: fixture.source, signal: new AbortController().signal }))
    .rejects.toMatchObject({ name: 'GitLabMarkdownConversionError', originalMarkdown: fixture.source });
});

it('does not trim an unowned nested-list separator merely because a task-list class is present', async () => {
  const schema = new Schema(createGitLabSchemaSpec());
  const body = '<ul class="task-list"><li>Plain\n<ul><li>Child</li></ul></li><li class="task-list-item"><input type="checkbox"> Task</li></ul>';
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body }) });
  const { document } = await codec.deserialize({ schema, markdown: 'Original', signal: new AbortController().signal });
  expect(document.child(0).child(0).child(0).textContent).toBe('Plain\n');
});
