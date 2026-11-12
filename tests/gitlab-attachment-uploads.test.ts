import { afterEach, expect, it, vi } from 'vitest';
import { Selection, insertText, undo, redo } from 'fountainjs-editor';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import type { GitLabUploadContext } from '../integrations/gitlab/services/attachment_uploads';

const services: GitLabContentEditor[] = [];
afterEach(() => services.splice(0).forEach(service => service.dispose()));
const file = () => new File(['binary image bytes'], 'figure.png', { type: 'image/png' });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function setup(upload = vi.fn(async (_file: File, _context: GitLabUploadContext) => '![figure](/uploads/figure.png)'), maxUploadEntries?: number) {
  const render = vi.fn(async (markdown: string) => ({ body: markdown.startsWith('![')
    ? '<p><img src="/uploads/figure.png" data-canonical-src="/uploads/figure.png" alt="figure"></p>'
    : `<p>${markdown}</p>` }));
  const service = new GitLabContentEditor({ renderMarkdown: render,
    describeLabels: () => '', uploadAttachment: upload, maxUploadEntries });
  services.push(service);
  await service.setSerializedContent('Before after');
  service.editor.dispatch(service.editor.createTransaction().setSelection(Selection.cursor([0, 0], 7)));
  return { service, editor: service.editor, upload, render };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

it('uploads through the host, maps through unrelated typing and records one undo step', async () => {
  const pending = deferred<string>();
  const { service, editor, upload } = await setup(vi.fn(() => pending.promise));
  const selected = file();
  const result = service.uploadAttachment(selected);
  await flush();
  expect(upload.mock.calls[0]![0]).toBe(selected);
  expect(service.status).toBe('loading');
  expect(() => service.getSerializedContent()).toThrow('GITLAB_EDITOR_NOT_READY');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  insertText(editor, 'Typed ');
  pending.resolve('![figure](/uploads/figure.png)');
  await expect(result).resolves.toEqual({ status: 'applied' });
  expect(service.getSerializedContent()).toContain('Typed Before ![figure](/uploads/figure.png)after');
  expect(service.attachmentUploads).toEqual([]);
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Typed Before after');
  expect(redo(editor)).toBe(true);
  expect(service.getSerializedContent()).toContain('![figure](/uploads/figure.png)');
});

it('reports finite monotonic progress without adding file handles to public snapshots', async () => {
  const pending = deferred<string>();
  const { service, upload } = await setup(vi.fn(() => pending.promise));
  const result = service.uploadAttachment(file());
  await flush();
  const context = upload.mock.calls[0]![1];
  context.reportProgress(0.5);
  context.reportProgress(0.1);
  context.reportProgress(Number.NaN);
  expect(service.attachmentUploads[0]).toMatchObject({ progress: 0.5, status: 'uploading' });
  expect(Object.keys(service.attachmentUploads[0]!)).not.toContain('file');
  context.reportProgress(10);
  expect(service.attachmentUploads[0]!.progress).toBe(1);
  pending.resolve('![figure](/uploads/figure.png)');
  await result;
});

it('keeps an image upload and its undo/redo caret in the empty destination paragraph', async () => {
  const { service, editor, render } = await setup();
  render.mockResolvedValueOnce({ body: '<p>Previous</p><p></p>' });
  await service.setSerializedContent('Previous\n\n');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 0))
    .setStoredMarks([editor.state.schema.mark('strong')]));
  await expect(service.uploadAttachment(file())).resolves.toEqual({ status: 'applied' });
  expect(editor.state.selection.eq(Selection.cursor([1, 1], 0))).toBe(true);
  expect(service.getSerializedContent()).not.toContain('data-fountain-text-style');
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.child(1).textContent).toBe('');
  expect(redo(editor)).toBe(true);
  expect(editor.state.selection.eq(Selection.cursor([1, 1], 0))).toBe(true);
  insertText(editor, 'After upload');
  expect(editor.state.doc.child(0).textContent).toBe('Previous');
  expect(editor.state.doc.child(1).child(1).text).toBe('After upload');
  expect(service.getSerializedContent()).toContain('**After upload**');
});

