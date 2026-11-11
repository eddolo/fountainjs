import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

type CopyState = { kind: 'pending' | 'copied' | 'failed'; text: string };

/** Clipboard feedback belongs to this host panel, not the document engine. */
export function LiveExportOutput({ output, children }: { output: string; children: ReactNode }) {
  const [copyState, setCopyState] = useState<CopyState>();
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const source = useRef<HTMLTextAreaElement>(null);
  const description = useId();
  useEffect(() => () => { request.current++; clearTimeout(timer.current); }, []);
  const current = copyState?.text === output ? copyState : undefined;
  const pending = copyState?.kind === 'pending';
  async function copy() {
    const id = ++request.current;
    const text = output;
    clearTimeout(timer.current);
    setCopyState({ kind: 'pending', text });
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (request.current !== id) return;
      setCopyState({ kind: 'copied', text });
      timer.current = setTimeout(() => {
        if (request.current === id) setCopyState(undefined);
      }, 1400);
    } catch {
      if (request.current === id) setCopyState({ kind: 'failed', text });
    }
  }
  return <section className="studio__export">
    <div className="export-head"><strong>Live document output</strong>
      <button type="button" onClick={copy} disabled={pending}>
        {pending ? 'Copying…' : current?.kind === 'copied' ? 'Copied!' : 'Copy'}
      </button>
      <span className="export-copy-status" role="status">{current?.kind === 'copied' ? 'Output copied.' : pending ? 'Copying output.' : ''}</span>
    </div>
    {children}
    {current?.kind === 'failed' ? <>
      <div className="export-copy-fallback">
        <p id={description} role="alert">Automatic copy failed. Select the output and copy it manually.</p>
        <button type="button" onClick={() => { source.current?.focus(); source.current?.select(); }}>Select output</button>
      </div>
      <textarea ref={source} className="export-copy-source" aria-label="Exported document source" aria-describedby={description} readOnly value={output} spellCheck={false} rows={8} />
    </> : <pre><code>{output}</code></pre>}
  </section>;
}
