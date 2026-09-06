import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HTMLExporter,
  ClipboardHistoryExtension,
  JSONExporter,
  LeanExtension,
  LeanInfoView,
  GapSelection,
  MarkdownExporter,
  MarkdownImporter,
  MathExtension,
  Schema,
  StarterKit,
  EditorView,
  addTableColumn,
  addTableRow,
  composeExtensions,
  createEditor,
  deleteTable,
  deleteTableColumn,
  deleteTableRow,
  getActiveMath,
  getActiveMedia,
  getActiveTableCell,
  isInsideNode,
  insertList,
  insertMathBlock,
  insertTable,
  redo,
  registerFountainElement,
  mergeTableCells,
  selectTableColumn,
  selectTableRow,
  selectAll,
  selectGap,
  setMark,
  setMathSource,
  setMediaAttributes,
  setTextAlignment,
  topLevelPosition,
  splitTableCell,
  deleteMedia,
  toggleQuote,
  toggleTableHeaderCell,
  toggleTableHeaderColumn,
  toggleTableHeaderRow,
  toggleMark,
  unsetMark,
  undo,
  type Editor,
  type FountainEditorElement,
  type LeanService,
  type Node,
} from 'fountainjs-editor';
import { FountainComposer, useFountain, useFountainState } from 'fountainjs-editor/react';
import { exportDOCX, importDOCX } from 'fountainjs-editor/docx';
import { createReactWidgetExtension, type ReactWidgetProps } from 'fountainjs-editor/react/widgets';
import { StableNodeIdsExtension } from 'fountainjs-editor/node-ids';
import { defineWidget } from 'fountainjs-editor/widgets';
import { createDOMWidgetExtension } from 'fountainjs-editor/widgets/dom';
import { demoDefinitions, getDemo, type DemoDefinition } from './demo-definitions';
import { SitePageLink } from './SitePageLink';

type OutputFormat = 'json' | 'markdown' | 'html';

const demoStatusWidget = defineWidget({
  name: 'status_panel',
  label: 'Incident status',
  attributes: {
    status: { default: 'Investigating', validate: (value) => ['Investigating', 'Resolved'].includes(String(value)) },
  },
});
const demoStatusExtension = createDOMWidgetExtension(demoStatusWidget, (context) => {
  const button = context.dom.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'demo-status-node';
  const render = (status: unknown) => {
    button.textContent = `Incident status · ${String(status)} · Click to change`;
    button.title = `Change incident status from ${String(status)}`;
  };
  const onClick = () => {
    const current = context.controller.getAttributes()?.status;
    context.set('status', current === 'Resolved' ? 'Investigating' : 'Resolved');
  };
  button.addEventListener('click', onClick);
  context.controls.appendChild(button);
  render(context.attributes.status);
  return {
    update(next) { render(next.attributes.status); },
    destroy() { button.removeEventListener('click', onClick); },
  };
}, { className: 'demo-status-widget', controlsClassName: 'demo-status-controls' });

const demoPriorityWidget = defineWidget({
  name: 'review_priority',
  label: 'Review priority',
  attributes: {
    priority: { default: 'Normal', validate: (value) => ['Low', 'Normal', 'High'].includes(String(value)) },
  },
});
function DemoPriorityWidget({ attributes, editable, selected, set }: ReactWidgetProps) {
  return <label className="demo-priority-control">
    <span>Review priority · choose a value{selected ? ' · selected' : ''}</span>
    <select
      aria-label="Review priority"
      disabled={!editable}
      value={String(attributes.priority)}
      onChange={(event) => set('priority', event.target.value)}
    >
      <option>Low</option><option>Normal</option><option>High</option>
    </select>
  </label>;
}
const demoPriorityExtension = createReactWidgetExtension(
  demoPriorityWidget,
  DemoPriorityWidget,
  { className: 'demo-priority-widget' },
);

