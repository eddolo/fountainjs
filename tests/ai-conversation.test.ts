import { describe, expect, it, vi } from 'vitest';

import {
  AIConversationConflictError,
  AIConversationController,
  InMemoryAIConversationStore,
  InMemoryAIPromptStore,
  createAIConversationAdapter,
  createStreamingAIConversationAdapter,
  defineAIPromptTemplate,
  renderAIPrompt,
  type AIConversationRequest,
} from '../src';

function deterministicIds() {
  let next = 0;
  return (kind: 'message' | 'request' | 'operation') => `${kind}-${++next}`;
}

describe('host-owned AI conversations', () => {
  it('persists a genuine multi-turn exchange and sends bounded prior context', async () => {
    const store = new InMemoryAIConversationStore();
    const requests: AIConversationRequest[] = [];
    const controller = new AIConversationController({
      threadId: 'thread-1',
      store,
      maxContextMessages: 3,
      autoLoad: false,
      idFactory: deterministicIds(),
      now: () => '2026-09-06T12:00:00.000Z',
      adapter: createAIConversationAdapter(async (request) => {
        requests.push(request);
        return `Reply ${requests.length}`;
      }),
    });

    await controller.send('First question');
    await controller.send('Second question');

    expect(controller.getSnapshot().thread?.messages.map(({ role, content }) => [role, content])).toEqual([
      ['user', 'First question'], ['assistant', 'Reply 1'],
      ['user', 'Second question'], ['assistant', 'Reply 2'],
    ]);
    expect(requests[1]?.messages.map((message) => message.content)).toEqual([
      'First question', 'Reply 1', 'Second question',
    ]);
    expect(requests[1]?.privacy).toEqual({ includedMessages: 3, totalThreadMessages: 3 });
    expect(controller.getSnapshot().lastRequest?.id).toBe(requests[1]?.id);

    const secondController = new AIConversationController({
      threadId: 'thread-1', store, adapter: createAIConversationAdapter(async () => 'unused'), autoLoad: false,
    });
    expect((await secondController.load()).messages).toHaveLength(4);
  });

  it('shows streaming output transiently and only persists a completed assistant message', async () => {
    const store = new InMemoryAIConversationStore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const controller = new AIConversationController({
      threadId: 'thread-stream', store, autoLoad: false, idFactory: deterministicIds(),
      adapter: createStreamingAIConversationAdapter(async function* () {
        yield { contentDelta: 'Visible ' };
        await gate;
        yield { contentDelta: 'reply', model: 'host-model' };
      }),
    });

    const response = controller.send('Hello');
    await vi.waitFor(() => expect(controller.getSnapshot().streamingContent).toBe('Visible '));
    expect((await store.load({ threadId: 'thread-stream' }))?.messages).toHaveLength(1);
    release();
    await expect(response).resolves.toMatchObject({ role: 'assistant', content: 'Visible reply', model: 'host-model' });
    expect((await store.load({ threadId: 'thread-stream' }))?.messages).toHaveLength(2);
  });

  it('cancels without persisting partial assistant output and can clear host history', async () => {
    const store = new InMemoryAIConversationStore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const controller = new AIConversationController({
      threadId: 'thread-cancel', store, autoLoad: false, idFactory: deterministicIds(),
      adapter: createStreamingAIConversationAdapter(async function* () {
        yield { contentDelta: 'Partial' };
        await gate;
        yield { contentDelta: ' response' };
      }),
    });
    const response = controller.send('Keep my question');
    await vi.waitFor(() => expect(controller.getSnapshot().streamingContent).toBe('Partial'));
    controller.cancel();
    release();
    await expect(response).rejects.toMatchObject({ name: 'AbortError' });
    expect(controller.getSnapshot().thread?.messages.map((message) => message.content)).toEqual(['Keep my question']);
    await controller.clear();
    expect(controller.getSnapshot().thread?.messages).toEqual([]);
  });

  it('detects stale host writes instead of overwriting another controller', async () => {
    const store = new InMemoryAIConversationStore();
    const adapter = createAIConversationAdapter(async () => 'Reply');
    const first = new AIConversationController({ threadId: 'shared', store, adapter, autoLoad: false });
    const second = new AIConversationController({ threadId: 'shared', store, adapter, autoLoad: false });
    await Promise.all([first.load(), second.load()]);
    await first.send('One');
    await expect(second.send('Two')).rejects.toBeInstanceOf(AIConversationConflictError);
    expect((await store.load({ threadId: 'shared' }))?.messages.map((message) => message.content)).toEqual(['One', 'Reply']);
  });

  it('exposes an inspectable request without storing or calling the provider', async () => {
    const store = new InMemoryAIConversationStore();
    const reply = vi.fn(async () => 'No');
    const controller = new AIConversationController({
      threadId: 'inspect', store, adapter: createAIConversationAdapter(reply), autoLoad: false,
    });
    const request = await controller.inspectRequest('Private question');
    expect(request.messages.at(-1)).toMatchObject({ role: 'user', content: 'Private question' });
    expect(await store.load({ threadId: 'inspect' })).toBeUndefined();
    expect(reply).not.toHaveBeenCalled();
  });

  it('can cancel a host-store load without leaving the controller busy', async () => {
    const store = {
      load: ({ signal }: { signal?: AbortSignal }) => new Promise<undefined>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
      save: () => { throw new Error('unused'); },
    };
    const controller = new AIConversationController({
      threadId: 'cancel-load', store, adapter: createAIConversationAdapter(async () => 'unused'), autoLoad: false,
    });
    const loading = controller.load();
    expect(controller.getSnapshot().status).toBe('loading');
    controller.cancel();
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    expect(controller.getSnapshot()).toEqual({ status: 'idle', error: undefined });
  });

  it('becomes busy before an asynchronous host save can admit a duplicate send', async () => {
    const backing = new InMemoryAIConversationStore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const store = {
      load: backing.load.bind(backing),
      save: async (request: Parameters<typeof backing.save>[0]) => {
        await gate;
        return backing.save(request);
      },
    };
    const controller = new AIConversationController({
      threadId: 'single-flight', store, autoLoad: false,
      adapter: createAIConversationAdapter(async () => 'Reply'),
    });
    await controller.load();
    const first = controller.send('First');
    expect(controller.getSnapshot().status).toBe('requesting');
    await expect(controller.send('Duplicate')).rejects.toThrow(/active AI conversation response/);
    release();
    await first;
    expect(controller.getSnapshot().thread?.messages.map((message) => message.content)).toEqual(['First', 'Reply']);
  });

  it('rejects a host store that acknowledges different data than it was asked to save', async () => {
    const controller = new AIConversationController({
      threadId: 'bad-store',
      autoLoad: false,
      store: {
        load: () => undefined,
        save: (request) => ({ ...request.thread, title: 'Unexpected server rewrite' }),
      },
      adapter: createAIConversationAdapter(async () => 'unused'),
    });
    await expect(controller.send('Do not rewrite this')).rejects.toThrow(/different from the requested save/);
  });
});

