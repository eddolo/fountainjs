// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  CoreExtension,
  EditorView,
  Selection,
  composeExtensions,
  createEditor,
  deleteSelection,
  insertText,
  selectText,
  type Editor,
} from '../src';
import {
  InMemoryCommentsStore,
  addComment,
  canComment,
  connectComments,
  createCommentThread,
  createCommentsExtension,
  disconnectComments,
  getCommentsState,
  hoverCommentThreads,
  reattachCommentThread,
  reduceCommentOperation,
  removeComment,
  removeCommentThread,
  selectCommentThread,
  setCommentThreadArchived,
  setCommentThreadResolved,
  subscribeCommentEvents,
  toggleCommentReaction,
  unselectCommentThread,
  updateComment,
  type CommentAuthor,
  type CommentsAdapter,
  type CommentsAdapterContext,
} from '../src/comments';

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] } as const;
}

function identityFactory(prefix: string) {
  let value = 0;
  return (kind: 'thread' | 'comment' | 'operation') => `${prefix}-${kind}-${++value}`;
}

function createCommentsEditor(
  store: InMemoryCommentsStore,
  user: CommentAuthor,
  prefix: string,
  content = 'Alpha Beta',
): Editor {
  const comments = createCommentsExtension({
    adapter: () => store.createAdapter(),
    user,
    idFactory: identityFactory(prefix),
    now: () => new Date('2026-09-04T12:00:00.000Z'),
  });
  const kit = composeExtensions([CoreExtension, comments]);
  return createEditor({
    schema: kit.schema,
    plugins: kit.plugins,
    content: { type: 'doc', content: [paragraph(content)] },
  });
}

