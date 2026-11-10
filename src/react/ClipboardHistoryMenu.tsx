import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { Editor } from '../core';
import {
  clearClipboardHistory,
  closeClipboardHistory,
  getClipboardHistoryState,
  pasteClipboardHistoryEntry,
  removeClipboardHistoryEntry,
} from '../extensions/clipboard-history';
import { useFountainState } from './useFountain';

export interface ClipboardHistoryMenuProps {
  editor: Editor | null;
  className?: string;
}

function preview(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 160 ? `${oneLine.slice(0, 159)}…` : oneLine;
}

/** Searchable React picker for the optional ClipboardHistoryExtension. */
export function ClipboardHistoryMenu({ editor, className }: ClipboardHistoryMenuProps) {
  useFountainState(editor);
  const search = useRef<HTMLInputElement>(null);
  const returnTarget = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const history = editor ? getClipboardHistoryState(editor) : null;
  const entries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? (history?.entries ?? []).filter((entry) => entry.text.toLocaleLowerCase().includes(normalized)) : history?.entries ?? [];
  }, [history, query]);

  useEffect(() => {
    const input = search.current;
    if (!history?.open || !input) return;
    const active = input.ownerDocument.activeElement as HTMLElement | null;
    if (active !== input) returnTarget.current = active;
    setQuery('');
    input.focus();
  }, [history?.open]);

  if (!editor || !history?.open) return null;
  const returnFocus = () => {
    const target = returnTarget.current;
    returnTarget.current = null;
    if (target?.isConnected) target.focus?.({ preventScroll: true });
  };
  const close = () => {
    closeClipboardHistory(editor);
    returnFocus();
  };
  const paste = (id: string) => {
    if (pasteClipboardHistoryEntry(editor, id)) returnFocus();
  };
  const keepFocus = (event: MouseEvent) => event.preventDefault();
  return (
    <section
      className={['fountain-clipboard-history', className].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="false"
      aria-label="Clipboard history"
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        } else if (event.key === 'Enter' && event.target === search.current && entries.length === 1) {
          event.preventDefault();
          paste(entries[0]!.id);
        }
      }}
    >
      <header>
        <div>
          <strong>Clipboard history</strong>
          <small>Copied in this editor · stored in memory</small>
        </div>
        <button type="button" aria-label="Close clipboard history" onClick={close}>×</button>
      </header>
      <input
        ref={search}
        type="search"
        aria-label="Search clipboard history"
        placeholder="Search copied text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="fountain-clipboard-history__entries" role="list">
        {!entries.length && <p className="fountain-clipboard-history__empty">{history.entries.length ? 'No matching copied text.' : 'Copy text in this editor to start a history.'}</p>}
        {entries.map((entry) => <article key={entry.id} role="listitem" className="fountain-clipboard-history__entry">
          <details>
            <summary title={entry.text}>{preview(entry.text)}</summary>
            <pre>{entry.text}</pre>
          </details>
          <div className="fountain-clipboard-history__actions">
            <time dateTime={new Date(entry.copiedAt).toISOString()}>{new Date(entry.copiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            <button type="button" aria-label={`Paste ${preview(entry.text)}`} onMouseDown={keepFocus} onClick={() => paste(entry.id)}>Paste</button>
            <button type="button" onMouseDown={keepFocus} onClick={() => removeClipboardHistoryEntry(editor, entry.id)} aria-label={`Remove ${preview(entry.text)}`}>Remove</button>
          </div>
        </article>)}
      </div>
      {history.entries.length > 0 && <footer>
        <span>{history.entries.length} saved {history.entries.length === 1 ? 'copy' : 'copies'}</span>
        <button type="button" onClick={() => clearClipboardHistory(editor)}>Clear all</button>
      </footer>}
    </section>
  );
}
