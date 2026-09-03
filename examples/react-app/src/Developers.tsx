const composeExample = `import {
  CoreExtension,
  HistoryExtension,
  MarkdownFormatExtension,
  composeExtensions,
  createEditor,
  EditorView,
} from 'fountainjs-editor'

const kit = composeExtensions([
  CoreExtension,
  HistoryExtension,
  MarkdownFormatExtension,
  myProductExtension,
])

const editor = createEditor({
  schema: kit.schema,
  plugins: kit.plugins,
  content: savedJSON,
  onUpdate: state => save(state.doc.toJSON()),
})

const view = new EditorView(mount, editor, {
  imageUpload: file => uploadToMyStorage(file),
})`;

const extensionExample = `import { defineExtension, insertNode } from 'fountainjs-editor'

export const callout = defineExtension({
  name: 'product-callout',
  nodes: {
    callout: {
      group: 'block',
      content: 'inline*',
      attrs: { tone: { default: 'info' } },
      toDOM: node => [
        'aside',
        { className: 'callout', 'data-tone': node.attrs.tone },
        0,
      ],
    },
  },
  commands: {
    insertCallout(editor, text = 'Explain this…') {
      const node = editor.state.schema.node('callout', {}, [
        editor.state.schema.text(text),
      ])
      return insertNode(editor, node)
    },
  },
  services: { telemetry: myTelemetryClient },
})`;

const transactionExample = `const transaction = editor.createTransaction()
  .replaceText([0, 0], 5, 11, 'modular')
  .setSelection(Selection.cursor([0, 0], 12))
  .setMeta('origin', 'my-command')

editor.dispatch(transaction)

// dispatch → schema validation → plugin state → subscribers → view`;

const pluginExample = `const revisionKey = new PluginKey<number>('revision')

const revisionPlugin = new Plugin({
  key: revisionKey,
  state: {
    init: () => 0,
    apply: (transaction, revision) =>
      transaction.docChanged ? revision + 1 : revision,
  },
  props: {
    handleKeyDown(editor, event) {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'k') return false
      openProductCommandMenu(editor)
      return true // FountainJS prevents the browser default
    },
  },
})`;

const nodeViewExample = `class StatusNodeView {
  dom = document.createElement('button')

  constructor(node, view, getPath) {
    this.render(node)
    this.dom.onclick = () => setNodeAttributes(
      view.editor,
      getPath(), // live after inserts, moves, and deletes before this node
      { status: 'resolved' },
    )
  }

  update(node) { this.render(node); return true }
  selectNode() { this.dom.dataset.selected = 'true' }
  deselectNode() { delete this.dom.dataset.selected }
  stopEvent(event) { return this.dom.contains(event.target) }
  ignoreMutation(record) { return record.attributeName === 'aria-expanded' }
  destroy() { this.unsubscribe?.() }
}

const statusExtension = defineExtension({
  name: 'status-node',
  nodes: {
    status_panel: { group: 'block', atom: true, nodeView: StatusNodeView },
  },
})

// React stays optional and is imported only from fountainjs-editor/react:
const ReactStatusView = createReactNodeView(StatusComponent)`;

const surfacesExample = `// Plain DOM
new EditorView(document.querySelector('#editor'), editor)

// Web Component — usable from Vue, Svelte, Angular, or plain HTML
registerFountainElement({ schema: kit.schema, plugins: kit.plugins })
const element = document.querySelector('fountain-editor')
element.value = savedJSON
element.addEventListener('fountain-change', event => save(event.detail.value))

// React (from the optional React entry point)
const reactEditor = useFountain({ schema: kit.schema, plugins: kit.plugins })
return <FountainComposer editor={reactEditor} />`;

const formatExample = `const portableFormat = {
  parse(source, schema) {
    return decodeMyFormat(source, schema)
  },
  serialize(document) {
    return encodeMyFormat(document.toJSON())
  },
}

const extension = defineExtension({
  name: 'my-format',
  formats: { portable: portableFormat },
})`;

