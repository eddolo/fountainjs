import { useMemo, useState, useSyncExternalStore } from 'react';
import type { AIAction, AIController, AIRequestEnvelope } from '../ai';

const ACTIONS: readonly { action: AIAction; label: string }[] = [
  { action: 'improve', label: 'Improve' },
  { action: 'shorten', label: 'Shorten' },
  { action: 'expand', label: 'Expand' },
  { action: 'fix-grammar', label: 'Fix grammar' },
];

export interface FountainAIReviewProps {
  controller: AIController;
  className?: string;
  actions?: readonly { action: AIAction; label: string }[];
  includeDocumentContext?: boolean;
  title?: string;
}

export function useAIControllerState(controller: AIController) {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

export function FountainAIReview({
  controller,
  className = '',
  actions = ACTIONS,
  includeDocumentContext = false,
  title = 'AI review',
}: FountainAIReviewProps) {
  const snapshot = useAIControllerState(controller);
  const editorState = useSyncExternalStore(
    (notify) => controller.editor.subscribe(() => notify()),
    () => controller.editor.state,
    () => controller.editor.state,
  );
  const [selectedAction, setSelectedAction] = useState<AIAction>('improve');
  const [instructions, setInstructions] = useState('');
  const pending = [...snapshot.suggestions].reverse().find((suggestion) => suggestion.status === 'pending');

  const requestPreview = useMemo<AIRequestEnvelope | undefined>(() => {
    try {
      return controller.inspectRequest({
        action: selectedAction,
        instructions,
        scope: 'auto',
        includeDocumentContext,
      });
    } catch {
      return undefined;
    }
  }, [controller, editorState, includeDocumentContext, instructions, selectedAction]);

  const run = async (action: AIAction) => {
    setSelectedAction(action);
    try {
      await controller.suggest({ action, instructions, scope: 'auto', includeDocumentContext });
    } catch {
      // The controller exposes the error through its external-store snapshot.
    }
  };

  const payload = snapshot.activeRequest ?? pending?.request ?? requestPreview;

  return (
    <section className={`fountain-ai-review ${className}`.trim()} aria-labelledby="fountain-ai-title">
      <div className="fountain-ai-review__head">
        <div>
          <span className="fountain-ai-review__eyebrow">Human in the loop</span>
          <h3 id="fountain-ai-title">{title}</h3>
        </div>
        <span className={`fountain-ai-review__status is-${snapshot.status}`}>
          {snapshot.status === 'requesting' ? 'Thinking…' : pending ? 'Review needed' : 'Ready'}
        </span>
      </div>

      {!pending && (
        <>
          <p className="fountain-ai-review__hint">
            Select text—or leave the cursor in a text fragment—then request a change.
          </p>
          <div className="fountain-ai-review__actions" aria-label="AI writing actions">
            {actions.map(({ action, label }) => (
              <button
                key={action}
                type="button"
                disabled={snapshot.status === 'requesting'}
                onClick={() => void run(action)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="fountain-ai-review__instructions">
            Optional instruction
            <input
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="e.g. Keep the tone warm and direct"
            />
          </label>
        </>
      )}

      {snapshot.error && <p className="fountain-ai-review__error" role="alert">{snapshot.error}</p>}

      {pending && (
        <div className="fountain-ai-review__proposal" aria-live="polite">
          <div className="fountain-ai-review__diff">
            <div><span>Before</span><del>{pending.original}</del></div>
            <div><span>Proposed</span><ins>{pending.replacement}</ins></div>
          </div>
          {pending.explanation && <p>{pending.explanation}</p>}
          <div className="fountain-ai-review__decision">
            <button type="button" className="is-accept" onClick={() => controller.accept(pending)}>Accept change</button>
            <button type="button" onClick={() => controller.reject(pending)}>Reject</button>
          </div>
        </div>
      )}

      <details className="fountain-ai-review__payload">
        <summary>Inspect the exact data {snapshot.status === 'requesting' ? 'sent' : 'to be sent'}</summary>
        {payload
          ? <pre><code>{JSON.stringify(payload, null, 2)}</code></pre>
          : <p>Place the cursor in non-empty text to build a request.</p>}
      </details>
    </section>
  );
}
