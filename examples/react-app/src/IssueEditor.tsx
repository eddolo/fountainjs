import { useCallback, useMemo, useRef, useState } from 'react';
import { EditorState, MarkdownExporter, MarkdownImporter, Schema, StarterKit, type ImageUploadHandler } from 'fountainjs-editor';
import { FountainComposer, FountainEditor, useFountain, useFountainState } from 'fountainjs-editor/react';
import { issueMarkdown } from './issue-example';
import { SitePageLink } from './SitePageLink';

// The demo host stores bounded raster images in the document, not on a server.
const localImage: ImageUploadHandler = async (file, { signal }) => {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    throw new Error('Choose a PNG, JPEG, WebP or GIF smaller than 2 MiB.');
  }
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    reader.onloadend = () => signal.removeEventListener('abort', abort);
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onabort = () => reject(new Error('Image insertion cancelled.'));
    reader.onload = () => resolve(String(reader.result));
    if (signal.aborted) return reject(new Error('Image insertion cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
    reader.readAsDataURL(file);
  });
  return { src, alt: file.name };
};
const toolbar = { groups: ['history', 'block-types', 'marks', 'insert', 'table'] as const,
  hiddenActions: ['media', 'upload-asset', 'text-style', 'subscript', 'superscript', 'text-color', 'clear-text-color', 'highlight', 'underline'] as const };

