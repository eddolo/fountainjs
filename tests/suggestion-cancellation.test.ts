import { expect, it, vi } from 'vitest';
import { Plugin, PluginKey, createEditor, Selection } from '../src/core';
import { CoreSchemaSpec } from '../src/extensions';
import { createSuggestionStateSpec, SuggestionController, type SuggestionPluginState } from '../src/extensions/suggestion';

it.each(['dismiss', 'destroy'] as const)('does not publish a late transport failure after %s', async action => {
  const key = new PluginKey<SuggestionPluginState>('cancelled-suggestion');
  const editor = createEditor({ schema: CoreSchemaSpec, plugins: [new Plugin({ key,
    state: createSuggestionStateSpec([{ char: '/', startOfLine: true }]) })] });
  const schema = editor.state.schema;
  editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('/la')])]))
    .setSelection(Selection.cursor([0, 0], 3)));
  let reject!: (error: Error) => void;
  let signal: AbortSignal | undefined;
  const result = new Promise<readonly { id: string; label: string }[]>((_resolve, failed) => { reject = failed; });
  const controller = new SuggestionController(editor, key, context => { signal = context.signal; return result; }, () => true);
  const listener = vi.fn(); controller.subscribe(listener);
  expect(controller.getSnapshot().status).toBe('loading');
  controller[action]();
  const snapshot = controller.getSnapshot(), calls = listener.mock.calls.length;
  expect(signal?.aborted).toBe(true);
  // Axios and other adapters need not reject with a DOM AbortError.
  reject(new Error('Transport ended after cancellation'));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(controller.getSnapshot()).toBe(snapshot);
  expect(listener).toHaveBeenCalledTimes(calls);
  controller.destroy(); editor.destroy();
});
