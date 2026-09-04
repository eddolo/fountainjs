import { useMemo, useState } from 'react';
import type { Editor } from '../core';
import {
  acceptAllTrackedSuggestions,
  acceptTrackedSuggestion,
  getTrackedChangesState,
  hoverTrackedSuggestions,
  rejectAllTrackedSuggestions,
  rejectTrackedSuggestion,
  selectTrackedSuggestion,
  toggleTrackedChanges,
  type TrackedSuggestion,
  type TrackedSuggestionType,
} from '../tracked-changes';
import { useFountainState } from './useFountain';

export interface FountainTrackedChangesProps {
  editor: Editor | null;
  className?: string;
  title?: string;
  onCreateComment?: (suggestion: TrackedSuggestion) => void | Promise<void>;
  onError?: (error: unknown) => void;
}

const typeLabels: Readonly<Record<TrackedSuggestionType, string>> = Object.freeze({
  insert: 'Insertion',
  delete: 'Deletion',
  replace: 'Replacement',
  markChange: 'Formatting',
  attributeChange: 'Attributes',
  structure: 'Structure',
});

function nodeSummary(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const node = value as Record<string, unknown>;
  const text = typeof node.text === 'string' ? node.text : '';
  const children = Array.isArray(node.content) ? node.content.map(nodeSummary).filter(Boolean).join('\n') : '';
  if (text || children) return [text, children].filter(Boolean).join('\n');
  const attrs = node.attrs && typeof node.attrs === 'object' ? node.attrs as Record<string, unknown> : undefined;
  if (node.type === 'image') {
    const description = [attrs?.alt, attrs?.title, attrs?.src].find((item) => typeof item === 'string' && item.length);
    return `[image${description ? `: ${description}` : ''}]`;
  }
  return typeof node.type === 'string' ? `[${node.type}]` : '';
}

function nodeSetSummary(label: string, nodes: readonly unknown[] | undefined): string {
  if (!nodes?.length) return '';
  const content = nodes.map(nodeSummary).filter(Boolean).join('\n');
  return `${label}: ${content || `${nodes.length} document block${nodes.length === 1 ? '' : 's'}`}`;
}

function fullSummary(suggestion: TrackedSuggestion): string {
  if (suggestion.type === 'insert') return suggestion.fullText || 'Inserted content';
  if (suggestion.type === 'delete') return suggestion.replacedText || 'Deleted content';
  if (suggestion.type === 'replace') return `${suggestion.replacedText || 'Previous content'} → ${suggestion.fullText || 'Replacement content'}`;
  if (suggestion.type === 'markChange') return suggestion.fullText || 'Text formatting changed';
  if (suggestion.type === 'attributeChange') {
    const change = suggestion.attributeChanges?.at(-1);
    return change ? `${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}` : 'Node attributes changed';
  }
  return [
    nodeSetSummary('Added', suggestion.insertedNodes),
    nodeSetSummary('Removed', suggestion.deletedNodes),
  ].filter(Boolean).join('\n') || 'Document structure changed';
}