describe('host-owned reusable AI prompts', () => {
  it('defines, stores, lists, renders, updates, and removes portable templates', async () => {
    const prompt = defineAIPromptTemplate({
      id: 'explain',
      title: 'Explain clearly',
      template: 'Explain {{topic}} for {{audience}}.',
      updatedAt: '2026-09-06T12:00:00Z',
    });
    const store = new InMemoryAIPromptStore([prompt]);
    expect((await store.list())[0]?.variables).toEqual(['topic', 'audience']);
    expect(renderAIPrompt(prompt, { topic: 'transactions', audience: 'a new contributor' }))
      .toBe('Explain transactions for a new contributor.');

    const updated = defineAIPromptTemplate({
      ...prompt, template: 'Describe {{topic}}.', variables: undefined, updatedAt: '2026-09-06T13:00:00Z',
    });
    await store.save(updated);
    expect((await store.load('explain'))?.variables).toEqual(['topic']);
    await store.remove('explain');
    expect(await store.list()).toEqual([]);
  });

  it('fails closed for mismatched placeholders and oversized history', () => {
    expect(() => defineAIPromptTemplate({
      id: 'bad', title: 'Bad', template: 'Hello {{name}}', variables: [], updatedAt: new Date().toISOString(),
    })).toThrow(/exactly match/);
    const prompt = defineAIPromptTemplate({
      id: 'strict', title: 'Strict', template: 'Hello {{name}}', updatedAt: new Date().toISOString(),
    });
    expect(() => renderAIPrompt(prompt, {})).toThrow(/missing: name/);
    expect(() => renderAIPrompt(prompt, { name: 'Ada', extra: 'ignored?' })).toThrow(/unknown: extra/);
  });
});
