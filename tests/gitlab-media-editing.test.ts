import { afterEach, expect, it, vi } from 'vitest';
import { NodeSelection, Plugin, Selection, insertText, undo, redo, type FountainExtension } from 'fountainjs-editor';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { getGitLabMediaContext, GitLabMediaEditingSession } from '../integrations/gitlab/services/media_editing';
import type { GitLabMediaFields } from '../integrations/gitlab/services/media';
import live from '../integrations/gitlab/fixtures/media-live-html.json';

const services: GitLabContentEditor[] = [];
afterEach(() => services.splice(0).forEach(service => service.dispose()));
const fixture = (name: string) => live.fixtures.find(item => item.name === name)!;
const fields = (session: GitLabMediaEditingSession, changes: Partial<GitLabMediaFields> = {}): GitLabMediaFields => {
  const { canonical, alt, title, width, height } = session.initial;
  return { canonical, alt, title, width, height, ...changes };
};
async function setup(name = 'image', extensions: readonly FountainExtension[] = []) {
  const row = fixture(name), onError = vi.fn();
  const render = vi.fn(async (_source: string, _options?: { signal: AbortSignal }) => ({ body: row.body }));
  const service = new GitLabContentEditor({ renderMarkdown: render, describeLabels: () => '', extensions, onListenerError: onError });
  services.push(service); await service.setSerializedContent(row.source);
  const { editor } = service; let path: readonly number[] | undefined;
  editor.state.doc.descendants((node, candidate) => { if (!path && ['inline_image', 'gitlab_media'].includes(node.type.name)) path = candidate; });
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, path!)));
  return { service, editor, render, onError, row, path: path! };
}
it.each(['image', 'audio', 'video'])('reads native %s context in pure Node and changes its description/dimensions with one-step undo', async name => {
  expect(typeof document).toBe('undefined');
  const { service, editor, render, row } = await setup(name);
  const session = service.beginMediaEdit(); expect(session.initial.kind).toBe(name);
  await expect(session.apply(fields(session, { alt: 'Reviewed media', title: 'Retained title', width: '320', height: '180' }))).resolves.toEqual({ status: 'applied' });
  expect(service.getSerializedContent()).toContain('![Reviewed media]');
  expect(service.getSerializedContent()).toContain('{width="320" height="180"}');
  expect(render).toHaveBeenCalledTimes(1); expect(session.snapshot.closed).toBe(true);
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(row.source);
  expect(redo(editor)).toBe(true); expect(getGitLabMediaContext(editor)?.alt).toBe('Reviewed media');
});
it.each(['image', 'audio', 'video'])('deletes the whole %s atom while retaining an editable paragraph and undo', async name => {
  const { service, editor, row } = await setup(name);
  expect(service.beginMediaEdit().remove()).toBe(true);
  expect(editor.state.doc.child(0).type.name).toBe('paragraph');
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(row.source);
  expect(redo(editor)).toBe(true); expect(insertText(editor, 'Replacement text')).toBe(true);
  expect(editor.getText()).toBe('Replacement text');
});
it('deletes an inline image without deleting surrounding text', async () => {
  const { service, editor, row } = await setup('image-inline'); service.beginMediaEdit().remove();
  expect(editor.getText()).toBe('Before  after.');
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(row.source);
});
it('does not open media controls for a text caret adjacent to an atom', async () => {
  const { service, editor } = await setup('image-inline');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
  expect(getGitLabMediaContext(editor)).toBeUndefined(); expect(() => service.beginMediaEdit()).toThrow('GITLAB_MEDIA_SELECTION_REQUIRED');
});
it('keeps a completely unchanged property apply out of network and history', async () => {
  const { service, editor, render } = await setup(); const session = service.beginMediaEdit();
  await session.apply(fields(session)); expect(undo(editor)).toBe(false); expect(render).toHaveBeenCalledTimes(1);
});
it.each([
  { canonical: 'javascript:alert(1)' }, { canonical: 'data:image/png;base64,AAAA' },
  { width: '2em' }, { height: 'calc(100%)' }, { alt: 'two\nlines' },
])('refuses invalid media fields without document or history changes: %o', async change => {
  const { service, editor, render } = await setup(), before = editor.state.doc, session = service.beginMediaEdit();
  await expect(session.apply(fields(session, change))).rejects.toThrow();
  expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false); expect(render).toHaveBeenCalledTimes(1);
});
it('resolves changed source through the host and preserves canonical versus display addresses', async () => {
  const { service, editor, render } = await setup(), session = service.beginMediaEdit();
  render.mockResolvedValueOnce({ body: fixture('image').body.replaceAll('figure.png', 'replacement.png') });
  await session.apply(fields(session, { canonical: '/uploads/media-fixture/replacement.png' }));
  expect(render.mock.calls[1]?.[0]).toContain('/uploads/media-fixture/replacement.png');
  expect(getGitLabMediaContext(editor)).toMatchObject({ canonical: '/uploads/media-fixture/replacement.png', displayURL: '/-/project/1/uploads/media-fixture/replacement.png' });
  expect(service.getSerializedContent()).not.toContain('/-/project/');
});
it('maps unrelated inserted blocks while resolving and keeps the captured target after the selection moves', async () => {
  const { service, editor, render } = await setup(), session = service.beginMediaEdit();
  let resolve!: (value: { body: string }) => void;
  render.mockImplementationOnce(() => new Promise(value => { resolve = value; }));
  const result = session.apply(fields(session, { canonical: '/uploads/media-fixture/replacement.png' }));
  expect(session.snapshot.pending).toBe(true);
  editor.dispatch(editor.createTransaction().replace(0, 0, [editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Unrelated')])])
    .setSelection(Selection.cursor([0, 0], 2)));
  expect(session.snapshot.path).toEqual([1, 0]);
  resolve({ body: fixture('image').body.replaceAll('figure.png', 'replacement.png') }); await result;
  expect(editor.state.doc.child(0).textContent).toBe('Unrelated');
  expect(editor.state.doc.child(1).child(0).attrs.gitlabCanonicalSrc).toBe('/uploads/media-fixture/replacement.png');
});
it('refuses a renderer response that does not retain the requested URL and fields', async () => {
  const { service, editor } = await setup(), before = editor.state.doc, session = service.beginMediaEdit();
  await expect(session.apply(fields(session, { canonical: '/uploads/media-fixture/replacement.png' }))).rejects.toThrow('GITLAB_MEDIA_RESOLUTION_MISMATCH');
  expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false); expect(session.snapshot.closed).toBe(false);
});
it('refuses a changed captured atom and retains the caller draft', async () => {
  const { service, editor, path } = await setup(), session = service.beginMediaEdit();
  editor.dispatch(editor.createTransaction().setNodeAttrs(path, { ...editor.state.doc.child(0).child(0).attrs, alt: 'Another edit' }));
  expect(session.snapshot.conflict).toBe(true);
  await expect(session.apply(fields(session, { alt: 'Draft' }))).rejects.toThrow('GITLAB_MEDIA_TARGET_CHANGED');
  expect(() => session.remove()).toThrow('GITLAB_MEDIA_TARGET_CHANGED');
  expect(editor.state.doc.child(0).child(0).attrs.alt).toBe('Another edit');
});
it.each(['resolve', 'reject'])('cancels a pending media request and ignores a late %s', async outcome => {
  const { service, editor, render } = await setup(), before = editor.state.doc, session = service.beginMediaEdit();
  let resolve!: (value: { body: string }) => void, reject!: (error: Error) => void;
  render.mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; reject = no; }));
  const result = session.apply(fields(session, { canonical: '/uploads/media-fixture/replacement.png' }));
  session.close();
  if (outcome === 'resolve') resolve({ body: fixture('image').body }); else reject(new Error('Cancelled request'));
  await expect(result).resolves.toEqual({ status: 'closed' }); expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false);
});
it('keeps state/history unchanged on host rendering failure and allows correction', async () => {
  const { service, editor, render } = await setup(), before = editor.state.doc, session = service.beginMediaEdit();
  render.mockRejectedValueOnce(new Error('Offline'));
  await expect(session.apply(fields(session, { canonical: '/uploads/media-fixture/replacement.png' }))).rejects.toThrow();
  expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false); expect(session.snapshot.closed).toBe(false);
  await session.apply(fields(session, { alt: 'Corrected' })); expect(editor.state.doc.child(0).child(0).attrs.alt).toBe('Corrected');
});
it.each(['apply', 'remove'])('honors a native transaction filter refusing %s', async operation => {
  let reject = false;
  const filter = new Plugin({ filterTransaction: transaction => !reject || !transaction.docChanged });
  const { service, editor } = await setup('image', [{ name: 'media-refusal', plugins: [filter] }]);
  const before = editor.state.doc, session = service.beginMediaEdit(); reject = true;
  if (operation === 'apply') await expect(session.apply(fields(session, { alt: 'Rejected' }))).rejects.toThrow('GITLAB_MEDIA_UPDATE_REFUSED');
  else expect(() => session.remove()).toThrow('GITLAB_MEDIA_UPDATE_REFUSED');
  expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false);
});
it('rolls back an export refusal before history/document observers publish an edit', async () => {
  const { service, editor } = await setup(), before = editor.state.doc;
  const session = new GitLabMediaEditingSession({ editor, ensureReady() {}, resolve() { throw new Error('Unexpected request'); },
    validate() { throw new Error('EXPORT_REFUSED'); } });
  await expect(session.apply(fields(session, { alt: 'Rejected' }))).rejects.toThrow('EXPORT_REFUSED');
  expect(editor.state.doc).toBe(before); expect(undo(editor)).toBe(false); session.close();
  expect(service.getSerializedContent()).toBe(fixture('image').source);
});
it('refuses mutation after becoming read-only and closes owned sessions on supersession/disposal', async () => {
  const { service } = await setup(), first = service.beginMediaEdit(), second = service.beginMediaEdit();
  expect(first.snapshot.closed).toBe(true); service.setEditable(false);
  await expect(second.apply(fields(second, { alt: 'Blocked' }))).rejects.toThrow('GITLAB_EDITOR_NOT_READY');
  expect(() => second.remove()).toThrow('GITLAB_EDITOR_NOT_READY');
  service.dispose(); expect(second.snapshot.closed).toBe(true);
});
