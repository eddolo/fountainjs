/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CoreExtension, composeExtensions, createEditor, selectText } from '../src';
import {
  InMemoryCommentsStore,
  createCommentThread,
  createCommentsExtension,
  getCommentsState,
} from '../src/comments';
import { FountainComments } from '../src/react/comments';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setTextArea(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
}

describe('React comments surface', () => {
  it('renders and operates an accessible threaded discussion panel', async () => {
    const store = new InMemoryCommentsStore();
    let nextId = 0;
    const extension = createCommentsExtension({
      adapter: () => store.createAdapter(),
      user: { id: 'ada', name: 'Ada' },
      idFactory: (kind) => `${kind}-${++nextId}`,
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });
    const kit = composeExtensions([CoreExtension, extension]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review this sentence' }] }] },
    });
    selectText(editor, [0, 0], 0, 6);
    const thread = await createCommentThread(editor, { content: 'Please verify this.' });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = createRoot(mount);

    await act(async () => root.render(<FountainComments editor={editor} />));
    const panel = mount.querySelector<HTMLElement>('[aria-label="Comments"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('1 thread · connected');
    expect(panel?.textContent).toContain('Please verify this.');
    const anchor = mount.querySelector<HTMLButtonElement>(`[data-thread-id="${thread.id}"] .fountain-comment-thread-card__anchor`);
    expect(anchor?.getAttribute('aria-pressed')).toBe('false');
    expect(anchor?.title).toBe('Review');

    await act(async () => anchor?.click());
    expect(anchor?.getAttribute('aria-pressed')).toBe('true');
    const reply = mount.querySelector<HTMLTextAreaElement>(`[aria-label="Thread by Ada"] .fountain-comments__reply textarea`);
    expect(reply).not.toBeNull();
    await act(async () => {
      setTextArea(reply as HTMLTextAreaElement, 'Confirmed.');
      reply?.form?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getCommentsState(editor)?.threads[0]?.comments).toHaveLength(2);
    expect(panel?.textContent).toContain('Confirmed.');

    const resolve = [...mount.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Resolve');
    await act(async () => {
      resolve?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getCommentsState(editor)?.threads[0]?.resolved).toBe(true);
    expect(panel?.textContent).toContain('Reopen');

    const reaction = mount.querySelector<HTMLButtonElement>('button[aria-label^="React "]');
    expect(reaction?.getAttribute('aria-label')).toContain('comment by Ada');
    await act(async () => {
      reaction?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mount.querySelector<HTMLButtonElement>('button[aria-label^="React "]')?.textContent).toBe('👍 1');

    await act(async () => root.unmount());
    editor.destroy();
    mount.remove();
  });
});
