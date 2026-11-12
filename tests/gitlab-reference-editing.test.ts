// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { NodeSelection, Selection, insertText, undo, redo } from 'fountainjs-editor';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import data from '../integrations/gitlab/fixtures/reference-live-html.json';

const fixtures = new Map(data.fixtures.map(item => [item.name, item]));
const fixture = (name: string) => fixtures.get(name)!;
const dispose: (() => void)[] = [];
afterEach(() => dispose.splice(0).forEach(action => action()));
async function create(name = 'issue-id', render?: (source: string, signal?: AbortSignal) => Promise<{ body: string }>) {
  const calls = vi.fn(async (source: string, options?: { signal: AbortSignal }) => {
    if (render) return render(source, options?.signal);
    const match = data.fixtures.find(item => item.source === source);
    if (!match) throw new Error('Unexpected fixture request');
    return { body: match.body };
  });
  const service = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: calls });
  dispose.push(() => service.dispose());
  await service.setSerializedContent(fixture(name).source);
  service.editor.state.doc.descendants((node, path) => {
    if (node.type.name === 'gitlab_reference') service.editor.dispatch(service.editor.createTransaction().setSelection(new NodeSelection(service.editor.state.doc, path)));
  });
  return { service, editor: service.editor, calls };
}
function deferred() {
  let resolve!: (value: { body: string }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ body: string }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it.each(['issue-id', 'issue-+', 'issue-+s', 'merge-request-id', 'merge-request-+', 'merge-request-+s', 'qualified-issue', 'qualified-issue-title', 'user', 'label'])('retains actual renderer source and identifies the selected %s reference', async name => {
  const { service } = await create(name);
  const session = service.beginReferenceEdit();
  expect(session.initial.original).toBe(fixture(name).source);
  expect(session.initial.href).toMatch(/^\//u);
  expect(service.getSerializedContent()).toBe(fixture(name).source);
  expect(typeof globalThis.document).toBe('undefined');
});

it.each([['issue-id', 'issue-+', 'title'], ['issue-id', 'issue-+s', 'summary'], ['issue-+s', 'issue-id', 'id'],
  ['merge-request-id', 'merge-request-+', 'title'], ['merge-request-id', 'merge-request-+s', 'summary'],
  ['qualified-issue', 'qualified-issue-title', 'title']] as const)('formats %s through the real renderer fixture, saves and undoes exactly once', async (from, to, format) => {
  const { service, editor, calls } = await create(from);
  const before = editor.state.doc.toJSON();
  await expect(service.beginReferenceEdit().applyFormat(format)).resolves.toEqual({ status: 'applied' });
  expect(calls.mock.calls.at(-1)?.[0]).toBe(fixture(to).source);
  expect(service.getSerializedContent()).toBe(fixture(to).source);
  expect(editor.state.doc.child(0).child(0).attrs.label).toContain(format === 'id' ? '#' : 'Fountain reference controls fixture: & <review>');
  expect(undo(editor)).toBe(true); expect(editor.state.doc.toJSON()).toEqual(before);
  expect(redo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(fixture(to).source);
  await service.setSerializedContent(service.getSerializedContent());
  expect(service.editor.state.doc.child(0).child(0).attrs.original).toBe(fixture(to).source);
});

it('deletes only the captured reference and leaves the surrounding paragraph editable, with undo', async () => {
  const { service, editor } = await create('mixed');
  const before = service.getSerializedContent();
  expect(service.beginReferenceEdit().remove()).toBe(true);
  expect(editor.state.doc.textContent).toBe('Before  after.');
  expect(insertText(editor, 'replacement')).toBe(true);
  expect(editor.state.doc.textContent).toBe('Before replacement after.');
  expect(editor.state.doc.childCount).toBe(1);
  expect(undo(editor)).toBe(true); expect(undo(editor)).toBe(true);
  expect(service.getSerializedContent()).toBe(before);
});

it('blocks saving while resolving, maps surrounding edits and preserves a cursor moved elsewhere', async () => {
  let release!: (value: { body: string }) => void;
  const { service, editor, calls } = await create('mixed', async source => source === fixture('mixed').source
    ? { body: fixture('mixed').body } : new Promise(resolve => { release = resolve; }));
  const session = service.beginReferenceEdit(), pending = session.applyFormat('title');
  await vi.waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
  expect(service.status).toBe('loading');
  expect(() => service.getSerializedContent()).toThrow('GITLAB_EDITOR_NOT_READY');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 2], 1)));
  expect(insertText(editor, 'still typing ')).toBe(true);
  const cursor = editor.state.selection;
  release({ body: fixture('issue-+').body });
  await expect(pending).resolves.toEqual({ status: 'applied' });
  expect(editor.state.selection).toEqual(cursor);
  expect(service.getSerializedContent()).toContain('still typing');
  expect(service.getSerializedContent()).toContain(fixture('issue-+').source);
});

