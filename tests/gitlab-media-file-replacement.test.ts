import { afterEach, expect, it, vi } from 'vitest';
import { NodeSelection, Selection, undo, redo } from 'fountainjs-editor';
import { GitLabContentEditor, GitLabEditorNotReady } from '../integrations/gitlab/services/content_editor';
import type { GitLabUploadContext } from '../integrations/gitlab/services/attachment_uploads';
import live from '../integrations/gitlab/fixtures/media-live-html.json';

const services: GitLabContentEditor[] = [];
afterEach(() => services.splice(0).forEach(service => service.dispose()));
const fixture = (name: string) => live.fixtures.find(row => row.name === name)!;
const replacement = { source: fixture('image').source.replaceAll('figure.png', 'replacement.png'),
  body: fixture('image').body.replaceAll('figure.png', 'replacement.png') };
const file = () => new File(['image bytes'], 'replacement.png', { type: 'image/png' });
const flush = async () => { for (let count = 0; count < 8; count++) await Promise.resolve(); };
const deferred = () => {
  let resolve!: (source: string) => void;
  const promise = new Promise<string>(yes => { resolve = yes; });
  return { promise, resolve };
};
async function setup(maxUploadEntries?: number, name = 'image-link') {
  const original = fixture(name);
  const upload = vi.fn(async (_file: File, _context: GitLabUploadContext) => replacement.source);
  const render = vi.fn(async (source: string) => ({ body: source === original.source ? original.body : replacement.body }));
  const service = new GitLabContentEditor({ renderMarkdown: render, describeLabels: () => '', uploadAttachment: upload, maxUploadEntries });
  services.push(service); await service.setSerializedContent(original.source);
  const { editor } = service;
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [0, 0])));
  const editing = service.beginMediaEdit();
  await editing.apply({ ...editing.initial, title: 'Authored title', width: '240', height: 'auto' });
  const prepend = () => editor.dispatch(editor.createTransaction().replace(0, 0, [editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Unrelated typing')])])
    .setSelection(Selection.cursor([0, 0], 3)));
  return { service, editor, upload, render, prepend, original };
}

it('replaces a selected image file while retaining its link, description, title and size with one-step undo/redo', async () => {
  const { service, editor } = await setup();
  const before = service.getSerializedContent();
  const marks = editor.state.doc.child(0).child(0).marks;
  await expect(service.replaceMediaAttachment(file())).resolves.toEqual({ status: 'applied' });
  const node = editor.state.doc.child(0).child(0);
  expect(node.marks).toEqual(marks);
  expect(node.attrs).toMatchObject({ alt: 'Linked figure', title: 'Authored title', width: '240px', height: 'auto',
    gitlabCanonicalSrc: '/uploads/media-fixture/replacement.png' });
  expect(service.getSerializedContent()).toBe(before.replaceAll('figure.png', 'replacement.png'));
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(before);
  expect(redo(editor)).toBe(true); expect(service.getSerializedContent()).toContain('/uploads/media-fixture/replacement.png');
});

it('keeps the picker-captured media after the cursor moves and an earlier block is inserted', async () => {
  const { service, editor, prepend } = await setup();
  const target = service.beginMediaReplacement();
  prepend();
  await expect(service.replaceMediaAttachment(file(), target)).resolves.toEqual({ status: 'applied' });
  expect(editor.state.doc.child(0).textContent).toBe('Unrelated typing');
  expect(editor.state.doc.child(1).child(0).attrs.alt).toBe('Linked figure');
  expect(editor.state.doc.child(1).child(0).attrs.gitlabCanonicalSrc).toBe('/uploads/media-fixture/replacement.png');
  expect(target.snapshot.closed).toBe(true);
});

it('maps through unrelated editing while the upload is pending and blocks serialization until it completes', async () => {
  const { service, editor, upload, prepend } = await setup(), pending = deferred();
  upload.mockImplementationOnce(() => pending.promise);
  const target = service.beginMediaReplacement(), result = service.replaceMediaAttachment(file(), target);
  await flush();
  expect(service.status).toBe('loading'); expect(() => service.getSerializedContent()).toThrow(GitLabEditorNotReady);
  prepend(); pending.resolve(replacement.source); await result;
  expect(editor.state.doc.child(0).textContent).toBe('Unrelated typing');
  expect(editor.state.doc.child(1).child(0).attrs.gitlabCanonicalSrc).toBe('/uploads/media-fixture/replacement.png');
  expect(target.snapshot.closed).toBe(true); expect(service.attachmentUploads).toEqual([]);
});

it('retries a network failure against the same mapped media instead of the current cursor', async () => {
  const { service, editor, upload, prepend } = await setup(), target = service.beginMediaReplacement();
  upload.mockRejectedValueOnce(new Error('Offline'));
  const before = editor.getJSON();
  await expect(service.replaceMediaAttachment(file(), target)).rejects.toThrow('Offline');
  expect(editor.getJSON()).toEqual(before); expect(target.snapshot.closed).toBe(false);
  const [failed] = service.attachmentUploads; expect(failed).toMatchObject({ operation: 'replace-media', status: 'failed' });
  prepend(); await service.retryUpload(failed!.id);
  expect(upload).toHaveBeenCalledTimes(2);
  expect(editor.state.doc.child(1).child(0).attrs).toMatchObject({ alt: 'Linked figure', title: 'Authored title', width: '240px',
    gitlabCanonicalSrc: '/uploads/media-fixture/replacement.png' });
  expect(target.snapshot.closed).toBe(true);
});

it('reuses the completed upload after a renderer failure and retains the target across cursor changes', async () => {
  const { service, editor, upload, render, prepend } = await setup(), target = service.beginMediaReplacement();
  render.mockRejectedValueOnce(new Error('Renderer unavailable'));
  await expect(service.replaceMediaAttachment(file(), target)).rejects.toMatchObject({ name: 'GitLabMarkdownConversionError',
    originalMarkdown: replacement.source, issues: expect.arrayContaining([expect.objectContaining({ code: 'render-or-parse-failed' })]) });
  const [failed] = service.attachmentUploads; expect(failed!.source).toBe(replacement.source);
  prepend(); await service.retryUpload(failed!.id);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(editor.state.doc.child(1).child(0).attrs.gitlabCanonicalSrc).toBe('/uploads/media-fixture/replacement.png');
});

it('refuses an edited target, preserves the other edit and never redirects a retry', async () => {
  const { service, editor, upload } = await setup(), pending = deferred(), target = service.beginMediaReplacement();
  upload.mockImplementationOnce(() => pending.promise);
  const result = service.replaceMediaAttachment(file(), target); await flush();
  editor.dispatch(editor.createTransaction().setNodeAttrs([0, 0], { ...editor.state.doc.child(0).child(0).attrs, alt: 'Edited meanwhile' }));
  pending.resolve(replacement.source);
  await expect(result).rejects.toThrow('GITLAB_INSERTION_TARGET_CHANGED');
  expect(editor.state.doc.child(0).child(0).attrs).toMatchObject({ alt: 'Edited meanwhile', gitlabCanonicalSrc: '/uploads/media-fixture/figure.png' });
  const [failed] = service.attachmentUploads;
  await expect(service.retryUpload(failed!.id)).rejects.toThrow('GITLAB_MEDIA_TARGET_CHANGED');
  expect(upload).toHaveBeenCalledTimes(1);
  service.cancelUpload(failed!.id); expect(target.snapshot.closed).toBe(true);
});

it('cancels promptly, closes the target owner and ignores a late upload result', async () => {
  const { service, editor, upload } = await setup(), pending = deferred(), target = service.beginMediaReplacement();
  upload.mockImplementationOnce(() => pending.promise); const before = service.getSerializedContent();
  const result = service.replaceMediaAttachment(file(), target); await flush();
  expect(service.cancelUpload(service.attachmentUploads[0]!.id)).toBe(true);
  await expect(result).resolves.toEqual({ status: 'superseded' });
  expect(upload.mock.calls[0]![1].signal.aborted).toBe(true); expect(target.snapshot.closed).toBe(true);
  pending.resolve(replacement.source); await flush();
  expect(service.getSerializedContent()).toBe(before); expect(service.attachmentUploads).toEqual([]);
  expect(editor.state.doc.child(0).child(0).attrs.gitlabCanonicalSrc).toBe('/uploads/media-fixture/figure.png');
});

it('supersedes replacement when a different document is loaded and ignores the old result', async () => {
  const { service, upload, original } = await setup(), pending = deferred(), target = service.beginMediaReplacement();
  upload.mockImplementationOnce(() => pending.promise);
  const result = service.replaceMediaAttachment(file(), target); await flush();
  await service.setSerializedContent(original.source);
  await expect(result).resolves.toEqual({ status: 'superseded' });
  pending.resolve(replacement.source); await flush();
  expect(service.getSerializedContent()).toBe(original.source); expect(target.snapshot.closed).toBe(true);
});

it('refuses a late read-only commit and reuses the upload after editing is restored', async () => {
  const { service, editor, upload } = await setup(), pending = deferred(), target = service.beginMediaReplacement();
  upload.mockImplementationOnce(() => pending.promise); const before = editor.getJSON();
  const result = service.replaceMediaAttachment(file(), target); await flush();
  service.setEditable(false); pending.resolve(replacement.source);
  await expect(result).rejects.toBeInstanceOf(GitLabEditorNotReady); expect(editor.getJSON()).toEqual(before);
  const [failed] = service.attachmentUploads;
  service.setEditable(true); await service.retryUpload(failed!.id);
  expect(upload).toHaveBeenCalledTimes(1); expect(target.snapshot.closed).toBe(true);
});

it('does not lose the replacement owner when an ordinary properties form is opened', async () => {
  const { service, upload } = await setup(), pending = deferred(), target = service.beginMediaReplacement();
  upload.mockImplementationOnce(() => pending.promise);
  const result = service.replaceMediaAttachment(file(), target); await flush();
  const form = service.beginMediaEdit(); expect(target.snapshot.closed).toBe(false); form.close();
  pending.resolve(replacement.source); await expect(result).resolves.toEqual({ status: 'applied' });
  expect(target.snapshot.closed).toBe(true);
});

it('refuses a replacement of another media kind without dropping the link or metadata', async () => {
  const { service, editor, upload, render } = await setup(), target = service.beginMediaReplacement();
  upload.mockResolvedValueOnce(fixture('audio').source); render.mockResolvedValueOnce({ body: fixture('audio').body });
  const before = editor.getJSON();
  await expect(service.replaceMediaAttachment(file(), target)).rejects.toThrow('GITLAB_MEDIA_REPLACEMENT_KIND_MISMATCH');
  expect(editor.getJSON()).toEqual(before);
  const [failed] = service.attachmentUploads; expect(failed).toMatchObject({ source: fixture('audio').source, operation: 'replace-media' });
  service.cancelUpload(failed!.id); expect(target.snapshot.closed).toBe(true);
});

it('releases a refused capacity reservation without uploading or affecting the existing job', async () => {
  const { service, editor, upload } = await setup(1), pending = deferred();
  upload.mockImplementationOnce(() => pending.promise); const before = editor.getJSON();
  const existing = service.uploadAttachment(file()); await flush();
  const target = service.beginMediaReplacement();
  await expect(service.replaceMediaAttachment(file(), target)).rejects.toThrow('GITLAB_UPLOAD_QUEUE_FULL');
  expect(target.snapshot.closed).toBe(true); expect(upload).toHaveBeenCalledTimes(1); expect(editor.getJSON()).toEqual(before);
  service.cancelUpload(service.attachmentUploads[0]!.id); await existing;
  pending.resolve(replacement.source); await flush();
});

it('releases an invalid file target and a cancelled picker without HTTP or model changes', async () => {
  const { service, editor, upload } = await setup(), target = service.beginMediaReplacement(), before = editor.getJSON();
  await expect(service.replaceMediaAttachment(null as unknown as File, target)).rejects.toThrow('GITLAB_INVALID_UPLOAD_FILE');
  expect(target.snapshot.closed).toBe(true);
  const picker = service.beginMediaReplacement(); picker.close(); picker.close();
  expect(service.status).toBe('ready'); expect(editor.getJSON()).toEqual(before); expect(upload).not.toHaveBeenCalled();
});

it('cannot use another editor owner and does not close that editor target', async () => {
  const first = await setup(), second = await setup(), target = first.service.beginMediaReplacement();
  await expect(second.service.replaceMediaAttachment(file(), target)).rejects.toThrow('GITLAB_MEDIA_TARGET_OWNER_REQUIRED');
  expect(first.upload).not.toHaveBeenCalled(); expect(second.upload).not.toHaveBeenCalled(); expect(target.snapshot.closed).toBe(false);
});

it('closes captured picker and pending upload owners on disposal without late insertion', async () => {
  const { service, upload } = await setup(), pending = deferred(), picker = service.beginMediaReplacement(), target = service.beginMediaReplacement();
  upload.mockImplementationOnce(() => pending.promise);
  const result = service.replaceMediaAttachment(file(), target); await flush(); service.dispose();
  await expect(result).resolves.toEqual({ status: 'superseded' });
  expect(target.snapshot.closed).toBe(true); expect(picker.snapshot.closed).toBe(true);
  expect(upload.mock.calls[0]![1].signal.aborted).toBe(true);
  pending.resolve(replacement.source); await flush();
});

it.each(['audio', 'video'])('retains %s source fields and dimensions when replacing its file', async kind => {
  const { service, editor, upload, render } = await setup(undefined, kind);
  const next = { source: fixture(kind).source.replaceAll('recording.', 'replacement.'), body: fixture(kind).body.replaceAll('recording.', 'replacement.') };
  upload.mockResolvedValueOnce(next.source); render.mockResolvedValueOnce({ body: next.body });
  const before = service.getSerializedContent(), node = editor.state.doc.child(0).child(0);
  await service.replaceMediaAttachment(file());
  expect(editor.state.doc.child(0).child(0).attrs).toMatchObject({ ...node.attrs,
    src: String(node.attrs.src).replace('recording.', 'replacement.'), gitlabCanonicalSrc: String(node.attrs.gitlabCanonicalSrc).replace('recording.', 'replacement.') });
  expect(service.getSerializedContent()).toBe(before.replaceAll('recording.', 'replacement.'));
  expect(undo(editor)).toBe(true); expect(service.getSerializedContent()).toBe(before);
});

it('refuses a stale renderer address or extra upload source content before changing the media', async () => {
  const { service, editor, render, upload } = await setup();
  const before = editor.getJSON();
  render.mockResolvedValueOnce({ body: fixture('image').body });
  await expect(service.replaceMediaAttachment(file())).rejects.toThrow('GITLAB_MEDIA_REPLACEMENT_SOURCE_MISMATCH');
  expect(editor.getJSON()).toEqual(before); service.cancelUpload(service.attachmentUploads[0]!.id);
  upload.mockResolvedValueOnce(replacement.source + '\n\nContent that must not disappear.');
  await expect(service.replaceMediaAttachment(file())).rejects.toThrow('GITLAB_MEDIA_REPLACEMENT_SOURCE_MISMATCH');
  expect(editor.getJSON()).toEqual(before);
});

it('orders two replacements while retaining independent mapped targets and metadata', async () => {
  const { service, editor, upload } = await setup(), first = deferred(), second = deferred();
  const firstNode = editor.state.doc.child(0).child(0), secondPath = [editor.state.doc.childCount, 0];
  const other = firstNode.type.create({ ...firstNode.attrs, alt: 'Second figure' }, firstNode.content, firstNode.text, firstNode.marks);
  editor.dispatch(editor.createTransaction().replace(secondPath[0]!, secondPath[0]!, [editor.state.schema.node('paragraph', {}, [other])]));
  const firstTarget = service.beginMediaReplacement();
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, secondPath)));
  const secondTarget = service.beginMediaReplacement();
  upload.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
  const firstResult = service.replaceMediaAttachment(file(), firstTarget), secondResult = service.replaceMediaAttachment(file(), secondTarget);
  await flush(); expect(upload).toHaveBeenCalledTimes(1);
  first.resolve(replacement.source); await firstResult; await flush(); expect(upload).toHaveBeenCalledTimes(2);
  second.resolve(replacement.source); await secondResult;
  expect(editor.state.doc.child(0).child(0).attrs.alt).toBe('Linked figure');
  expect(editor.state.doc.child(secondPath[0]!).child(0).attrs.alt).toBe('Second figure');
  for (const index of [0, secondPath[0]!]) expect(editor.state.doc.child(index).child(0).attrs.gitlabCanonicalSrc).toBe('/uploads/media-fixture/replacement.png');
  expect(firstTarget.snapshot.closed).toBe(true); expect(secondTarget.snapshot.closed).toBe(true);
});

it('can delete a linked image after reloading canonical left-aligned Markdown tables', async () => {
  const image = fixture('image-link-sized');
  const tableSource = '| Stage | Status |\n| :--- | :--- |\n| Save | Pending |';
  const tableHTML = '<table dir="auto"><thead><tr><th style="text-align:left">Stage</th><th style="text-align:left">Status</th></tr></thead><tbody><tr><td style="text-align:left">Save</td><td style="text-align:left">Pending</td></tr></tbody></table>';
  const source = tableSource + '\n\n' + image.source;
  const service = new GitLabContentEditor({ renderMarkdown: async () => ({ body: tableHTML + image.body }), describeLabels: () => '' });
  services.push(service); await service.setSerializedContent(source);
  service.editor.dispatch(service.editor.createTransaction().setSelection(new NodeSelection(service.editor.state.doc, [1, 0])));
  expect(service.beginMediaEdit().remove()).toBe(true);
  expect(service.getSerializedContent()).toContain(tableSource); expect(service.getSerializedContent()).not.toContain('figure.png');
  expect(undo(service.editor)).toBe(true); expect(service.getSerializedContent()).toBe(source);
});