const statusDemoKit = composeExtensions([...StarterKit.extensions, demoStatusExtension]);
const docsDemoKit = composeExtensions([
  ...StarterKit.extensions,
  StableNodeIdsExtension,
  MathExtension,
  LeanExtension,
]);
const reactDemoKit = composeExtensions([
  ...StarterKit.extensions,
  ClipboardHistoryExtension,
  demoPriorityExtension,
]);
const headlessDemoKit = docsDemoKit;
const HEADLESS_HTML_SOURCE = `<h1>Server-native document</h1>
<p style="text-align:center"><strong>DOM-free HTML</strong> becomes validated Fountain JSON.</p>
<p><span data-fountain-math="inline" data-latex="E=mc^2" data-math-aria-label="E equals m c squared">E=mc²</span></p>
<ol start="3"><li>Parse the source<ul><li>Keep nested structure</li></ul></li><li>Validate every node</li></ol>
<table><thead><tr><th>Boundary</th><th>Behavior</th></tr></thead><tbody><tr><td>Node.js</td><td>no jsdom</td></tr></tbody></table>`;

function outputFor(document: Node | undefined, format: OutputFormat): string {
  if (!document) return '';
  if (format === 'html') return HTMLExporter.export(document, { document: false });
  if (format === 'markdown') return MarkdownExporter.export(document);
  return JSONExporter.export(document);
}

function OutputPanel({ document }: { document: Node | undefined }) {
  const [format, setFormat] = useState<OutputFormat>('json');
  const [copied, setCopied] = useState(false);
  const output = useMemo(() => outputFor(document, format), [document, format]);
  const copy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return <section className="demo-output">
    <header><strong>Live document output</strong><button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button></header>
    <nav>{(['json', 'markdown', 'html'] as const).map((item) => <button className={format === item ? 'active' : ''} onClick={() => setFormat(item)} key={item}>{item}</button>)}</nav>
    <pre><code>{output}</code></pre>
  </section>;
}

