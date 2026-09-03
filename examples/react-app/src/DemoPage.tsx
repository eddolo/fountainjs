import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HTMLExporter,
  JSONExporter,
  LeanExtension,
  LeanInfoView,
  MarkdownExporter,
  MarkdownImporter,
  MathExtension,
  Schema,
  Selection,
  StarterKit,
  EditorView,
  addTableColumn,
  addTableRow,
  composeExtensions,
  createEditor,
  defineExtension,
  insertList,
  insertMathBlock,
  insertTable,
  redo,
  registerFountainElement,
  selectAll,
  selectGap,
  setNodeAttributes,
  setTextAlignment,
  topLevelPosition,
  toggleMark,
  undo,
  type Editor,
  type FountainEditorElement,
  type LeanService,
  type Node,
} from '../../../src';
import { FountainComposer, useFountain, useFountainState } from '../../../src/react';
import { demoDefinitions, getDemo, type DemoDefinition } from './demo-definitions';

type OutputFormat = 'json' | 'markdown' | 'html';

class DemoStatusNodeView {
  dom = document.createElement('button');
  constructor(node: Node, view: unknown, getPath: () => number[]) {
    this.dom.type = 'button';
    this.dom.className = 'demo-status-node';
    this.dom.addEventListener('click', () => {
      const editor = (view as EditorView).editor;
      const path = getPath();
      let current = editor.state.doc;
      for (const index of path) current = current.child(index);
      setNodeAttributes(editor, path, { status: current.attrs.status === 'Resolved' ? 'Investigating' : 'Resolved' });
    });
    this.update(node);
  }
  update(node: Node): boolean {
    this.dom.textContent = `Incident status · ${String(node.attrs.status)}`;
    return true;
  }
  selectNode(): void { this.dom.dataset.selected = 'true'; }
  deselectNode(): void { delete this.dom.dataset.selected; }
  stopEvent(event: Event): boolean {
    return event.target instanceof globalThis.Node && this.dom.contains(event.target);
  }
}

const demoStatusExtension = defineExtension({
  name: 'demo-status-node',
  nodes: {
    status_panel: {
      group: 'block',
      atom: true,
      attrs: { status: { default: 'Investigating', validate: (value) => ['Investigating', 'Resolved'].includes(String(value)) } },
      nodeView: DemoStatusNodeView,
    },
  },
});
const statusDemoKit = composeExtensions([...StarterKit.extensions, demoStatusExtension]);
const docsDemoKit = composeExtensions([...StarterKit.extensions, MathExtension, LeanExtension]);
const headlessDemoKit = docsDemoKit;

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

function runTableCommand(editor: Editor, command: (editor: Editor) => boolean): void {
  if (command(editor)) return;
  let target: number[] | undefined;
  editor.state.doc.descendants((node, path) => {
    if (target || (node.type.name !== 'table_cell' && node.type.name !== 'table_header')) return;
    node.descendants((child, childPath) => {
      if (!target && child.isText) target = [...path, ...childPath];
    });
  });
  if (!target) return;
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor(target, 0)));
  command(editor);
}

