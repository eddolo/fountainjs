import { expect, it } from 'vitest';
import { Schema } from 'fountainjs-editor';
import { GitLabMarkdownCodec, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import captured from '../integrations/gitlab/fixtures/toc-live-html.json';

const schema = new Schema(createGitLabSchemaSpec());
async function open(id: string, enabled = true, rendering: 'undecorated' | 'reader' = 'undecorated') {
  const sample = captured.cases.find(row => row.id === id)!;
  const codec = new GitLabMarkdownCodec({ tableOfContentsLabel: enabled ? 'Table of contents' : undefined,
    renderMarkdown: async () => ({ body: sample[rendering] }) });
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

it.each(captured.cases.map(row => row.id))('restores the editable blocks from the captured %s reader output', async id => {
  const baseline = await open(id);
  const { document, codec, sample } = await open(id, true, 'reader');
  expect(document.toJSON()).toEqual(baseline.document.toJSON());
  expect(codec.serialize({doc:document})).toBe(sample.source);
  const edited = document.copy([...document.content, schema.node('paragraph', {}, [schema.text('New ending.')])]);
  const expected = baseline.document.copy([...baseline.document.content, edited.content.at(-1)!]);
  expect(codec.serialize({doc:edited})).toBe(baseline.codec.serialize({doc:expected}));
});

it('keeps escaped text and a fenced example literal', async () => {
  const { document } = await open('literal');
  expect(document.content.map(node => node.type.name)).toEqual(['paragraph','code_block']);
});
it('reopens an outline, intentional empty paragraph and prose from the heading-free issue reader', async () => {
  const source = '[[_TOC_]]\n\n<p data-fountain-empty="text"></p>\n\nDraft the outline before adding headings.';
  const rendered = '&#x000A;<p dir="auto"></p>&#x000A;<p data-sourcepos="5:1-5:41" dir="auto">Draft the outline before adding headings.</p>';
  const codec = new GitLabMarkdownCodec({tableOfContentsLabel:'Contents', renderMarkdown:async () => ({body:rendered})});
  const {document} = await codec.deserialize({schema, markdown:source, signal:new AbortController().signal});
  expect(document.content.map(node => node.type.name)).toEqual(['gitlab_table_of_contents','paragraph','paragraph']);
  expect(document.child(1).textContent).toBe('');
  expect(codec.serialize({doc:document})).toBe(source);
  const changed = document.copy([...document.content,schema.node('paragraph', {}, [schema.text('Another paragraph.')])]);
  expect(codec.serialize({doc:changed})).toContain('Draft the outline before adding headings.');
});

it('refuses reader reconstruction when the host drops unrelated prose', async () => {
  const sample = captured.cases.find(row => row.id === 'simple')!;
  const codec = new GitLabMarkdownCodec({tableOfContentsLabel:'Contents', renderMarkdown:async () => ({
    body:sample.reader.replace('<p data-sourcepos="7:1-7:4" dir="auto">End.</p>', ''),
  })});
  await expect(codec.deserialize({schema, markdown:sample.source, signal:new AbortController().signal})).rejects.toThrow();
});

it('leaves other unpositioned editing blocks alone when the directive already has its source span', async () => {
  const codec = new GitLabMarkdownCodec({tableOfContentsLabel:'Contents', renderMarkdown:async () => ({
    body:'<p>First.</p><p data-sourcepos="3:1-3:5">[TOC]</p>',
  })});
  const {document} = await codec.deserialize({schema, markdown:'First.\n\n[TOC]', signal:new AbortController().signal});
  expect(document.content.map(node => node.type.name)).toEqual(['paragraph','gitlab_table_of_contents']);
});

it('preserves an authored heading link beside the reader permalink', async () => {
  const source = '[TOC]\r\n\r\n# [One](/guide)';
  const body = '<ul class="section-nav"><li><a href="#one">One</a></li></ul>'
    + '<h1 id="user-content-one" data-sourcepos="3:1-3:15"><a href="/guide">One</a>'
    + '<a href="#one" class="anchor" data-heading-content="One"></a></h1>';
  const codec = new GitLabMarkdownCodec({tableOfContentsLabel:'Contents', renderMarkdown:async () => ({body})});
  const {document} = await codec.deserialize({schema, markdown:source, signal:new AbortController().signal});
  const heading = document.child(1);
  expect(heading.childCount).toBe(1);
  expect(heading.child(0).marks[0]?.attrs.href).toBe('/guide');
});

it('respects hosts which disable the table of contents', async () => {
  const { document } = await open('simple', false);
  expect(document.child(1).type.name).toBe('paragraph');
});