function DemoControls({ editor }: { editor: Editor | null }) {
  const state = useFountainState(editor);
  const [mathSource, setMathInput] = useState('a^2 + b^2 = c^2');
  const [tableRows, setTableRows] = useState('2');
  const [tableColumns, setTableColumns] = useState('2');
  const [highlightColor, setHighlightColor] = useState('#fff3a3');
  const [tableToolsOpen, setTableToolsOpen] = useState(false);
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaDescription, setMediaDescription] = useState('');
  const selectedMath = editor ? getActiveMath(editor) : null;
  const activeTable = editor ? getActiveTableCell(editor) : null;
  const activeMedia = editor ? getActiveMedia(editor) : null;
  const insertionGap = state?.selection instanceof GapSelection
    && state.selection.parentPath.length === 0
    && state.selection.index === 1;
  const selectedMathPath = selectedMath?.path.join('.') ?? '';
  const selectedMathSource = String(selectedMath?.node.attrs.latex ?? '');
  useEffect(() => {
    if (selectedMathPath) setMathInput(selectedMathSource);
  }, [selectedMathPath, selectedMathSource]);
  useEffect(() => {
    if (!activeTable) setTableToolsOpen(false);
  }, [activeTable]);
  const activeMediaPath = activeMedia?.path.join('.') ?? '';
  const activeMediaSignature = activeMedia
    ? JSON.stringify([
      activeMediaPath,
      activeMedia.node.attrs.name,
      activeMedia.node.attrs.title,
      activeMedia.node.attrs.description,
      activeMedia.node.attrs.caption,
    ])
    : '';
  useEffect(() => {
    if (!activeMedia) return;
    setMediaTitle(String(activeMedia.node.attrs.name ?? activeMedia.node.attrs.title ?? ''));
    setMediaDescription(String(activeMedia.node.attrs.description ?? activeMedia.node.attrs.caption ?? ''));
  }, [activeMediaSignature]);
  return <div className="demo-controls" aria-label="Editor controls" onMouseDown={(event) => {
    if (!(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement) && !(event.target instanceof HTMLSelectElement)) event.preventDefault();
  }}>
    <button disabled={!editor} onClick={() => editor && undo(editor)}>Undo</button>
    <button disabled={!editor} onClick={() => editor && redo(editor)}>Redo</button>
    <button disabled={!editor} onClick={() => editor && toggleMark(editor, 'strong')}>Bold</button>
    <label className="demo-colour-control" title="Choose a highlight colour">
      <span>Highlight</span>
      <input aria-label="Highlight colour" type="color" value={highlightColor} onChange={(event) => setHighlightColor(event.target.value)} />
    </label>
    <button disabled={!editor} onClick={() => editor && setMark(editor, 'highlight', { color: highlightColor })}>Apply highlight</button>
    <button disabled={!editor} onClick={() => editor && unsetMark(editor, 'highlight')}>Remove highlight</button>
    <button disabled={!editor} onClick={() => editor && setTextAlignment(editor, 'center')}>Centre</button>
    <button aria-pressed={Boolean(editor && isInsideNode(editor, 'blockquote'))} disabled={!editor} title="Turn the selected paragraph(s) into a quote, or remove the current quote" onClick={() => editor && toggleQuote(editor)}>{editor && isInsideNode(editor, 'blockquote') ? 'Remove quote' : 'Quote'}</button>
    <button disabled={!editor} onClick={() => editor && selectAll(editor)}>Select all</button>
    <button
      aria-pressed={insertionGap}
      disabled={!editor || editor.state.doc.childCount < 2}
      title="Places the insertion point after the title; it does not insert a page break"
      onClick={() => editor && selectGap(editor, topLevelPosition(editor.state.doc, 1))}
    >Place cursor after title</button>
    <button disabled={!editor} onClick={() => editor && insertList(editor, 'task', ['A new task'])}>+ Task</button>
    <label className="demo-table-control"><span>Table</span><input aria-label="Table rows" type="number" min="1" max="50" value={tableRows} onChange={(event) => setTableRows(event.target.value)} /><b>×</b><input aria-label="Table columns" type="number" min="1" max="20" value={tableColumns} onChange={(event) => setTableColumns(event.target.value)} /></label>
    <button disabled={!editor} onClick={() => editor && insertTable(editor, { rows: Number(tableRows), columns: Number(tableColumns), headerRow: true })}>+ Table</button>
    {editor?.state.schema.nodes.math_block && <label className="demo-math-control">
      <span>LaTeX</span>
      <input aria-label="Math source" value={mathSource} onChange={(event) => setMathInput(event.target.value)} />
      <button disabled={!mathSource.trim()} onClick={() => insertMathBlock(editor, mathSource, 'Editable math expression')}>+ New Math</button>
      {selectedMath && <button disabled={!mathSource.trim()} onClick={() => setMathSource(editor, mathSource, '')}>Update selected</button>}
    </label>}
    {activeTable && <button aria-expanded={tableToolsOpen} onClick={() => setTableToolsOpen((open) => !open)}>Table options</button>}
    {activeTable && tableToolsOpen && <div className="demo-table-tools" role="group" aria-label="Table options">
      <p>Select adjacent cells with Shift-click before merging.</p>
      <fieldset><legend>Selection</legend><button onClick={() => editor && selectTableRow(editor)}>Select row</button><button onClick={() => editor && selectTableColumn(editor)}>Select column</button><button disabled={state?.selection.kind !== 'cell' || state.selection.cellPaths.length < 2} onClick={() => editor && mergeTableCells(editor)}>Merge selected cells</button><button disabled={activeTable.cell.colspan === 1 && activeTable.cell.rowspan === 1} onClick={() => editor && splitTableCell(editor)}>Split merged cell</button></fieldset>
      <fieldset><legend>Rows</legend><button onClick={() => editor && addTableRow(editor, 'before')}>Add row above</button><button onClick={() => editor && addTableRow(editor, 'after')}>Add row below</button><button onClick={() => editor && deleteTableRow(editor)}>Delete row</button><button onClick={() => editor && toggleTableHeaderRow(editor)}>Make/unmake header row</button></fieldset>
      <fieldset><legend>Columns</legend><button onClick={() => editor && addTableColumn(editor, 'before')}>Add column left</button><button onClick={() => editor && addTableColumn(editor, 'after')}>Add column right</button><button onClick={() => editor && deleteTableColumn(editor)}>Delete column</button><button onClick={() => editor && toggleTableHeaderColumn(editor)}>Make/unmake header column</button></fieldset>
      <fieldset><legend>Cell</legend><button onClick={() => editor && toggleTableHeaderCell(editor)}>Make/unmake this cell a header</button></fieldset>
      <button className="is-danger" onClick={() => { if (editor) deleteTable(editor); setTableToolsOpen(false); }}>Delete entire table</button>
      <button onClick={() => setTableToolsOpen(false)}>Close</button>
    </div>}
    {activeMedia && <div className="demo-object-tools" role="group" aria-label="Selected media details">
      <strong>{activeMedia.kind === 'file_attachment' ? 'Selected attachment' : `Selected ${activeMedia.kind}`}</strong>
      <label>{activeMedia.kind === 'file_attachment' ? 'File name' : 'Title'}<input value={mediaTitle} onChange={(event) => setMediaTitle(event.target.value)} /></label>
      <label>{activeMedia.kind === 'file_attachment' ? 'Description' : 'Caption'}<textarea value={mediaDescription} onChange={(event) => setMediaDescription(event.target.value)} /></label>
      <button disabled={activeMedia.kind === 'file_attachment' && !mediaTitle.trim()} onClick={() => editor && setMediaAttributes(editor, activeMedia.kind === 'file_attachment'
        ? { name: mediaTitle, description: mediaDescription }
        : { title: mediaTitle, caption: mediaDescription })}>Save details</button>
      <button className="is-danger" onClick={() => editor && deleteMedia(editor)}>Delete selected item</button>
    </div>}
    {insertionGap && <span className="demo-control-status" role="status">Insertion point ready — the next task, table, or math block will be placed here. This is not a page break.</span>}
  </div>;
}

