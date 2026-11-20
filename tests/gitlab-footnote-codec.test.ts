import { expect, it, vi } from 'vitest';
import { Schema, type Node } from 'fountainjs-editor';
import { inspectFootnotes } from 'fountainjs-editor/pages';
import live from '../integrations/gitlab/fixtures/footnote-probe-live-html.json';
import editing from '../integrations/gitlab/fixtures/footnote-editing-live-html.json';
import { GitLabMarkdownCodec, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { verifyGitLabFootnoteProbeReferences } from '../integrations/gitlab/services/footnote_codec';
import { inspectGitLabFootnoteProjection } from '../integrations/gitlab/services/footnote_projection';

const find = (name: string) => [...live.fixtures, ...editing.fixtures].find(item => item.name === name)!;
async function load(name: string) {
  const item = find(name), schema = new Schema(createGitLabSchemaSpec());
  const render = vi.fn(async (source: string) => {
    if (source === item.source) return { body: item.body };
    if (source === item.probe?.source) return { body: item.probeBody! };
    throw new Error('No authenticated fixture for this exact input.');
  });
  const codec = new GitLabMarkdownCodec({ renderMarkdown: render });
  const result = await codec.deserialize({ schema, markdown: item.source, signal: new AbortController().signal });
  return { ...result, schema, codec, item, render };
}
const append = (document: Node) => document.copy([...document.content, document.type.schema.node('paragraph', {}, [document.type.schema.text('Unrelated edit.')])]);
it.each(['simple', 'repeated', 'ordered', 'hyphen', 'underscore', 'case', 'unicode', 'unicode-space', 'punctuation',
  'multiblock', 'nested-reference', 'nested-definition', 'links-math', 'definition-reference', 'table', 'backslash-label', 'unicode-case'])('imports/edits/exports the actual %s note graph using native nodes', async name => {
  expect(typeof globalThis.document).toBe('undefined');
  const { codec, document, item, render } = await load(name);
  expect(inspectFootnotes(document).valid).toBe(true);
  expect(codec.serializeWithReport({ doc: document })).toEqual({ markdown: item.source, preservation: 'exact', issues: [] });
  const result = codec.serializeWithReport({ doc: append(document) });
  expect(result.issues).toEqual([]);
  expect(result.markdown).toContain('Unrelated edit.');
  expect(result.markdown).not.toContain('FOUNTAINNOTELABEL');
  expect(render).toHaveBeenCalledTimes(1);
  const notes: Node[] = [];
  document.descendants(node => { if (node.type.name.startsWith('footnote_')) notes.push(node); });
  for (const note of notes) expect(result.markdown).toContain(`[^${note.attrs.gitlabFootnoteLabel}]`);
});
it.each(['unreferenced', 'escaped', 'unused-open-fence', 'unused-nested', 'unused-multiblock', 'two-unused', 'code-candidate-and-unused', 'header-unused', 'unused-math-link', 'tab-definition'])('preserves and exports the actual omitted %s body after another edit', async name => {
  const { document, codec, item, render } = await load(name);
  const notes = inspectFootnotes(document);
  expect(notes.references).toHaveLength(0);
  expect(notes.definitions.length).toBeGreaterThan(0);
  expect(codec.serialize({ doc: document })).toBe(item.source);
  const result = codec.serializeWithReport({ doc: append(document) });
  expect(result.issues).toEqual([]);
  for (const note of notes.definitions) {
    const node = note.path.reduce((parent, part) => parent.child(part), document);
    expect(result.markdown).toContain(`[^${node.attrs.gitlabFootnoteLabel}]:`);
    expect(node.textContent.length).toBeGreaterThan(0);
  }
  expect(result.markdown).not.toContain(item.probe!.marker);
  expect(render).toHaveBeenCalledTimes(2);
});
it.each(['duplicate', 'body-backref-lookalike', 'entity-label', 'escaped-opening-label', 'ascii-entity-label', 'decoded-bracket-entity', 'bom-unused', 'cr-unicode'])('retains original %s source when the full representation is not verified', async name => {
  const item = find(name);
  await expect(load(name)).rejects.toMatchObject({ originalMarkdown: item.source });
});
it('proves a duplicate-label probe cannot reinterpret an existing reference', () => {
  const item = find('duplicate');
  const before = inspectGitLabFootnoteProjection(item.source, item.body);
  const after = inspectGitLabFootnoteProjection(item.probe!.source, item.probeBody!, { probe: item.probe });
  expect(verifyGitLabFootnoteProbeReferences(before, after, item.probe!)).toContain('footnote-probe-reference-target');
});
it('preserves every footnote label and body when one reference and twelve definitions are exported after a prose edit', async () => {
  const { document, codec, schema } = await load('simple');
  const first = document.content.find(node => node.type.name === 'footnote_definition')!;
  const extras = Array.from({ length: 11 }, (_, index) => {
    const label = 'appendix-' + (index + 1);
    const body = schema.node('paragraph', {}, [schema.text('Evidence for ' + label)]);
    return first.type.create({ ...first.attrs, id: label, gitlabFootnoteLabel: label }, [body]);
  });
  const changed = append(document.copy([...document.content, ...extras]));
  const result = codec.serializeWithReport({ doc: changed });
  expect(result.issues).toEqual([]);
  expect(result.markdown.split('\n').filter(line => /^\[\^.+\]: /u.test(line))).toEqual(
    ['[^alpha]: Definition **bold**.', ...extras.map(node => '[^' + node.attrs.gitlabFootnoteLabel + ']: ' + node.textContent)],
  );
});
it('follows a changed definition label instead of exporting a dangling old alias', async () => {
  const { document, codec } = await load('case');
  const renamed = document.copy(document.content.map(node => node.type.name === 'footnote_definition'
    ? node.type.create({ ...node.attrs, gitlabFootnoteLabel: 'renamed' }, node.content) : node));
  const result = codec.serializeWithReport({ doc: renamed });
  expect(result.issues).toEqual([]);
  expect(result.markdown.match(/\[\^renamed\]/gu)).toHaveLength(3);
  expect(result.markdown).not.toContain('[^Alpha]');
});
it('retains source on cancellation while a missing-body render is pending', async () => {
  const item = find('unreferenced'), controller = new AbortController();
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async source => {
    if (source === item.source) return { body: item.body };
    controller.abort(); return { body: item.probeBody! };
  } });
  await expect(codec.deserialize({ schema: new Schema(createGitLabSchemaSpec()), markdown: item.source, signal: controller.signal }))
    .rejects.toMatchObject({ originalMarkdown: item.source, issues: expect.arrayContaining([expect.objectContaining({ code: 'cancelled' })]) });
});
it.each(['empty', 'mixed', 'orphan-reference', 'authored-backlink'])('imports/exports the actual %s source without losing hidden bodies or authored links', async name => {
  const { codec, document, item } = await load(name);
  expect(codec.serialize({ doc: document })).toBe(item.source);
  const result = codec.serializeWithReport({ doc: append(document) });
  expect(result.issues).toEqual([]);
  if (name === 'authored-backlink') {
    expect(result.markdown).toContain('[Back](#fnref-a)');
    expect(result.markdown).not.toMatch(/#fnref-a-\d/u);
  }
  if (name === 'empty') expect(result.markdown).toContain('[^empty]:');
  if (name === 'mixed') expect(result.markdown).toContain('[^unused]: Hidden.');
});
