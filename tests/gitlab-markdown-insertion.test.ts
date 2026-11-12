import { afterEach, expect, it, vi } from 'vitest';
import { Selection, insertText, undo, redo, Plugin } from 'fountainjs-editor';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { GitLabInsertionConflict } from '../integrations/gitlab/services/markdown_insertion';
const services: GitLabContentEditor[] = [];
afterEach(() => services.splice(0).forEach((service) => service.dispose()));
function setup(
  extensions = [] as NonNullable<
    ConstructorParameters<typeof GitLabContentEditor>[0]['extensions']
  >,
) {
  const render = vi.fn(async (value: string) => ({ body: `<p>${value}</p>` }));
  const service = new GitLabContentEditor({
    renderMarkdown: render,
    describeLabels: () => '',
    extensions,
  });
  services.push(service);
  return { service, render, editor: service.editor };
}
function defer(render: ReturnType<typeof setup>['render']) {
  let finish!: (value: { body: string }) => void;
  render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  return (body: string) => finish({ body });
}
const turn = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

it('inserts the rendered fragment into selected text with one undo step', async () => {
  const { service, editor, render } = setup();
  await service.setSerializedContent('Before target after');
  editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 7, [0, 0], 13)));
  const changes = vi.fn();
  service.subscribeChange(changes);
  render.mockResolvedValueOnce({ body: '<p><strong>replacement</strong></p>' });
  await expect(service.pasteMarkdown('**replacement**')).resolves.toEqual({ status: 'applied' });
  expect(editor.getText()).toBe('Before replacement after');
  expect(service.getSerializedContent()).toBe('Before **replacement** after');
  expect(changes).toHaveBeenCalledTimes(1);
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Before target after');
  expect(redo(editor)).toBe(true);
  expect(editor.getText()).toBe('Before replacement after');
});

it('blocks premature serialization while rendering and maps an insertion through unrelated typing', async () => {
  const { service, editor, render } = setup();
  await service.setSerializedContent('First target');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
  const finish = defer(render),
    pending = service.pasteMarkdown('new');
  await turn();
  expect(service.status).toBe('loading');
  expect(() => service.getSerializedContent()).toThrow('GITLAB_EDITOR_NOT_READY');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  expect(insertText(editor, 'Typed ')).toBe(true);
  finish('<p><strong>new</strong></p>');
  await pending;
  expect(editor.getText()).toBe('Typed First newtarget');
  expect(service.getSerializedContent()).toContain('**new**');
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Typed First target');
});

it('retains selected content and rejected source when the actual renderer fails', async () => {
  const { service, editor, render } = setup();
  await service.setSerializedContent('Keep this');
  editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 0, [0, 0], 4)));
  const before = editor.getJSON();
  render.mockRejectedValueOnce(new Error('Renderer unavailable'));
  await expect(service.pasteMarkdown('Requested source')).rejects.toThrow();
  expect(editor.getJSON()).toEqual(before);
  expect(service.insertionRecovery?.markdown).toBe('Requested source');
  expect(service.getSerializedContent()).toBe('Keep this');
});

it('does not overwrite changes inside a pending replacement range', async () => {
  const { service, editor, render } = setup();
  await service.setSerializedContent('Target text');
  editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 0, [0, 0], 6)));
  const finish = defer(render),
    pending = service.pasteMarkdown('Replacement');
  await turn();
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
  insertText(editor, '!');
  finish('<p>Replacement</p>');
  await expect(pending).rejects.toBeInstanceOf(GitLabInsertionConflict);
  expect(editor.getText()).toBe('Ta!rget text');
});

it('commits repeated paste requests in invocation order and preserves each undo boundary', async () => {
  const { service, editor, render } = setup();
  await service.setSerializedContent('Start');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 5)));
  const finish = defer(render);
  const first = service.pasteMarkdown('A'),
    second = service.pasteMarkdown('B');
  await turn();
  expect(render).toHaveBeenCalledTimes(2);
  finish('<p>A</p>');
  await Promise.all([first, second]);
  expect(editor.getText()).toBe('StartAB');
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('StartA');
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Start');
});

it.each(['load', 'dispose'] as const)(
  'cancels a pending insertion on %s without waiting for a stalled renderer',
  async (action) => {
    const { service, editor, render } = setup();
    await service.setSerializedContent('Original');
    render.mockImplementationOnce(() => new Promise(() => {}));
    const pending = service.pasteMarkdown('Stalled');
    await turn();
    if (action === 'load') await service.setSerializedContent('New document');
    else service.dispose();
    await expect(pending).resolves.toEqual({ status: 'superseded' });
    if (action === 'load') expect(editor.getText()).toBe('New document');
  },
);

it('orders repeated replacements at the same pending selection without dropping either paste', async () => {
  const { service, editor, render } = setup();
  await service.setSerializedContent('Start target end');
  editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 6, [0, 0], 12)));
  const finish = defer(render);
  const first = service.pasteMarkdown('A'),
    second = service.pasteMarkdown('B');
  await turn();
  finish('<p>A</p>');
  await Promise.all([first, second]);
  expect(editor.getText()).toBe('Start AB end');
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Start A end');
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Start target end');
});

it('rolls back an unrepresentable rendered fragment instead of corrupting current export', async () => {
  const { service, editor, render } = setup();
  await service.setSerializedContent('Keep');
  const before = editor.getJSON();
  render.mockResolvedValueOnce({ body: '<p style="text-align:center">Centered</p>' });
  await expect(service.pasteMarkdown('Centered')).rejects.toThrow();
  expect(editor.getJSON()).toEqual(before);
  expect(service.getSerializedContent()).toBe('Keep');
});

it('retains both user edits when a reentrant host edit interrupts the mapping sequence', async () => {
  const { service, editor, render } = setup();
  await service.setSerializedContent('Original');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  const finish = defer(render),
    pending = service.pasteMarkdown('Pending');
  await turn();
  let nested = false;
  service.subscribeChange(() => {
    if (!nested) {
      nested = true;
      insertText(editor, '?');
    }
  });
  expect(() => insertText(editor, '!')).not.toThrow();
  finish('<p>Pending</p>');
  await expect(pending).rejects.toBeInstanceOf(GitLabInsertionConflict);
  expect(editor.getText()).toBe('!?Original');
  expect(service.insertionRecovery?.markdown).toBe('Pending');
});

it('rolls back the whole insertion when a host transaction filter refuses it', async () => {
  let refuse = false;
  const { service, editor } = setup([
    {
      name: 'host-filter',
      plugins: [
        new Plugin({ filterTransaction: (transaction) => !refuse || !transaction.docChanged }),
      ],
    },
  ]);
  await service.setSerializedContent('Original');
  const before = editor.getJSON();
  refuse = true;
  await expect(service.pasteMarkdown('Blocked')).rejects.toThrow('GITLAB_INSERTION_REFUSED');
  expect(editor.getJSON()).toEqual(before);
});