it('retains a failed display choice and original source, then retries against the same target', async () => {
  let fail = true;
  const { service, editor } = await create('mixed', async source => {
    if (source === fixture('mixed').source) return { body: fixture('mixed').body };
    if (fail) throw new Error('Offline');
    return { body: fixture('issue-+s').body };
  });
  const session = service.beginReferenceEdit();
  await expect(session.applyFormat('summary')).rejects.toThrow();
  expect(session.snapshot).toMatchObject({ closed: false, pending: false, conflict: false });
  expect(service.getSerializedContent()).toBe(fixture('mixed').source);
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  insertText(editor, 'Unrelated. '); const cursor = editor.state.selection;
  fail = false; await expect(session.applyFormat('summary')).resolves.toEqual({ status: 'applied' });
  expect(editor.state.selection).toEqual(cursor);
  expect(service.getSerializedContent()).toContain(`Unrelated. Before ${fixture('issue-+s').source} after.`);
});

it.each(['cancel', 'dispose', 'new-form'] as const)('%s aborts only the owned pending reference resolution and late results cannot apply', async action => {
  const gate = deferred(); let signal: AbortSignal | undefined;
  const { service, editor, calls } = await create('issue-id', async (source, incoming) => {
    if (source === fixture('issue-id').source) return { body: fixture('issue-id').body };
    signal = incoming; return gate.promise;
  });
  const session = service.beginReferenceEdit(), pending = session.applyFormat('title');
  await vi.waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
  const before = editor.state.doc;
  if (action === 'cancel') session.close();
  if (action === 'dispose') service.dispose();
  if (action === 'new-form') service.beginReferenceEdit();
  await expect(pending).resolves.toEqual({ status: 'superseded' });
  expect(signal?.aborted).toBe(true);
  gate.resolve({ body: fixture('issue-+').body }); await Promise.resolve();
  expect(editor.state.doc).toBe(before);
  expect(session.snapshot.closed).toBe(true);
});

it('refuses an overlapping target edit during resolution rather than changing another reference', async () => {
  const gate = deferred();
  const { service, editor, calls } = await create('issue-id', async source => source === fixture('issue-id').source
    ? { body: fixture('issue-id').body } : gate.promise);
  const session = service.beginReferenceEdit(), pending = session.applyFormat('title');
  await vi.waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
  editor.dispatch(editor.createTransaction().setNodeAttrs([0, 0], { label: 'Changed by another edit' }));
  const before = editor.state.doc;
  gate.resolve({ body: fixture('issue-+').body });
  await expect(pending).rejects.toThrow('GITLAB_INSERTION_TARGET_CHANGED');
  expect(editor.state.doc).toBe(before);
  expect(session.snapshot).toMatchObject({ pending: false, conflict: true });
});

it('document replacement supersedes resolution without appending the old reference into the new document', async () => {
  const gate = deferred();
  const { service, calls } = await create('issue-id', async source => source === fixture('issue-+').source
    ? gate.promise : { body: data.fixtures.find(item => item.source === source)!.body });
  const pending = service.beginReferenceEdit().applyFormat('title');
  await vi.waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
  await service.setSerializedContent(fixture('user').source);
  await expect(pending).resolves.toEqual({ status: 'superseded' });
  gate.resolve({ body: fixture('issue-+').body }); await Promise.resolve();
  expect(service.getSerializedContent()).toBe('@root');
});

