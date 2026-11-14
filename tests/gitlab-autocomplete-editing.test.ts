import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Selection, undo, redo, type Node } from 'fountainjs-editor';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { findGitLabAutocompleteMatch, gitLabAutocompleteTarget } from '../integrations/gitlab/services/autocomplete_editing';
import { parseGitLabAutocompleteItems, gitLabAutocompleteSources, type GitLabAutocompleteKind, type GitLabAutocompleteProvider } from '../integrations/gitlab/services/autocomplete_data';
import live from '../integrations/gitlab/fixtures/autocomplete-live.json';
import rendered from '../integrations/gitlab/fixtures/reference-live-html.json';

const services: GitLabContentEditor[] = [];
const issue = parseGitLabAutocompleteItems('issue', live.results.issues.data)[0];
const user = parseGitLabAutocompleteItems('user', live.results.members.data)[0];
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const service of services.splice(0)) service.dispose(); vi.useRealTimers(); });
async function setup(provider: GitLabAutocompleteProvider = async () => [issue], commands = false) {
  const errors: unknown[] = [];
  const render = vi.fn(async (source: string) => ({ body: live.projections.find(item => item.source === source)?.body
    ?? rendered.fixtures.find(item => item.source === source)?.body ?? `<p>${escape(source)}</p>` }));
  const service = new GitLabContentEditor({ renderMarkdown: render, describeLabels: () => 'Label', autocompleteProvider: provider,
    ...(commands ? { quickActionProvider: async () => [] } : {}), onListenerError: error => errors.push(error) });
  services.push(service); await service.setSerializedContent('Start'); render.mockClear();
  return { service, editor: service.editor, controller: service.autocomplete.suggestions!, render, errors };
}
async function seed(service: GitLabContentEditor, blocks: readonly Node[], path = [0, 0], offset = 0) {
  const { editor } = service;
  editor.dispatch(editor.createTransaction().replaceDocument(editor.state.schema.node('doc', {}, blocks))
    .setMeta('content$replace', true).setSelection(Selection.cursor(path, 0)).setMeta('addToHistory', false));
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor(path, offset)));
  await vi.advanceTimersByTimeAsync(151);
}
async function query(service: GitLabContentEditor, source: string, offset = source.length) {
  const schema = service.editor.state.schema;
  await seed(service, [schema.node('paragraph', {}, [schema.text(source)])], [0, 0], offset);
}
const settle = () => vi.advanceTimersByTimeAsync(1);

it.each(live.projections)('resolves the actual $kind rendering for $source', async projection => {
  const kind = projection.kind as GitLabAutocompleteKind, sourceKey = gitLabAutocompleteSources[kind]!;
  const record = (live.results as Record<string, { data: unknown }>)[sourceKey].data;
  const item = parseGitLabAutocompleteItems(kind, record).find(value => value.source === projection.source)!;
  const { service, editor, controller, errors } = await setup(async () => [item]);
  await query(service, item.source.slice(0, 2));
  expect(controller.accept()).toBe(true); await settle();
  expect(editor.state.doc.child(0).child(0).attrs.original).toBe(item.source);
  expect(errors).toEqual([]); expect(service.pendingInsertions).toBe(0);
});