function ReactRuntime({ demo }: { demo: DemoDefinition }) {
  const editor = useFountain({ schema: reactDemoKit.schema, plugins: reactDemoKit.plugins, content: demo.content });
  const state = useFountainState(editor);
  return <div className="demo-workspace">
    <section className="demo-surface"><div className="surface-label"><span>LIVE {demo.surface.toUpperCase()}</span><i>One supplied toolbar. Select text or a document object to reveal the relevant controls.</i></div><FountainComposer editor={editor} placeholder="Start writing…" /></section>
    <OutputPanel document={state?.doc} />
  </div>;
}

function DOMRuntime({ demo }: { demo: DemoDefinition }) {
  const mount = useRef<HTMLDivElement>(null);
  const leanMount = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [currentDocument, setCurrentDocument] = useState<Node>();

  useEffect(() => {
    if (!mount.current) return;
    const kit = demo.slug === 'plain-dom-notes'
      ? statusDemoKit
      : demo.slug === 'go-docs-service' ? docsDemoKit : StarterKit;
    const nextEditor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: demo.content });
    const view = new EditorView(mount.current, nextEditor, { placeholder: 'Edit this document…' });
    const unsubscribe = nextEditor.subscribe((state) => setCurrentDocument(state.doc));
    setEditor(nextEditor);
    setCurrentDocument(nextEditor.state.doc);
    const leanController = demo.slug === 'go-docs-service'
      ? (kit.services.lean as LeanService).createController(nextEditor)
      : undefined;
    const leanInfo = leanController && leanMount.current
      ? new LeanInfoView(leanMount.current, leanController)
      : undefined;
    return () => {
      leanInfo?.destroy();
      void leanController?.dispose();
      unsubscribe();
      view.destroy();
      nextEditor.destroy();
      setEditor(null);
    };
  }, [demo]);

  return <div className="demo-workspace">
    <section className="demo-surface"><div className="surface-label"><span>LIVE {demo.surface.toUpperCase()}</span><i>No React editor components are used inside this mount.</i></div><DemoControls editor={editor} /><div className="bare-editor" ref={mount} />{demo.slug === 'go-docs-service' && <div className="lean-demo-info" ref={leanMount} />}</section>
    <OutputPanel document={currentDocument} />
  </div>;
}