function DemoControls({ editor }: { editor: Editor | null }) {
  return <div className="demo-controls" aria-label="Editor controls" onMouseDown={(event) => event.preventDefault()}>
    <button disabled={!editor} onClick={() => editor && undo(editor)}>Undo</button>
    <button disabled={!editor} onClick={() => editor && redo(editor)}>Redo</button>
    <button disabled={!editor} onClick={() => editor && toggleMark(editor, 'strong')}>Bold</button>
    <button disabled={!editor} onClick={() => editor && toggleMark(editor, 'highlight')}>Highlight</button>
    <button disabled={!editor} onClick={() => editor && setTextAlignment(editor, 'center')}>Centre</button>
    <button disabled={!editor} onClick={() => editor && selectAll(editor)}>Select all</button>
    <button disabled={!editor || editor.state.doc.childCount < 2} onClick={() => editor && selectGap(editor, topLevelPosition(editor.state.doc, 1))}>Gap after first</button>
    <button disabled={!editor} onClick={() => editor && insertList(editor, 'task', ['A new task'])}>+ Task</button>
    <button disabled={!editor} onClick={() => editor && insertTable(editor, { rows: 2, columns: 2, headerRow: true })}>+ Table</button>
    <button disabled={!editor?.state.schema.nodes.math_block} onClick={() => editor && insertMathBlock(editor, 'a^2 + b^2 = c^2', 'Pythagorean theorem')}>+ Math</button>
    <button disabled={!editor} onClick={() => editor && runTableCommand(editor, addTableRow)}>+ Row</button>
    <button disabled={!editor} onClick={() => editor && runTableCommand(editor, addTableColumn)}>+ Column</button>
  </div>;
}

function ReactRuntime({ demo }: { demo: DemoDefinition }) {
  const editor = useFountain({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: demo.content });
  const state = useFountainState(editor);
  return <div className="demo-workspace">
    <section className="demo-surface"><div className="surface-label"><span>LIVE {demo.surface.toUpperCase()}</span><i>Try Ctrl/Cmd+A, click an image, Shift-click table cells, or use the explicit gap control.</i></div><DemoControls editor={editor} /><FountainComposer editor={editor} placeholder="Start writing…" /></section>
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

  useEffect(() => {
    if (!mount.current) return;
    const tagName = 'fountain-demo-editor';
    registerFountainElement({ tagName, schema: StarterKit.schema, plugins: StarterKit.plugins, placeholder: 'Edit through the Custom Element…' });
    const element = document.createElement(tagName) as FountainEditorElement;
    element.value = demo.content;
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ state: { doc: Node } }>).detail;
      setCurrentDocument(detail.state.doc);
      setEditor(element.editor ?? null);
    };
    element.addEventListener('fountain-change', onChange);
    mount.current.appendChild(element);
    setEditor(element.editor ?? null);
    setCurrentDocument(element.editor?.state.doc);
    return () => {
      element.removeEventListener('fountain-change', onChange);
      element.remove();
      setEditor(null);
    };
  }, [demo]);

  return <div className="demo-workspace">
    <section className="demo-surface"><div className="surface-label"><span>LIVE {demo.surface.toUpperCase()}</span><i>The editable region below is a registered &lt;fountain-demo-editor&gt;.</i></div><DemoControls editor={editor} /><div className="element-editor" ref={mount} /></section>
    <OutputPanel document={currentDocument} />
  </div>;
}

function HeadlessRuntime({ demo }: { demo: DemoDefinition }) {
  const schema = useMemo(() => new Schema(
    demo.slug === 'node-markdown' ? headlessDemoKit.schema : StarterKit.schema,
  ), [demo.slug]);
  const [source, setSource] = useState(demo.markdown ?? '');
  const parsed = useMemo(() => {
    try { return { document: MarkdownImporter.parse(source, schema), error: '' }; }
    catch (error) { return { document: undefined, error: error instanceof Error ? error.message : String(error) }; }
  }, [schema, source]);

  return <div className="demo-workspace">
    <section className="demo-surface headless-surface"><div className="surface-label"><span>LIVE HEADLESS FORMAT PIPELINE</span><i>No contenteditable or EditorView is mounted.</i></div><label htmlFor="markdown-source">Markdown input</label><textarea id="markdown-source" value={source} onChange={(event) => setSource(event.target.value)} /><p className={parsed.error ? 'headless-status error' : 'headless-status'}>{parsed.error || `Valid document · ${parsed.document?.childCount ?? 0} top-level blocks`}</p></section>
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
      <nav><a href="../demos.html">All 10 demos</a><a href="../developers.html">Developer guide</a><a href="https://github.com/eddolo/fountainjs">Source</a></nav>
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