it('retains a failed file for retry without changing the document or history', async () => {
  const upload = vi.fn(async (_file: File, _context: GitLabUploadContext) => '![figure](/uploads/figure.png)');
  upload.mockRejectedValueOnce(new Error('Host refused upload'));
  const { service, editor } = await setup(upload);
  const before = editor.getJSON();
  await expect(service.uploadAttachment(file())).rejects.toThrow('Host refused');
  expect(editor.getJSON()).toEqual(before);
  expect(() => service.getSerializedContent()).toThrow('GITLAB_EDITOR_NOT_READY');
  expect(undo(editor)).toBe(false);
  const [entry] = service.attachmentUploads;
  expect(entry).toMatchObject({ status: 'failed', fileName: 'figure.png', errorCode: 'GITLAB_UPLOAD_FAILED' });
  await expect(service.retryUpload(entry!.id)).resolves.toEqual({ status: 'applied' });
  expect(upload).toHaveBeenCalledTimes(2);
  expect(service.attachmentUploads).toEqual([]);
});

it('reuses a completed server upload when renderer/insertion recovery is retried', async () => {
  const { service, upload, render } = await setup();
  render.mockRejectedValueOnce(new Error('Renderer temporarily unavailable'));
  await expect(service.uploadAttachment(file())).rejects.toThrow();
  const [failed] = service.attachmentUploads;
  expect(failed!.source).toBe('![figure](/uploads/figure.png)');
  await service.retryUpload(failed!.id);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(service.getSerializedContent()).toContain('![figure](/uploads/figure.png)');
});

it('cancels a stalled upload promptly and ignores late progress and completion', async () => {
  const pending = deferred<string>();
  const { service, upload, editor } = await setup(vi.fn(() => pending.promise));
  const result = service.uploadAttachment(file());
  await flush();
  const context = upload.mock.calls[0]![1];
  expect(service.cancelUpload(service.attachmentUploads[0]!.id)).toBe(true);
  await expect(result).resolves.toEqual({ status: 'superseded' });
  expect(context.signal.aborted).toBe(true);
  pending.resolve('![figure](/uploads/figure.png)');
  context.reportProgress(1);
  await flush();
  expect(service.attachmentUploads).toEqual([]);
  expect(editor.getText()).toBe('Before after');
});

it('queues files in invocation order with separate native undo steps', async () => {
  const first = deferred<string>();
  const { service, upload, editor } = await setup();
  upload.mockImplementationOnce(() => first.promise);
  const a = service.uploadAttachment(file()), b = service.uploadAttachment(file());
  await flush();
  expect(upload).toHaveBeenCalledTimes(1);
  expect(service.attachmentUploads.map(entry => entry.status)).toEqual(['uploading', 'queued']);
  first.resolve('![figure](/uploads/figure.png)');
  await Promise.all([a, b]);
  expect(service.getSerializedContent().match(/!\[figure\]/g)).toHaveLength(2);
  expect(undo(editor)).toBe(true);
  expect(service.getSerializedContent().match(/!\[figure\]/g)).toHaveLength(1);
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Before after');
});

it('refuses an overlapping changed target and lets the author retry at a new cursor', async () => {
  const pending = deferred<string>();
  const { service, editor, upload } = await setup(vi.fn(() => pending.promise));
  editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 0, [0, 0], 6)));
  const result = service.uploadAttachment(file());
  await flush();
  insertText(editor, 'Changed');
  await expect(result).rejects.toThrow('GITLAB_INSERTION_TARGET_CHANGED');
  pending.resolve('![figure](/uploads/figure.png)');
  await flush();
  expect(editor.getText()).toBe('Changed after');
  const [failed] = service.attachmentUploads;
  upload.mockResolvedValueOnce('![figure](/uploads/figure.png)');
  await service.retryUpload(failed!.id);
  expect(editor.getText()).toContain('Changed');
});

