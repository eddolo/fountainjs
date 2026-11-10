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
      ? <form onSubmit={(event) => void save(event)}>
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
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<CommentThreadType>('inline');
  const [draft, setDraft] = useState('');
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
    if (!message) return;
    await run(async () => {
      const thread = await createCommentThread(editor, { content: message, type: target });
      selectCommentThread(editor, thread.id, false);
      setDraft('');
      setCreating(false);
    });
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
        <textarea ref={draftInput} value={draft} onChange={(event) => setDraft(event.currentTarget.value)} placeholder="Add context or feedback…" />
      </label>
      <div className="fountain-comments__actions">
        <button type="submit" disabled={!message}>Create thread</button>
        {actionButton('Cancel', () => setCreating(false))}
      </div>
    </form> : null}
    <div className="fountain-comments__list" aria-live="polite">
      {!threads.length ? <p className="fountain-comments__empty">Select text, a block, or the whole document to start a discussion.</p> : null}
      {threads.map((thread) => {
        const selected = state.selectedThreadId === thread.id;
        const pending = state.pendingThreadIds.includes(thread.id);
        const anchor = anchorLabel(thread);
        const replyDraft = drafts.get(thread.id) ?? '';
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
            {thread.anchor.status === 'orphaned' && canComment(editor, 'reattach-thread', thread.id)
              ? actionButton('Reattach to selection', () => void run(() => reattachCommentThread(editor, thread.id)))
              : null}
            {canComment(editor, 'resolve-thread', thread.id)
              ? actionButton(thread.resolved ? 'Reopen' : 'Resolve', () => void run(() => setCommentThreadResolved(editor, thread.id, !thread.resolved)))
              : null}
            {canComment(editor, 'archive-thread', thread.id)
              ? actionButton(thread.archived ? 'Restore' : 'Archive', () => void run(() => setCommentThreadArchived(editor, thread.id, !thread.archived)))
              : null}
            {canComment(editor, 'delete-thread', thread.id)
              ? actionButton('Delete thread', () => void run(() => removeCommentThread(editor, thread.id)))
              : null}
          </footer>
        </section>;
      })}
    </div>
  </aside>;
}
