import { type FormEvent, useEffect, useId, useState, useSyncExternalStore } from 'react';
import {
  type AIGeneratedMediaAsset,
  type AIGeneratedMediaCommitter,
  type AIGeneratedMediaController,
  type AIGeneratedMediaKind,
  type AIGeneratedMediaRequest,
  type AIGeneratedMediaSnapshot,
} from '../ai/generated-media';

export interface FountainAIGeneratedMediaProps {
  readonly controller: AIGeneratedMediaController;
  readonly onAccept: AIGeneratedMediaCommitter;
  readonly className?: string;
  readonly title?: string;
  readonly kinds?: readonly AIGeneratedMediaKind[];
  readonly initialKind?: AIGeneratedMediaKind;
  readonly initialPrompt?: string;
  readonly onError?: (error: unknown) => void;
}

export function useAIGeneratedMediaState(controller: AIGeneratedMediaController): AIGeneratedMediaSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

function AssetPreview({ asset }: { readonly asset: AIGeneratedMediaAsset }) {
  const [source, setSource] = useState('');
  useEffect(() => {
    if (asset.kind === 'file' || typeof URL === 'undefined' || typeof Blob === 'undefined') return undefined;
    const url = URL.createObjectURL(new Blob([asset.bytes.slice()], { type: asset.mimeType }));
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [asset.id, asset.kind, asset.mimeType, asset.requestId]);
  if (asset.kind === 'image') return source ? <img src={source} alt={asset.alt ?? asset.title ?? asset.name} /> : <span>Preparing preview…</span>;
  if (asset.kind === 'audio') return source ? <audio src={source} controls aria-label={asset.title ?? asset.name} /> : <span>Preparing preview…</span>;
  if (asset.kind === 'video') return source ? <video src={source} controls aria-label={asset.title ?? asset.name} /> : <span>Preparing preview…</span>;
  return <span className="fountain-ai-media__file" aria-label={`Generated file: ${asset.name}`}>FILE</span>;
}

function requestJSON(request: AIGeneratedMediaRequest | undefined): string {
  return request ? JSON.stringify(request, null, 2) : '';
}

export function FountainAIGeneratedMedia({
  controller,
  onAccept,
  className,
  title = 'Generated media',
  kinds = ['image', 'audio', 'video', 'file'],
  initialKind = 'image',
  initialPrompt = '',
  onError,
}: FountainAIGeneratedMediaProps) {
  const snapshot = useAIGeneratedMediaState(controller);
  const [kind, setKind] = useState<AIGeneratedMediaKind>(initialKind);
  const [prompt, setPrompt] = useState(initialPrompt);
  const promptId = useId();
  const busy = snapshot.status === 'generating' || snapshot.status === 'accepting';
  let preview: AIGeneratedMediaRequest | undefined;
  try { preview = prompt.trim() ? controller.inspectRequest({ kind, prompt }) : undefined; } catch { preview = undefined; }

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || busy) return;
    try { await controller.generate({ kind, prompt }); } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) onError?.(error);
    }
  };

  return <section
    className={['fountain-ai-media', className].filter(Boolean).join(' ')}
    aria-label={title}
    aria-busy={busy}
  >
    <header className="fountain-ai-media__header">
      <div><span>Provider-neutral</span><h3>{title}</h3></div>
      <span className={`fountain-ai-media__status is-${snapshot.status}`} aria-live="polite">
        {snapshot.status === 'generating' ? `Generating ${Math.round(snapshot.generationProgress * 100)}%`
          : snapshot.status === 'accepting' ? `Uploading ${Math.round(snapshot.uploadProgress * 100)}%`
            : snapshot.status === 'review' ? 'Review required'
              : snapshot.status === 'error' ? 'Needs attention' : 'Ready'}
      </span>
    </header>

    <p className="fountain-ai-media__hint">Nothing enters the document until you accept it. Your application chooses the generator and permanent file storage.</p>

    <form className="fountain-ai-media__form" onSubmit={(event) => void generate(event)}>
      <label>Type
        <select value={kind} disabled={busy} onChange={(event) => setKind(event.currentTarget.value as AIGeneratedMediaKind)}>
          {kinds.map((item) => <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>)}
        </select>
      </label>
      <label htmlFor={promptId}>Prompt
        <textarea id={promptId} value={prompt} maxLength={100_000} disabled={busy} onChange={(event) => setPrompt(event.currentTarget.value)} />
      </label>
      <div>
        <button className="is-primary" type="submit" disabled={!prompt.trim() || busy}>Generate preview</button>
        {busy ? <button type="button" onClick={() => controller.cancel()}>Stop</button> : null}
        {snapshot.assets.length && !busy ? <button type="button" onClick={() => controller.clear()}>Clear previews</button> : null}
      </div>
    </form>

    {snapshot.error ? <p className="fountain-ai-media__error" role="alert">{snapshot.error}</p> : null}

    {snapshot.assets.length ? <div className="fountain-ai-media__assets" aria-live="polite">
      {snapshot.assets.map((asset) => <article key={asset.id} className={`is-${asset.status}`}>
        <div className="fountain-ai-media__preview"><AssetPreview asset={asset} /></div>
        <div className="fountain-ai-media__details">
          <strong>{asset.title ?? asset.name}</strong>
          <span>{asset.mimeType} · {asset.bytes.byteLength.toLocaleString()} bytes</span>
          {asset.caption ? <p>{asset.caption}</p> : null}
          {(asset.provider || asset.model) ? <small>{[asset.provider, asset.model].filter(Boolean).join(' · ')}</small> : null}
        </div>
        <div className="fountain-ai-media__decisions">
          {asset.status === 'pending' ? <>
            <button type="button" className="is-accept" disabled={busy} onClick={() => {
              void controller.accept(asset.id, onAccept).catch((error) => {
                if (!(error instanceof Error && error.name === 'AbortError')) onError?.(error);
              });
            }}>Upload and insert</button>
            <button type="button" disabled={busy} onClick={() => controller.reject(asset.id)}>Reject</button>
          </> : <span>{asset.status === 'accepted' ? 'Inserted' : 'Rejected'}</span>}
        </div>
      </article>)}
    </div> : null}

    <details className="fountain-ai-media__payload">
      <summary>Inspect the exact generation request</summary>
      {snapshot.request || snapshot.lastRequest || preview
        ? <pre><code>{requestJSON(snapshot.request ?? snapshot.lastRequest ?? preview)}</code></pre>
        : <p>Enter a prompt to build the request. Document content and reference assets are excluded by default.</p>}
    </details>
  </section>;
}
