import { useMemo, useState } from 'react';
import {
  AIController,
  CoreExtension,
  HTMLExporter,
  JSONExporter,
  MarkdownExporter,
  Selection,
  composeExtensions,
  createAIAdapter,
  defineExtension,
  historyPlugin,
  markdownShortcutsPlugin,
} from '../../../src';
import { FountainAIReview, FountainComposer, Navigator, useFountain, useFountainState } from '../../../src/react';
import '../../../src/styles.css';

const initialContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Build an editor that fits your product.' }] },
    { type: 'paragraph', content: [
      { type: 'text', text: 'FountainJS is an ' },
      { type: 'text', text: 'modular rich-text engine', marks: [{ type: 'strong' }] },
      { type: 'text', text: '. Compose only the document types, behavior, formats, UI bindings, and integrations your product needs.' },
    ] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Try the composed modules' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Edit text, use Markdown shortcuts, insert a custom callout, switch export formats, or try the optional AI review panel.' }] },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One document model. Any interface. Your extensions.' }] }] },
    { type: 'code_block', attrs: { language: 'typescript', lineNumbers: true }, content: [{ type: 'text', text: "const kit = composeExtensions([\n  CoreExtension, history, callout, myIntegration\n]);\nconst editor = createEditor({ schema: kit.schema, plugins: kit.plugins });" }] },
  ],
} as const;

const demoAdapter = createAIAdapter(async (request, { signal }) => {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const source = request.input.trim();
  const replacement = request.action === 'shorten'
    ? source.split(/\s+/).slice(0, Math.max(4, Math.ceil(source.split(/\s+/).length * 0.6))).join(' ').replace(/[,:;]$/, '') + '.'
    : request.action === 'expand'
      ? `${source.replace(/[.!?]$/, '')}—with clearer intent, stronger structure, and no loss of the author’s voice.`
      : request.action === 'fix-grammar'
        ? `${source.charAt(0).toUpperCase()}${source.slice(1).replace(/\s+/g, ' ').replace(/[.!?]?$/, '.')}`
        : source === 'Build an editor that fits your product.'
          ? 'Shape one editor core around the product you are building.'
          : `Make it unmistakably clear: ${source.charAt(0).toLowerCase()}${source.slice(1)}`;
  return {
    replacement,
    explanation: 'This local demo adapter returns a deterministic proposal. A production app supplies its own model or MCP adapter.',
    model: 'local-demo (no network)',
  };
});

const calloutExtension = defineExtension({
  name: 'callout',
  nodes: {
    callout: {
      group: 'block',
      content: 'inline*',
      attrs: { tone: { default: 'idea' } },
      toDOM: (node) => ['aside', { className: 'demo-callout', 'data-tone': node.attrs.tone }, 0],
    },
  },
});

const demoKit = composeExtensions([
  CoreExtension,
  defineExtension({ name: 'history', plugins: [historyPlugin] }),
  defineExtension({ name: 'markdown-shortcuts', plugins: [markdownShortcutsPlugin] }),
  calloutExtension,
  defineExtension({ name: 'ai-review', services: { adapter: demoAdapter } }),
]);

type ExportFormat = 'markdown' | 'html' | 'json';

const competitors = [
  {
    name: 'Tiptap',
    maturity: 'Mature ProseMirror-based platform with a large extension ecosystem.',
    ai: 'AI Toolkit already supports suggestions and review; tracked changes is a paid add-on.',
    fit: 'Choose it for ecosystem depth, collaboration, and commercial support.',
    href: 'https://tiptap.dev/docs/ai/ai-toolkit/client/api-reference/suggestions',
  },
  {
    name: 'Plate',
    maturity: 'Powerful React/Slate framework with composable plugins and polished examples.',
    ai: 'Rich AI plugin with streaming, selection transforms, previews, and Vercel AI SDK integration.',
    fit: 'Choose it for a React-first stack and a broad ready-made feature set.',
    href: 'https://platejs.org/docs/ai',
  },
  {
    name: 'BlockNote',
    maturity: 'Excellent out-of-the-box React block editor experience.',
    ai: 'Model-agnostic AI extension with suggestions and streaming; AI ships in its XL licensing tier.',
    fit: 'Choose it when a Notion-like block UI is the priority.',
    href: 'https://www.blocknotejs.org/docs/features/ai',
  },
  {
    name: 'FountainJS',
    maturity: 'Early beta: compact TypeScript core, DOM view, Web Component, and React bindings.',
    ai: 'Explicit extension composition for schema, behavior, formats, services, and optional AI review.',
    fit: 'Choose it to own a small modular stack and keep framework boundaries open.',
    href: 'https://github.com/eddolo/fountainjs',
  },
] as const;

