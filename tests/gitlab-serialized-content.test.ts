import { afterEach, expect, it } from 'vitest';
import { CoreExtension, CoreSchemaSpec, MarkdownExporter, MarkdownImporter, Plugin, Selection, composeExtensions,
  createCollaborationExtension, createEditor, createHistoryPlugin,
  insertText, redo, undo, type Editor, type Node, type Schema } from 'fountainjs-editor';
import { SerializedContentConflict, SerializedContentController, type SerializedContentCodec } from '../integrations/gitlab/services/serialized_content';

const dispose: (() => void)[] = [];
afterEach(() => dispose.splice(0).forEach(action => action()));
const ordinaryMarkdownCodec: SerializedContentCodec = {
  async deserialize({ schema, markdown }) { return { document: MarkdownImporter.parse(markdown, schema) }; },
  serialize: ({ doc }) => new MarkdownExporter().export(doc),
};
function setup(codec = ordinaryMarkdownCodec, plugins: Plugin[] = []) {
  const editor = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin(), ...plugins] });
  const controller = new SerializedContentController(editor, codec);
  dispose.push(() => { controller.dispose(); editor.destroy(); });
  return { editor, controller };
}
function typeAtEnd(editor: Editor, value: string) {
  const path = [0, 0];
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor(path, editor.state.doc.child(0).textContent.length)));
  expect(insertText(editor, value)).toBe(true);
}
function deferredCodec() {
  const requests: { schema: Schema; markdown: string; signal: AbortSignal; resolve: (value: { document: Node }) => void; reject: (error: Error) => void }[] = [];
  const codec: SerializedContentCodec = { ...ordinaryMarkdownCodec, deserialize: input => new Promise((resolve, reject) => requests.push({ ...input, resolve, reject })) };
  return { requests, codec, resolve: (index: number) => {
    const request = requests[index]!;
    request.resolve({ document: MarkdownImporter.parse(request.markdown, request.schema) });
  } };
}

it('loads outside history, makes templates undoable, and establishes a fresh baseline on reopen', async () => {
  const { editor, controller } = setup();
  expect(await controller.setSerializedContent('Original')).toEqual({ status: 'applied' });
  expect(undo(editor)).toBe(false);
  typeAtEnd(editor, ' typed');
  await controller.setSerializedContent('Template', { addToHistory: true });
  expect(editor.getText()).toBe('Template');
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Original typed');
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Original');
  expect(redo(editor)).toBe(true);
  await controller.setSerializedContent('Reopened');
  expect(undo(editor)).toBe(false);
  expect(redo(editor)).toBe(false);
  expect(controller.getSerializedContent()).toBe('Reopened');
});

it('reports user edits once while suppressing load, selection and interaction-mode changes', async () => {
  const { editor, controller } = setup();
  const changes: string[] = [];
  const unsubscribe = controller.subscribeChange(change => {
    if (change.status === 'error') throw change.error;
    changes.push(change.markdown);
  });
  await controller.setSerializedContent('Original');
  editor.setEditable(false); editor.setEditable(true);
  typeAtEnd(editor, '!');
  expect(changes).toEqual(['Original!']);
  unsubscribe();
  typeAtEnd(editor, '?');
  expect(changes).toEqual(['Original!']);
});

it('keeps the newest replacement when asynchronous rendering finishes out of order', async () => {
  const pending = deferredCodec(), { editor, controller } = setup(pending.codec);
  const first = controller.setSerializedContent('Old');
  const second = controller.setSerializedContent('New');
  expect(pending.requests[0]!.signal.aborted).toBe(true);
  pending.resolve(1);
  expect(await second).toEqual({ status: 'applied' });
  expect(await first).toEqual({ status: 'superseded' });
  pending.resolve(0);
  expect(editor.getText()).toBe('New');
});

it('ignores an aborted superseded error but surfaces the active rendering error', async () => {
  const pending = deferredCodec(), { controller } = setup(pending.codec);
  const first = controller.setSerializedContent('Old');
  const second = controller.setSerializedContent('New');
  pending.requests[0]!.reject(new Error('Old render cancelled'));
  expect(await first).toEqual({ status: 'superseded' });
  pending.requests[1]!.reject(new Error('Actual service failed'));
  await expect(second).rejects.toThrow('Actual service failed');
});

it('preserves newer typing rather than overwriting it with a delayed template', async () => {
  const pending = deferredCodec(), { editor, controller } = setup(pending.codec);
  const first = controller.setSerializedContent('Original'); pending.resolve(0); await first;
  const next = controller.setSerializedContent('Template', { addToHistory: true });
  typeAtEnd(editor, '!');
  pending.resolve(1);
  await expect(next).rejects.toBeInstanceOf(SerializedContentConflict);
  expect(editor.getText()).toBe('Original!');
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Original');
});