const toc = [
  ['mental-model', 'Mental model'],
  ['system-map', 'System map'],
  ['document-model', 'Document model'],
  ['schema', 'Schema & validation'],
  ['transactions', 'Transactions'],
  ['input-view', 'Input & rendering'],
  ['extensions', 'Extensions'],
  ['surfaces', 'Framework surfaces'],
  ['formats-media', 'Formats & media'],
  ['ai-mcp', 'Optional AI & MCP'],
  ['source-tour', 'Source tour'],
  ['contributing', 'Testing & contributing'],
] as const;

function Code({ children }: { children: string }) {
  return <pre className="dev-code"><code>{children}</code></pre>;
}

function Developers() {
  return (
    <main className="developer-page">
      <header className="site-header">
        <a className="brand" href="./" aria-label="FountainJS home"><span>F</span> FountainJS</a>
        <nav><a href="#system-map">Architecture</a><a href="#extensions">Extensions</a><a href="./demos.html">10 demos</a></nav>
        <a className="install-pill" href="./#playground">Open playground</a>
      </header>

      <section className="dev-hero">
        <div className="dev-hero__copy">
          <p className="dev-kicker">FOUNTAINJS DEVELOPER GUIDE</p>
          <h1>Understand the engine.<br /><em>Then make it yours.</em></h1>
          <p>This is the implementation map for people integrating FountainJS, writing extensions, reviewing the code, or contributing to the project. It follows a real edit from browser input to validated JSON and explains where every layer can be replaced.</p>
          <div className="dev-hero__actions"><a href="#mental-model">Start with the mental model ↓</a><a href="https://github.com/eddolo/fountainjs">Browse source ↗</a></div>
        </div>
        <div className="dev-hero__facts" aria-label="Project facts">
          <span><b>0</b> runtime dependencies</span>
          <span><b>3</b> official surfaces</span>
          <span><b>6</b> extension contribution types</span>
          <span><b>1</b> portable document tree</span>
        </div>
      </section>

      <div className="dev-layout">
        <aside className="dev-toc">
          <p>ON THIS PAGE</p>
          <nav>{toc.map(([id, label], index) => <a href={`#${id}`} key={id}><b>{String(index + 1).padStart(2, '0')}</b>{label}</a>)}</nav>
          <a className="dev-toc__api" href="https://github.com/eddolo/fountainjs/blob/master/docs/API.md">API reference ↗</a>
        </aside>

        <article className="dev-content">
          <section className="dev-section" id="mental-model">
            <p className="dev-label">01 · MENTAL MODEL</p>
            <h2>A document engine with adapters around it.</h2>
            <p className="dev-lead">FountainJS is not a React component that happens to save HTML. The central object is an immutable, schema-owned document tree. Commands create transactions that transform that tree. Views render state and translate user input back into commands.</p>
            <div className="dev-principles">
              <article><b>Model first</b><span>Content exists independently of the DOM, React, a database, or an AI provider.</span></article>
              <article><b>Explicit change</b><span>Every edit is a transaction made of inspectable steps and metadata.</span></article>
              <article><b>Host owned</b><span>Your application chooses extensions, storage, media, UI, analytics, collaboration, and services.</span></article>
            </div>
            <Code>{composeExample}</Code>
          </section>

          <section className="dev-section" id="system-map">
            <p className="dev-label">02 · SYSTEM MAP</p>
            <h2>The same core drives every surface.</h2>
            <div className="system-map" role="img" aria-label="FountainJS architecture from host surfaces through the editor and state to portable formats">
              <div className="system-map__surfaces"><span>Plain DOM</span><span>Web Component</span><span>React</span><span>Your adapter</span></div>
              <i>events ↓ &nbsp; state updates ↑</i>
              <div className="system-map__engine"><b>Editor + commands</b><span>dispatch · subscribe · lifecycle</span></div>
              <i>transactions ↓</i>
              <div className="system-map__state"><span><b>EditorState</b>document · selection · stored marks</span><span><b>Plugins</b>state · input hooks · lifecycle</span><span><b>Schema</b>nodes · marks · validation</span></div>
              <i>parse / serialize ↕</i>
              <div className="system-map__boundaries"><span>JSON</span><span>Markdown</span><span>HTML</span><span>Text</span><span>Host services</span></div>
            </div>
            <p>The dependency direction is deliberate: core modules never import React. The DOM view depends on core; React wraps the DOM view; the Web Component registers the same editor/view pair as a browser standard. A future adapter only needs to subscribe to <code>Editor</code> and dispatch transactions or commands.</p>
          </section>

          <section className="dev-section" id="document-model">
            <p className="dev-label">03 · DOCUMENT MODEL</p>
            <h2>Typed nodes, inline marks, stable paths.</h2>
            <p>A document is a tree of <code>Node</code> objects. Blocks such as paragraphs, tables, lists, images, and custom callouts are nodes. Formatting such as strong, links, colour, or inline code is represented by marks on text nodes. Arrays and attributes are frozen on construction; transformations return new branches instead of mutating existing state.</p>
            <div className="dev-two-column">
              <div><h3>Addressing and selection</h3><p>Paths are child indexes from the root: <code>[2, 0, 1]</code>. The selection hierarchy distinguishes text ranges, complete nodes, structural gaps, the whole document, and rectangular table-cell regions. Every kind maps through transaction steps without pretending that its text projection is the user’s actual intent.</p></div>
              <div><h3>Portable boundary</h3><p><code>node.toJSON()</code> emits only type names, attributes, content, text, and mark data. There are no DOM nodes, React values, or class instances in persisted content.</p></div>
            </div>
            <Code>{`{
  "type": "doc",
  "content": [{
    "type": "paragraph",
    "content": [
      { "type": "text", "text": "Portable " },
      { "type": "text", "text": "and typed", "marks": [{ "type": "strong" }] }
    ]
  }]
}`}</Code>
          </section>

          <section className="dev-section" id="schema">
            <p className="dev-label">04 · SCHEMA & VALIDATION</p>
            <h2>The schema is the contract, not a suggestion.</h2>
            <p>Each node declares its group, allowed content expression, attributes, DOM representation, and optional custom NodeView. Marks declare attributes and DOM wrappers. Content expressions support names, groups, sequences, alternatives, and <code>*</code>, <code>+</code>, or <code>?</code> quantifiers.</p>
            <div className="dev-callout"><b>Validation boundary</b><span>Documents are validated when state is created, JSON is imported, and a transaction is applied. FountainJS rejects foreign-schema nodes, invalid attributes, marks on block nodes, children inside atoms, and content that does not match its expression.</span></div>
            <div className="dev-mini-grid"><span><code>block+</code> one or more blocks</span><span><code>inline*</code> zero or more inline nodes</span><span><code>paragraph (paragraph | list)*</code> sequences and alternatives</span></div>
          </section>

          <section className="dev-section" id="transactions">
            <p className="dev-label">05 · TRANSACTIONS</p>
            <h2>Every edit has one observable route.</h2>
            <ol className="dev-pipeline">
              <li><b>Command</b><span>Checks whether the operation is valid for the current state.</span></li>
              <li><b>Transaction</b><span>Collects document steps, next selection, stored marks, and host metadata.</span></li>
              <li><b>Transform</b><span>Applies immutable replace, mark, node-attribute, or structure steps in order.</span></li>
              <li><b>State</b><span>Validates the result and lets every plugin calculate its next state.</span></li>
              <li><b>Editor</b><span>Notifies subscribers and the host <code>onUpdate</code> callback.</span></li>
              <li><b>View</b><span>Renders changed documents and synchronizes the browser selection.</span></li>
            </ol>
            <Code>{transactionExample}</Code>
            <p>History is a plugin rather than hidden editor behavior. Its depth and adjacent-input delay are configurable; typing, composition, and repeated deletion form natural groups; <code>closeHistory</code> creates an explicit boundary; and undo/redo restores both document and semantic selection. This snapshot implementation is local-only until collaboration adds origin-aware rebasing.</p>
          </section>

          <section className="dev-section" id="input-view">
            <p className="dev-label">06 · INPUT & RENDERING</p>
            <h2>The browser is an interface, not the source of truth.</h2>
            <p><code>EditorView</code> mounts one accessible <code>contenteditable</code>. <code>InputManager</code> handles desktop and mobile <code>beforeinput</code> variants, alternate IME commit order, structured paste, image and selected-block drop, task toggles, list indentation, table navigation, and history input. <code>SelectionHandler</code> converts DOM ranges to logical document paths and back—including nested and bidirectional text—then renders exact node, gap, all-document, and cell selection states without storing view markers in JSON.</p>
            <p>Ctrl/Cmd+A selects the document. Clicking an atomic node or pressing Left/Right at its neighboring text boundary creates a node selection. Shift-click extends a table-cell rectangle; Alt+Shift+Arrow does the same from the keyboard. Public selection commands expose the identical behavior to plain DOM, Web Components, React, or another adapter.</p>
            <p>Rendering walks the document and asks each node/mark for a safe DOM output specification. Text wrappers carry document paths for selection recovery. URL attributes and tag names pass safety checks before reaching the DOM.</p>
            <h3>Interactive NodeViews keep identity without owning the document</h3>
            <p>A custom NodeView owns its surrounding UI while FountainJS still owns model content. Its path accessor follows transaction mapping; <code>update</code> chooses reuse or recreation; selection hooks mirror node selection; <code>stopEvent</code> protects embedded controls; and <code>ignoreMutation</code> identifies intentional local UI state. Unapproved DOM changes are restored from the document, and <code>destroy</code> releases resources exactly when the instance leaves the view.</p>
            <Code>{nodeViewExample}</Code>
            <p>For nodes with editable children, return a <code>contentDOM</code> element and leave its descendants to FountainJS. The React adapter uses separate sibling containers for React-owned controls and model-owned content, so neither renderer rewrites the other’s subtree. The live <a href="./demos/plain-dom-notes.html">plain-DOM demo</a> exercises a mapped interactive status node.</p>
            <div className="dev-callout dev-callout--mint"><b>Why controlled input?</b><span>Commands—not browser-generated HTML—decide the resulting document. That keeps undo, schema validation, portable output, cross-block selection, and multiple UI surfaces consistent.</span></div>
          </section>

          <section className="dev-section" id="extensions">
            <p className="dev-label">07 · EXTENSIONS</p>
            <h2>One composition contract for product code.</h2>
            <p>An extension may contribute <b>nodes</b>, <b>marks</b>, <b>plugins</b>, <b>commands</b>, <b>formats</b>, and arbitrary <b>services</b>. The composed kit exposes all contributions and its extension list. Duplicate extension names or contribution names throw by default; intentional replacement must be opted into.</p>
            <Code>{extensionExample}</Code>
            <h3>Behavior is modular too</h3>
            <p>List structure uses public commands too. <code>toggleList</code> wraps multiple blocks or converts only the selected item range; <code>indentListItem</code> and <code>outdentListItem</code> handle multi-item and mixed-type nesting while preserving trailing hierarchy and ordered starts. Nested HTML and Markdown use the same model, and the toolbar plus Tab/Shift+Tab routes call those commands directly.</p>
            <p><code>StarterKit</code> composes the link mark with <code>LinkBehaviorExtension</code>. It safely normalizes and validates destinations, autolinks typed web and email addresses, links selections on paste, edits or removes the complete link around a caret, and emits <code>fountain-link-activate</code> instead of forcing navigation. Replace it with <code>createLinkBehaviorExtension</code> to supply product validation and activation policies; the React toolbar uses the same public contract for add, preview, title, target, edit, and remove controls.</p>
            <p>It also composes <code>SyntaxHighlightExtension</code>. Code source, language, and the line-number preference stay portable; live tokens and number gutters are decorations that never enter JSON or model text. The included tokenizer covers common languages, while <code>createSyntaxHighlightExtension</code> accepts validated ranges from any host grammar engine. Public language and line-number commands drive the same settings shown in the React toolbar.</p>
            <p><code>TableEditingExtension</code> keeps logical grid geometry valid across rowspans and colspans. Public commands merge and split cells, toggle scoped headers, select full logical rows or columns, resize through pointer or keyboard controls, and exchange rectangular TSV/HTML clipboard data. A non-historical append transaction repairs malformed host changes before subscribers receive the final state.</p>
            <h3>First-party modules remain opt-in</h3>
            <p><code>ClipboardHistoryExtension</code> records a bounded, deduplicated list only when copy or cut originates inside that editor. Native copy/paste remains unchanged; Ctrl/Cmd+Alt+V or a public command opens the optional searchable React picker. Its default is per-editor memory, with no upload and no browser-wide clipboard access. Applications must deliberately inject any persistence adapter, and non-React surfaces can render the same immutable plugin state.</p>
            <p><code>MathExtension</code> adds inline and display TeX nodes, commands, isolated typing/paste rules, and format round trips without changing <code>StarterKit</code>. Its default NodeView keeps accessible source visible; <code>createMathExtension</code> accepts a host-owned DOM renderer, and <code>createKaTeXRenderer</code> adapts KaTeX without coupling FountainJS to that dependency. Try the complete source-to-JSON route in the <a href="./demos/node-markdown.html">headless Markdown and LaTeX demo</a>.</p>
            <p><code>LeanExtension</code> is equally optional and works source-only: portable Lean blocks, Unicode shortcuts, highlighting, and a clear <code>LeanInfoView</code> do not require a server. An injected <code>LeanProvider</code> may add mapped diagnostics, goals, hover, and completion through a local, self-hosted, managed, or one-shot service. FountainJS chooses no endpoint and stores no credentials; see the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/LEAN.md">Lean provider and security guide</a>.</p>
            <h3>Stateful behavior belongs in plugins</h3>
            <Code>{pluginExample}</Code>
            <p>Plugins can intercept keyboard, before-input, text-input, copy, cut, paste, drop, and click events, run editor create/destroy lifecycle hooks, and append validated follow-up transactions. Returning <code>true</code> tells the view the event was handled and prevents the browser default.</p>
          </section>

          <section className="dev-section" id="surfaces">
            <p className="dev-label">08 · FRAMEWORK SURFACES</p>
            <h2>Pick an adapter without changing the document.</h2>
            <Code>{surfacesExample}</Code>
            <div className="dev-two-column dev-two-column--cards">
              <div><h3>Core + DOM</h3><p>The lowest-level browser API. Own every surrounding control and subscribe directly to editor state.</p></div>
              <div><h3>Web Component</h3><p>A standards boundary with a <code>value</code> property, <code>fountain-change</code> event, and configurable schema/plugins.</p></div>
              <div><h3>React</h3><p>Hooks, composer, toolbar, navigator, clipboard picker, and optional AI review UI from <code>fountainjs-editor/react</code>.</p></div>
              <div><h3>Your framework</h3><p>Create one editor, subscribe on mount, dispatch commands from UI, and destroy both view and editor on unmount.</p></div>
            </div>
          </section>

          <section className="dev-section" id="formats-media">
            <p className="dev-label">09 · FORMATS & MEDIA</p>
            <h2>Storage and uploads stay outside the core.</h2>
            <p>JSON is lossless and is the recommended persistence format. Markdown, HTML, and text are modular boundaries for publishing and interchange. A product-specific format is just a parser/serializer pair contributed by an extension.</p>
            <Code>{formatExample}</Code>
            <p>Images support safe URLs, data URLs, captions, alt text, titles, and width metadata. By default local files become data URLs with a size limit. Pass an <code>imageUpload(file, context)</code> handler to store files anywhere and return the permanent URL/metadata. FountainJS never assumes a vendor or backend.</p>
          </section>

          <section className="dev-section" id="ai-mcp">
            <p className="dev-label">10 · OPTIONAL AI & MCP</p>
            <h2>AI proposes. The transaction system decides.</h2>
            <p>The core editor has no model dependency. <code>AIController</code> reads the current selection, sends a provider-neutral request to an adapter, and creates a before/after proposal. Accept applies a normal undoable transaction; reject changes nothing; stale proposals are refused if their target text has changed.</p>
            <p><code>MCPAIAdapter</code> is one adapter. It negotiates an MCP Streamable HTTP session, discovers tools, calls the selected tool, handles JSON or server-sent-event responses, and closes the session. Your product can instead provide a local function, HTTP service, worker, or any model SDK.</p>
            <div className="dev-callout"><b>Privacy posture</b><span>The default request contains the selected text and minimal action context—not the whole document. The host owns the adapter, endpoint, authentication, logging, and retention policy.</span></div>
          </section>

          <section className="dev-section" id="source-tour">
            <p className="dev-label">11 · SOURCE TOUR</p>
            <h2>Where to read and where to add code.</h2>
            <div className="source-list">
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/core/schema"><code>src/core/schema/</code><span>Node, mark, schema, attributes, content-expression validation.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/core/transaction"><code>src/core/transaction/</code><span>Immutable steps, paths, ranges, transforms, transaction metadata.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/src/core/commands.ts"><code>src/core/commands.ts</code><span>Text, marks, blocks, selection, document insertion, table and list commands.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/view"><code>src/view/</code><span>DOM renderer, input normalization, selection bridge, media, Web Component.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/extensions"><code>src/extensions/</code><span>Composition API plus built-in nodes, marks, formats, and plugins.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/src/extensions/math.ts"><code>src/extensions/math.ts</code><span>Opt-in TeX nodes, commands, input/paste rules, NodeViews, and renderer adapter.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/lean"><code>src/lean/</code><span>Provider-neutral Lean requests, proof-service results, validation, and stale protection.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/react"><code>src/react/</code><span>Optional React hooks and product-ready interface components.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/ai"><code>src/ai/</code><span>Provider-neutral review controller and MCP adapter.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/tests"><code>tests/</code><span>Core, extension, view, AI, and live loopback MCP behavior.</span></a>
            </div>
          </section>

          <section className="dev-section" id="contributing">
            <p className="dev-label">12 · TESTING & CONTRIBUTING</p>
            <h2>Change behavior with evidence.</h2>
            <p>Start with a failing behavior test in the closest suite. Core tests cover immutable transforms and selection semantics; view tests run the real DOM input layer in JSDOM; MCP tests include a local HTTP server through the entire connect/discover/call/apply/close lifecycle.</p>
            <Code>{`pnpm install
pnpm dev          # live website and playground
pnpm typecheck    # public and internal TypeScript contracts
pnpm test         # all behavioral suites
pnpm build        # ESM, CJS, declarations, CSS
pnpm pack:check   # inspect the npm artifact
pnpm check        # complete library release gate`}</Code>
            <div className="contribution-steps">
              <article><b>1</b><h3>Locate the boundary</h3><p>Model, command, view, extension, format, adapter, or site—not whichever file is easiest to patch.</p></article>
              <article><b>2</b><h3>Protect invariants</h3><p>Keep the document valid, state immutable, selection explicit, output safe, and framework imports isolated.</p></article>
              <article><b>3</b><h3>Prove integration</h3><p>Test the user-visible route as well as the individual unit. Add documentation when the public contract changes.</p></article>
            </div>
            <div className="dev-final"><h2>There is room to build here.</h2><p>Start with the source tour, open an issue with the behavior you want, or submit an extension with tests and a concrete example.</p><div><a href="https://github.com/eddolo/fountainjs/blob/master/CONTRIBUTING.md">Contribution guide ↗</a><a href="https://github.com/eddolo/fountainjs/issues">Open an issue ↗</a></div></div>
          </section>
        </article>
      </div>

      <footer><span>FountainJS developer guide</span><span><a href="./">Home</a> · <a href="https://github.com/eddolo/fountainjs">GitHub</a> · MIT</span></footer>
    </main>
  );
}

export default Developers;