function App() {
  const editor = useFountain({
    schema: demoKit.schema,
    content: initialContent,
    plugins: demoKit.plugins,
  });
  const state = useFountainState(editor);
  const aiController = useMemo(() => new AIController(editor, demoAdapter), [editor]);
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [copied, setCopied] = useState(false);

  const output = useMemo(() => {
    if (!state) return '';
    if (format === 'html') return HTMLExporter.export(state, { document: false });
    if (format === 'json') return JSONExporter.export(state);
    return MarkdownExporter.export(state);
  }, [format, state]);

  const words = state?.doc.textContent.trim().split(/\s+/).filter(Boolean).length ?? 0;
  const blocks = state?.doc.childCount ?? 0;

  const addBlock = (kind: 'quote' | 'task' | 'table' | 'callout') => {
    const schema = editor.state.schema;
    const p = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
    const node = kind === 'callout'
      ? schema.node('callout', { tone: 'idea' }, [schema.text('A custom node supplied by the demo extension.')])
      : kind === 'quote'
      ? schema.node('blockquote', {}, [p('A thought worth keeping…')])
      : kind === 'task'
        ? schema.node('task_list', {}, [
            schema.node('task_item', { checked: false }, [p('Review the AI proposal')]),
            schema.node('task_item', { checked: true }, [p('Inspect what leaves the editor')]),
          ])
        : schema.node('table', {}, [
            schema.node('table_row', {}, ['Step', 'Who decides'].map((value) => schema.node('table_header', {}, [p(value)]))),
            schema.node('table_row', {}, ['Propose', 'AI adapter'].map((value) => schema.node('table_cell', {}, [p(value)]))),
            schema.node('table_row', {}, ['Apply', 'The user'].map((value) => schema.node('table_cell', {}, [p(value)]))),
          ]);
    const index = editor.state.doc.childCount;
    const transaction = editor.state.createTransaction().replace(index, index, [node]);
    const path = kind === 'callout' ? [index, 0] : kind === 'quote' ? [index, 0, 0] : kind === 'task' ? [index, 0, 0, 0] : [index, 0, 0, 0, 0];
    transaction.setSelection(Selection.cursor(path, 0));
    editor.dispatch(transaction);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="FountainJS home"><span>F</span> FountainJS</a>
        <nav><a href="#what">What it is</a><a href="#playground">Live demo</a><a href="#compare">Compare</a></nav>
        <a className="install-pill" href="https://www.npmjs.com/package/fountainjs-editor">npm i fountainjs-editor</a>
      </header>

      <section className="hero" id="top">
        <div className="hero__eyebrow"><i /> Open source · early beta</div>
        <h1>One editor core. Any framework.<br /><em>Yours to extend.</em></h1>
        <p>FountainJS is a modular rich-text engine for the browser. Use its DOM API, Web Component, or React bindings; add your own nodes, marks, commands, formats, and services; keep portable JSON on any backend.</p>
        <div className="hero__actions"><a className="primary" href="#playground">Try the workflow ↓</a><a className="secondary" href="https://github.com/eddolo/fountainjs">Read the source</a></div>
        <div className="promise-strip"><span>Framework neutral</span><span>Composable modules</span><span>Portable JSON</span><span>Web Component</span><span>MIT licensed</span></div>
      </section>

      <section className="definition" id="what">
        <div className="definition__lead">
          <span>PLAIN ENGLISH</span>
          <h2>It is a foundation, not a fixed editor product.</h2>
        </div>
        <div className="definition__answer">
          <p className="big-answer">React is one adapter. AI is one optional module. Neither one defines FountainJS.</p>
          <p>The runtime is JavaScript/TypeScript because it edits inside a browser. Its boundaries are language and framework agnostic: plain DOM and Custom Elements work across frontend stacks, while stable JSON can be stored or transformed by Python, Go, Ruby, PHP, Java, or anything else.</p>
          <div className="definition__parts">
            <article><b>01</b><h3>Small engine</h3><p>Schema, immutable document tree, selections, transactions, and a DOM view with no UI framework dependency.</p></article>
            <article><b>02</b><h3>Extension kit</h3><p>Compose nodes, marks, plugins, commands, formats, and arbitrary host services. Conflicts are explicit.</p></article>
            <article><b>03</b><h3>Choice of surface</h3><p>Use plain DOM, register a Web Component, use the React package, or build another binding over the same editor store.</p></article>
          </div>
        </div>
      </section>

      <section className="flow">
        <div className="flow__title"><span>HOW MODULARITY WORKS</span><h2>Start small. Compose exactly what belongs.</h2></div>
        <ol>
          <li><b>1</b><strong>Choose a core</strong><span>Begin with the supplied rich-document module or define a schema from scratch.</span></li>
          <li><b>2</b><strong>Add capabilities</strong><span>Install or write extensions for nodes, marks, commands, history, formats, or services.</span></li>
          <li><b>3</b><strong>Compose safely</strong><span>The kit merges named contributions and reports accidental conflicts instead of silently overriding them.</span></li>
          <li><b>4</b><strong>Pick a surface</strong><span>DOM, Web Component, React, or another adapter all subscribe to the same framework-neutral editor.</span></li>
          <li><b>5</b><strong>Own boundaries</strong><span>Persist portable JSON anywhere. Add Markdown, HTML, AI, analytics, or your own format as modules.</span></li>
        </ol>
      </section>

      <section className="playground" id="playground">
        <div className="section-heading"><div><span>LIVE PLAYGROUND</span><h2>The package running in this page.</h2></div><p>{words} words · {blocks} blocks · local demo adapter</p></div>
        <div className="demo-note"><b>Try it:</b> edit and format text, insert the custom <strong>Callout</strong> node, inspect live formats, or use the optional local AI review module. This page composes five modules.</div>
        <div className="studio">
          <aside className="studio__outline"><Navigator editor={editor} /><div className="outline-tip">Markdown shortcuts<br /><kbd>##</kbd> heading · <kbd>-</kbd> list · <kbd>&gt;</kbd> quote</div></aside>
          <div className="studio__canvas">
            <div className="quick-insert" aria-label="Insert rich content">
              <span>Insert</span>
              <button onClick={() => addBlock('quote')}>❝ Quote</button>
              <button onClick={() => addBlock('task')}>☑ Tasks</button>
              <button onClick={() => addBlock('table')}>▦ Table</button>
              <button onClick={() => addBlock('callout')}>✦ Callout</button>
            </div>
            <FountainComposer editor={editor} placeholder="Start writing…" />
          </div>
          <aside className="studio__tools">
            <div className="module-stack"><span>COMPOSED FOR THIS DEMO</span><div>{demoKit.extensions.map((extension) => <code key={extension.name}>{extension.name}</code>)}</div></div>
            <FountainAIReview controller={aiController} title="Optional AI module" />
            <section className="studio__export">
              <div className="export-head"><strong>Live document output</strong><button onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button></div>
              <div className="format-tabs">{(['markdown', 'html', 'json'] as ExportFormat[]).map((item) => <button key={item} className={format === item ? 'active' : ''} onClick={() => setFormat(item)}>{item}</button>)}</div>
              <pre><code>{output}</code></pre>
            </section>
          </aside>
        </div>
      </section>

      <section className="comparison" id="compare">
        <div className="comparison__intro"><span>HONEST COMPARISON</span><h2>Framework-neutral is not a claim that nobody else can make.</h2><p>Tiptap supports several frameworks; Plate and BlockNote are strong React choices. FountainJS focuses on a compact DOM-first core, a standards-based Custom Element, explicit extension composition, and portable data—but it is much younger.</p></div>
        <div className="comparison__table" role="table" aria-label="Rich text editor comparison">
          {competitors.map((item) => <a key={item.name} href={item.href} className="comparison__row" role="row">
            <strong role="cell">{item.name}</strong><span role="cell">{item.maturity}</span><span role="cell">{item.ai}</span><span role="cell">{item.fit}</span><i aria-hidden="true">↗</i>
          </a>)}
        </div>
        <div className="truth-cards">
          <article className="is-good"><span>FountainJS is a fit when…</span><p>You need a compact engine across multiple frontend surfaces, want extensions to stay host-controlled, prefer portable JSON and MIT licensing, and can work with an early API.</p></article>
          <article><span>Choose a mature alternative when…</span><p>You need real-time collaboration, mobile and IME battle-testing, a large plugin market, or commercial support today.</p></article>
        </div>
      </section>

      <section className="architecture">
        <div><span>THE EXTENSION CONTRACT</span><h2>Add what you need. Replace what you own.</h2></div>
        <div className="architecture__code"><pre><code>{`const callout = defineExtension({
  name: 'callout',
  nodes: { callout: calloutSpec },
  commands: { toggleCallout },
  formats: { myFormat },
  services: { analytics }
})

const kit = composeExtensions([
  CoreExtension,
  history,
  callout
])`}</code></pre></div>
        <ul><li><b>DOM first</b><span>The core editor and view do not import React or another UI framework.</span></li><li><b>Web standard</b><span>Register &lt;fountain-editor&gt; once and consume it from any Custom-Element-capable framework.</span></li><li><b>Open modules</b><span>Nodes, marks, plugins, commands, formats, and services share one composition contract.</span></li><li><b>Optional AI</b><span>The review controller and MCP adapter are example modules—not dependencies or the product identity.</span></li></ul>
      </section>

      <section className="closing"><p>npm install fountainjs-editor</p><h2>Build the editor your product needs.<br />Nothing more. Nothing locked in.</h2><a href="https://github.com/eddolo/fountainjs">Explore FountainJS on GitHub ↗</a></section>
      <footer><span>FountainJS · Built by Paolo Cappuccini</span><span>MIT · TypeScript · Open source</span></footer>
    </main>
  );
}

export default App;
