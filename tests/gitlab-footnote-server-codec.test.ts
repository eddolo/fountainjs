import { expect, it } from 'vitest';
import { Schema } from 'fountainjs-editor';
import { inspectFootnotes } from 'fountainjs-editor/pages';
import stock from '../integrations/gitlab/fixtures/footnote-probe-live-html.json';
import editing from '../integrations/gitlab/fixtures/footnote-editing-live-html.json';
import repaired from '../integrations/gitlab/fixtures/footnote-server-live-html.json';
import { GitLabMarkdownCodec, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';

const originalResponses = new Map([...stock.fixtures, ...editing.fixtures].flatMap(item => [
  [item.source, item.body] as const,
  ...(item.probe ? [[item.probe.source, item.probeBody!] as const] : []),
]));
const repairedResponses = new Map(repaired.fixtures.map(item => [item.source, item.body]));
const originals = repaired.fixtures.filter(item => !item.name.endsWith('-probe') && item.name !== 'occurrence-label-collision');
async function load(source: string, responses: Map<string, string>) {
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async input => {
    const body = responses.get(input);
    if (body === undefined) throw new Error('No actual server response for this exact source.');
    return { body };
  } });
  const { document } = await codec.deserialize({ schema: new Schema(createGitLabSchemaSpec()), markdown: source,
    signal: new AbortController().signal });
  return { codec, document };
}

it.each(originals)('retains the original native semantics after the actual server repair: $name', async item => {
  expect(typeof globalThis.document).toBe('undefined');
  const before = await load(item.source, originalResponses), after = await load(item.source, repairedResponses);
  expect(after.codec.serialize({ doc: after.document })).toBe(item.source);
  const edit = (document: typeof after.document) => document.copy([...document.content,
    document.type.schema.node('paragraph', {}, [document.type.schema.text('Unrelated edit.')])]);
  const originalExport = before.codec.serializeWithReport({ doc: edit(before.document) });
  expect(originalExport.issues).toEqual([]);
  expect(after.codec.serializeWithReport({ doc: edit(after.document) })).toEqual(originalExport);
});

it('keeps a repeated reference separate from a legitimate label ending in an occurrence suffix', async () => {
  const item = repaired.fixtures.find(item => item.name === 'occurrence-label-collision')!;
  const { codec, document } = await load(item.source, repairedResponses);
  const notes = inspectFootnotes(document);
  expect(notes.valid).toBe(true);
  expect(notes.definitions).toHaveLength(2); expect(notes.references).toHaveLength(3);
  expect(notes.references[0]!.id).toBe(notes.references[2]!.id);
  expect(notes.references[0]!.id).not.toBe(notes.references[1]!.id);
  const body = (id: string) => {
    const note = notes.definitions.find(entry => entry.id === id)!;
    return note.path.reduce((node, index) => node.child(index), document).textContent;
  };
  expect(body(notes.references[0]!.id)).toBe('First body.');
  expect(body(notes.references[1]!.id)).toBe('Other body.');
  expect(codec.serialize({ doc: document })).toBe(item.source);
});
