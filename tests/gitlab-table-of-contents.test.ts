import { expect, it } from 'vitest';
import { Schema } from 'fountainjs-editor';
import { GitLabMarkdownCodec, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import captured from '../integrations/gitlab/fixtures/toc-live-html.json';

const schema = new Schema(createGitLabSchemaSpec());
async function open(id: string, enabled = true) {
  const sample = captured.cases.find(row => row.id === id)!;
  const codec = new GitLabMarkdownCodec({ tableOfContentsLabel: enabled ? 'Table of contents' : undefined,
    renderMarkdown: async () => ({ body: sample.undecorated }) });
  const { document } = await codec.deserialize({ schema, markdown: sample.source, signal: new AbortController().signal });
  return { document, codec, sample };
}

it.each([['simple',['[tOc]']], ['wiki',['[[_TOC_]]']], ['empty',['[TOC]']], ['aliases',['[TOC]','[[_tOc_]]']]] as const)(
  'retains %s directive spellings after editing another block', async (id, tokens) => {
    const { document, codec, sample } = await open(id);
    expect(document.content.filter(node => node.type.name === 'gitlab_table_of_contents').map(node => node.attrs.token)).toEqual(tokens);
    expect(codec.serialize({doc:document})).toBe(sample.source);
    const edited = document.copy([...document.content,schema.node('paragraph', {}, [schema.text('New ending.')])]);
    const output = codec.serialize({doc:edited});
    for (const token of tokens) expect(output).toContain(token);
    expect(output).not.toContain('/-/blob/');
    expect(output).toContain('New ending.');
  });

it('keeps escaped text and a fenced example literal', async () => {
  const { document } = await open('literal');
  expect(document.content.map(node => node.type.name)).toEqual(['paragraph','code_block']);
});
it('respects hosts which disable the table of contents', async () => {
  const { document } = await open('simple', false);
  expect(document.child(1).type.name).toBe('paragraph');
});