it.each(['load', 'dispose'] as const)('cancels pending file insertion on %s without leaking into another document', async action => {
  const pending = deferred<string>();
  const { service, upload, editor } = await setup(vi.fn(() => pending.promise));
  const result = service.uploadAttachment(file());
  await flush();
  const context = upload.mock.calls[0]![1];
  if (action === 'load') await service.setSerializedContent('Replacement');
  else service.dispose();
  await expect(result).resolves.toEqual({ status: 'superseded' });
  expect(context.signal.aborted).toBe(true);
  expect(service.attachmentUploads).toEqual([]);
  pending.resolve('![figure](/uploads/figure.png)');
  await flush();
  if (action === 'load') expect(editor.getText()).toBe('Replacement');
});

it('keeps later upload observers alive if an earlier host observer throws', async () => {
  const { service } = await setup();
  const observed = vi.fn();
  service.subscribeUploads(() => { throw new Error('Consumer observer'); });
  service.subscribeUploads(observed);
  await service.uploadAttachment(file());
  expect(observed).toHaveBeenCalled();
  expect(service.attachmentUploads).toEqual([]);
});

it('refuses invalid upload responses and releases retained jobs on explicit removal', async () => {
  const { service, editor } = await setup(vi.fn(async () => ''));
  await expect(service.uploadAttachment(file())).rejects.toThrow('GITLAB_INVALID_UPLOAD_RESPONSE');
  expect(editor.getText()).toBe('Before after');
  expect(service.cancelUpload(service.attachmentUploads[0]!.id)).toBe(true);
  expect(service.attachmentUploads).toEqual([]);
});

it('bounds retained upload entries and lets explicit cancellation release capacity', async () => {
  const pending = deferred<string>();
  const { service } = await setup(vi.fn(() => pending.promise), 1);
  expect(service.availableUploadSlots).toBe(1);
  const first = service.uploadAttachment(file());
  await flush();
  expect(service.availableUploadSlots).toBe(0);
  await expect(service.uploadAttachment(file())).rejects.toThrow('GITLAB_UPLOAD_QUEUE_FULL');
  service.cancelUpload(service.attachmentUploads[0]!.id);
  await first;
  expect(service.availableUploadSlots).toBe(1);
  const second = service.uploadAttachment(file());
  pending.resolve('![figure](/uploads/figure.png)');
  await expect(second).resolves.toEqual({ status: 'applied' });
  expect(service.availableUploadSlots).toBe(1);
  service.dispose();
  expect(service.availableUploadSlots).toBe(0);
});

it('captures the insertion target before a host status observer types elsewhere', async () => {
  const { service, editor } = await setup();
  let changed = false;
  service.subscribeStatus(status => {
    if (status !== 'loading' || changed) return;
    changed = true;
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    insertText(editor, 'Observer ');
  });
  await service.uploadAttachment(file());
  expect(service.getSerializedContent()).toContain('Observer Before ![figure](/uploads/figure.png)after');
});

it('publishes the current edited document only after an unresolved failed file is explicitly removed', async () => {
  const { service, editor } = await setup(vi.fn(async () => { throw new Error('Upload failed'); }));
  await expect(service.uploadAttachment(file())).rejects.toThrow();
  const changes = vi.fn();
  service.subscribeChange(changes);
  insertText(editor, 'New ');
  expect(service.status).toBe('error');
  expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error' }));
  service.cancelUpload(service.attachmentUploads[0]!.id);
  expect(service.status).toBe('ready');
  expect(service.getSerializedContent()).toBe('Before New after');
  expect(changes).toHaveBeenLastCalledWith({ status: 'ready', markdown: 'Before New after' });
});
