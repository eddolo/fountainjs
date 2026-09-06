import { describe, expect, it, vi } from 'vitest';
import {
  AIController,
  AllSelection,
  CoreSchemaSpec,
  Selection,
  createAIAdapter,
  createStreamingAIAdapter,
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
  it('requires an adapter operation', () => {
    expect(() => new AIController(makeEditor(), {} as never)).toThrow(/transform or stream/);
  });

  it('keeps a conventional transform fallback on a streaming adapter', async () => {
    const adapter = createStreamingAIAdapter(async function* () {
      yield { replacementDelta: 'Collected', explanationDelta: 'Fallback ' };
      yield { replacementDelta: ' result', explanationDelta: 'works.' };
    });
    await expect(adapter.transform({} as never, { signal: new AbortController().signal })).resolves.toEqual({
      replacement: 'Collected result',
      explanation: 'Fallback works.',
    });
  });
  it('streams a live proposal without mutating the document, then accepts once', async () => {
    const editor = makeEditor('Draft words.');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const controller = new AIController(editor, createStreamingAIAdapter(async function* () {
      yield { replacementDelta: 'Clear', explanationDelta: 'Making it ' };
      await gate;
      yield { replacementDelta: ' words.', explanationDelta: 'direct.', model: 'stream-test' };
    }));

    const pending = controller.suggest({ action: 'improve' });
    await vi.waitFor(() => expect(controller.getSnapshot().streamingProposal?.replacement).toBe('Clear'));
    expect(controller.getSnapshot()).toMatchObject({ status: 'streaming' });
    expect(editor.getText()).toBe('Draft words.');
    expect(controller.getSnapshot().suggestions).toHaveLength(0);

    release();
    const suggestion = await pending;
    expect(suggestion).toMatchObject({
      replacement: 'Clear words.',
      explanation: 'Making it direct.',
      model: 'stream-test',
      status: 'pending',
    });
    expect(controller.getSnapshot().streamingProposal).toBeUndefined();
    expect(editor.getText()).toBe('Draft words.');
    controller.accept(suggestion);
    expect(editor.getText()).toBe('Clear words.');
    expect(undo(editor)).toBe(true);
    expect(editor.getText()).toBe('Draft words.');
  });

  it('cancels an in-flight stream without retaining or applying partial output', async () => {
    const editor = makeEditor('Untouched');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const controller = new AIController(editor, createStreamingAIAdapter(async function* () {
      yield { replacementDelta: 'Partial' };
      await gate;
      yield { replacementDelta: ' output' };
    }));
    const pending = controller.suggest({ action: 'expand' });
    await vi.waitFor(() => expect(controller.getSnapshot().streamingProposal?.replacement).toBe('Partial'));
    controller.cancel();
    release();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(controller.getSnapshot()).toEqual({ status: 'idle', suggestions: [] });
    expect(editor.getText()).toBe('Untouched');
  });

  it('fails closed on empty, malformed, and over-limit streaming output', async () => {
    const editor = makeEditor('Still safe');
    const empty = new AIController(editor, createStreamingAIAdapter(async function* () {
      yield { model: 'metadata-only' };
    }));
    await expect(empty.suggest({ action: 'custom' })).rejects.toThrow(/empty replacement/);
    expect(editor.getText()).toBe('Still safe');

    const oversized = new AIController(editor, createStreamingAIAdapter(async function* () {
      yield { replacementDelta: 'x'.repeat(1_000_001) };
    }));
    await expect(oversized.suggest({ action: 'custom' })).rejects.toThrow(/1000000/);
    expect(oversized.getSnapshot()).toMatchObject({ status: 'error' });
    expect(editor.getText()).toBe('Still safe');
  });

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

  it('rejects semantic document selections instead of flattening them through a text proposal', () => {
    const editor = makeEditor('Structured draft');
    editor.dispatch(editor.state.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    const transform = vi.fn(async () => 'Result');
    const controller = new AIController(editor, createAIAdapter(transform));
    expect(() => controller.inspectRequest({ action: 'improve' })).toThrow('requires a text selection');
    expect(transform).not.toHaveBeenCalled();
    expect(editor.getText()).toBe('Structured draft');
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

  it('reviews and replaces a selection across document blocks', async () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First draft' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second pass' }] },
        ],
      },
      plugins: [historyPlugin],
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 6, [1, 0], 6)));
    const controller = new AIController(editor, createAIAdapter(async () => 'final'));
    const proposal = await controller.suggest({ action: 'improve' });
    expect(proposal.original).toBe('draft\nSecond');
    controller.accept(proposal);
    expect(editor.getText()).toBe('First final pass');
  });

  it('separates selected list items in the adapter request', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: { type: 'doc', content: [{ type: 'bullet_list', content: [
        { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
        { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] },
      ] }] },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0, 0, 0], 0, [0, 1, 0, 0], 6)));
    const controller = new AIController(editor, createAIAdapter(async () => 'Result'));
    expect(controller.inspectRequest({ action: 'improve' }).input).toBe('First\nSecond');
  });
});
