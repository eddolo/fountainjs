import { expect, it } from 'vitest';
import { Schema } from 'fountainjs-editor';
import { GitLabMarkdownCodec, GitLabMarkdownConversionError, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import live from '../integrations/gitlab/fixtures/footnote-live-html.json';
import { gitLabHasFootnoteDefinitions } from '../integrations/gitlab/services/footnote_source';
import { transformGitLabQuickActions } from '../integrations/gitlab/services/quick_actions';

it.each(['unreferenced', 'escaped'])('does not silently discard the %s footnote source hidden by the real renderer', async name => {
  const fixture = live.fixtures.find(item => item.name === name)!;
  expect(fixture.body).not.toContain('class="footnotes"');
  const schema = new Schema(createGitLabSchemaSpec());
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: fixture.body }) });
  try {
    await codec.deserialize({ schema, markdown: fixture.source, signal: new AbortController().signal });
    throw new Error('The omitted definition was accepted without a source-aware footnote adapter.');
  } catch (error) {
    expect(error).toBeInstanceOf(GitLabMarkdownConversionError);
    expect((error as GitLabMarkdownConversionError).originalMarkdown).toBe(fixture.source);
    expect((error as GitLabMarkdownConversionError).issues.some(issue => issue.code === 'footnote-source')).toBe(true);
  }
});

const literalCases = new Set(['space', 'code', 'missing', 'raw-html', 'header-example']);
it.each(live.fixtures)('uses the real $name rendering without silently accepting omitted source', async fixture => {
  expect(typeof globalThis.document).toBe('undefined');
  const definitions = !literalCases.has(fixture.name);
  expect(gitLabHasFootnoteDefinitions(fixture.source, 1_048_576)).toBe(definitions);
  const schema = new Schema(createGitLabSchemaSpec());
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: fixture.body }) });
  const result = codec.deserialize({ schema, markdown: fixture.source, signal: new AbortController().signal });
  if (definitions) await expect(result).rejects.toMatchObject({ originalMarkdown: fixture.source,
    issues: expect.arrayContaining([expect.objectContaining({ code: 'footnote-source' })]) });
  else if (fixture.name === 'raw-html') {
    // The existing HTML boundary refuses this rendering; it is not mistaken
    // for a source footnote by the new inspection grammar.
    await expect(result).rejects.toMatchObject({ originalMarkdown: fixture.source });
    await result.catch(error => expect(error.issues.some((issue: { code: string }) => issue.code === 'footnote-source')).toBe(false));
  } else {
    const { document } = await result;
    expect(codec.serialize({ doc: document })).toBe(fixture.source);
  }
});

it.each([
  '```md\n[^hidden]: Literal code.\n```',
  '    [^hidden]: Indented code.',
  '<!--\n[^hidden]: Comment only.\n-->',
  '<pre>\n[^hidden]: Raw HTML.\n</pre>',
  '\\[^hidden]: Escaped definition syntax.',
  '[^two words]: The actual GitLab renderer treats this as ordinary text.',
  '---\nexample: |\n  [^hidden]: Metadata example.\n---\n\nProse.',
])('does not confuse a literal source example with an omitted definition %#', source => {
  expect(gitLabHasFootnoteDefinitions(source, 1_048_576)).toBe(false);
});
it('bounds the extra source inspection and leaves ordinary source on the fast path', () => {
  expect(() => gitLabHasFootnoteDefinitions('[^a]: ' + 'x'.repeat(100), 32)).toThrow('byte limit');
  expect(gitLabHasFootnoteDefinitions('Ordinary prose.', 0)).toBe(false);
});
it('still detects an unused definition after host quick-action isolation', () => {
  const source = '/close\n\n[^unused]: Keep this source.';
  expect(gitLabHasFootnoteDefinitions(transformGitLabQuickActions(source), 1_048_576)).toBe(true);
});
