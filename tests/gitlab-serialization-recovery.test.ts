import { afterEach, expect, it } from 'vitest';
import { Selection, createEditor, createHistoryPlugin, insertText, redo, undo } from 'fountainjs-editor';
import { GitLabMarkdownCodec, GitLabMarkdownConversionError, createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { SerializedContentConflict, SerializedContentController } from '../integrations/gitlab/services/serialized_content';

const dispose: (() => void)[] = [];
afterEach(() => dispose.splice(0).forEach(action => action()));

async function setup() {
  const editor = createEditor({ schema: createGitLabSchemaSpec(), plugins: [createHistoryPlugin()] });
  const codec = new GitLabMarkdownCodec({ renderMarkdown: async () => ({ body: '<p>Original</p>' }) });
  const controller = new SerializedContentController(editor, codec);
  dispose.push(() => { controller.dispose(); editor.destroy(); });
  await controller.setSerializedContent('Original');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  return { editor, controller };
}

it('reports an actual GitLab export loss without interrupting document/view notifications, then recovers through history', async () => {
  const { editor, controller } = await setup();
  const changes: unknown[] = [], observed: string[] = [];
  controller.subscribeChange(change => changes.push(change));
  // Registered after the converter, as a mounted view would be.
  editor.subscribe(state => observed.push(String(state.doc.child(0).attrs.align)));
  expect(() => editor.dispatch(editor.createTransaction().setNodeAttrs([0], { align: 'center', alignExplicit: true }))).not.toThrow();
  expect(observed).toEqual(['center']);
  expect(changes).toEqual([{ status: 'error', error: expect.any(GitLabMarkdownConversionError) }]);
  expect(() => controller.getSerializedContent()).toThrow(GitLabMarkdownConversionError);
  expect(undo(editor)).toBe(true);
  expect(changes.at(-1)).toEqual({ status: 'ready', markdown: 'Original' });
  expect(controller.getSerializedContent()).toBe('Original');
  expect(() => redo(editor)).not.toThrow();
  expect(changes.at(-1)).toEqual({ status: 'error', error: expect.any(GitLabMarkdownConversionError) });
  expect(observed).toHaveLength(3);
});

it('continues reporting edits in a non-serializable document and detects them during a pending replacement', async () => {
  const { editor, controller } = await setup();
  const changes: unknown[] = [];
  controller.subscribeChange(change => changes.push(change));
  const loading = expect(controller.setSerializedContent('Replacement')).rejects.toBeInstanceOf(SerializedContentConflict);
  expect(() => editor.dispatch(editor.createTransaction().setNodeAttrs([0], { align: 'center', alignExplicit: true }))).not.toThrow();
  expect(() => insertText(editor, 'New ')).not.toThrow();
  await loading;
  expect(editor.getText()).toBe('New Original');
  expect(changes).toHaveLength(2);
  expect(changes.every(change => (change as { status: string }).status === 'error')).toBe(true);
  expect(() => controller.getSerializedContent()).toThrow(GitLabMarkdownConversionError);
});

it('releases error and success notifications with the same subscription lifecycle', async () => {
  const { editor, controller } = await setup();
  const changes: unknown[] = [];
  const release = controller.subscribeChange(change => changes.push(change));
  release();
  expect(() => editor.dispatch(editor.createTransaction().setNodeAttrs([0], { align: 'center', alignExplicit: true }))).not.toThrow();
  expect(undo(editor)).toBe(true);
  controller.subscribeChange(change => changes.push(change));
  controller.dispose();
  expect(() => redo(editor)).not.toThrow();
  expect(changes).toEqual([]);
});

it('does not misclassify a host listener exception as a conversion error', async () => {
  const { editor, controller } = await setup();
  const events: unknown[] = [], hostError = new Error('Host listener failed');
  controller.subscribeChange(change => { events.push(change); throw hostError; });
  expect(() => insertText(editor, 'New ')).toThrow(hostError);
  expect(events).toEqual([{ status: 'ready', markdown: 'New Original' }]);
  expect(controller.getSerializedContent()).toBe('New Original');
});