function ElementRuntime({ demo }: { demo: DemoDefinition }) {
  const mount = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [currentDocument, setCurrentDocument] = useState<Node>();
  const [uploadStatus, setUploadStatus] = useState('');

  useEffect(() => {
    if (!mount.current) return;
    const tagName = 'fountain-demo-editor';
    registerFountainElement({
      tagName,
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      placeholder: 'Edit through the Custom Element…',
      imageUpload: demo.slug === 'angular-media' ? async (file, { signal, reportProgress }) => {
        reportProgress(.25);
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, 220);
          signal.addEventListener('abort', () => {
            window.clearTimeout(timer);
            reject(new DOMException('Upload cancelled', 'AbortError'));
          }, { once: true });
        });
        reportProgress(1);
        return { src: '../demo-media.svg', alt: file.name.replace(/\.[^.]+$/, ''), caption: 'Uploaded through the demo host adapter.' };
      } : undefined,
      assetUpload: demo.slug === 'angular-media' ? async (file, { kind, signal, reportProgress }) => {
        reportProgress(.25);
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, 220);
          signal.addEventListener('abort', () => {
            window.clearTimeout(timer);
            reject(new DOMException('Upload cancelled', 'AbortError'));
          }, { once: true });
        });
        reportProgress(1);
        if (kind === 'audio') return {
          src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
          title: file.name.replace(/\.[^.]+$/, ''),
          caption: 'Audio uploaded through the Angular-owned adapter.',
        };
        if (kind === 'video') return {
          src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
          title: file.name.replace(/\.[^.]+$/, ''),
          caption: 'Video uploaded through the Angular-owned adapter.',
        };
        return {
          src: '../demo-media.svg',
          name: file.name,
          description: 'File uploaded through the Angular-owned adapter.',
        };
      } : undefined,
    });
    const element = document.createElement(tagName) as FountainEditorElement;
    element.value = demo.content;
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ state: { doc: Node } }>).detail;
      setCurrentDocument(detail.state.doc);
      setEditor(element.editor ?? null);
    };
    const onUpload = (event: Event) => {
      const snapshot = (event as CustomEvent<{ snapshot: { fileName: string; status: string; progress: number } }>).detail.snapshot;
      setUploadStatus(snapshot.status === 'uploading'
        ? `Uploading ${snapshot.fileName}: ${Math.round(snapshot.progress * 100)}%`
        : `${snapshot.fileName}: ${snapshot.status}`);
    };
    element.addEventListener('fountain-change', onChange);
    element.addEventListener('fountain-image-upload', onUpload);
    element.addEventListener('fountain-asset-upload', onUpload);
    mount.current.appendChild(element);
    setEditor(element.editor ?? null);
    setCurrentDocument(element.editor?.state.doc);
    return () => {
      element.removeEventListener('fountain-change', onChange);
      element.removeEventListener('fountain-image-upload', onUpload);
      element.removeEventListener('fountain-asset-upload', onUpload);
      element.remove();
      setEditor(null);
    };
  }, [demo]);

  return <div className="demo-workspace">
    <section className="demo-surface"><div className="surface-label"><span>LIVE {demo.surface.toUpperCase()}</span><i>The editable region below is a registered &lt;fountain-demo-editor&gt;.</i></div><DemoControls editor={editor} /><div className="element-editor" ref={mount} />{demo.slug === 'angular-media' && <p className="headless-status" role="status">{uploadStatus || 'Paste or drop an image, audio, video, or file to run the host upload adapters.'}</p>}</section>
    <OutputPanel document={currentDocument} />
  </div>;
}

