import { expect, it } from 'vitest';
import { Schema, type Node } from 'fountainjs-editor';
import { createGitLabSchemaSpec, GitLabMarkdownCodec, GitLabMarkdownConversionError } from '../integrations/gitlab/services/markdown_codec';
import { gitlabMediaSource } from '../integrations/gitlab/services/media';
import live from '../integrations/gitlab/fixtures/media-live-html.json';

const fixture = (name: string) => live.fixtures.find(item => item.name === name)!;
async function parse(name: string, source?: string, body?: string) {
  const row = fixture(name), schema = new Schema(createGitLabSchemaSpec());
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: body ?? row.body }) });
  const result = await codec.deserialize({ schema, markdown: source ?? row.source, signal: new AbortController().signal }).catch(error => {
    if (error instanceof GitLabMarkdownConversionError) error.message += ' ' + JSON.stringify(error.issues);
    throw error;
  });
  return { ...result, row, schema, codec };
}
const append = (doc: Node) => doc.copy([...doc.content, doc.type.schema.node('paragraph', {}, [doc.type.schema.text('Added.')])]);

it.each(live.fixtures.filter(item => !['drawio', 'raw-video'].includes(item.name)).map(item => item.name))('retains actual GitLab %s source and media semantics after an unrelated edit', async name => {
  expect(typeof document).toBe('undefined');
  const { codec, document: doc, row } = await parse(name);
  expect(codec.serialize({ doc })).toBe(row.source);
  const output = codec.serializeWithReport({ doc: append(doc) });
  expect(output.issues).toEqual([]); expect(output.markdown).toBe(row.source + '\n\nAdded.');
});
it('stores inline playback source separately from its canonical Markdown address', async () => {
  const { document } = await parse('video-sized'), video = document.child(0).child(0);
  expect(video.type.name).toBe('gitlab_media');
  expect(video.attrs).toMatchObject({ kind: 'video', src: '/-/project/1/uploads/media-fixture/recording.webm',
    gitlabCanonicalSrc: '/uploads/media-fixture/recording.webm', alt: 'Sized video', width: '320px', height: '180px' });
});
it('recovers the playable description/title pair when GitLab folds its title into the rendered label', async () => {
  const { codec, document } = await parse('audio-titled');
  expect(document.child(0).child(0).attrs).toMatchObject({ title: 'Retained audio title', alt: 'Audio description' });
  expect(codec.serialize({ doc: append(document) })).toContain('"Retained audio title"');
});
it('refuses ambiguous omitted descriptions instead of assigning one source field to the wrong playable', async () => {
  const source = '![First description](/uploads/media-fixture/recording.wav "Retained audio title")\n\n![Second description](/uploads/media-fixture/recording.wav "Retained audio title")';
  await expect(parse('audio-titled', source)).rejects.toBeInstanceOf(GitLabMarkdownConversionError);
});
it.each(['raw-video', 'drawio'])('keeps %s source available when its required adapter is unavailable', async name => {
  await expect(parse(name)).rejects.toMatchObject({ name: 'GitLabMarkdownConversionError', originalMarkdown: fixture(name).source });
});
it('does not mistake raw media in a code fence or a literal alert title for an active media element', async () => {
  const source = '```html\n<video src="x.webm"></video>\n```';
  const body = '<pre data-canonical-lang="html"><code>&lt;video src="x.webm"&gt;&lt;/video&gt;</code></pre>';
  const result = await parse('video', source, body); expect(result.codec.serialize({ doc: result.document })).toBe(source);
  const alert = await parse('video', '> [!note] <video>\n>\n> Body.',
    '<div class="markdown-alert markdown-alert-note" data-sourcepos="1:1-3:7"><p class="markdown-alert-title">&lt;video&gt;</p><p>Body.</p></div>');
  expect(alert.document.child(0).child(0).textContent).toBe('<video>');
});
it.each(['<audio src="/a.wav"></audio>', 'Before <video src="/a.webm"></video> after.'])('refuses raw HTML media erased by the host: %s', async source => {
  await expect(parse('video', source, '<p>Before after.</p>')).rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ code: 'raw-media-source' })]) });
});
it.each([
  ['autoplay', fixture('video').body.replace('controls="true"', 'controls="true" autoplay="true"')],
  ['track', fixture('video').body.replace('</video>', '<track src="/captions.vtt"></video>')],
  ['unknown child', fixture('video').body.replace('</span>', '<b>Retain this</b></span>')],
  ['missing canonical', fixture('video').body.replace(' data-canonical-src="/uploads/media-fixture/recording.webm"', '')],
])('refuses unhandled %s rather than dropping playable content or behavior', async (_name, body) => {
  await expect(parse('video', undefined, body)).rejects.toBeInstanceOf(GitLabMarkdownConversionError);
});
it('builds escaped native media source with pixel/percentage sizes and rejects non-native dimensions', () => {
  const schema = new Schema(createGitLabSchemaSpec());
  expect(gitlabMediaSource(schema, { canonical: '/a.png', alt: '[text]', title: 'Title', width: '320px', height: '50%' }))
    .toBe('![\\[text\\]](/a.png "Title"){width="320" height="50%"}');
  expect(() => gitlabMediaSource(schema, { canonical: '/a.png', alt: '', title: '', width: '2em', height: 'auto' })).toThrow('GITLAB_MEDIA_INVALID_DIMENSION');
});
