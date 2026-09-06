import { type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  type AIConversationController,
  type AIConversationSnapshot,
  type AIPromptStore,
  type AIPromptTemplate,
  defineAIPromptTemplate,
} from '../ai/conversation';

const EMPTY_SNAPSHOT: AIConversationSnapshot = Object.freeze({ status: 'idle' });

export interface FountainAIConversationProps {
  readonly controller: AIConversationController | null;
  readonly promptStore?: AIPromptStore;
  readonly className?: string;
  readonly title?: string;
  readonly placeholder?: string;
  readonly sendLabel?: string;
  readonly onError?: (error: unknown) => void;
}

const noopSubscribe = () => () => {};

export function useAIConversationState(controller: AIConversationController | null): AIConversationSnapshot {
  return useSyncExternalStore(
    controller?.subscribe ?? noopSubscribe,
    controller?.getSnapshot ?? (() => EMPTY_SNAPSHOT),
    controller?.getSnapshot ?? (() => EMPTY_SNAPSHOT),
  );
}

export function FountainAIConversation({
  controller,
  promptStore,
  className,
  title = 'Conversation',
  placeholder = 'Ask a follow-up…',
  sendLabel = 'Send',
  onError,
}: FountainAIConversationProps) {
  const snapshot = useAIConversationState(controller);
  const [input, setInput] = useState('');
  const [prompts, setPrompts] = useState<readonly AIPromptTemplate[]>([]);
  const [promptId, setPromptId] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const messagesElement = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!controller || snapshot.thread || snapshot.status === 'loading') return;
    void controller.load().catch(onError);
  }, [controller, onError, snapshot.status, snapshot.thread]);

  useEffect(() => {
    if (!promptStore) { setPrompts([]); return; }
    const abort = new AbortController();
    void Promise.resolve(promptStore.list({ signal: abort.signal }))
      .then((items) => {
        if (abort.signal.aborted) return;
        const normalized = Object.freeze(items.map(defineAIPromptTemplate));
        setPrompts(normalized);
        setPromptId((current) => normalized.some((prompt) => prompt.id === current) ? current : normalized[0]?.id ?? '');
      })
      .catch((error) => { if (!abort.signal.aborted) onError?.(error); });
    return () => abort.abort();
  }, [onError, promptStore]);

  const messages = snapshot.thread?.messages ?? [];

  useEffect(() => {
    const element = messagesElement.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, snapshot.streamingContent]);

  if (!controller) return null;
  const busy = snapshot.status === 'loading' || snapshot.status === 'requesting' || snapshot.status === 'streaming';
  const selectedPrompt = prompts.find((prompt) => prompt.id === promptId);
  const displayedRequest = snapshot.activeRequest ?? snapshot.lastRequest;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim() || busy) return;
    const message = input;
    setInput('');
    setConfirmClear(false);
    try { await controller.send(message); }
    catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setInput(message);
      onError?.(error);
    }
  };

  return <section
    className={['fountain-ai-conversation', className].filter(Boolean).join(' ')}
    aria-label={title}
    aria-busy={busy}
  >
    <header className="fountain-ai-conversation__header">
      <div>
        <span>Host-owned history</span>
        <h3>{title}</h3>
      </div>
      <span className={`fountain-ai-conversation__status is-${snapshot.status}`} aria-live="polite">
        {snapshot.status === 'loading' ? 'Loading…'
          : snapshot.status === 'requesting' ? 'Waiting…'
            : snapshot.status === 'streaming' ? 'Responding…'
              : snapshot.status === 'error' ? 'Needs attention' : 'Ready'}
      </span>
    </header>

    <div ref={messagesElement} className="fountain-ai-conversation__messages" aria-live="polite" aria-label="Conversation messages">
      {!messages.length && snapshot.status !== 'loading'
        ? <p className="fountain-ai-conversation__empty">No messages yet. Your application chooses the model and where this history is stored.</p>
        : null}
      {messages.map((message) => <article key={message.id} className={`is-${message.role}`}>
        <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
        <p>{message.content}</p>
        {message.model ? <small>{message.model}</small> : null}
      </article>)}
      {snapshot.status === 'streaming' ? <article className="is-assistant is-streaming">
        <strong>Assistant</strong>
        <p>{snapshot.streamingContent}<span className="fountain-ai-review__cursor" aria-hidden="true" /></p>
      </article> : null}
    </div>

    {snapshot.error ? <p className="fountain-ai-conversation__error" role="alert">{snapshot.error}</p> : null}

    {prompts.length ? <div className="fountain-ai-conversation__prompts">
      <label>Reusable prompt
        <select value={promptId} onChange={(event) => setPromptId(event.currentTarget.value)}>
          {prompts.map((prompt) => <option key={prompt.id} value={prompt.id}>{prompt.title}</option>)}
        </select>
      </label>
      <button type="button" disabled={!selectedPrompt || busy} onClick={() => {
        if (!selectedPrompt) return;
        setInput(selectedPrompt.template);
      }}>Use prompt</button>
    </div> : null}

    <form className="fountain-ai-conversation__composer" onSubmit={(event) => void send(event)}>
      <label>
        <span>Message</span>
        <textarea value={input} maxLength={1_000_000} placeholder={placeholder} onChange={(event) => setInput(event.currentTarget.value)} />
      </label>
      <div>
        <button type="submit" className="is-primary" disabled={!input.trim() || busy}>{sendLabel}</button>
        {snapshot.status === 'requesting' || snapshot.status === 'streaming'
          ? <button type="button" onClick={() => controller.cancel()}>Stop</button>
          : null}
        {messages.length ? <button type="button" className={confirmClear ? 'is-warning' : undefined} disabled={busy} onClick={() => {
          if (!confirmClear) { setConfirmClear(true); return; }
          setConfirmClear(false);
          void controller.clear().catch(onError);
        }}>{confirmClear ? 'Confirm clear' : 'Clear history'}</button> : null}
      </div>
    </form>

    {displayedRequest ? <details className="fountain-ai-conversation__payload">
      <summary>Inspect context sent for {snapshot.activeRequest ? 'this' : 'the last'} reply</summary>
      <pre><code>{JSON.stringify(displayedRequest, null, 2)}</code></pre>
    </details> : null}
  </section>;
}