function HeadlessRuntime({ demo }: { demo: DemoDefinition }) {
  const schema = useMemo(() => new Schema(
    demo.slug === 'node-markdown' ? headlessDemoKit.schema : StarterKit.schema,
  ), [demo.slug]);
  const [inputFormat, setInputFormat] = useState<'markdown' | 'html' | 'docx'>('markdown');
  const [markdownSource, setMarkdownSource] = useState(demo.markdown ?? '');
  const [htmlSource, setHTMLSource] = useState(HEADLESS_HTML_SOURCE);
  const markdownParsed = useMemo(() => {
    try {
      const document = MarkdownImporter.parse(markdownSource, schema);
      return { document, details: MarkdownExporter.exportWithReport(document).losses.length, error: '', loading: false };
    } catch (error) {
      return { document: undefined, details: 0, error: error instanceof Error ? error.message : String(error), loading: false };
    }
  }, [schema, markdownSource]);
  const [htmlParsed, setHTMLParsed] = useState<{
    document: Node | undefined;
    details: number;
    error: string;
    loading: boolean;
  }>({ document: undefined, details: 0, error: '', loading: false });
  const [docxParsed, setDOCXParsed] = useState<{
    document: Node | undefined;
    details: number;
    error: string;
    fileName: string;
  }>({ document: undefined, details: 0, error: '', fileName: '' });
  useEffect(() => {
    if (inputFormat !== 'html') return undefined;
    let active = true;
    setHTMLParsed((current) => ({ ...current, error: '', loading: true }));
    void import('fountainjs-editor/html/server').then(({ ServerHTMLImporter }) => {
      if (!active) return;
      const result = ServerHTMLImporter.parseWithReport(htmlSource, schema);
      setHTMLParsed({ document: result.document, details: result.issues.length, error: '', loading: false });
    }).catch((error: unknown) => {
      if (!active) return;
      setHTMLParsed({ document: undefined, details: 0, error: error instanceof Error ? error.message : String(error), loading: false });
    });
    return () => { active = false; };
  }, [htmlSource, inputFormat, schema]);
  const parsed = inputFormat === 'html' ? htmlParsed : inputFormat === 'docx'
    ? { ...docxParsed, loading: false }
    : markdownParsed;
  const source = inputFormat === 'html' ? htmlSource : markdownSource;
  const setSource = inputFormat === 'html' ? setHTMLSource : setMarkdownSource;
  const detailLabel = inputFormat === 'docx'
    ? `${parsed.details ? `${parsed.details} reported DOCX conversion detail${parsed.details === 1 ? '' : 's'}` : 'bounded DOCX import with no reported losses'}`
    : inputFormat === 'html'
    ? `${parsed.details ? `${parsed.details} recovered HTML issue${parsed.details === 1 ? '' : 's'}` : 'no recovered HTML issues'}`
    : `${parsed.details ? `${parsed.details} projected Markdown detail${parsed.details === 1 ? '' : 's'}` : 'no reported Markdown losses'}`;
  const downloadDOCX = () => {
    if (!parsed.document) return;
    const result = exportDOCX(parsed.document, { title: demo.title, creator: 'FountainJS demo' });
    const url = URL.createObjectURL(new Blob([result.bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'fountainjs-document.docx';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div className="demo-workspace">
    <section className="demo-surface headless-surface"><div className="surface-label"><span>LIVE HEADLESS FORMAT PIPELINE</span><i>No contenteditable or EditorView is mounted.</i></div><nav className="headless-input-tabs" aria-label="Headless input format"><button className={inputFormat === 'markdown' ? 'active' : ''} onClick={() => setInputFormat('markdown')}>Markdown</button><button className={inputFormat === 'html' ? 'active' : ''} onClick={() => setInputFormat('html')}>Server HTML</button><button className={inputFormat === 'docx' ? 'active' : ''} onClick={() => setInputFormat('docx')}>Word DOCX</button></nav>{inputFormat === 'docx' ? <div className="headless-docx-controls"><label>Import a Word document<input aria-label="Import Word DOCX" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const result = importDOCX(await file.arrayBuffer(), schema);
        setDOCXParsed({ document: result.document, details: result.report.issues.length, error: '', fileName: file.name });
      } catch (error) {
        setDOCXParsed({ document: undefined, details: 0, error: error instanceof Error ? error.message : String(error), fileName: file.name });
      }
    }} /></label><span>{docxParsed.fileName || 'Choose a .docx file; parsing stays in this browser.'}</span></div> : <><label htmlFor="headless-source">{inputFormat === 'html' ? 'Server HTML input' : 'Markdown input'}</label><textarea id="headless-source" value={source} onChange={(event) => setSource(event.target.value)} /></>}<div className="headless-format-actions"><button disabled={!parsed.document} onClick={downloadDOCX}>Download as Word DOCX</button><span>Uses the same DOM-free import/export entry in browsers and servers.</span></div><p className={parsed.error ? 'headless-status error' : 'headless-status'}>{parsed.error || (parsed.loading ? 'Loading the isolated DOM-free parser…' : `Valid document · ${parsed.document?.childCount ?? 0} top-level blocks · ${detailLabel}`)}</p></section>
    <OutputPanel document={parsed.document} />
  </div>;
}

function Runtime({ demo }: { demo: DemoDefinition }) {
  if (demo.runtime === 'dom') return <DOMRuntime demo={demo} />;
  if (demo.runtime === 'element') return <ElementRuntime demo={demo} />;
  if (demo.runtime === 'headless') return <HeadlessRuntime demo={demo} />;
  return <ReactRuntime demo={demo} />;
}

function DemoPage() {
  const demo = getDemo(document.body.dataset.demo);
  const previous = demo.index > 1 ? demo.index - 2 : 9;
  const next = demo.index < 10 ? demo.index : 0;

  return <main className="single-demo" style={{ '--demo-accent': demo.accent } as React.CSSProperties}>
    <header className="site-header">
      <a className="brand" href="../" aria-label="FountainJS home"><span>F</span> FountainJS</a>
      <nav aria-label="Primary navigation"><SitePageLink href="../">Home</SitePageLink><SitePageLink href="../demos.html">10 demos</SitePageLink><SitePageLink href="../developers.html">Developers</SitePageLink><a className="site-section-link site-external-link" href="https://github.com/eddolo/fountainjs">Source ↗</a></nav>
      <a className="install-pill" href="../demos.html">Demo {String(demo.index).padStart(2, '0')} / 10</a>
    </header>

    <section className="single-demo__hero">
      <div><p>{String(demo.index).padStart(2, '0')} · {demo.host.toUpperCase()}</p><h1>{demo.title}</h1><span>{demo.summary}</span></div>
      <aside><b>Integration boundary</b><p>{demo.boundary}</p><dl><div><dt>Host</dt><dd>{demo.host}</dd></div><div><dt>Surface</dt><dd>{demo.surface}</dd></div></dl></aside>
    </section>

    <section className="single-demo__runtime" id="live-demo"><Runtime demo={demo} /></section>

    <section className="single-demo__details">
      <div className="demo-capabilities"><p>CAPABILITIES IN THIS PAGE</p>{demo.capabilities.map((capability, index) => <article key={capability}><b>0{index + 1}</b><span>{capability}</span></article>)}</div>
      <div className="host-recipe"><p>{demo.host.toUpperCase()} INTEGRATION RECIPE</p><pre><code>{demo.code}</code></pre><span>This code documents the real boundary used by the live example. Product storage, authentication, and deployment remain host-owned.</span></div>
    </section>

    <nav className="demo-pagination" aria-label="Other demos">
      <a href={`./${demoDefinitions[previous]!.slug}.html`}>← <span>Previous</span><b>{demoDefinitions[previous]!.title}</b></a><a href={`./${demoDefinitions[next]!.slug}.html`}><span>Next</span><b>{demoDefinitions[next]!.title}</b> →</a>
    </nav>
    <footer><span>FountainJS working demo · {demo.host}</span><span><a href="../demos.html">All demos</a> · <a href="../developers.html">How it works</a></span></footer>
  </main>;
}

export default DemoPage;
