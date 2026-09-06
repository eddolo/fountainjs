/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import {
  AIConversationController,
  InMemoryAIConversationStore,
  InMemoryAIPromptStore,
  createAIConversationAdapter,
  defineAIPromptTemplate,
} from '../src';
import { FountainAIConversation } from '../src/react';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('FountainAIConversation', () => {
  it('loads reusable prompts and renders a persisted multi-turn conversation', async () => {
    const store = new InMemoryAIConversationStore();
    const controller = new AIConversationController({
      threadId: 'react-chat', store, autoLoad: false,
      adapter: createAIConversationAdapter(async (request) => `Answer ${request.messages.filter((message) => message.role === 'user').length}`),
    });
    const prompts = new InMemoryAIPromptStore([defineAIPromptTemplate({
      id: 'review', title: 'Review this', template: 'Review this decision.', updatedAt: '2026-09-06T12:00:00Z',
    })]);
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = createRoot(mount);

    await act(async () => root.render(<FountainAIConversation controller={controller} promptStore={prompts} />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const usePrompt = [...mount.querySelectorAll('button')].find((button) => button.textContent === 'Use prompt') as HTMLButtonElement;
    await act(async () => usePrompt.click());
    const textarea = mount.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Review this decision.');
    await act(async () => (mount.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(mount.textContent).toContain('Review this decision.');
    expect(mount.textContent).toContain('Answer 1');

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, 'Follow up');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => (mount.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(mount.textContent).toContain('Answer 2');
    expect(controller.getSnapshot().thread?.messages).toHaveLength(4);

    const clear = [...mount.querySelectorAll('button')].find((button) => button.textContent === 'Clear history') as HTMLButtonElement;
    await act(async () => clear.click());
    expect(mount.textContent).toContain('Confirm clear');
    await act(async () => ([...mount.querySelectorAll('button')].find((button) => button.textContent === 'Confirm clear') as HTMLButtonElement).click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(controller.getSnapshot().thread?.messages).toEqual([]);

    await act(async () => root.unmount());
    controller.destroy();
    mount.remove();
  });
});