describe('provider-independent threaded comments', () => {
  it('synchronizes complete thread conversations and lifecycle across adapters', async () => {
    const store = new InMemoryCommentsStore();
    const ada = createCommentsEditor(store, { id: 'ada', name: 'Ada' }, 'ada');
    const grace = createCommentsEditor(store, { id: 'grace', name: 'Grace' }, 'grace');
    selectText(ada, [0, 0], 0, 5);

    const created = await createCommentThread(ada, {
      content: 'Should this be more specific?',
      data: { category: 'editorial' },
      commentData: { mentionIds: ['grace'] },
    });
    expect(created.anchor).toMatchObject({ type: 'inline', status: 'attached', quote: 'Alpha' });
    expect(getCommentsState(grace)?.threads[0]?.comments[0]?.content).toBe('Should this be more specific?');

    const replied = await addComment(grace, created.id, { content: 'Yes — I will revise it.' });
    expect(replied.comments.map((comment) => comment.author.id)).toEqual(['ada', 'grace']);
    expect(getCommentsState(ada)?.threads[0]?.comments).toHaveLength(2);

    await expect(updateComment(grace, created.id, created.comments[0]!.id, 'Not allowed')).rejects.toThrow('permission denied');
    await updateComment(ada, created.id, created.comments[0]!.id, 'Could this be more specific?');
    await toggleCommentReaction(grace, created.id, created.comments[0]!.id, '👍');
    expect(getCommentsState(ada)?.threads[0]?.comments[0]).toMatchObject({
      content: 'Could this be more specific?',
      reactions: [{ emoji: '👍', userIds: ['grace'] }],
    });

    await setCommentThreadResolved(grace, created.id, true);
    expect(getCommentsState(ada)?.threads[0]).toMatchObject({ resolved: true, resolvedBy: { id: 'grace' } });
    await addComment(ada, created.id, { content: 'One follow-up.' });
    expect(getCommentsState(grace)?.threads[0]?.resolved).toBe(false);
    await removeComment(ada, created.id, getCommentsState(ada)!.threads[0]!.comments.at(-1)!.id);

    await setCommentThreadArchived(ada, created.id, true);
    expect(getCommentsState(grace)?.threads[0]?.archived).toBe(true);
    await setCommentThreadArchived(ada, created.id, false);
    await removeCommentThread(ada, created.id);
    expect(getCommentsState(ada)?.threads).toHaveLength(0);
    expect(getCommentsState(grace)?.threads).toHaveLength(0);
  });

  it('maps anchors through edits, orphans deleted ranges, and explicitly reattaches them', async () => {
    const store = new InMemoryCommentsStore();
    const editor = createCommentsEditor(store, { id: 'ada', name: 'Ada' }, 'mapped');
    const events: string[] = [];
    subscribeCommentEvents(editor, (event) => events.push(event.type));
    selectText(editor, [0, 0], 0, 5);
    const thread = await createCommentThread(editor, { content: 'Anchor Alpha.' });
    const initial = thread.anchor;

    selectText(editor, [0, 0], 0);
    expect(insertText(editor, 'Start ')).toBe(true);
    await Promise.resolve();
    expect(getCommentsState(editor)?.threads[0]?.anchor).toMatchObject({
      status: 'attached', from: (initial.from ?? 0) + 6, to: (initial.to ?? 0) + 6, quote: 'Alpha',
    });

    selectText(editor, [0, 0], 6, 11);
    expect(deleteSelection(editor)).toBe(true);
    await Promise.resolve();
    expect(getCommentsState(editor)?.threads[0]?.anchor.status).toBe('orphaned');
    expect(events).toContain('anchor-orphaned');

    selectText(editor, [0, 0], 6, 11);
    const restored = await reattachCommentThread(editor, thread.id);
    expect(restored.anchor).toMatchObject({ status: 'attached', quote: ' Beta' });
    expect(events).toContain('anchor-restored');
  });

  it('recovers a uniquely quoted anchor across a whole-document replacement', async () => {
    const store = new InMemoryCommentsStore();
    const editor = createCommentsEditor(store, { id: 'ada', name: 'Ada' }, 'recover', 'Unique phrase');
    selectText(editor, [0, 0], 0, 6);
    await createCommentThread(editor, { content: 'Keep this anchor.' });
    const replacement = editor.state.schema.nodeFromJSON({
      type: 'doc', content: [paragraph('Before'), paragraph('Unique phrase'), paragraph('After')],
    });

    expect(editor.dispatch(editor.state.createTransaction().replace(0, editor.state.doc.childCount, replacement.content))).toBe(true);
    await Promise.resolve();
    const anchor = getCommentsState(editor)?.threads[0]?.anchor;
    expect(anchor).toMatchObject({ status: 'attached', quote: 'Unique' });
    expect(anchor?.from).toBeGreaterThan(1);
  });

  it('renders overlapping inline, block, and point anchors as accessible view-only annotations', async () => {
    const store = new InMemoryCommentsStore();
    const editor = createCommentsEditor(store, { id: 'ada', name: '<Ada>' }, 'render');
    selectText(editor, [0, 0], 0, 5);
    const first = await createCommentThread(editor, { content: 'First.' });
    selectText(editor, [0, 0], 3, 8);
    const second = await createCommentThread(editor, { content: 'Second.' });
    selectText(editor, [0, 0], 2);
    const point = await createCommentThread(editor, { content: 'Point.' });
    const block = await createCommentThread(editor, { content: 'Block.', type: 'block' });
    await createCommentThread(editor, { content: 'Document.', type: 'document' });
    selectCommentThread(editor, second.id, false);
    hoverCommentThreads(editor, [first.id]);

    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor, { ariaLabel: 'Commented editor' });
    expect(mount.querySelectorAll('.fountain-comment-thread--inline').length).toBeGreaterThanOrEqual(3);
    expect(mount.querySelector(`[data-fountain-comment-thread="${first.id}"]`)?.getAttribute('aria-label')).toBe('Comment thread by <Ada>');
    expect(mount.querySelector(`[data-fountain-comment-thread="${second.id}"]`)?.classList.contains('is-selected')).toBe(true);
    expect(mount.querySelector(`[data-fountain-comment-thread="${first.id}"]`)?.classList.contains('is-hovered')).toBe(true);
    expect(mount.querySelector(`[data-fountain-comment-thread="${block.id}"]`)?.classList.contains('fountain-comment-thread--block')).toBe(true);
    const pointButton = mount.querySelector<HTMLButtonElement>(`button[data-fountain-comment-thread="${point.id}"]`);
    expect(pointButton?.getAttribute('aria-label')).toBe('Open comment thread by <Ada>');
    expect(mount.querySelectorAll('[data-fountain-comment-thread]').length).toBeGreaterThanOrEqual(4);
    expect(mount.innerHTML).not.toContain('<script>');

    pointButton?.click();
    expect(getCommentsState(editor)?.selectedThreadId).toBe(point.id);
    expect(unselectCommentThread(editor)).toBe(true);
    view.destroy();
  });

  it('anchors one inline thread across blocks and keeps comment bodies as portable rich JSON', async () => {
    const store = new InMemoryCommentsStore();
    const editor = createCommentsEditor(store, { id: 'ada', name: 'Ada' }, 'cross-block', 'Alpha');
    const second = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Beta')]);
    expect(editor.dispatch(editor.state.createTransaction().replace(1, 1, [second]))).toBe(true);
    expect(editor.dispatch(editor.state.createTransaction().setSelection(
      Selection.range([0, 0], 3, [1, 0], 2),
    ))).toBe(true);

    const thread = await createCommentThread(editor, {
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Cross-block ' },
            { type: 'text', text: 'review', marks: [{ type: 'strong' }] },
          ],
        }],
      },
    });
    expect(thread.anchor).toMatchObject({ type: 'inline', quote: 'ha\nBe' });
    expect(thread.comments[0]?.content).toMatchObject({ type: 'doc' });

    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    expect(mount.querySelectorAll(`[data-fountain-comment-thread="${thread.id}"]`)).toHaveLength(2);
    view.destroy();
  });

  it('exposes custom permission policy and never applies an asynchronous operation optimistically', async () => {
    let complete!: () => void;
    const adapter: CommentsAdapter = {
      connect: (value) => value.replaceThreads([]),
      apply: async (operation) => {
        await new Promise<void>((resolve) => { complete = resolve; });
        if (operation.type !== 'create-thread') throw new Error('Unexpected operation.');
        return { thread: operation.thread };
      },
    };
    const comments = createCommentsExtension({
      adapter: () => adapter,
      user: { id: 'ada', name: 'Ada' },
      permissions: { createThread: () => true, reply: () => false },
      idFactory: identityFactory('async'),
    });
    const kit = composeExtensions([CoreExtension, comments]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [paragraph('Safe')] } });
    const pending = createCommentThread(editor, { content: 'Wait for authority.' });
    expect(getCommentsState(editor)).toMatchObject({ threads: [], pendingThreadIds: ['async-thread-1'] });
    complete();
    const created = await pending;
    expect(getCommentsState(editor)?.threads).toHaveLength(1);
    expect(canComment(editor, 'reply', created.id)).toBe(false);
    await expect(addComment(editor, created.id, { content: 'Denied.' })).rejects.toThrow('permission denied');
    expect(getCommentsState(editor)?.threads[0]?.comments).toHaveLength(1);
  });

  it('contains adapter failures, validates hostile snapshots, and supports explicit lifecycle', async () => {
    let context!: CommentsAdapterContext;
    let unavailable = true;
    const disconnect = vi.fn();
    const destroy = vi.fn();
    const adapter: CommentsAdapter = {
      connect: (value) => { context = value; },
      apply: (operation) => {
        if (unavailable) {
          unavailable = false;
          throw new Error('storage unavailable');
        }
        return reduceCommentOperation([], operation);
      },
      disconnect,
      destroy,
    };
    const comments = createCommentsExtension({
      adapter: () => adapter,
      user: { id: 'ada', name: 'Ada' },
      autoConnect: false,
      idFactory: identityFactory('failure'),
    });
    const kit = composeExtensions([CoreExtension, comments]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [paragraph('Safe')] } });
    expect(getCommentsState(editor)?.status).toBe('disconnected');
    expect(connectComments(editor)).toBe(true);
    expect(getCommentsState(editor)?.status).toBe('connected');

    await expect(createCommentThread(editor, { content: 'Will fail.' })).rejects.toThrow('storage unavailable');
    expect(getCommentsState(editor)).toMatchObject({ status: 'error', error: { recoverable: true } });
    await createCommentThread(editor, { content: 'Recovered.' });
    expect(getCommentsState(editor)).toMatchObject({
      status: 'connected',
      threads: [{ comments: [{ content: 'Recovered.' }] }],
    });
    context.replaceThreads([{
      id: 'unsafe',
      anchor: { type: 'inline', status: 'attached', from: -1, to: 99 },
      author: { id: 'evil', name: '<script>' },
      comments: [],
      resolved: false,
      archived: false,
      createdAt: 'invalid',
      updatedAt: 'invalid',
      revision: 1,
    }]);
    expect(getCommentsState(editor)?.threads).toHaveLength(1);
    expect(getCommentsState(editor)?.threads[0]?.comments[0]?.content).toBe('Recovered.');
    expect(getCommentsState(editor)?.status).toBe('error');

    expect(disconnectComments(editor)).toBe(true);
    expect(disconnect).toHaveBeenCalledTimes(1);
    editor.destroy();
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