it('detects an intervening edit even if undo restores the original document object', async () => {
  const pending = deferredCodec(), { editor, controller } = setup(pending.codec);
  const first = controller.setSerializedContent('Original'); pending.resolve(0); await first;
  const next = controller.setSerializedContent('Delayed template', { addToHistory: true });
  typeAtEnd(editor, '!');
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Original');
  pending.resolve(1);
  await expect(next).rejects.toBeInstanceOf(SerializedContentConflict);
  expect(redo(editor)).toBe(true);
  expect(editor.getText()).toBe('Original!');
});

it('permits caret and mode updates during rendering and preserves all returned root attributes', async () => {
  const pending = deferredCodec(), { editor, controller } = setup(pending.codec);
  const first = controller.setSerializedContent('Original'); pending.resolve(0); await first;
  const next = controller.setSerializedContent('Replacement', { addToHistory: true });
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
  editor.setEditable(false);
  const document = editor.state.schema.nodeFromJSON({ type: 'doc', attrs: { language: 'it', customProject: { key: 'stable' } },
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Replacement' }] }] });
  pending.requests[1]!.resolve({ document });
  expect(await next).toEqual({ status: 'applied' });
  expect(editor.getJSON()).toEqual(document.toJSON());
  editor.setEditable(true);
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Original');
  expect(redo(editor)).toBe(true);
  expect(editor.getJSON()).toEqual(document.toJSON());
});

it('keeps document/history when the host rejects a replacement', async () => {
  let refuse = false;
  const { editor, controller } = setup(ordinaryMarkdownCodec, [new Plugin({ filterTransaction: () => !refuse })]);
  await controller.setSerializedContent('Original');
  typeAtEnd(editor, '!');
  const before = editor.getJSON();
  refuse = true;
  await expect(controller.setSerializedContent('Rejected')).rejects.toThrow('refused');
  expect(editor.getJSON()).toEqual(before);
  refuse = false;
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Original');
});

it('still honors plugin vetoes when loading an identical document', async () => {
  let refuse = false;
  const { editor, controller } = setup(ordinaryMarkdownCodec, [new Plugin({ filterTransaction: () => !refuse })]);
  await controller.setSerializedContent('Same');
  typeAtEnd(editor, '!');
  refuse = true;
  await expect(controller.setSerializedContent('Same!')).rejects.toThrow('refused');
  refuse = false;
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Same');
});

it('rejects a document from another schema without clearing existing history', async () => {
  const pending = deferredCodec(), { editor, controller } = setup(pending.codec);
  const first = controller.setSerializedContent('Original'); pending.resolve(0); await first;
  typeAtEnd(editor, '!');
  const next = controller.setSerializedContent('Foreign');
  const foreign = setup();
  pending.requests[1]!.resolve({ document: MarkdownImporter.parse('Foreign', foreign.editor.state.schema) });
  await expect(next).rejects.toThrow('editor schema');
  expect(editor.getText()).toBe('Original!');
  expect(undo(editor)).toBe(true);
  expect(editor.getText()).toBe('Original');
});

it('refuses an uncoordinated Markdown load into an active collaboration session', async () => {
  const kit = composeExtensions([CoreExtension, createCollaborationExtension({ adapter: () => ({ connect() {} }) })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared document' }] }] } });
  const controller = new SerializedContentController(editor, ordinaryMarkdownCodec);
  dispose.push(() => { controller.dispose(); editor.destroy(); });
  await expect(controller.setSerializedContent('Local replacement')).rejects.toThrow('session seed/replacement protocol');
  expect(editor.getText()).toBe('Shared document');
});

it('cancels loads and detaches host notifications on disposal without destroying the host editor', async () => {
  const pending = deferredCodec(), { editor, controller } = setup(pending.codec);
  const changes: unknown[] = [];
  controller.subscribeChange(value => changes.push(value));
  const load = controller.setSerializedContent('Late');
  controller.dispose();
  expect(pending.requests[0]!.signal.aborted).toBe(true);
  expect(await load).toEqual({ status: 'superseded' });
  pending.resolve(0);
  expect(editor.isDestroyed).toBe(false);
  expect(insertText(editor, 'Still live')).toBe(true);
  expect(changes).toEqual([]);
  await expect(controller.setSerializedContent('Later')).rejects.toThrow('destroyed');
  expect(() => controller.getSerializedContent()).toThrow('destroyed');
});
