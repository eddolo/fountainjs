import { expect, it, vi } from 'vitest';
import { NodeSelection, Selection, insertText, undo, redo } from 'fountainjs-editor';
import { inspectFootnotes } from 'fountainjs-editor/pages';
import captures from '../integrations/gitlab/fixtures/footnote-renaming-live-html.json';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { gitLabFootnoteRenameFingerprint } from '../integrations/gitlab/services/footnote_renaming';

interface Fixture { name: string; source: string; from: string; label: string; edit?: string; renders: { source: string; body: string }[] }
const fixtures: Fixture[] = captures.fixtures;
const get = (name: string) => fixtures.find(item => item.name === name)!;
const responses = new Map(fixtures.flatMap(item => item.renders.map(render => [render.source, render.body] as const)));
const response = (source: string) => {
  if (!responses.has(source)) throw new Error('No actual GitLab capture for this exact renderer input.');
  return { body: responses.get(source)! };
};
async function setup(name = 'simple') {
  const item = get(name);
  const render = vi.fn(async (source: string, _options?: { signal: AbortSignal }) => response(source));
  const bridge = new GitLabContentEditor({ renderMarkdown: render, describeLabels: () => '' });
  await bridge.setSerializedContent(item.source);
  const editor = bridge.editor, definition = inspectFootnotes(editor.state.doc).definitions[0]!;
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, definition.path)));
  return { bridge, editor, render, definition, item };
}
const prefix = (bridge: GitLabContentEditor) => {
  const { editor } = bridge, { schema } = editor.state;
  editor.dispatch(editor.createTransaction().replace(0, 0, [schema.node('paragraph', {}, [schema.text('Prefix paragraph.')])]));
};

