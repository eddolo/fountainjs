import { describe, expect, it, vi } from 'vitest';
import {
  AIController,
  CoreSchemaSpec,
  Selection,
  createAIAdapter,
  createEditor,
  historyPlugin,
  undo,
} from '../src';

function makeEditor(text = 'A rough first sentence.') {
  return createEditor({
    schema: CoreSchemaSpec,
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
    plugins: [historyPlugin],
  });
}

describe('AI review controller', () => {
  it('exposes the exact minimal request before calling an adapter', () => {
    const editor = makeEditor();
    editor.dispatch(editor.state.createTransaction().setSelection(new Selection([0, 0], 2, 7)));
    const transform = vi.fn();
    const controller = new AIController(editor, createAIAdapter(transform));

    const request = controller.inspectRequest({ action: 'improve' });

    expect(request.input).toBe('rough');
    expect(request.target).toMatchObject({ path: [0, 0], from: 2, to: 7, scope: 'selection' });
    expect(request.context).toBeUndefined();
    expect(request.privacy).toEqual({ scope: 'selection', includesDocumentContext: false });
    expect(transform).not.toHaveBeenCalled();
  });

  it('keeps a proposal out of the document until accepted, then makes it undoable', async () => {
    const editor = makeEditor('Draft words.');
    const transform = vi.fn(async () => ({ replacement: 'Clear words.', model: 'test-model' }));
    const controller = new AIController(editor, createAIAdapter(transform));

    const proposal = await controller.suggest({ action: 'improve' });
    expect(editor.getText()).toBe('Draft words.');
    expect(proposal.status).toBe('pending');

    controller.accept(proposal);
    expect(editor.getText()).toBe('Clear words.');
    expect(controller.getSnapshot().suggestions[0]?.status).toBe('accepted');
    expect(undo(editor)).toBe(true);
    expect(editor.getText()).toBe('Draft words.');
  });

  it('rejects without editing and refuses stale proposals', async () => {
    const editor = makeEditor('Original');
    const controller = new AIController(editor, createAIAdapter(async () => 'Proposed'));

    const rejected = await controller.suggest({ action: 'shorten' });
    controller.reject(rejected);
    expect(editor.getText()).toBe('Original');

    const stale = await controller.suggest({ action: 'improve' });
    editor.dispatch(editor.state.createTransaction().replaceText([0, 0], 0, 8, 'Changed'));
    expect(() => controller.accept(stale)).toThrow('stale');
    expect(editor.getText()).toBe('Changed');
    expect(controller.getSnapshot().suggestions.at(-1)?.status).toBe('stale');
  });

  it('only includes full-document context when explicitly requested', () => {
    const editor = makeEditor('Private draft');
    const controller = new AIController(editor, createAIAdapter(async () => 'Result'));
    const request = controller.inspectRequest({ action: 'improve', includeDocumentContext: true });
    expect(request.context?.documentText).toBe('Private draft');
    expect(request.privacy.includesDocumentContext).toBe(true);
  });

  it('reviews a selection that crosses inline mark boundaries', async () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [
          { type: 'text', text: 'A ' },
          { type: 'text', text: 'rough', marks: [{ type: 'strong' }] },
          { type: 'text', text: ' draft.' },
        ] }],
      },
      plugins: [historyPlugin],
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 2, [0, 2], 7)));
    const controller = new AIController(editor, createAIAdapter(async () => 'clean version'));

    const proposal = await controller.suggest({ action: 'improve' });
    expect(proposal.original).toBe('rough draft.');
    controller.accept(proposal);
    expect(editor.getText()).toBe('A clean version');
  });
});