export function FountainTrackedChanges({
  editor,
  className,
  title = 'Review changes',
  onCreateComment,
  onError,
}: FountainTrackedChangesProps) {
  useFountainState(editor);
  const [type, setType] = useState<TrackedSuggestionType | 'all'>('all');
  const [author, setAuthor] = useState('all');
  const [pending, setPending] = useState<string>();
  const state = editor ? getTrackedChangesState(editor) : undefined;
  const authors = useMemo(() => {
    const unique = new Map((state?.suggestions ?? []).map((suggestion) => [suggestion.user.id, suggestion.user]));
    return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [state]);
  const suggestions = useMemo(() => (state?.suggestions ?? []).filter((suggestion) => (
    (type === 'all' || suggestion.type === type) && (author === 'all' || suggestion.user.id === author)
  )), [state, type, author]);

  if (!editor || !state) return null;
  const run = async (id: string, operation: () => boolean | void | Promise<boolean | void>) => {
    setPending(id);
    try { await operation(); }
    catch (error) { onError?.(error); }
    finally { setPending(undefined); }
  };
  const batchFilter = {
    ...(type === 'all' ? {} : { type }),
    ...(author === 'all' ? {} : { userId: author }),
  };

  return <section className={['fountain-tracked-changes-panel', className].filter(Boolean).join(' ')} aria-label={title}>
    <header className="fountain-tracked-changes-panel__header">
      <div>
        <h2>{title}</h2>
        <p aria-live="polite">{state.suggestions.length} open {state.suggestions.length === 1 ? 'suggestion' : 'suggestions'}</p>
      </div>
      <label className="fountain-tracked-changes-panel__toggle">
        <input type="checkbox" checked={state.enabled} onChange={(event) => toggleTrackedChanges(editor, event.currentTarget.checked)} />
        Track my edits
      </label>
    </header>

    <div className="fountain-tracked-changes-panel__filters">
      <label>Change type
        <select value={type} onChange={(event) => setType(event.currentTarget.value as TrackedSuggestionType | 'all')}>
          <option value="all">All types</option>
          {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label>Author
        <select value={author} onChange={(event) => setAuthor(event.currentTarget.value)}>
          <option value="all">All authors</option>
          {authors.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
      </label>
    </div>

    {suggestions.length > 0
      ? <div className="fountain-tracked-changes-panel__batch">
        <button type="button" disabled={Boolean(pending)} onClick={() => void run('all-accept', () => acceptAllTrackedSuggestions(editor, batchFilter))}>Accept shown</button>
        <button type="button" disabled={Boolean(pending)} onClick={() => void run('all-reject', () => rejectAllTrackedSuggestions(editor, batchFilter))}>Reject shown</button>
      </div>
      : null}

    <div className="fountain-tracked-changes-panel__list" role="list">
      {!suggestions.length && <p className="fountain-tracked-changes-panel__empty">{state.suggestions.length ? 'No suggestions match these filters.' : 'No changes to review.'}</p>}
      {suggestions.map((suggestion) => {
        const selected = state.selectedSuggestionId === suggestion.id;
        const summary = fullSummary(suggestion);
        return <article
          key={suggestion.id}
          role="listitem"
          className={['fountain-tracked-change-card', selected ? 'is-selected' : ''].filter(Boolean).join(' ')}
          data-suggestion-id={suggestion.id}
          onMouseEnter={() => hoverTrackedSuggestions(editor, [suggestion.id])}
          onMouseLeave={() => hoverTrackedSuggestions(editor, [])}
        >
          <button
            type="button"
            className="fountain-tracked-change-card__focus"
            aria-pressed={selected}
            title={`Show ${typeLabels[suggestion.type].toLowerCase()} by ${suggestion.user.name} in the document`}
            onClick={() => selectTrackedSuggestion(editor, selected ? undefined : suggestion.id)}
          >
            <span className={`fountain-tracked-change-card__type is-${suggestion.type}`}>{typeLabels[suggestion.type]}</span>
            <span className="fountain-tracked-change-card__author" title={suggestion.user.name}>{suggestion.user.name}</span>
            <time dateTime={suggestion.updatedAt}>{new Date(suggestion.updatedAt).toLocaleString()}</time>
          </button>
          <p className="fountain-tracked-change-card__summary" title={summary}>{summary}</p>
          {suggestion.reason && <p className="fountain-tracked-change-card__reason"><strong>Reason:</strong> {suggestion.reason}</p>}
          {suggestion.commentThreadId && <p className="fountain-tracked-change-card__linked">Linked discussion: {suggestion.commentThreadId}</p>}
          <footer>
            <button type="button" disabled={Boolean(pending)} onClick={() => void run(suggestion.id, () => acceptTrackedSuggestion(editor, suggestion.id))}>Accept</button>
            <button type="button" disabled={Boolean(pending)} onClick={() => void run(suggestion.id, () => rejectTrackedSuggestion(editor, suggestion.id))}>Reject</button>
            {onCreateComment && <button type="button" disabled={Boolean(pending)} onClick={() => void run(suggestion.id, () => onCreateComment(suggestion))}>Discuss</button>}
          </footer>
        </article>;
      })}
    </div>
  </section>;
}
