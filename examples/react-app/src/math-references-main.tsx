import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createEditor, EditorView, StarterKit, composeExtensions, createMathExtension, NodeSelection, MarkdownExporter, undo, redo, type Editor, type Node } from 'fountainjs-editor';
import { SitePageLink } from './SitePageLink';
import { mathReferenceSamples } from './math-reference-samples';
import { createDocumentMathJaxRenderer, type EquationSnapshot } from './mathjax-document-renderer';
import 'fountainjs-editor/styles.css';
import './math-renderer.css';
import './math-references.css';

function EquationReferencesLab() {
  const mount = useRef<HTMLDivElement>(null);
  const readerMount = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [doc, setDoc] = useState<Node>();
  const [selected, setSelected] = useState(false);
  const [snapshot, setSnapshot] = useState<EquationSnapshot>({ equationCount: 0, diagnostics: [] });
  const counter = useRef(0);
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
        reader.dispatch(reader.state.createTransaction().replace(0, reader.state.doc.childCount, copy.content));
      }
    });
    setEditor(next);
    setDoc(next.state.doc);
    return () => { unsubscribe(); view.destroy(); readerView.destroy(); reader.destroy(); next.destroy(); };
  }, []);

  function reset(target: Editor) {
    const { schema } = target.state;
    const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
    target.dispatch(target.state.createTransaction().replace(0, target.state.doc.childCount, [
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
    const latex = String.raw`\begin{equation}\label{eq:extra-${++counter.current}}E=mc^2\end{equation}`;
    const index = editor.state.doc.childCount - 1;
    const tr = editor.state.createTransaction().replace(index, index, [editor.state.schema.node('math_block', { latex })]);
    tr.setSelection(new NodeSelection(tr.doc, [index]));
    editor.dispatch(tr);
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
    <section className="math-lab__intro"><h2>Developer integration</h2><p>Use <code>createMathExtension(&#123; documentRenderer &#125;)</code>. The host adapter compiles a fresh document snapshot, caches each node’s SVG output, and namespaces links per view. It loads only base/AMS syntax, limits source expansion, and reports missing or duplicate labels. This lab caps a snapshot at 128 formulas and 128,000 source characters; it does not promise large-document compile performance.</p><p>Unsupported source remains editable instead of showing stale successful output. PDF/DOCX visual export parity is still pending. <a href="./math-renderer.html">Compare the lightweight KaTeX lab →</a></p><p><a href="https://github.com/eddolo/fountainjs/blob/master/examples/react-app/src/mathjax-document-renderer.ts">Host adapter source →</a> · <a href="https://github.com/eddolo/fountainjs/blob/master/docs/API.md">API contracts →</a></p></section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><EquationReferencesLab /></React.StrictMode>);
