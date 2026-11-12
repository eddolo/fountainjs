import { expect, it } from 'vitest';
import { Schema } from 'fountainjs-editor';
import { GitLabMarkdownCodec, createGitLabSchemaSpec, GitLabMarkdownConversionError } from '../integrations/gitlab/services/markdown_codec';
import fixtures from '../integrations/gitlab/fixtures/code-block-html.json';
import live from '../integrations/gitlab/fixtures/code-block-live-html.json';
const schema = new Schema(createGitLabSchemaSpec());
async function convert(html: string, source: string) {
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: html }) });
  const { document } = await codec.deserialize({ schema, markdown: source, signal: new AbortController().signal });
  return { codec, document };
}
it.each([
  ['CODE_BLOCK_HTML', 'javascript', "console.log('hello world')"],
  ['EMPTY_CODE_BLOCK_HTML', 'js', ''],
] as const)('imports actual pinned GitLab %s and retains its source after unrelated edits', async (key, language, text) => {
  const source = '```' + language + '\n' + text + '\n```';
  const { codec, document } = await convert(fixtures.fixtures[key], source);
  expect(document.childCount).toBe(1);
  expect(document.child(0).type.name).toBe('code_block');
  expect(document.child(0).attrs.language).toBe(language);
  expect(document.child(0).textContent).toBe(text);
  expect(codec.serialize({ doc: document })).toBe(source);
  const edited = document.copy([...document.content, schema.node('paragraph', {}, [schema.text('Added')])]);
  const exported = codec.serialize({ doc: edited });
  expect(exported).toContain('```' + language + '\n'); expect(exported).toContain(text);
  expect(exported).not.toContain('LC1'); expect(exported).not.toContain('copy-code');
});
it('retains literal entities, whitespace, Unicode and empty lines across renderer line spans', async () => {
  const text = '  <tag>&\n\n\tα\u200b😀\n';
  const source = '```text\n' + text + '```';
  const html = '<pre data-canonical-lang="text"><code><span id="LC1" class="line">  &lt;tag&gt;&amp;</span>\n<span class="line"></span>\n<span class="line">\tα\u200b😀</span>\n</code></pre>';
  const { document } = await convert(html, source); expect(document.child(0).textContent).toBe(text);
});
it('imports the actual service response including data-lang and the empty snippet control', async () => {
  const { document, codec } = await convert(live.html, live.upstream.request);
  expect(document.childCount).toBe(1); expect(document.child(0).attrs.language).toBe('javascript');
  expect(document.textContent).toBe('const total = 42;\nconsole.log(total);');
  const changed = document.copy([document.child(0).withAttrs({ ...document.child(0).attrs, language: 'python' })]);
  expect(codec.serialize({ doc: changed })).toBe('```python\nconst total = 42;\nconsole.log(total);\n```');
});
it('refuses nonempty renderer controls rather than discarding their content', async () => {
  await expect(convert(live.html.replace('<insert-code-snippet></insert-code-snippet>', '<insert-code-snippet>Additional content</insert-code-snippet>'), live.upstream.request))
    .rejects.toBeInstanceOf(GitLabMarkdownConversionError);
});
it.each([
  '<pre data-canonical-lang="js"><code><a href="/x">linked</a></code></pre>',
  '<pre data-canonical-lang="js"><code><span style="color:red">styled</span></code></pre>',
  '<pre data-canonical-lang="js" data-unknown="value"><code>metadata</code></pre>',
  '<pre data-canonical-lang="two words"><code>invalid</code></pre>',
  '<pre data-canonical-lang="js"><code>first</code><code>second</code></pre>',
])('refuses ambiguous code rendering without claiming conversion succeeded', async html => {
  await expect(convert(html, '```js\noriginal\n```')).rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ code: 'code-rendering' })]) });
});
it.each(['mermaid', 'plantuml', 'math', 'suggestion', 'glql'])('keeps %s out of the ordinary code adapter', async language => {
  await expect(convert(`<pre data-canonical-lang="${language}"><code>special</code></pre>`, 'source')).rejects.toBeInstanceOf(GitLabMarkdownConversionError);
});
it('refuses fence parameters until their source representation is implemented', async () => {
  await expect(convert('<pre data-canonical-lang="json" data-lang-params="title=Example"><code>{}</code></pre>', 'source')).rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ code: 'specialized-renderer' })]) });
});
