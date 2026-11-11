import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor, NodeJSON } from '../core';
import {
  addComment,
  canComment,
  createCommentThread,
  getCommentsState,
  hoverCommentThreads,
  reattachCommentThread,
  removeComment,
  removeCommentThread,
  selectCommentThread,
  setCommentThreadArchived,
  setCommentThreadResolved,
  toggleCommentReaction,
  updateComment,
  type CommentAction,
  type CommentContent,
  type CommentMessage,
  type CommentThread,
  type CommentThreadType,
} from '../comments';
import { useFountainState } from './useFountain';

export interface FountainCommentsProps {
  editor: Editor | null;
  className?: string;
  title?: string;
  showArchived?: boolean;
  reactions?: readonly string[];
  onError?: (error: unknown) => void;
}

function contentText(content: CommentContent): string {
  if (typeof content === 'string') return content;
  const collect = (node: NodeJSON): string => [node.text ?? '', ...(node.content ?? []).map(collect)].join('');
  return collect(content) || JSON.stringify(content);
}

function anchorLabel(thread: CommentThread): string {
  if (thread.anchor.status === 'orphaned') return 'Anchor removed — select content to reattach';
  if (thread.anchor.type === 'document') return 'Whole document';
  if (thread.anchor.type === 'block') return thread.anchor.quote || thread.anchor.nodeType || 'Block';
  return thread.anchor.quote || 'Cursor position';
}

function commentRunner(onError?: FountainCommentsProps['onError']) {
  return async (operation: () => Promise<unknown>) => {
    try { await operation(); }
    catch (error) { onError?.(error); }
  };
}

function actionButton(label: string, onClick: () => void) {
  return <button type="button" onClick={onClick}>{label}</button>;
}

function CommentBody({
  editor,
  thread,
  comment,
  reactions,
  onError,
  draft,
  changeDraft,
  pending,
}: {
  editor: Editor;
  thread: CommentThread;
  comment: CommentMessage;
  reactions: readonly string[];
  onError?: (error: unknown) => void;
  draft?: string;
  changeDraft: (value?: string, previous?: string) => void;
  pending: boolean;
}) {
  const content = contentText(comment.content);
  const timestamp = comment.updatedAt ?? comment.createdAt;
  const editing = draft !== undefined;
  const message = draft?.trim();
  const run = commentRunner(onError);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || !message) return;
    await run(async () => {
      await updateComment(editor, thread.id, comment.id, message);
      changeDraft(undefined, draft);
    });
  };
  return <article className="fountain-comment" data-comment-id={comment.id}>
    <header>
      <strong>{comment.author.name}</strong>
      <time dateTime={timestamp}>{new Date(timestamp).toLocaleString()}</time>
    </header>
    {editing
      ? <form onSubmit={save}>
        <label>
          <span>Edit comment</span>
          <textarea value={draft} onChange={(event) => changeDraft(event.currentTarget.value)} />
        </label>
        <div className="fountain-comments__actions">
          <button type="submit" disabled={pending || !message}>Save</button>
          {actionButton('Cancel', () => changeDraft())}
        </div>
      </form>
      : <p>{content}</p>}
    <div className="fountain-comments__actions">
      {reactions.map((emoji) => {
        const count = comment.reactions.find((value) => value.emoji === emoji)?.userIds.length;
        return <button
          key={emoji}
          type="button"
          className={count ? 'has-reactions' : undefined}
          disabled={!canComment(editor, 'react', thread.id, comment.id)}
          aria-label={`React ${emoji} to comment by ${comment.author.name}`}
          onClick={() => void run(() => toggleCommentReaction(editor, thread.id, comment.id, emoji))}
        >{emoji}{count ? ` ${count}` : ''}</button>;
      })}
      {!editing && canComment(editor, 'edit-comment', thread.id, comment.id)
        ? actionButton('Edit', () => changeDraft(content))
        : null}
      {canComment(editor, 'delete-comment', thread.id, comment.id)
        ? actionButton('Delete', () => void run(async () => {
          await removeComment(editor, thread.id, comment.id);
          changeDraft();
        }))
        : null}
    </div>
  </article>;
}

