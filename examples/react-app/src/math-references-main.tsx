import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createEditor, EditorView, StarterKit, composeExtensions, createMathExtension, NodeSelection, MarkdownExporter, undo, redo, type Editor, type Node } from 'fountainjs-editor';
import { SitePageLink } from './SitePageLink';
import { mathReferenceSamples } from './math-reference-samples';
import { createDocumentMathJaxRenderer, type EquationSnapshot } from './mathjax-document-renderer';
import { downloadDocumentFile, MAX_EQUATION_FILE_BYTES, nextEquationLabel, parseEquationDocument, replaceEquationDocument } from './math-document-files';
import { createPageGeometry } from 'fountainjs-editor/pages';
import { layoutDOMPages } from 'fountainjs-editor/pages/dom';
import { renderDOMPagePreview } from 'fountainjs-editor/pages/preview';
import 'fountainjs-editor/styles.css';
import './math-renderer.css';
import './math-references.css';

function EquationReferencesLab() {
  const mount = useRef<HTMLDivElement>(null);
  const readerMount = useRef<HTMLDivElement>(null);
  const pageMount = useRef<HTMLDivElement>(null);
  const [pagedDocument, setPagedDocument] = useState<Node>();
  const [pageMessage, setPageMessage] = useState('Build a snapshot to inspect the equations and follow their links on pages.');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [doc, setDoc] = useState<Node>();
  const [selected, setSelected] = useState(false);
  const [snapshot, setSnapshot] = useState<EquationSnapshot>({ equationCount: 0, diagnostics: [] });
  const counter = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const openRequest = useRef(0);
  const [fileMessage, setFileMessage] = useState('Files are read locally. Opening replaces the document and can be undone.');
  useEffect(() => {
    const renderer = createDocumentMathJaxRenderer(setSnapshot);
    const kit = composeExtensions([...StarterKit.extensions, createMathExtension({ documentRenderer: renderer })]);
    const next = createEditor({ schema: kit.schema, plugins: kit.plugins });
    reset(next);
    const view = new EditorView(mount.current!, next, { ariaLabel: 'Equation author editor', blockHandles: true });
    const reader = createEditor({ schema: kit.schema, content: next.state.doc.toJSON(), editable: false });
    const readerView = new EditorView(readerMount.current!, reader, { ariaLabel: 'Equation reader preview' });
    const unsubscribe = next.subscribe((state, transaction) => {
      setDoc(state.doc);
      setSelected(state.selection instanceof NodeSelection && ['math_block', 'inline_math'].includes(state.selection.nodePath.reduce((node, index) => node.child(index), state.doc).type.name));
      if (transaction.docChanged) {
        const copy = reader.state.schema.nodeFromJSON(state.doc.toJSON());
        replaceEquationDocument(reader, copy);
      }
    });
    setEditor(next);
    setDoc(next.state.doc);
    return () => { openRequest.current++; unsubscribe(); view.destroy(); readerView.destroy(); reader.destroy(); next.destroy(); };
  }, []);

  function reset(target: Editor) {
    const { schema } = target.state;
    const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
    replaceEquationDocument(target, schema.node('doc', {}, [
      paragraph('The deterministic model and its stochastic extension'),
      schema.node('paragraph', {}, [schema.text('Compare equations '),
        schema.node('inline_math', { latex: String.raw`\eqref{eq:dNFE}` }), schema.text(' and '),
        schema.node('inline_math', { latex: String.raw`\eqref{eq:dSNFE}` }), schema.text('. These references precede their targets.')]),
      ...mathReferenceSamples.slice(1).map(sample => schema.node('math_block', { latex: sample.source })),
      paragraph('Move either equation using its block controls, or click it to edit its exact TeX source.'),
    ]));
  }

  function removeSelected() {
    if (!editor || !(editor.state.selection instanceof NodeSelection)) return;
    const selection = editor.state.selection;
    const node = selection.nodePath.reduce((node, index) => node.child(index), editor.state.doc);
    if (['math_block', 'inline_math'].includes(node.type.name)) editor.dispatch(editor.state.createTransaction().replaceNode(selection.nodePath));
  }

  function addEquation() {
    if (!editor) return;
    const identity = nextEquationLabel(editor.state.doc, counter.current);
    counter.current = identity.counter;
    const latex = String.raw`\begin{equation}\label{${identity.label}}E=mc^2\end{equation}`;
    const index = editor.state.doc.childCount - 1;
    const tr = editor.state.createTransaction().replace(index, index, [editor.state.schema.node('math_block', { latex })]);
    tr.setSelection(new NodeSelection(tr.doc, [index]));
    editor.dispatch(tr);
  }

  async function openFile(file?: File) {
    if (!editor || !file) return;
    const request = ++openRequest.current;
    const before = editor.state.doc;
    setFileMessage(`Opening ${file.name}…`);
    try {
      if (file.size > MAX_EQUATION_FILE_BYTES) throw new Error('Document exceeds the 2 MiB file limit.');
      const source = await file.text();
      if (request !== openRequest.current) return;
      const parsed = parseEquationDocument(source, editor.state.schema);
      if (editor.state.doc !== before) throw new Error('The document changed while the file was opening. Choose the file again to replace it.');
      const accepted = replaceEquationDocument(editor, parsed);
      if (!accepted && !parsed.eq(editor.state.doc)) throw new Error('The editor rejected this document.');
      setFileMessage(`Opened ${file.name}. Equation numbers are rebuilt from the saved source; Undo restores the previous document.`);
    } catch (error) {
      if (request === openRequest.current) setFileMessage(`File not opened: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function buildPages() {
    if (!editor) return;
    const before = editor.state.doc;
    setPageMessage('Waiting for fonts, then measuring the reader snapshot…');
    await document.fonts.ready;
    if (!pageMount.current || !readerMount.current || editor.state.doc !== before) {
      setPageMessage('The document changed before measurement. Build the preview again.');
      return;
    }
    // Measure a separate read-only copy at the same 960px body width used by
    // this lab's equation renderer. Never resize or move the live editor.
    const source = readerMount.current.querySelector<HTMLElement>('.fountain-editor')!.cloneNode(true) as HTMLElement;
    source.style.cssText = 'position:absolute;left:-20000px;top:0;width:960px;min-width:960px;max-width:none;padding:0;border:0;min-height:0;height:auto;visibility:hidden;';
    pageMount.current.parentElement!.append(source);
    try {
      const geometry = createPageGeometry({ size: { width: 1056, height: 816 }, margins: 48 });
      const layout = layoutDOMPages(source, before, geometry);
      // Measurement-only positioning must not leak into the accessible copy.
      source.removeAttribute('style');
      const result = renderDOMPagePreview(source, pageMount.current, geometry, layout, { ariaLabel: 'Paged equation snapshot' });
      const warnings = [...layout.measurement.warnings, ...layout.layout.warnings, ...layout.presentation.warnings];
      setPagedDocument(before);
      setPageMessage(`${result.pages.length} landscape Letter page${result.pages.length === 1 ? '' : 's'}. Links stay inside this snapshot. ${warnings.length ? `${warnings.length} layout warning(s); inspect overflow before exporting.` : ''}`);
    } catch (error) {
      pageMount.current.replaceChildren();
      setPagedDocument(undefined);
      setPageMessage(`Preview not built: ${error instanceof Error ? error.message : String(error)}`);
    } finally { source.remove(); }
  }

  return <main className="math-lab equation-lab">
    <header className="site-header"><a className="brand" href="./"><span>F</span> FountainJS</a>
      <nav aria-label="Primary navigation"><SitePageLink href="./">Home</SitePageLink><SitePageLink href="./demos.html">10 demos</SitePageLink><SitePageLink href="./developers.html">Developers</SitePageLink></nav><span>Capability lab</span></header>
    <section className="math-lab__intro">
      <h1>Equation references</h1>
      <p>Edit labelled equations, move them, and watch the numbers and references update in both the editor and the reader preview. MathJax 4.1.3 and its TeX SVG font are bundled locally by this example; they are not Fountain engine dependencies. The host can supply a different preloaded SVG font.</p>
      <p>Original equations: Tiago Sequeira (2022), <a href="https://doi.org/10.21105/joss.03974">NeuralFieldEq.jl, JOSS 7(75), 3974</a>, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. The introductory prose/references are this demo’s additions. Loading retains the published TeX, including labels and the suppressed first-row number. Edits create a modified version.</p>
      <p>This is an equation workflow, not a reproduced paper or a full LaTeX compiler. Long equations scroll horizontally on small screens. The read-only preview is a UI mode, not backend authorization. <a href="./mathjax-notices.txt">Renderer and font licenses</a>.</p>
    </section>
    <section className="math-lab__workspace" aria-label="Equation authoring">
      <h2>Author</h2>
      <div className="math-lab__controls">
        <button disabled={!editor} onClick={() => editor && reset(editor)}>Restore published equations</button>
        <button disabled={!editor} onClick={addEquation}>Add equation</button>
        <button disabled={!selected} onClick={removeSelected}>Delete selected formula</button>
        <button disabled={!editor} onClick={() => editor && undo(editor)}>Undo</button>
        <button disabled={!editor} onClick={() => editor && redo(editor)}>Redo</button>
      </div>
      <div className="math-lab__controls" role="group" aria-label="Document files">
        <button disabled={!editor} onClick={() => editor && downloadDocumentFile(document, 'equations.fountain.json', JSON.stringify(editor.getJSON(), null, 2), 'application/json')}>Save JSON</button>
        <button disabled={!editor} onClick={() => fileInput.current?.click()}>Open JSON</button>
        <input ref={fileInput} type="file" accept=".json,application/json" aria-label="Open Fountain document JSON" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void openFile(file); }} />
        <button disabled={!editor} onClick={() => editor && downloadDocumentFile(document, 'equations.md', MarkdownExporter.export(editor.state.doc), 'text/markdown;charset=utf-8')}>Save Markdown</button>
      </div>
      <p aria-live="polite" data-file-message>{fileMessage}</p>
      <p>JSON retains document data, not external image/attachment files or session history. Imported media URLs may contact their hosts. This is not an offline document package.</p>
      <p>Hover a block to find its movement controls. Click a formula to edit source; Enter inserts a line, Ctrl/Command+Enter finishes. The reader preview below follows your changes.</p>
      <div className={`math-lab__status${snapshot.diagnostics.length ? ' math-lab__status--error' : ''}`} role="status">
        {snapshot.diagnostics.length ? 'Equation diagnostics — check the source below.' : `${snapshot.equationCount} formulas rendered. References resolved; this does not certify the mathematics or paper layout.`}
        {snapshot.diagnostics.length > 0 && <ul>{snapshot.diagnostics.map((issue, i) => <li key={i}>Block {issue.path.join('.')} — {issue.message}</li>)}</ul>}
      </div>
      <div ref={mount} />
      <details><summary>Stored document JSON</summary><pre>{doc ? JSON.stringify(doc.toJSON(), null, 2) : ''}</pre></details>
      <details><summary>Markdown source export</summary><pre>{doc ? MarkdownExporter.export(doc) : ''}</pre></details>
    </section>
    <section className="math-lab__workspace" aria-label="Equation reading"><h2>Reader preview</h2><p>No author controls. References target equations inside this preview, not the editor above.</p><div ref={readerMount} /></section>
    <section className="math-lab__workspace equation-lab__print" aria-label="Equation pagination" data-print-ready={Boolean(pagedDocument && pagedDocument === doc)}>
      <h2>Paged snapshot</h2>
      <p>This lab uses landscape Letter pages with a 960px body to fit its equations. Chromium PDF output is checked for page sizes and internal equation links, with independently inspected page renders. This is not the original paper’s layout or a tagged accessible PDF.</p>
      <div className="math-lab__controls"><button disabled={!editor} onClick={() => void buildPages()}>Build page preview</button><button disabled={!pagedDocument || pagedDocument !== doc} onClick={() => window.print()}>Print / Save PDF</button></div>
      <p>Print opens your browser’s print dialog. Choose Save as PDF to keep the paged snapshot; check the preview and leave browser headers/footers off.</p>
      <p className="equation-lab__print-notice">No current page snapshot. Return to the editor and build the page preview before printing.</p>
      <p aria-live="polite" data-page-message>{pagedDocument && pagedDocument !== doc ? 'The document has changed. Build the preview again to replace this older snapshot.' : pageMessage}</p>
      <div className="equation-lab__pages"><div ref={pageMount} /></div>
    </section>
    <section className="math-lab__intro"><h2>Developer integration</h2><p>Use <code>createMathExtension(&#123; documentRenderer &#125;)</code>. The host adapter compiles a fresh document snapshot, caches each node’s SVG output, and namespaces links per view. It loads only base/AMS syntax, limits source expansion, and reports missing or duplicate labels. This lab caps a snapshot at 128 formulas and 128,000 source characters; it does not promise large-document compile performance.</p><p>Unsupported source remains editable instead of showing stale successful output. The paged snapshot can be printed through the browser; full-paper and accessible PDF fidelity remain pending. Default DOCX export keeps TeX fallback text with a loss report. The separate experimental semantic OMML adapter is not wired into this lab; native Word rendering/editing and source restoration remain unverified. <a href="./math-renderer.html">Compare the lightweight KaTeX lab →</a></p><p><a href="https://github.com/eddolo/fountainjs/blob/master/examples/react-app/src/mathjax-document-renderer.ts">Host adapter source →</a> · <a href="https://github.com/eddolo/fountainjs/blob/master/docs/API.md">API contracts →</a></p></section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><EquationReferencesLab /></React.StrictMode>);