it('uses the captured real GitLab rendering for one semantic reference and an undoable native insertion', async () => {
  const { service, editor, controller, errors } = await setup(); await query(service, 'Before #7');
  expect(typeof globalThis.document).toBe('undefined');
  expect(controller.getSnapshot().items).toEqual([issue]);
  expect(controller.accept()).toBe(true); await settle();
  const node = editor.state.doc.child(0).child(1);
  expect(node.type.name).toBe('gitlab_reference'); expect(node.attrs.original).toBe('#75');
  expect(node.attrs.href).toBe('/root/fountain-product-integration/-/work_items/75');
  expect(service.getSerializedContent()).toBe('Before #75&#32;');
  expect(editor.state.selection).toEqual(Selection.cursor([0, 2], 1));
  expect(undo(editor)).toBe(true); expect(editor.getText()).toBe('Before #7');
  expect(redo(editor)).toBe(true); expect(service.getSerializedContent()).toBe('Before #75&#32;');
  expect(errors).toEqual([]);
});
it('accepts an actual user record without a numeric id', async () => {
  const { service, editor, controller } = await setup(async () => [user]); await query(service, '@ro');
  expect(controller.accept()).toBe(true); await settle();
  expect(editor.state.doc.child(0).child(0).attrs).toMatchObject({ referenceType: 'user', original: '@root', href: '/root' });
});
it('replaces a formatted query and expands forward through matching text, preserving suffix marks and supported block attributes', async () => {
  const { service, editor, controller } = await setup(); const schema = editor.state.schema;
  await seed(service, [schema.node('paragraph', { dir: 'auto', align: 'start' }, [schema.text('Before '),
    schema.text('#7', [schema.mark('strong')]), schema.text('5 after', [schema.mark('em')])])], [0, 1], 2);
  expect(controller.getSnapshot().match?.range).toMatchObject({ path: [0, 1], from: 0, to: 2 });
  expect(controller.getSnapshot()).toMatchObject({ status: 'ready' });
  expect(controller.accept()).toBe(true); await settle();
  expect(editor.getText()).toBe('Before #75  after');
  expect(editor.state.doc.child(0).attrs).toMatchObject({ dir: 'auto', align: 'start' });
  expect(editor.state.doc.child(0).content.at(-1)?.marks.map(mark => mark.type.name)).toEqual(['em']);
  expect(undo(editor)).toBe(true); expect(editor.getText()).toBe('Before #75 after');
  expect(editor.state.doc.child(0).child(1).marks[0].type.name).toBe('strong');
});
it('refuses provider work while unsupported host document formatting makes serialization unsafe', async () => {
  const provider = vi.fn(async () => [issue]); const { service, editor, controller } = await setup(provider);
  await seed(service, [editor.state.schema.node('paragraph', { align: 'center', alignExplicit: true }, [editor.state.schema.text('#7')])], [0, 0], 2);
  expect(service.status).toBe('error'); expect(controller.getSnapshot().status).toBe('error');
  expect(controller.accept()).toBe(false); expect(provider).not.toHaveBeenCalled();
  expect(editor.state.doc.child(0).attrs.align).toBe('center');
});
it('keeps a query spanning adjacent formatting in a nested quote', async () => {
  const { service, editor, controller } = await setup(); const schema = editor.state.schema;
  await seed(service, [schema.node('blockquote', {}, [schema.node('paragraph', {}, [schema.text('#', [schema.mark('strong')]), schema.text('7')])])], [0, 0, 1], 1);
  expect(controller.getSnapshot().match?.range.endPath).toEqual([0, 0, 1]);
  expect(controller.accept()).toBe(true); await settle();
  expect(editor.state.doc.child(0).child(0).child(0).attrs.original).toBe('#75');
});
it.each(['code', 'link'])('does not interpret a query crossing a %s mark', async markName => {
  const provider = vi.fn(async () => [issue]); const { service, editor, controller } = await setup(provider); const schema = editor.state.schema;
  const mark = schema.mark(markName, markName === 'link' ? { href: '/safe' } : {});
  await seed(service, [schema.node('paragraph', {}, [schema.text('#', [mark]), schema.text('75')])], [0, 1], 2);
  expect(controller.getSnapshot().open).toBe(false); expect(provider).not.toHaveBeenCalled();
});
it.each(['code_block', 'math_block'])('does not search inside %s', async type => {
  const provider = vi.fn(async () => [issue]); const { service, editor, controller } = await setup(provider); const schema = editor.state.schema;
  const node = type === 'code_block' ? schema.node(type, { language: 'markdown' }, [schema.text('#75')])
    : schema.node(type, { latex: '#75' });
  if (type === 'code_block') await seed(service, [node], [0, 0], 3);
  else editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [node])).setMeta('content$replace', true));
  expect(controller.getSnapshot().open).toBe(false); expect(provider).not.toHaveBeenCalled();
});
it('leaves ordinary punctuation, leading-space queries and unsupported Gollum source alone', async () => {
  const provider = vi.fn(async () => [issue]); const { service, controller } = await setup(provider);
  for (const text of ['Hello ! ', 'email@root', '[[guide']) {
    await query(service, text); expect(controller.getSnapshot().open).toBe(false);
  }
  expect(provider).not.toHaveBeenCalled();
});
it('treats quoted status names as plain command arguments with complete source and undo', async () => {
  const item = parseGitLabAutocompleteItems('status', [{ name: 'In progress' }])[0];
  const provider = vi.fn<GitLabAutocompleteProvider>(async () => [item]); const { service, editor, controller } = await setup(provider, true);
  await query(service, '/status "In'); expect(provider.mock.calls[0][0]).toMatchObject({ kind: 'status', command: '/status', query: 'In' });
  expect(controller.accept()).toBe(true); expect(editor.getText()).toBe('/status "In progress" ');
  expect(editor.state.doc.child(0).content.every(node => node.isText)).toBe(true);
  expect(controller.getSnapshot().open).toBe(false);
  expect(undo(editor)).toBe(true); expect(editor.getText()).toBe('/status "In');
});
it('does not activate quoted command fields when quick actions are disabled', async () => {
  const { service, controller } = await setup(); await query(service, '/status "In');
  expect(controller.getSnapshot().open).toBe(false);
});
it('revalidates provider context when a same-length command changes without moving the query', async () => {
  const provider = vi.fn<GitLabAutocompleteProvider>(async () => [user]); const { service, editor } = await setup(provider, true);
  await query(service, '/reassign @ro');
  editor.dispatch(editor.createTransaction().replaceText([0, 0], 1, 9, 'unassign'));
  await vi.advanceTimersByTimeAsync(151);
  expect(provider.mock.calls.map(call => call[0].command)).toEqual(['/reassign', '/unassign']);
});
it('retains source and reports a renderer that did not resolve the requested reference', async () => {
  const { service, editor, controller, render, errors } = await setup(); await query(service, '#7');
  render.mockResolvedValue({ body: '<p>#75</p>' }); expect(controller.accept()).toBe(true); await settle();
  expect(editor.getText()).toBe('#7'); expect(errors).toHaveLength(1); expect(service.insertionRecovery?.markdown).toBe('#75');
});
it('preserves unrelated typing and a later caret while an accepted reference renders', async () => {
  const { service, editor, controller, render } = await setup(); const schema = editor.state.schema;
  await seed(service, [schema.node('paragraph', {}, [schema.text('Before #7')]), schema.node('paragraph', {}, [schema.text('Elsewhere')])], [0, 0], 9);
  let resolve!: (value: { body: string }) => void;
  render.mockImplementation(() => new Promise(value => { resolve = value; }));
  expect(controller.accept()).toBe(true); await settle(); expect(service.pendingInsertions).toBe(1);
  editor.dispatch(editor.createTransaction().insertText([1, 0], 0, 'New ').setSelection(Selection.cursor([1, 0], 4)));
  resolve({ body: rendered.fixtures.find(item => item.source === '#75')!.body }); await settle();
  expect(editor.getText()).toBe('Before #75 \nNew Elsewhere');
  expect(editor.state.selection).toEqual(Selection.cursor([1, 0], 4));
});
it('refuses an overlapping edit instead of replacing newly typed source', async () => {
  const { service, editor, controller, render, errors } = await setup(); await query(service, '#7');
  let resolve!: (value: { body: string }) => void;
  render.mockImplementation(() => new Promise(value => { resolve = value; }));
  expect(controller.accept()).toBe(true); await settle();
  editor.dispatch(editor.createTransaction().insertText([0, 0], 1, 'X'));
  resolve({ body: rendered.fixtures.find(item => item.source === '#75')!.body }); await settle();
  expect(editor.getText()).toBe('#X7'); expect(errors).toHaveLength(1);
});
it('does not accept an item from a stale query and expands no farther than real matching source', async () => {
  const { service, editor, controller } = await setup(); await query(service, '#7 suffix', 2);
  const snapshot = controller.getSnapshot();
  const target = gitLabAutocompleteTarget(editor.state, snapshot.match!, '#75'); expect(target.to).toBe(2);
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  expect(service.autocomplete.accept(snapshot.items[0])).toBe(false);
});