export function FountainComments({
  editor,
  className,
  title = 'Comments',
  showArchived = false,
  reactions = ['👍', '✅'],
  onError,
}: FountainCommentsProps) {
  useFountainState(editor);
  const [composer, setComposer] = useState({ open: false, target: 'inline' as CommentThreadType, text: '' });
  const { open: creating, target, text: draft } = composer;
  const [posting, setPosting] = useState(false);
  const postingRequest = useRef(false);
  const updateComposer = (change: Partial<typeof composer>) => setComposer(current => ({ ...current, ...change }));
  const draftInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (creating) draftInput.current?.focus();
  }, [creating]);
  const [drafts, setDrafts] = useState(() => new Map<string, string>());
  const state = editor ? getCommentsState(editor) : undefined;
  const threads = useMemo(
    () => (state?.threads ?? []).filter((thread) => showArchived || !thread.archived),
    [showArchived, state?.threads],
  );
  if (!editor || !state) return null;

  const message = draft.trim();
  const run = commentRunner(onError);
  const changeDraft = (key: string, value?: string, previous?: string) => {
    setDrafts(current => {
      if (previous !== undefined && current.get(key) !== previous) return current;
      const next = new Map(current);
      if (value === undefined) next.delete(key);
      else next.set(key, value);
      return next;
    });
  };
  const submitThread = async (event: FormEvent) => {
    event.preventDefault();
    if (!message || postingRequest.current) return;
    postingRequest.current = true;
    setPosting(true);
    try {
      await run(async () => {
        const thread = await createCommentThread(editor, { content: message, type: target });
        selectCommentThread(editor, thread.id, false);
        setComposer(current => current === composer ? { open: false, target, text: '' } : current);
      });
    } finally {
      postingRequest.current = false;
      setPosting(false);
    }
  };
  const submitReply = async (event: FormEvent, thread: CommentThread) => {
    event.preventDefault();
    const reply = drafts.get(thread.id);
    const content = reply?.trim();
    if (!content) return;
    await run(async () => {
      await addComment(editor, thread.id, { content });
      changeDraft(thread.id, undefined, reply);
    });
  };

  return <aside
    className={className ? `fountain-comments ${className}` : 'fountain-comments'}
    aria-label={title}
  >
    <header className="fountain-comments__header">
      <div>
        <h2>{title}</h2>
        <span>{threads.length} {threads.length === 1 ? 'thread' : 'threads'} · {state.status}</span>
      </div>
      <button
        type="button"
        disabled={!canComment(editor, 'create-thread')}
        aria-expanded={creating}
        onClick={() => updateComposer({ open: !creating })}
      >New comment</button>
    </header>
    {state.error ? <p className="fountain-comments__error" role="alert">{state.error.message}</p> : null}
    {creating ? <form className="fountain-comments__composer" onSubmit={submitThread}>
      <label>
        <span>Comment target</span>
        <select value={target} onChange={(event) => updateComposer({ target: event.currentTarget.value as CommentThreadType })}>
          <option value="inline">Current text or cursor</option>
          <option value="block">Current block</option>
          <option value="document">Whole document</option>
        </select>
      </label>
      <label>
        <span>New comment</span>
        <textarea ref={draftInput} value={draft} onChange={(event) => updateComposer({ text: event.currentTarget.value })} placeholder="Add context or feedback…" />
      </label>
      <div className="fountain-comments__actions">
        <button type="submit" disabled={posting || !message}>{posting ? 'Posting…' : 'Create thread'}</button>
        {actionButton('Cancel', () => updateComposer({ open: false }))}
      </div>
    </form> : null}
    <div className="fountain-comments__list" aria-live="polite">
      {!threads.length ? <p className="fountain-comments__empty">Select text, a block, or the whole document to start a discussion.</p> : null}
      {threads.map((thread) => {
        const selected = state.selectedThreadId === thread.id;
        const pending = state.pendingThreadIds.includes(thread.id);
        const anchor = anchorLabel(thread);
        const replyDraft = drafts.get(thread.id) ?? '';
        const action = <Args extends unknown[]>(
          permission: CommentAction,
          label: string,
          operation: (editor: Editor, threadId: string, ...args: Args) => Promise<unknown>,
          ...args: Args
        ) => canComment(editor, permission, thread.id)
          ? actionButton(label, () => void run(() => operation(editor, thread.id, ...args)))
          : null;
        return <section
          key={thread.id}
          className={`fountain-comment-thread-card${selected ? ' is-selected' : ''}${thread.resolved ? ' is-resolved' : ''}${thread.anchor.status === 'orphaned' ? ' is-orphaned' : ''}`}
          aria-label={`Thread by ${thread.author.name}`}
          data-thread-id={thread.id}
          onPointerEnter={() => hoverCommentThreads(editor, [thread.id])}
          onPointerLeave={() => hoverCommentThreads(editor, [])}
        >
          <button className="fountain-comment-thread-card__anchor" type="button" aria-pressed={selected} title={anchor} onClick={() => selectCommentThread(editor, thread.id)}>
            <span>{thread.anchor.type}</span>
            <b>{anchor}</b>
          </button>
          <div className="fountain-comment-thread-card__meta">
            <span>{thread.resolved ? 'Resolved' : thread.archived ? 'Archived' : 'Open'}</span>
            {pending ? <span role="status">Saving…</span> : null}
          </div>
          {thread.comments.map((comment) => {
            // IDs exclude spaces, so a reply key cannot overlap a comment edit.
            const key = `${thread.id} ${comment.id}`;
            return <CommentBody
              key={comment.id}
              editor={editor}
              thread={thread}
              comment={comment}
              reactions={reactions}
              onError={onError}
              draft={drafts.get(key)}
              changeDraft={(value, previous) => changeDraft(key, value, previous)}
              pending={pending}
            />;
          })}
          {selected && canComment(editor, 'reply', thread.id) ? <form className="fountain-comments__reply" onSubmit={(event) => void submitReply(event, thread)}>
            <label>
              <span>Reply to thread by {thread.author.name}</span>
              <textarea
                value={replyDraft}
                onChange={(event) => changeDraft(thread.id, event.currentTarget.value)}
                placeholder="Reply…"
              />
            </label>
            <button type="submit" disabled={!replyDraft.trim()}>Reply</button>
          </form> : null}
          <footer className="fountain-comments__actions">
            {thread.anchor.status === 'orphaned' && action('reattach-thread', 'Reattach to selection', reattachCommentThread)}
            {action('resolve-thread', thread.resolved ? 'Reopen' : 'Resolve', setCommentThreadResolved, !thread.resolved)}
            {action('archive-thread', thread.archived ? 'Restore' : 'Archive', setCommentThreadArchived, !thread.archived)}
            {action('delete-thread', 'Delete thread', removeCommentThread)}
          </footer>
        </section>;
      })}
    </div>
  </aside>;
}