it.each(['simple', 'repeated', 'case-aliases', 'unused', 'nested-reference', 'math-link', 'table',
  'backslash', 'percent', 'unresolved-literal', 'verbatim-literal', 'unrelated-prefix'])('renames actual %s source without changing note identities, body or reference targets', async name => {
  expect(typeof globalThis.document).toBe('undefined');
  const { bridge, editor, item } = await setup(name);
  const session = bridge.beginFootnoteRename();
  if (item.edit === 'prefix') { prefix(bridge); expect(session.snapshot.path).toEqual([2]); }
  const before = editor.state.doc, source = bridge.getSerializedContent();
  const ids = inspectFootnotes(before).definitions.map(note => note.id);
  expect((await session.apply(item.label)).status).toBe('applied');
  expect(inspectFootnotes(editor.state.doc).definitions.map(note => note.id)).toEqual(ids);
  expect(gitLabFootnoteRenameFingerprint(editor.state.doc, { from: item.from, to: item.label })).toBe(gitLabFootnoteRenameFingerprint(before));
  expect(bridge.getSerializedContent()).toContain(`[^${item.label}]:`);
  const renamed = bridge.getSerializedContent();
  expect(undo(editor)).toBe(true); expect(bridge.getSerializedContent()).toBe(source);
  expect(redo(editor)).toBe(true); expect(bridge.getSerializedContent()).toBe(renamed);
  bridge.dispose();
});
it.each([
  ['exact-collision', 'GITLAB_FOOTNOTE_LABEL_COLLISION'],
  ['case-collision', 'GITLAB_FOOTNOTE_RENAME_RESOLUTION'],
  ['entity-collision', 'GITLAB_FOOTNOTE_RENAME_RESOLUTION'],
  ['invalid-space', 'GITLAB_FOOTNOTE_INVALID_LABEL'],
  ['invalid-bracket', 'GITLAB_FOOTNOTE_INVALID_LABEL'],
])('refuses actual %s without changing source or adding history', async (name, message) => {
  const { bridge, editor, item } = await setup(name);
  const before = editor.state.doc;
  const session = bridge.beginFootnoteRename();
  await expect(session.apply(item.label)).rejects.toThrow(message);
  expect(editor.state.doc).toBe(before); expect(bridge.getSerializedContent()).toBe(item.source);
  expect(undo(editor)).toBe(false); expect(session.snapshot.pending).toBe(false);
  bridge.dispose();
});
it('treats the unchanged label as a no-op without a renderer request or history item', async () => {
  const { bridge, editor, render, item } = await setup();
  render.mockClear();
  expect((await bridge.beginFootnoteRename().apply(item.from)).status).toBe('applied');
  expect(render).not.toHaveBeenCalled(); expect(undo(editor)).toBe(false);
  bridge.dispose();
});
it('retains the captured note if selection moves before and during validation', async () => {
  const { bridge, editor, render, item } = await setup();
  const session = bridge.beginFootnoteRename();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  let finish!: (value: { body: string }) => void, input = '';
  render.mockImplementationOnce(source => { input = source; return new Promise(resolve => { finish = resolve; }); });
  const completion = session.apply(item.label);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
  finish(response(input)); await completion;
  expect(editor.state.selection.path).toEqual([0, 0]); expect(editor.state.selection.from).toBe(2);
  expect(bridge.getSerializedContent()).toContain('[^research]:');
  bridge.dispose();
});
it('blocks Save while checking, cancels a pending request, and ignores the late renderer result', async () => {
  const { bridge, editor, render, item } = await setup();
  const before = editor.state.doc, session = bridge.beginFootnoteRename();
  let finish!: (value: { body: string }) => void, input = '', signal!: AbortSignal;
  render.mockImplementationOnce((source, options) => { input = source; signal = options!.signal; return new Promise(resolve => { finish = resolve; }); });
  const completion = session.apply(item.label);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  expect(bridge.pendingInsertions).toBe(1); expect(() => bridge.getSerializedContent()).toThrow('GITLAB_EDITOR_NOT_READY');
  session.close(); expect(signal.aborted).toBe(true);
  expect((await completion).status).toBe('superseded');
  finish(response(input)); await Promise.resolve(); await Promise.resolve();
  expect(editor.state.doc).toBe(before); expect(bridge.getSerializedContent()).toBe(item.source);
  bridge.dispose();
});
it('retains a failed connection draft and supports retry in the same session', async () => {
  const { bridge, editor, render, item } = await setup();
  const before = editor.state.doc, session = bridge.beginFootnoteRename();
  render.mockRejectedValueOnce(new Error('Offline'));
  await expect(session.apply(item.label)).rejects.toThrow();
  expect(editor.state.doc).toBe(before); expect(session.snapshot.closed).toBe(false);
  expect((await session.apply(item.label)).status).toBe('applied');
  bridge.dispose();
});
it('aborts on an unrelated in-flight edit, retains that edit, and retries against the rebased document', async () => {
  const { bridge, editor, render, item } = await setup();
  const session = bridge.beginFootnoteRename();
  let finish!: (value: { body: string }) => void, input = '';
  render.mockImplementationOnce(source => { input = source; return new Promise(resolve => { finish = resolve; }); });
  const completion = session.apply(item.label);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  prefix(bridge);
  await expect(completion).rejects.toThrow('GITLAB_FOOTNOTE_DOCUMENT_CHANGED');
  finish(response(input)); await Promise.resolve();
  expect(session.snapshot.conflict).toBe(false); expect(session.snapshot.path).toEqual([2]);
  expect((await session.apply(item.label)).status).toBe('applied');
  expect(bridge.getSerializedContent()).toContain('Prefix paragraph.');
  expect(inspectFootnotes(editor.state.doc).definitions).toHaveLength(1);
  bridge.dispose();
});
it('refuses a changed target body and retains the newer body instead of restoring a stale snapshot', async () => {
  const { bridge, editor, definition, item } = await setup();
  const session = bridge.beginFootnoteRename();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([...definition.path, 0, 0], 0)));
  insertText(editor, 'New body. ');
  const newer = editor.state.doc;
  expect(session.snapshot.conflict).toBe(true);
  await expect(session.apply(item.label)).rejects.toThrow('GITLAB_FOOTNOTE_TARGET_CHANGED');
  expect(editor.state.doc).toBe(newer); expect(bridge.getSerializedContent()).toContain('New body.');
  bridge.dispose();
});
it('refuses read-only changes and releases a pending draft on disposal', async () => {
  const { bridge, editor, render, item } = await setup();
  const session = bridge.beginFootnoteRename();
  bridge.setEditable(false);
  await expect(session.apply(item.label)).rejects.toThrow('GITLAB_EDITOR_NOT_READY');
  bridge.setEditable(true);
  let finish!: (value: { body: string }) => void, input = '';
  render.mockImplementationOnce(source => { input = source; return new Promise(resolve => { finish = resolve; }); });
  const before = editor.state.doc, completion = session.apply(item.label);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  bridge.dispose(); expect(session.snapshot.closed).toBe(true);
  expect((await completion).status).toBe('superseded'); finish(response(input));
  expect(editor.state.doc).toBe(before);
});
it('rejects a syntactically valid renderer response that silently changes a note body', async () => {
  const { bridge, editor, render, item } = await setup();
  const before = editor.state.doc;
  render.mockImplementation(async source => {
    const result = response(source);
    if (!source.includes('[^research]')) return result;
    expect(result.body).toContain('Definition ');
    return { body: result.body.replace('Definition ', 'Wrong body. ') };
  });
  await expect(bridge.beginFootnoteRename().apply(item.label)).rejects.toThrow('GITLAB_FOOTNOTE_RENAME_RESOLUTION');
  expect(editor.state.doc).toBe(before);
  bridge.dispose();
});