function download(name: string, value: string, type: string): void {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Reader({ json }: { json: ReturnType<ReturnType<typeof useFountain>['getJSON']> }) {
  const editor = useFountain({ schema: StarterKit.schema, content: json, editable: false });
  return <FountainEditor editor={editor} ariaLabel="Issue preview" />;
}

export function IssueEditor() {
  const initial = useMemo(() => {
    const schema = new Schema(StarterKit.schema);
    const parsed = MarkdownImporter.parseWithSource(issueMarkdown, schema);
    return { ...parsed, state: EditorState.create({ schema, doc: parsed.document, plugins: StarterKit.plugins }) };
  }, []);
  // Source provenance and editor state must use the same schema instance.
  const editor = useFountain({ schema: StarterKit.schema, state: initial.state });
  const state = useFountainState(editor)!;
  const [snapshot, setSnapshot] = useState(initial.source);
  const [raw, setRaw] = useState(issueMarkdown);
  const [mode, setMode] = useState<'visual' | 'markdown' | 'preview'>('visual');
  const [title, setTitle] = useState('Room switch leaves stale content');
  const [message, setMessage] = useState('Local demo only. Nothing is submitted to GitHub or GitLab. Download your draft before leaving.');
  const [error, setError] = useState('');
  const reportError = useCallback((cause: unknown) => setError(String(cause)), []);
  const uploadImage = useCallback<ImageUploadHandler>((file, context) => {
    setError('');
    return localImage(file, context);
  }, []);
  const upload = useRef<HTMLInputElement>(null);
  const result = useMemo(() => MarkdownExporter.exportWithSource(state.doc, snapshot), [state.doc, snapshot]);

  const switchMode = (next: typeof mode) => {
    if (next === mode) return;
    try {
      if (mode === 'markdown' && next !== 'markdown') {
        const parsed = MarkdownImporter.parseWithSource(raw, state.schema);
        if (!parsed.document.eq(state.doc) && !editor.dispatch(editor.createTransaction().replaceDocument(parsed.document))) {
          throw new Error('The editor rejected the Markdown update. Your source is still available.');
        }
        setSnapshot(parsed.source);
      } else if (next === 'markdown') setRaw(result.markdown);
      setError('');
      setMode(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  const reopen = async (file: File) => {
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Choose a Markdown draft smaller than 8 MiB.');
      const source = await file.text();
      const parsed = MarkdownImporter.parseWithSource(source, editor.state.schema);
      if (!parsed.document.eq(editor.state.doc) && !editor.dispatch(editor.createTransaction().replaceDocument(parsed.document))) throw new Error('Draft replacement was rejected.');
      setSnapshot(parsed.source);
      setRaw(source);
      setMode('visual');
      setError('');
      setMessage(`Opened ${file.name} locally. The title belongs to the host form and is not part of Markdown.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  return <main className="issue-site">
    <header className="site-header"><a className="brand" href="./"><span>F</span> FountainJS</a><nav aria-label="Primary navigation"><SitePageLink href="./">Home</SitePageLink><SitePageLink href="./demos.html">10 demos</SitePageLink><SitePageLink href="./developers.html">Developers</SitePageLink></nav><a href="#integration">How this is built ↓</a></header>
    <div className="issue-layout">
      <section className="issue-workspace">
        <p className="issue-eyebrow">WORKFLOW LAB · UNOFFICIAL GITLAB-STYLE ISSUE EDITOR</p>
        <h1>A bug report, from draft to review.</h1>
        <p>Write visually, inspect the Markdown, and preview what a reader sees. This is a FountainJS implementation of an issue-writing workflow, not a GitLab integration or a full GitLab Flavored Markdown implementation.</p>
        <label className="issue-title">Issue title<input value={title} onChange={event => setTitle(event.target.value)} /></label>
        <section className="issue-card" aria-label="Issue description">
          <nav className="issue-modes" aria-label="Description mode">{(['visual', 'markdown', 'preview'] as const).map(value => <button key={value} aria-pressed={mode === value} onClick={() => switchMode(value)}>{value === 'visual' ? 'Visual editor' : value === 'markdown' ? 'Markdown source' : 'Reader preview'}</button>)}</nav>
          <div hidden={mode !== 'visual'}><FountainComposer editor={editor} ariaLabel="Issue description editor" toolbarProps={toolbar} imageUpload={uploadImage} onError={reportError} /></div>
          {mode === 'markdown' && <div className="issue-source"><label htmlFor="issue-markdown">Markdown description</label><textarea id="issue-markdown" aria-describedby="issue-source-help" spellCheck={false} value={raw} onChange={event => setRaw(event.target.value)} /><small id="issue-source-help">Source changes apply when you open Visual editor or Reader preview. Raw source is never injected as HTML.</small></div>}
          {mode === 'preview' && <div className="issue-reader"><p>READ-ONLY DESCRIPTION · NO AUTHOR TOOLBAR</p><Reader json={state.doc.toJSON()} /></div>}
        </section>
        {error && <p role="alert" className="issue-error">{error}</p>}
        <div className="issue-actions"><button onClick={() => { download('issue-description.md', mode === 'markdown' ? raw : result.markdown, 'text/markdown;charset=utf-8'); setMessage('Downloaded description Markdown. Keep the host title separately; this does not create an online issue.'); }}>Download Markdown draft</button><button onClick={() => upload.current?.click()}>Open Markdown draft</button><input ref={upload} type="file" accept=".md,.markdown,text/markdown,text/plain" aria-label="Open Markdown draft file" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void reopen(file); event.target.value = ''; }} /></div>
        <p role="status">{message}</p>
      </section>
      <aside className="issue-diagnostics" aria-label="Fountain diagnostics"><h2>Fountain diagnostics</h2><dl><dt>Engine</dt><dd>FountainJS · React surface</dd><dt>Document blocks</dt><dd>{state.doc.childCount} top-level blocks</dd><dt>Source preservation</dt><dd>{mode === 'markdown' ? 'Raw buffer — not yet applied' : result.preservation}</dd><dt>Export warnings</dt><dd>{result.losses.length}</dd><dt>Images</dt><dd>Local raster data · no upload server</dd><dt>Collaboration / pagination</dt><dd>Not enabled in this workflow</dd><dt>Virtualization / server runtimes</dt><dd>Not measured by this page</dd></dl>
        <details><summary>What does preservation mean?</summary><p>Exact means the unchanged source string is retained. Blocks or mapped-blocks retain safely matched untouched blocks and root reference definitions, including definitions directly before a paragraph; edited blocks are regenerated. Canonical means regeneration was necessary. Definitions inside containers and ambiguous source regions can still force canonical export after editing. This is not a guarantee that every imported syntax is understood.</p></details>
        {result.losses.length > 0 && <ul aria-label="Markdown export warnings">{result.losses.map((loss, index) => <li key={index}>{loss.type}: {loss.detail}</li>)}</ul>}
        <div className="issue-exercise"><h3>Try the source-fidelity check</h3><ol><li>Open Markdown source and find the tilde code fence and double underscores.</li><li>Return to Visual editor. Edit only the first paragraph.</li><li>Switch back. Check that the untouched source is still there.</li><li>Download, reopen, and preview your draft.</li></ol></div>
      </aside>
    </div>
    <section className="issue-integration" id="integration"><h2>Build this into your product</h2><p>The host owns the title, file controls and submission. Fountain owns the description model, history, selection and formatting. Switching modes uses <code>parseWithSource</code>, <code>exportWithSource</code> and a document-replacement transaction. The preview creates a separate read-only editor; read-only UI is not access control.</p><p>Images here use a bounded local file adapter. A real issue tracker supplies its own authenticated upload service, permissions and API submission. Drafts are not automatically persisted. External links and images in imported content may make network requests; this is not an offline sandbox.</p><p><a href="./developers.html">Developer guide ↗</a> · <a href="https://github.com/eddolo/fountainjs/blob/master/docs/ISSUE_EDITOR_DEMO.md">Workflow API walkthrough ↗</a> · <a href="https://github.com/eddolo/fountainjs/blob/master/examples/react-app/src/IssueEditor.tsx">Demo source ↗</a></p></section>
  </main>;
}
