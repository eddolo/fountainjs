import { useRef, useState } from 'react';
import { StarterKit, type Node } from 'fountainjs-editor';
import { FountainComposer, FountainEditor, useFountain, useFountainState } from 'fountainjs-editor/react';
import { detectLabFormat, exportLab, importLab, labPolicy, labImages, sameLabDocument, type LabFormat } from './conversion-lab';
import { SitePageLink } from './SitePageLink';
import packageInfo from '../../../package.json';

type Entry = { id: string; file: File; format?: LabFormat; result?: ReturnType<typeof importLab>; error?: string; sourceText?: string };
const formats: LabFormat[] = ['json', 'markdown', 'html', 'docx'];
function download(data: BlobPart, name: string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Preview({ document }: { document: Node }) {
  const editor = useFountain({ schema: StarterKit.schema, content: document.toJSON(), editable: false });
  return <FountainEditor editor={editor} ariaLabel="Reopened export preview" />;
}
function RecoveredImage({ image, index }: { image: ReturnType<typeof labImages>[number]; index: number }) {
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');
  function save() {
    try {
      const [header, body] = image.source.split(',');
      const mime = header.slice(5).split(';')[0];
      download(Uint8Array.from(atob(body), char => char.charCodeAt(0)), `recovered-image-${index + 1}.${mime.split('/')[1]}`, mime);
    } catch { setError('This embedded image data could not be decoded. Keep the original file.'); }
  }
  return <figure>{image.embedded ? <><img src={image.source} alt={image.alt || `Recovered image ${index + 1}`} onError={() => setFailed(true)} /><figcaption>{image.alt || `Image ${index + 1}`} — {failed ? 'Embedded data recovered, but the browser cannot display it.' : 'Embedded raster data recovered'}</figcaption><button onClick={save}>Download image {index + 1}</button></> : <figcaption>{image.alt || `Image ${index + 1}`} — linked or unsupported image source. Not fetched or previewed. The address remains in the document.</figcaption>}{error && <p role="alert">{error}</p>}</figure>;
}
function FileWorkspace({ entry, active }: { entry: Entry; active: boolean }) {
  const editor = useFountain({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: entry.result!.document.toJSON() });
  const state = useFountainState(editor)!;
  const [format, setFormat] = useState<LabFormat>(entry.format!);
  const [check, setCheck] = useState<{ id: string; document: Node; equal: boolean; issues: { code: string; message: string }[]; format: LabFormat; revision: Node }>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [includeContent, setIncludeContent] = useState(false);
  const [note, setNote] = useState('');
  const images = labImages(entry.result!.document);
  const stale = check && (check.revision !== state.doc || check.format !== format);
  function convert(save: boolean) {
    try {
      const output = exportLab(state.doc, format, entry.result?.source);
      const reopened = importLab(output.bytes, format);
      setCheck({ id: crypto.randomUUID(), document: reopened.document, equal: sameLabDocument(state.doc, reopened.document), issues: [...output.issues, ...reopened.issues], format, revision: state.doc });
      if (save) download(new Uint8Array(output.bytes), `${entry.file.name}.converted.${output.extension}`, output.mime);
      setError(''); setStatus(save ? 'Export downloaded and reopened below.' : 'Export generated in memory and reopened below. The editable draft was not replaced.');
    } catch (cause) { setCheck(undefined); setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  function report() {
    const data = {
      reportVersion: 1, fountainVersion: packageInfo.version, policy: labPolicy, createdAt: new Date().toISOString(),
      input: { format: entry.format, bytes: entry.file.size }, output: format,
      importedImages: { represented: images.length, embeddedRaster: images.filter(image => image.embedded).length },
      importIssues: entry.result!.issues, draftChanged: !sameLabDocument(entry.result!.document, state.doc),
      roundTrip: check ? { format: check.format, stale: Boolean(stale), exactFountainJSONEquality: check.equal, issues: check.issues } : null,
      fidelity: 'Original-format visual fidelity and exhaustive loss detection are unverified.',
      ...(includeContent ? { fileName: entry.file.name, note, importedDocument: entry.result!.document.toJSON(), editedDocument: state.doc.toJSON(), originalText: entry.sourceText } : {}),
    };
    download(JSON.stringify(data, null, 2), 'fountain-conversion-report.json', 'application/json');
    setStatus('Report downloaded locally. Review it before sharing; warning messages may contain source fragments. Nothing was submitted.');
  }
  return <section className="lab-file" hidden={!active} aria-label={`Conversion workspace: ${entry.file.name}`}>
    <div className="lab-file-heading"><div><h2>{entry.file.name}</h2><p>{entry.format?.toUpperCase()} · {entry.file.size.toLocaleString()} bytes · {state.doc.childCount} top-level blocks</p></div><button onClick={() => download(entry.file, entry.file.name)}>Download untouched original</button></div>
    <div className="lab-notice"><strong>Import report</strong><p>These are reported conversion details—not proof of zero loss. Original-format layout and complete fidelity are unverified.</p><ul>{entry.result!.issues.length ? entry.result!.issues.map((issue, index) => <li key={index}><code>{issue.code}</code> — {issue.message}</li>) : <li>No issues reported by this adapter. Undetected losses remain possible.</li>}</ul></div>
    <details className="lab-assets" open={images.length > 0}><summary>Images in the imported document: {images.length} ({images.filter(image => image.embedded).length} embedded raster)</summary><p>Embedded raster images can be displayed without internet access. This inventory reflects what the adapter recovered, not every image in the original archive. Missing/unsupported Word images appear in the import warnings when detected; headers, drawings and other unsupported structures may need further import work.</p><div>{images.map((image, index) => <RecoveredImage key={index} image={image} index={index} />)}</div></details>
    <div className="lab-columns"><section><h3>1. Original source</h3><p>Text inspection, not an original-application rendering. Source is never executed.</p><pre aria-label="Original source">{entry.sourceText !== undefined ? entry.sourceText.slice(0, 60000) : 'DOCX is a binary archive. Download the untouched original to compare it in Word or LibreOffice. Native page preview is not available here.'}</pre>{(entry.sourceText?.length ?? 0) > 60000 && <p>Preview limited to 60,000 characters. The full original remains downloadable.</p>}</section><section><h3>2. Imported document — editable</h3><p>Edit here, then check an export. Undo/redo stays separate for each file.</p><FountainComposer editor={editor} ariaLabel="Imported document editor" toolbarProps={{ groups: ['history', 'block-types', 'marks'] }} /></section></div>
    <section className="lab-export"><h3>3. Export and reopen</h3><div className="lab-actions"><label>Export format<select value={format} onChange={event => setFormat(event.target.value as LabFormat)}>{formats.map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label><button onClick={() => convert(false)}>Check round trip</button><button className="lab-primary" onClick={() => convert(true)}>Download export</button></div><p>Compares the current draft with its generated export reimported through Fountain—not with Word or another independent renderer. JSON equality is stricter than visual similarity.</p>
      {check && <div className="lab-check" aria-label="Round-trip result"><strong>{stale ? 'Outdated check — run again after your changes.' : check.equal ? 'Exact Fountain document equality after reopening.' : 'The reopened Fountain document differs. Inspect the preview and report.'}</strong><ul>{check.issues.map((issue, index) => <li key={index}>{issue.code}: {issue.message}</li>)}</ul><Preview key={check.id} document={check.document} /></div>}
    </section>
    <section className="lab-report"><h3>Found a problem?</h3><p>Download a diagnostic report for your own testing. Files are never attached or submitted automatically. Even report warnings may contain private snippets: review before sharing.</p><label className="lab-checkbox"><input type="checkbox" checked={includeContent} onChange={event => setIncludeContent(event.target.checked)} /> Include filename, document content and my note in the downloaded report</label><label>What went wrong?<textarea value={note} onChange={event => setNote(event.target.value)} placeholder="What you expected, and what happened instead" /></label><div className="lab-actions"><button onClick={report}>Download diagnostic report</button><a href="https://github.com/eddolo/fountainjs/issues/new" target="_blank" rel="noreferrer">Open a blank GitHub bug report ↗</a></div></section>
    {error && <p role="alert">{error}</p>}<p role="status">{status}</p>
  </section>;
}
export function ConversionLab() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [active, setActive] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const importing = useRef(false);
  async function open(files: File[]) {
    if (importing.current) return;
    if (files.length + entries.length > 8) { setMessage('Keep up to 8 files in this lab. Remove files or clear the session first.'); return; }
    if ([...entries.map(entry => entry.file), ...files].reduce((sum, file) => sum + file.size, 0) > 16 * 1024 * 1024) { setMessage('Session limit: 16 MiB total. Try fewer or smaller files.'); return; }
    importing.current = true; setBusy(true); setMessage('Reading files locally…');
    const added: Entry[] = [];
    try {
      for (const file of files) {
        const entry: Entry = { id: crypto.randomUUID(), file };
        try {
          entry.format = detectLabFormat(file.name);
          if (file.size > (entry.format === 'docx' ? 4 : 1) * 1024 * 1024) throw new Error('Lab limit: 1 MiB per text/JSON file; 4 MiB per DOCX.');
          const bytes = new Uint8Array(await file.arrayBuffer());
          entry.result = importLab(bytes, entry.format);
          if (entry.format !== 'docx') entry.sourceText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch (cause) { entry.error = cause instanceof Error ? cause.message : String(cause); }
        added.push(entry);
      }
      setEntries(current => [...current, ...added]); setActive(added[0]?.id ?? active);
      setMessage(`${added.filter(entry => entry.result).length} imported; ${added.filter(entry => entry.error).length} could not be imported. No files were uploaded.`);
    } finally { importing.current = false; setBusy(false); }
  }
  return <main className="conversion-lab">
    <header className="site-header"><a className="brand" href="./"><span>F</span> FountainJS</a><nav aria-label="Primary navigation"><SitePageLink href="./">Home</SitePageLink><SitePageLink href="./demos.html">10 demos</SitePageLink><SitePageLink href="./workflows.html">Workflows</SitePageLink><SitePageLink href="./developers.html">Developers</SitePageLink></nav></header>
    <div className="lab-shell"><nav className="lab-breadcrumb" aria-label="Breadcrumb"><a href="./">Home</a><span> / </span><a href="./demos.html">Demos</a><span> / Conversion lab</span></nav><a href="./demos.html">← Back to demos</a><h1>Try your own documents.</h1><p className="lab-intro">Import, inspect, edit and reopen an export. A working conversion lab—not a guarantee of identical output.</p>
    <section className="lab-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void open(Array.from(event.dataTransfer.files)); }} aria-label="Local file import"><label>Drop files here, or choose files<input aria-label="Choose documents" type="file" multiple disabled={busy} onChange={event => { void open(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label><p>Markdown · HTML · DOCX · Fountain JSON. Other formats, including PDF, TeX, ODT and EPUB, are not supported in this first lab.</p><div className="lab-actions"><button disabled={busy || entries.length >= 8} onClick={() => void open([new File(['# Conversion check\n\nA paragraph with **bold text**.\n\n- [ ] Verify the export\n- [x] Keep the original\n'], 'sample.md', { type: 'text/markdown' })])}>Try a sample</button><button disabled={busy || !entries.length} onClick={() => { if (window.confirm('Clear all local drafts? Download anything you want to keep first.')) { setEntries([]); setActive(''); setMessage('Local session cleared.'); } }}>Clear session</button></div></section>
    <p className="lab-privacy">Local processing only. No uploads or automatic storage. External images, media and embedded pages are blocked; their addresses may remain in the document. Following a link is your choice. Reloading or leaving clears these drafts. Up to 8 files / 16 MiB total.</p><p role="status">{message}</p>
    {entries.length > 0 && <nav className="lab-files" aria-label="Imported files">{entries.map(entry => <button key={entry.id} aria-pressed={active === entry.id} onClick={() => setActive(entry.id)} title={entry.file.name}>{entry.file.name}{entry.error ? ' — not imported' : ''}</button>)}</nav>}
    {entries.map(entry => entry.result ? <FileWorkspace key={entry.id} entry={entry} active={active === entry.id} /> : <section key={entry.id} hidden={active !== entry.id} className="lab-notice"><h2>{entry.file.name}</h2><p role="alert">{entry.error}</p><button onClick={() => download(entry.file, entry.file.name)}>Download untouched original</button></section>)}
    {entries.length > 0 && <button disabled={busy} onClick={() => { if (window.confirm('Remove this file and its edited draft?')) { const remaining = entries.filter(entry => entry.id !== active); setEntries(remaining); setActive(remaining[0]?.id ?? ''); } }}>Remove selected file</button>}
    <footer><p>Experimental lab · FountainJS {packageInfo.version} · StarterKit schema</p><a href="https://github.com/eddolo/fountainjs/blob/master/docs/CONVERSION_LAB.md">How this lab works ↗</a></footer></div>
  </main>;
}
