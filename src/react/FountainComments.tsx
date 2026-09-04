import { FormEvent, useMemo, useState } from 'react';
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

function CommentBody({
  editor,
  thread,
  comment,
  reactions,
  onError,
}: {
  editor: Editor;
  thread: CommentThread;
  comment: CommentMessage;
  reactions: readonly string[];
  onError?: (error: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(contentText(comment.content));
  const run = async (operation: () => Promise<unknown>) => {
    try { await operation(); }
    catch (error) { onError?.(error); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    await run(() => updateComment(editor, thread.id, comment.id, draft.trim()));
    setEditing(false);
  };
  return <article className="fountain-comment" data-comment-id={comment.id}>
    <header>
      <strong>{comment.author.name}</strong>
      <time dateTime={comment.updatedAt ?? comment.createdAt}>{new Date(comment.updatedAt ?? comment.createdAt).toLocaleString()}</time>
    </header>
    {editing
      ? <form onSubmit={(event) => void save(event)}>
        <label>
          <span>Edit comment</span>
          <textarea value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
        </label>
        <div className="fountain-comments__actions">
          <button type="submit" disabled={!draft.trim()}>Save</button>
          <button type="button" onClick={() => { setDraft(contentText(comment.content)); setEditing(false); }}>Cancel</button>
        </div>
      </form>
      : <p>{contentText(comment.content)}</p>}
    <div className="fountain-comments__actions">
      {reactions.map((emoji) => {
        const reaction = comment.reactions.find((value) => value.emoji === emoji);
        return <button
          key={emoji}
          type="button"
          className={reaction?.userIds.length ? 'has-reactions' : undefined}
          disabled={!canComment(editor, 'react', thread.id, comment.id)}
          aria-label={`React ${emoji} to comment by ${comment.author.name}`}
          onClick={() => void run(() => toggleCommentReaction(editor, thread.id, comment.id, emoji))}
        >{emoji}{reaction?.userIds.length ? ` ${reaction.userIds.length}` : ''}</button>;
      })}
      {!editing && canComment(editor, 'edit-comment', thread.id, comment.id)
        ? <button type="button" onClick={() => setEditing(true)}>Edit</button>
        : null}
      {canComment(editor, 'delete-comment', thread.id, comment.id)
        ? <button type="button" onClick={() => void run(() => removeComment(editor, thread.id, comment.id))}>Delete</button>
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
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<CommentThreadType>('inline');
  const [draft, setDraft] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const state = editor ? getCommentsState(editor) : undefined;
  const threads = useMemo(
    () => (state?.threads ?? []).filter((thread) => showArchived || !thread.archived),
    [showArchived, state?.threads],
  );
  if (!editor || !state) return null;

  const run = async (operation: () => Promise<unknown>) => {
    try { await operation(); }
    catch (error) { onError?.(error); }
  };
  const submitThread = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    await run(async () => {
      const thread = await createCommentThread(editor, { content: draft.trim(), type: target });
      selectCommentThread(editor, thread.id, false);
      setDraft('');
      setCreating(false);
    });
  };
  const submitReply = async (event: FormEvent, thread: CommentThread) => {
    event.preventDefault();
    const content = replyDrafts[thread.id]?.trim();
    if (!content) return;
    await run(async () => {
      await addComment(editor, thread.id, { content });
      setReplyDrafts((current) => ({ ...current, [thread.id]: '' }));
    });
  };

  return <aside
    className={['fountain-comments', className].filter(Boolean).join(' ')}
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
        onClick={() => setCreating((value) => !value)}
      >New comment</button>
    </header>
    {state.error ? <p className="fountain-comments__error" role="alert">{state.error.message}</p> : null}
    {creating ? <form className="fountain-comments__composer" onSubmit={(event) => void submitThread(event)}>
      <label>
        <span>Comment target</span>
        <select value={target} onChange={(event) => setTarget(event.currentTarget.value as CommentThreadType)}>
          <option value="inline">Current text or cursor</option>
          <option value="block">Current block</option>
          <option value="document">Whole document</option>
        </select>
      </label>
      <label>
        <span>New comment</span>
        <textarea autoFocus value={draft} onChange={(event) => setDraft(event.currentTarget.value)} placeholder="Add context or feedback…" />
      </label>
      <div className="fountain-comments__actions">
        <button type="submit" disabled={!draft.trim()}>Create thread</button>
        <button type="button" onClick={() => setCreating(false)}>Cancel</button>
      </div>
    </form> : null}
    <div className="fountain-comments__list" aria-live="polite">
      {!threads.length ? <p className="fountain-comments__empty">Select text, a block, or the whole document to start a discussion.</p> : null}
      {threads.map((thread) => {
        const selected = state.selectedThreadId === thread.id;
        const pending = state.pendingThreadIds.includes(thread.id);
        const anchor = anchorLabel(thread);
        return <section
          key={thread.id}
          className={['fountain-comment-thread-card', selected ? 'is-selected' : '', thread.resolved ? 'is-resolved' : '', thread.anchor.status === 'orphaned' ? 'is-orphaned' : ''].filter(Boolean).join(' ')}
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
          {thread.comments.map((comment) => <CommentBody
            key={comment.id}
            editor={editor}
            thread={thread}
            comment={comment}
            reactions={reactions}
            onError={onError}
          />)}
          {selected && canComment(editor, 'reply', thread.id) ? <form className="fountain-comments__reply" onSubmit={(event) => void submitReply(event, thread)}>
            <label>
              <span>Reply to thread by {thread.author.name}</span>
              <textarea
                value={replyDrafts[thread.id] ?? ''}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setReplyDrafts((current) => ({ ...current, [thread.id]: value }));
                }}
                placeholder="Reply…"
              />
            </label>
            <button type="submit" disabled={!replyDrafts[thread.id]?.trim()}>Reply</button>
          </form> : null}
          <footer className="fountain-comments__actions">
            {thread.anchor.status === 'orphaned' && canComment(editor, 'reattach-thread', thread.id)
              ? <button type="button" onClick={() => void run(() => reattachCommentThread(editor, thread.id))}>Reattach to selection</button>
              : null}
            {canComment(editor, 'resolve-thread', thread.id)
              ? <button type="button" onClick={() => void run(() => setCommentThreadResolved(editor, thread.id, !thread.resolved))}>{thread.resolved ? 'Reopen' : 'Resolve'}</button>
              : null}
            {canComment(editor, 'archive-thread', thread.id)
              ? <button type="button" onClick={() => void run(() => setCommentThreadArchived(editor, thread.id, !thread.archived))}>{thread.archived ? 'Restore' : 'Archive'}</button>
              : null}
            {canComment(editor, 'delete-thread', thread.id)
              ? <button type="button" onClick={() => void run(() => removeCommentThread(editor, thread.id))}>Delete thread</button>
              : null}
          </footer>
        </section>;
      })}
    </div>
  </aside>;
}
