import { useLayoutEffect, useRef, useState } from 'react';
import { createImageNode, EditorState, imageFileToDataURL, NodeSelection, readDocumentPageSettings, type DocumentPageSettings, type Editor, type Node } from 'fountainjs-editor';
import type { DOCXPackagePart } from 'fountainjs-editor/docx';
import { FountainComposer, FountainEditor, useFountain, useFountainState, type FountainEditorHandle } from 'fountainjs-editor/react';
import { computeFootnoteNumbering, inspectFootnotes, insertFootnote, selectFootnoteDefinition, reconnectFootnote, removeFootnote, inspectPageTemplates, selectPageTemplate, insertPageBreak, setDocumentPageSettings } from 'fountainjs-editor/pages';
import { createLabContext, detectLabFormat, exportLab, importLab, labImages, labReportIssues, sameLabDocument, type LabContext, type LabFormat, type LabIssue } from './conversion-lab';
import { SitePageLink } from './SitePageLink';
import { ConversionPagePreview } from './ConversionPagePreview';
import packageInfo from '../../../package.json';

type Entry = { id: string; file: File; context: LabContext; format?: LabFormat; result?: ReturnType<typeof importLab>; error?: string; sourceText?: string };
const formats: LabFormat[] = ['json', 'markdown', 'html', 'docx'];
const pageSettingFields = [
  ['width', 'Page width'], ['height', 'Page height'], ['marginTop', 'Top margin'],
  ['marginRight', 'Right margin'], ['marginBottom', 'Bottom margin'], ['marginLeft', 'Left margin'],
  ['headerDistance', 'Header distance'], ['footerDistance', 'Footer distance'], ['gutter', 'Gutter'],
] as const;
function download(data: BlobPart, name: string, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Preview({ document, context }: { document: Node; context: LabContext }) {
  const editor = useFountain({ schema: context.kit.schema, content: document.toJSON(), editable: false });
  return <FountainEditor editor={editor} ariaLabel="Reopened export preview" />;
}
function IssueList({ issues }: { issues: readonly LabIssue[] }) {
  return <ul>{issues.map((issue, index) => <li key={index}><code>{issue.code}{issue.type && ` · ${issue.type}`}</code> — {issue.message}{issue.path !== undefined && <> Document path: <code>{issue.path.length ? issue.path.join('.') : 'root'}</code>.</>}{issue.sourcePart && <> Source part: <code>{issue.sourcePart}</code>.</>}</li>)}</ul>;
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
function SourceImageRecovery({ file, parts, editor }: { file: File; parts: readonly DOCXPackagePart[]; editor: Editor }) {
  const [path, setPath] = useState(parts[0].path);
  const [preview, setPreview] = useState<{ file: File; source: string }>();
  const [alt, setAlt] = useState('');
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  function reset() { setPreview(undefined); setDimensions(undefined); setError(''); setStatus(''); }
  async function open() {
    const part = parts.find(candidate => candidate.path === path);
    if (!part || busy) return;
    reset(); setBusy(true);
    try {
      const { recoverLabDOCXImage } = await import('./conversion-lab-docx-media');
      const image = recoverLabDOCXImage(new Uint8Array(await file.arrayBuffer()), part);
      const recovered = new File([Uint8Array.from(image.bytes)], image.fileName, { type: image.type });
      setPreview({ file: recovered, source: await imageFileToDataURL(recovered) });
      setAlt(image.fileName);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  function append() {
    if (!preview || !dimensions) return;
    const scale = Math.min(1, 640 / Math.max(dimensions.width, dimensions.height));
    const image = createImageNode(editor, { src: preview.source, alt,
      width: `${Math.max(1, Math.round(dimensions.width * scale))}px`,
      height: `${Math.max(1, Math.round(dimensions.height * scale))}px`,
    });
    const end = editor.state.doc.childCount;
    if (!image || !editor.dispatch(editor.state.createTransaction().replace(end, end, [image]))) {
      setError('The image could not be added to the draft.'); return;
    }
    setError(''); setStatus('Image appended to the draft. Use Undo in the editor to remove it.');
  }
  return <section className="lab-source-media" aria-label="Recover source images">
    <h4>Recover images from the original DOCX</h4>
    <p>Preview a PNG, JPEG, GIF or WebP that the import missed. You can download its original bytes or add it at the end of the draft. The archive does not tell this tool where the image belongs.</p>
    <div className="lab-actions"><label>Unrepresented media<select value={path} disabled={busy} onChange={event => { setPath(event.target.value); reset(); }}>
      {parts.map(part => <option key={part.path} value={part.path}>{part.path}</option>)}
    </select></label><button type="button" disabled={busy} onClick={open}>{busy ? 'Reading image…' : 'Preview source image'}</button></div>
    {preview && <figure><img src={preview.source} alt={`Preview of ${preview.file.name}`} onLoad={event => {
      const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
      if (width > 0 && height > 0) setDimensions({ width, height });
    }} onError={() => { setDimensions(undefined); setError('The browser could not display this image. You can still download its original bytes.'); }} />
      <figcaption>{preview.file.name} · {preview.file.size.toLocaleString()} bytes</figcaption>
      <label>Image description for the draft<input value={alt} onChange={event => setAlt(event.target.value)} /></label>
      <div className="lab-actions"><button type="button" onClick={() => download(preview.file, preview.file.name, preview.file.type)}>Download source image</button>
        <button type="button" disabled={!dimensions} onClick={append}>Append image to draft</button></div></figure>}
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
  </section>;
}
function FileWorkspace({ entry, active }: { entry: Entry; active: boolean }) {
  const [initialState] = useState(() => EditorState.create({ schema: entry.context.schema,
    doc: entry.result!.document, plugins: entry.context.kit.plugins }));
  const editor = useFountain({ schema: entry.context.kit.schema, state: initialState });
  const surface = useRef<FountainEditorHandle>(null);
  const insertFootnoteButton = useRef<HTMLButtonElement>(null);
  const state = useFountainState(editor)!;
  const [format, setFormat] = useState<LabFormat>(entry.format!);
  const [omitCaretHosts, setOmitCaretHosts] = useState(entry.format === 'markdown' && entry.context.options.commonMarkSourceReview);
  const [renderMath, setRenderMath] = useState(true);
  const [check, setCheck] = useState<{ id: string; document: Node; equal: boolean; issues: LabIssue[]; format: LabFormat; revision: Node; omitMarkdownCaretHosts: boolean; renderHTMLMath: boolean }>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [includeContent, setIncludeContent] = useState(false);
  const [note, setNote] = useState('');
  const images = labImages(entry.result!.document);
  const packageParts = entry.result!.packageParts;
  const unrepresentedParts = packageParts?.filter(part => part.handling === 'unrepresented-media') ?? [];
  const unrepresentedMedia = unrepresentedParts.length;
  const markdownHTML = format === 'html' && entry.format === 'markdown';
  const omitMarkdownCaretHosts = markdownHTML && omitCaretHosts;
  const renderHTMLMath = format === 'html' && renderMath;
  const stale = check && (check.revision !== state.doc || check.format !== format || check.omitMarkdownCaretHosts !== omitMarkdownCaretHosts || check.renderHTMLMath !== renderHTMLMath);
  const footnoteReport = inspectFootnotes(state.doc);
  const templateReport = inspectPageTemplates(state.doc);
  const pageSettings = readDocumentPageSettings(state.doc);
  const pageBreakPaths: Array<readonly number[]> = [];
  state.doc.descendants((node, path) => { if (node.type.name === 'page_break') pageBreakPaths.push(path); });
  const footnoteNumbers = new Map(computeFootnoteNumbering(state.doc).map(item => [item.id, item.label]));
  function editFootnote(id: string) {
    if (selectFootnoteDefinition(editor, id)) { surface.current?.focus(); setError(''); }
    else setError('This footnote has no editable text position. Inspect its content in the editor.');
  }
  function addFootnote() {
    const id = crypto.randomUUID();
    if (insertFootnote(editor, { id, content: 'New footnote' })) editFootnote(id);
    else setError('Place the cursor in body text before inserting a footnote. Notes cannot contain other footnote references.');
  }
  function reconnectNote(id: string) {
    if (reconnectFootnote(editor, id)) {
      surface.current?.focus();
      setError('');
      setStatus('Footnote reference restored. Undo removes the reference and keeps the note.');
    } else {
      setStatus('');
      setError('Place a text cursor in the document body, then reconnect the footnote.');
    }
  }
  function removeNote(id: string) {
    if (removeFootnote(editor, id)) {
      insertFootnoteButton.current?.focus();
      setError('');
      setStatus('Footnote and its references removed. Undo restores them together.');
    } else {
      setStatus('');
      setError('Could not remove this footnote.');
    }
  }
  function convert(save: boolean) {
    try {
      const output = exportLab(state.doc, format, entry.result?.source, entry.context, {
        omitMarkdownCaretHosts, renderHTMLMath,
        markdownBOM: entry.result?.markdownBOM,
      });
      const reopened = importLab(output.bytes, format, entry.context);
      setCheck({ id: crypto.randomUUID(), document: reopened.document, equal: sameLabDocument(state.doc, reopened.document), issues: [...output.issues, ...reopened.issues], format, revision: state.doc, omitMarkdownCaretHosts, renderHTMLMath });
      if (save) download(new Uint8Array(output.bytes), `${entry.file.name}.converted.${output.extension}`, output.mime);
      setError(''); setStatus(save ? 'Export downloaded and reopened below.' : 'Export generated in memory and reopened below. The editable draft was not replaced.');
    } catch (cause) { setCheck(undefined); setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  function report() {
    const data = {
      reportVersion: 2, fountainVersion: packageInfo.version, policy: entry.context.policy, importOptions: entry.context.options, createdAt: new Date().toISOString(),
      input: { format: entry.format, bytes: entry.file.size }, output: format,
      importedImages: { represented: images.length, embeddedRaster: images.filter(image => image.embedded).length },
      sourcePackage: packageParts ? { entries: packageParts.length, unrepresentedMedia, parts: includeContent ? packageParts : packageParts.map(({ path: _path, ...part }) => part) } : null,
      importIssues: labReportIssues(entry.result!.issues, includeContent), draftChanged: !sameLabDocument(entry.result!.document, state.doc),
      roundTrip: check ? { format: check.format, renderHTMLMath: check.renderHTMLMath, stale: Boolean(stale), exactFountainJSONEquality: check.equal,
        ...(check.omitMarkdownCaretHosts ? { omitMarkdownCaretHosts: true } : {}), issues: labReportIssues(check.issues, includeContent) } : null,
      fidelity: 'Original-format visual fidelity and exhaustive loss detection are unverified.',
      ...(includeContent ? { fileName: entry.file.name, note, importedDocument: entry.result!.document.toJSON(), editedDocument: state.doc.toJSON(), originalText: entry.sourceText } : {}),
    };
    download(JSON.stringify(data, null, 2), 'fountain-conversion-report.json', 'application/json');
    setStatus('Report downloaded locally. Review it before sharing; warning messages may contain source fragments. Nothing was submitted.');
  }
  return <section className="lab-file" hidden={!active} aria-label={`Conversion workspace: ${entry.file.name}`}>
    <div className="lab-file-heading"><div><h2>{entry.file.name}</h2><p>{entry.format?.toUpperCase()} · {entry.file.size.toLocaleString()} bytes · {state.doc.childCount} top-level blocks</p></div><button onClick={() => download(entry.file, entry.file.name)}>Download untouched original</button></div>
    <p className="lab-import-mode">This file uses {entry.context.options.commonMarkSourceReview ? 'CommonMark source review' : entry.context.options.preserveHTMLStructure ? 'supported HTML structure conversion' : 'standard import'}.{entry.format === 'markdown' && !entry.context.options.preserveHTMLStructure ? ' Raw tags stay as literal HTML inside Markdown.' : ''} Export checks use the same import settings.</p>
    {entry.context.options.commonMarkSourceReview && entry.format === 'markdown' && <p className="lab-import-mode">Markdown downloads can contain the original HTML source. Choose HTML for the safe reader export.</p>}
    {entry.context.options.commonMarkSourceReview && entry.format === 'json' && <p className="lab-import-mode">Fountain JSON restores the saved document model. Keep the Markdown file if you need its original spelling and line endings.</p>}
    {entry.format === 'markdown' && entry.context.options.commonMarkText && <p className="lab-import-mode">Leading delimiters are part of the Markdown body. Bare addresses stay as text.</p>}
    <div className="lab-notice"><strong>Import report</strong><p>These are reported conversion details—not proof of zero loss. Original-format layout and complete fidelity are unverified.</p>{entry.result!.issues.length ? <IssueList issues={entry.result!.issues} /> : <ul><li>No issues reported by this adapter. Undetected losses remain possible.</li></ul>}</div>
    {packageParts && <details className="lab-package" aria-label="Source package inventory"><summary>Source package: {packageParts.length} entries · Unrepresented media: {unrepresentedMedia}</summary><p>Archive entries are counted before conversion. Adapter input means bytes were read, not that every feature survived. Unrepresented media may be unused or belong to omitted content. Skipped parts remain in the untouched original; they are not embedded in the converted document.</p><ul>{packageParts.map((part, index) => <li key={index}><code>{part.path}</code> — {part.handling} · {part.declaredBytes.toLocaleString()} declared bytes</li>)}</ul></details>}
    <details className="lab-assets" open={images.length > 0}><summary>Images in the imported document: {images.length} ({images.filter(image => image.embedded).length} embedded raster)</summary><p>Embedded raster images can be displayed without internet access. This inventory reflects what the adapter recovered, not every image in the original archive. Missing/unsupported Word images appear in the import warnings when detected; headers, drawings and other unsupported structures may need further import work.</p><div>{images.map((image, index) => <RecoveredImage key={index} image={image} index={index} />)}</div></details>
    <div className="lab-columns"><section><h3>1. Original source</h3><p>Text inspection, not an original-application rendering. Source is never executed.</p><pre aria-label="Original source">{entry.sourceText !== undefined ? entry.sourceText.slice(0, 60000) : 'DOCX is a binary archive. Download the untouched original to compare it in Word or LibreOffice. Native page preview is not available here.'}</pre>{(entry.sourceText?.length ?? 0) > 60000 && <p>Preview limited to 60,000 characters. The full original remains downloadable.</p>}
      {unrepresentedMedia > 0 && <SourceImageRecovery file={entry.file} parts={unrepresentedParts} editor={editor} />}</section><section><h3>2. Imported document — editable</h3><p>Edit here, then check an export. Undo/redo stays separate for each file.</p><FountainComposer ref={surface} editor={editor} ariaLabel="Imported document editor" />
      {templateReport.templates.length > 0 && <section className="lab-footnotes" aria-label="Page template controls"><h2>Headers and footers</h2><p>These are editable templates, not repeated page previews. Native DOCX parts retain supported text, images and simple page fields; the receiving application must lay out pages and recalculate field values.</p><ul>{templateReport.templates.map(item => <li key={`${item.kind}:${item.variant}`}><button onClick={() => { if (selectPageTemplate(editor, item.kind, item.variant)) { surface.current?.focus(); setError(''); } else setError('This template has no text cursor position. Select its content directly in the editor.'); }}>Edit {item.kind} ({item.variant})</button></li>)}</ul></section>}
      <details className="lab-page-settings" aria-label="Document page settings"><summary>Page settings{pageSettings?.width && pageSettings?.height ? ` · ${pageSettings.width} × ${pageSettings.height} pt` : ' · unspecified values use export defaults'}</summary><p>Physical points (72 pt = 1 inch). These values travel with the document and DOCX export. They do not change this continuous editor into a paginated Word preview. Header/footer distances are offsets from the page edge, not content heights. Blank values are unspecified.</p>
        <form key={JSON.stringify(pageSettings)} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); const settings: Record<string, unknown> = { unit: 'pt' }; for (const [key] of pageSettingFields) { const value = String(data.get(key) ?? '').trim(); if (value) settings[key] = Number(value); } const orientation = data.get('orientation'); if (orientation) settings.orientation = orientation; if (setDocumentPageSettings(editor, settings as unknown as DocumentPageSettings)) { setError(''); setStatus('Page settings updated. Undo restores the previous settings.'); } else setError('Invalid page settings. Dimensions must be positive; distances must be finite numbers.'); }}>
          <div className="lab-page-setting-fields">{pageSettingFields.map(([key, label]) => <label key={key}>{label} (pt)<input name={key} type="number" step="any" defaultValue={pageSettings?.[key] ?? ''} /></label>)}<label>Page orientation<select name="orientation" defaultValue={pageSettings?.orientation ?? ''}><option value="">Unspecified</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label></div>
          <p>Orientation describes the stored dimensions; changing it does not swap width and height.</p><button type="submit">Apply page settings</button>
        </form>
      </details>
      <section className="lab-footnotes" aria-label="Page break controls"><h2>Manual page breaks</h2><p>Dashed separators mark explicit page boundaries, not blank lines. This editor is a continuous view, not a page-layout preview. Select a break and press Delete or Backspace to remove it; Undo restores it.</p><button onMouseDown={event => event.preventDefault()} onClick={() => { if (insertPageBreak(editor)) { surface.current?.focus(); setError(''); } else setError('Place the cursor in the document before inserting a page break.'); }}>Insert page break after current block</button><ul>{pageBreakPaths.map((path, index) => <li key={path.join('.')}><button onClick={() => { editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, path))); surface.current?.focus(); setError(''); }}>Select page break {index + 1}</button></li>)}</ul></section>
      <section className="lab-footnotes" aria-label="Footnote controls"><h2>Footnotes</h2><p>Notes are editable blocks below the body, linked to numbered references. DOCX export stores them as native footnotes; original page placement and custom numbering are not reproduced here.</p><button ref={insertFootnoteButton} onMouseDown={event => event.preventDefault()} onClick={addFootnote}>Insert footnote at cursor</button>
        {footnoteReport.definitions.length > 0 && <ul>{footnoteReport.definitions.map(item => {
          const number = footnoteNumbers.get(item.id);
          const label = number ? `footnote ${number}` : `unreferenced footnote ${item.id}`;
          const canReconnect = !number && item.path.length === 1
            && !footnoteReport.issues.some(issue => issue.id === item.id && issue.code === 'duplicate-definition');
          return <li key={item.path.join('.')}>
            <span>{number ? `Footnote ${number}` : `Unreferenced footnote ${item.id}`}</span>
            <button onClick={() => editFootnote(item.id)}>Edit {label}</button>
            {canReconnect && <button onMouseDown={event => event.preventDefault()} onClick={() => reconnectNote(item.id)}>Reconnect footnote {item.id} at cursor</button>}
            <button onClick={() => removeNote(item.id)}>Remove {label}</button>
          </li>;
        })}</ul>}
        {footnoteReport.issues.length > 0 && <ul>{footnoteReport.issues.map((issue, index) => <li key={index}>{issue.detail}</li>)}</ul>}
      </section></section></div>
    {active && <ConversionPagePreview editor={editor} document={state.doc} surface={surface} />}
    <section className="lab-export"><h3>3. Export and reopen</h3><div className="lab-actions"><label>Export format<select value={format} onChange={event => setFormat(event.target.value as LabFormat)}>{formats.map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label><button onClick={() => convert(false)}>Check round trip</button><button className="lab-primary" onClick={() => convert(true)}>Download export</button></div><p>Compares the current draft with its generated export reimported through Fountain—not with Word or another independent renderer. JSON equality is stricter than visual similarity.</p>
      {format === 'html' && <label className="lab-checkbox"><input type="checkbox" checked={renderMath} onChange={event => setRenderMath(event.target.checked)} /> Render equations in the downloaded HTML (offline; original TeX is retained)</label>}
      {markdownHTML && <label className="lab-checkbox"><input type="checkbox" checked={omitCaretHosts} onChange={event => setOmitCaretHosts(event.target.checked)} /> Omit Markdown’s editor-only caret paragraphs in HTML</label>}
      {check && <div className="lab-check" aria-label="Round-trip result"><strong>{stale ? 'Outdated check — run again after your changes.' : check.equal ? 'Exact Fountain document equality after reopening.' : 'The reopened Fountain document differs. Inspect the preview and report.'}</strong><p>This compares only the current Fountain draft, not the original file. Original import findings: {entry.result!.issues.length}. Missing original content is not restored by a successful round trip. Independent visual fidelity: not verified by this check.</p><IssueList issues={check.issues} /><Preview key={check.id} document={check.document} context={entry.context} /></div>}
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
  const [preserveHTMLStructure, setPreserveHTMLStructure] = useState(false);
  const [commonMarkText, setCommonMarkText] = useState(false);
  const [commonMarkSourceReview, setCommonMarkSourceReview] = useState(false);
  const [retainBlockedAutolinks, setRetainBlockedAutolinks] = useState(false);
  const importing = useRef(false);
  const fileChooser = useRef<HTMLInputElement>(null);
  const selectedFileButton = useRef<HTMLButtonElement>(null);
  const restoreFileFocus = useRef(false);
  useLayoutEffect(() => {
    if (!restoreFileFocus.current) return;
    restoreFileFocus.current = false;
    const target = selectedFileButton.current ?? fileChooser.current;
    target?.focus();
  }, [active]);

  function removeSelectedFile() {
    const index = entries.findIndex(entry => entry.id === active);
    const selected = entries[index];
    if (!selected || !window.confirm('Remove this file and its edited draft?')) return;
    const remaining = entries.filter(entry => entry.id !== selected.id);
    const next = remaining[index] ?? remaining.at(-1);
    restoreFileFocus.current = true;
    setEntries(remaining);
    setActive(next?.id ?? '');
    setMessage(`Removed ${selected.file.name}.`);
  }

  function clearSession() {
    if (!window.confirm('Clear all local drafts? Download anything you want to keep first.')) return;
    restoreFileFocus.current = true;
    setEntries([]);
    setActive('');
    setMessage('Local session cleared.');
  }

  async function open(files: File[]) {
    if (importing.current) return;
    if (files.length + entries.length > 8) { setMessage('Keep up to 8 files in this lab. Remove files or clear the session first.'); return; }
    if ([...entries.map(entry => entry.file), ...files].reduce((sum, file) => sum + file.size, 0) > 16 * 1024 * 1024) { setMessage('Session limit: 16 MiB total. Try fewer or smaller files.'); return; }
    importing.current = true; setBusy(true); setMessage('Reading files locally…');
    const added: Entry[] = [];
    try {
      const context = createLabContext({ preserveHTMLStructure, commonMarkText, retainBlockedAutolinks });
      const sourceReviewContext = commonMarkSourceReview ? createLabContext({ commonMarkSourceReview }) : context;
      for (const file of files) {
        const entry: Entry = { id: crypto.randomUUID(), file, context };
        try {
          entry.format = detectLabFormat(file.name);
          if (entry.format !== 'docx') entry.context = sourceReviewContext;
          if (file.size > (entry.format === 'docx' ? 4 : 1) * 1024 * 1024) throw new Error('Lab limit: 1 MiB per text/JSON file; 4 MiB per DOCX.');
          const bytes = new Uint8Array(await file.arrayBuffer());
          entry.result = importLab(bytes, entry.format, entry.context);
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
    <section className="lab-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void open(Array.from(event.dataTransfer.files)); }} aria-label="Local file import"><label>Drop files here, or choose files<input ref={fileChooser} aria-label="Choose documents" type="file" multiple disabled={busy} onChange={event => { void open(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label><p>Markdown · HTML · DOCX · Fountain JSON. Other formats, including PDF, TeX, ODT and EPUB, are not supported in this first lab.</p><div className="lab-actions"><button disabled={busy || entries.length >= 8} onClick={() => void open([new File(['# Conversion check\n\nA paragraph with **bold text**.\n\n- [ ] Verify the export\n- [x] Keep the original\n'], 'sample.md', { type: 'text/markdown' })])}>Try a sample</button><button disabled={busy || !entries.length} onClick={clearSession}>Clear session</button></div></section>
    <fieldset className="lab-import-options" disabled={busy}>
      <legend>Options for the next files</legend>
      <label className="lab-checkbox"><input type="checkbox" checked={commonMarkSourceReview} onChange={event => setCommonMarkSourceReview(event.target.checked)} /> Use CommonMark source review for Markdown, HTML and Fountain JSON</label>
      <p>Read leading delimiters as Markdown and keep bare addresses as text. Preserve supported HTML source as inactive data. Choose this mode again before reopening HTML or Fountain JSON saved from a source review draft.</p>
      <label className="lab-checkbox"><input type="checkbox" checked={preserveHTMLStructure} onChange={event => setPreserveHTMLStructure(event.target.checked)} /> Preserve supported HTML structure</label>
      <p>Keep supported sections, bookmarks, comments and inline flow. HTML inside Markdown will be converted too. This does not reproduce arbitrary styles or scripts.</p>
      {preserveHTMLStructure && <label className="lab-checkbox"><input type="checkbox" checked={retainBlockedAutolinks} onChange={event => setRetainBlockedAutolinks(event.target.checked)} /> Preserve blocked Markdown autolinks as inactive data</label>}
      <label className="lab-checkbox"><input type="checkbox" checked={commonMarkText} onChange={event => setCommonMarkText(event.target.checked)} /> Use CommonMark rules for delimiters and bare addresses</label>
      <p>Parse leading --- lines as Markdown and leave bare URLs and email addresses as text. Existing drafts keep their original settings.</p>
    </fieldset>
    <p className="lab-privacy">Local processing only. No uploads or automatic storage. External images, media and embedded pages are blocked; their addresses may remain in the document. Following a link is your choice. Reloading or leaving clears these drafts. Up to 8 files / 16 MiB total.</p><p role="status">{message}</p>
    {entries.length > 0 && <nav className="lab-files" aria-label="Imported files">{entries.map(entry => <button key={entry.id} ref={active === entry.id ? selectedFileButton : undefined} aria-pressed={active === entry.id} onClick={() => setActive(entry.id)} title={entry.file.name}>{entry.file.name}{entry.error ? ' — not imported' : ''}</button>)}</nav>}
    {entries.map(entry => entry.result ? <FileWorkspace key={entry.id} entry={entry} active={active === entry.id} /> : <section key={entry.id} hidden={active !== entry.id} className="lab-notice"><h2>{entry.file.name}</h2><p role="alert">{entry.error}</p><button onClick={() => download(entry.file, entry.file.name)}>Download untouched original</button></section>)}
    {entries.length > 0 && <button disabled={busy} onClick={removeSelectedFile}>Remove selected file</button>}
    <footer><p>Experimental lab · FountainJS {packageInfo.version} · StarterKit + Pages schema</p><a href="https://github.com/eddolo/fountainjs/blob/master/docs/CONVERSION_LAB.md">How this lab works ↗</a></footer></div>
  </main>;
}
