import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import katex from 'katex';
import { createEditor, EditorView, StarterKit, composeExtensions, createMathExtension, createKaTeXRenderer, NodeSelection, MarkdownExporter, undo, redo, type Editor, type Node } from 'fountainjs-editor';
import { SitePageLink } from './SitePageLink';
import { mathReferenceSamples } from './math-reference-samples';
import 'fountainjs-editor/styles.css';
import 'katex/dist/katex.min.css';
import './math-renderer.css';

function MathRendererLab() {
  const mount = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [documentNode, setDocumentNode] = useState<Node>();
  const [failure, setFailure] = useState('');
  const [sample, setSample] = useState(0);
  useEffect(() => {
    const renderer = createKaTeXRenderer(katex, { maxExpand: 1000, maxSize: 20 });
    const kit = composeExtensions([...StarterKit.extensions, createMathExtension({
      renderer(source, context) {
        const result = renderer(source, context);
        setFailure('');
        return result;
      },
      onRenderError(error) { setFailure(error instanceof Error ? error.message : 'The renderer rejected this formula.'); },
    })]);
    const next = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const view = new EditorView(mount.current!, next, { ariaLabel: 'Math renderer editor' });
    const unsubscribe = next.subscribe(state => setDocumentNode(state.doc));
    setEditor(next);
    load(next, 0);
    return () => { unsubscribe(); view.destroy(); next.destroy(); };
  }, []);

  function load(target: Editor, index: number) {
    const schema = target.state.schema;
    const tr = target.state.createTransaction().replace(0, target.state.doc.childCount, [
      schema.node('paragraph', {}, [schema.text('Select the formula to edit its TeX source. Enter adds a line; Ctrl/Command+Enter finishes.')]),
      schema.node('math_block', { latex: mathReferenceSamples[index].source, ariaLabel: '' }),
      schema.node('paragraph', {}, [schema.text('The renderer changes the view, not the stored mathematical source.')]),
    ]);
    tr.setSelection(new NodeSelection(tr.doc, [1]));
    target.dispatch(tr);
  }

  return <main className="demos-site math-lab">
    <header className="site-header">
      <a className="brand" href="./"><span>F</span> FountainJS</a>
      <nav aria-label="Primary navigation"><SitePageLink href="./">Home</SitePageLink><SitePageLink href="./demos.html">10 demos</SitePageLink><SitePageLink href="./developers.html">Developers</SitePageLink></nav>
      <span>Capability lab</span>
    </header>
    <section className="math-lab__intro">
      <h1>Math renderer lab</h1>
      <p>Real KaTeX, editable Fountain math nodes, and explicit failures. KaTeX and its fonts are bundled by this demo; they are not a Fountain engine dependency.</p>
      <p>This is a formula-rendering audit, not whole-paper LaTeX import. The two published samples retain <code>\label</code>, which this renderer currently rejects. Their fallback is a known gap, not a successful reproduction.</p>
      <p>Equation excerpts: Tiago Sequeira (2022), <a href="https://doi.org/10.21105/joss.03974">NeuralFieldEq.jl, JOSS 7(75), 3974</a>, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Unofficial rendering test; original source is unchanged on loading. User edits create a modified version.</p>
    </section>
    <section className="math-lab__workspace" aria-label="Live math renderer">
      <div className="math-lab__controls">
        <label>Reference sample <select value={sample} onChange={event => setSample(Number(event.target.value))}>{mathReferenceSamples.map((item, index) => <option value={index} key={item.label}>{item.label}</option>)}</select></label>
        <button disabled={!editor} onClick={() => editor && load(editor, sample)}>Load sample (replaces editor)</button>
        <button disabled={!editor} onClick={() => editor && undo(editor)}>Undo</button>
        <button disabled={!editor} onClick={() => editor && redo(editor)}>Redo</button>
      </div>
      <div className={failure ? 'math-lab__status math-lab__status--error' : 'math-lab__status'} role="status">Most recent formula render: {failure ? `Source fallback — ${failure}` : 'Typeset view ready. This reports rendering, not mathematical proof or paper fidelity.'}</div>
      <div ref={mount} />
      <details><summary>Stored document JSON</summary><pre>{documentNode ? JSON.stringify(documentNode.toJSON(), null, 2) : ''}</pre></details>
      <details><summary>Markdown export</summary><pre>{documentNode ? MarkdownExporter.export(documentNode) : ''}</pre></details>
    </section>
    <section className="math-lab__intro"><h2>Build this integration</h2><p>Compose <code>createMathExtension</code> with <code>createKaTeXRenderer(katex)</code> and an <code>onRenderError</code> handler. Import KaTeX’s CSS in the host application. The adapter disables trust; unsupported commands fall back to exact editable source.</p><p><a href="./developers.html">Developer guide →</a> · <a href="https://github.com/eddolo/fountainjs/blob/master/docs/REFERENCE_DOCUMENT_AUDIT.md">Reference audit and known gaps →</a> · <a href="https://github.com/eddolo/fountainjs/blob/master/examples/react-app/src/math-renderer-main.tsx">Full example source →</a></p></section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><MathRendererLab /></React.StrictMode>);