it('rechecks edit permission after resolution and retains a retryable draft', async () => {
  const gate = deferred();
  const { service, editor, calls } = await create('issue-id', async source => source === fixture('issue-id').source
    ? { body: fixture('issue-id').body } : gate.promise);
  const session = service.beginReferenceEdit(), pending = session.applyFormat('title');
  await vi.waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
  editor.setEditable(false); const before = editor.state.doc;
  gate.resolve({ body: fixture('issue-+').body });
  await expect(pending).rejects.toThrow('GITLAB_EDITOR_NOT_READY');
  expect(editor.state.doc).toBe(before); expect(session.snapshot.closed).toBe(false);
  editor.setEditable(true); await session.applyFormat('title');
  expect(service.getSerializedContent()).toBe(fixture('issue-+').source);
});

it.each([
  ['foreign URL', fixture('issue-+').body.replace('/-/work_items/', '/-/foreign/')],
  ['foreign type', fixture('issue-+').body.replace('data-reference-type="issue"', 'data-reference-type="merge_request"')],
  ['wrong original', fixture('issue-+').body.replace(`data-original="${fixture('issue-+').source}"`, 'data-original="#999999+"')],
  ['extra text', fixture('issue-+').body.replace('</p>', ' unexpected content</p>')],
  ['unresolved', '<p>#999999+</p>'],
] as const)('refuses %s renderer output and preserves document/history', async (_kind, body) => {
  const { service, editor } = await create('issue-id', async source => ({ body: source === fixture('issue-id').source ? fixture('issue-id').body : body }));
  const before = editor.state.doc;
  await expect(service.beginReferenceEdit().applyFormat('title')).rejects.toThrow();
  expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false);
  expect(service.getSerializedContent()).toBe(fixture('issue-id').source);
});

it.each(['user', 'label'])('does not offer unsupported display formats for a %s reference', async name => {
  const { service, calls } = await create(name);
  const session = service.beginReferenceEdit(); expect(session.initial.formats).toEqual([]);
  await expect(session.applyFormat('title')).rejects.toThrow('GITLAB_REFERENCE_FORMAT_UNAVAILABLE');
  expect(calls).toHaveBeenCalledTimes(1); expect(service.getSerializedContent()).toBe(fixture(name).source);
});

it('the active format is a no-op and invalid display choices do not call the renderer', async () => {
  const { service, editor, calls } = await create();
  const before = editor.state.doc;
  const session = service.beginReferenceEdit();
  await expect(session.applyFormat('invalid' as 'id')).rejects.toThrow('GITLAB_REFERENCE_FORMAT_UNAVAILABLE');
  await session.applyFormat('id');
  expect(editor.state.doc).toBe(before); expect(calls).toHaveBeenCalledTimes(1); expect(undo(editor)).toBe(false);
});

it.each(['not-found', 'not-found-expanded', 'code', 'issue-link'])('does not treat %s content as an editable reference atom', async name => {
  const { service, calls } = await create(name);
  expect(() => service.beginReferenceEdit()).toThrow('GITLAB_REFERENCE_SELECTION_REQUIRED');
  expect(service.getSerializedContent()).toBe(fixture(name).source); expect(calls).toHaveBeenCalledTimes(1);
});

it.each([['**', 'strong'], ['*', 'em']])('retains %s marks surrounding the reference through display changes', async (delimiter, mark) => {
  const original = `${delimiter}${fixture('issue-id').source}${delimiter}`;
  const body = fixture('issue-id').body.replace(/^(<p[^>]*>)/u, `$1<${mark}>`).replace('</p>', `</${mark}></p>`);
  const service = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async source => ({ body: source === original ? body : fixture('issue-+').body }) });
  dispose.push(() => service.dispose());
  await service.setSerializedContent(original);
  service.editor.dispatch(service.editor.createTransaction().setSelection(new NodeSelection(service.editor.state.doc, [0, 0])));
  await service.beginReferenceEdit().applyFormat('title');
  expect(service.editor.state.doc.child(0).child(0).marks.map(value => value.type.name)).toContain(mark);
  expect(service.getSerializedContent()).toBe(`${delimiter}${fixture('issue-+').source}${delimiter}`);
});
