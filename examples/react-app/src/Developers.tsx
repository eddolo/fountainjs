import { SitePageLink } from './SitePageLink';

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
  assetUpload: (file, { kind, signal, reportProgress }) =>
    uploadAsset(file, { kind, signal, onProgress: reportProgress }),
  blockHandles: true,
})`;

const collaborationExample = `import * as Y from 'yjs'
import { CoreExtension, composeExtensions } from 'fountainjs-editor'
import { createYjsCollaborationExtension } from 'fountainjs-editor/yjs'

const ydoc = new Y.Doc()
const collaboration = createYjsCollaborationExtension({
  document: ydoc,
  provider: myAuthenticatedProvider, // optional and host-owned
  user: { id: user.id, name: user.name, color: '#6d4aff' },
})
const kit = composeExtensions([CoreExtension, collaboration])

// Use these instead of snapshot history in a shared room.
kit.commands.undoCollaboration(editor)
kit.commands.redoCollaboration(editor)`;

const commentsExample = `import {
  createCommentThread,
  createCommentsExtension,
  getCommentsState,
} from 'fountainjs-editor/comments'
import { FountainComments } from 'fountainjs-editor/react/comments'

const comments = createCommentsExtension({
  adapter: () => myAuthenticatedCommentStore.createAdapter(room.id),
  user: { id: session.user.id, name: session.user.name },
  permissions: {
    deleteThread: ({ user }) => user.role === 'owner',
  },
})

// Compose it beside core, Yjs, or any other extension.
const kit = composeExtensions([CoreExtension, collaboration, comments])

const thread = await createCommentThread(editor, {
  content: 'Can we cite this?',
  type: 'inline', // point, range, cross-block; also block or document
})
const state = getCommentsState(editor)

// Optional React surface; every operation above is framework-neutral.
<FountainComments editor={editor} title="Document review" />`;

const trackedChangesExample = `import {
  createTrackedChangesExtension,
  acceptTrackedSuggestion,
  rejectTrackedSuggestion,
  subscribeTrackedChanges,
} from 'fountainjs-editor/tracked-changes'
import { FountainTrackedChanges } from 'fountainjs-editor/react/tracked-changes'

const tracked = createTrackedChangesExtension({
  user: { id: session.user.id, name: session.user.name, color: '#6d4aff' },
})
const kit = composeExtensions([CoreExtension, collaboration, tracked])

subscribeTrackedChanges(editor, event => audit.record(event))
acceptTrackedSuggestion(editor, suggestion.id)
rejectTrackedSuggestion(editor, anotherSuggestion.id)

// Optional UI. Vue, Svelte, Angular, and DOM hosts use the same state/functions.
<FountainTrackedChanges editor={editor} title="Editorial review" />`;

const versionsExample = `import {
  VersionController,
  type VersionProvider,
} from 'fountainjs-editor/versions'
import { FountainVersions } from 'fountainjs-editor/react/versions'

const versions = new VersionController({
  editor,
  documentId: document.id,
  user: { id: session.user.id, name: session.user.name },
  provider: myAuthenticatedVersionProvider satisfies VersionProvider,
  autoSave: { delayMs: 2_000 },
})

const release = await versions.save({ name: 'Release candidate' })
await versions.preview(release.id)       // does not edit the document
await versions.compare(release.id)       // saved state → current state
await versions.restore(release.id)       // backup → restore → linked head

// Optional UI; every controller operation above is framework-neutral.
<FountainVersions controller={versions} title="Document versions" />`;

const mediaExample = `const task = startImageUpload(editor, file, {
  placement: 'block', // or 'inline'
  // Use replacePath to update an existing image safely.
  upload: async (file, { signal, reportProgress }) =>
    assets.upload(file, { signal, onProgress: reportProgress }),
})

task.subscribe(({ status, progress, error }) => {
  renderUploadState({ status, progress, error })
})

task.cancel()       // abort signal reaches the host adapter
await task.retry()  // retries the same mapped destination after failure

const assetTask = startAssetUpload(editor, mediaFile, {
  // MIME type infers audio, video, or a downloadable file.
  upload: (file, { kind, signal, reportProgress }) =>
    assets.upload(file, { kind, signal, onProgress: reportProgress }),
})`;

const extensionExample = `import {
  FOUNTAIN_EXTENSION_API_VERSION,
  defineExtension,
  insertNode,
} from 'fountainjs-editor'

export const callout = defineExtension({
  name: 'product-callout',
  manifest: {
    version: '1.0.0',
    apiVersion: FOUNTAIN_EXTENSION_API_VERSION,
    requires: ['fountain-core'],
  },
  nodes: {
    callout: {
      group: 'block',
      content: 'inline*',
      attrs: { tone: { default: 'info' } },
      parseDOM: [{
        tag: 'aside[data-callout]',
        getAttrs: element => ({ tone: element.dataset.tone ?? 'info' }),
      }],
      toDOM: node => [
        'aside',
        { className: 'callout', 'data-callout': '', 'data-tone': node.attrs.tone },
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

const extensionToolingExample = `# Generate a package without overwriting existing work
npx fountainjs-editor create-extension ./product-callout --name product-callout

# Validate the whole ordered installation before startup
npx fountainjs-editor doctor ./fountain.extensions.mjs

# The generated test imports this framework-neutral API
import { assertExtensionConformance } from 'fountainjs-editor/testing'

assertExtensionConformance(callout, {
  documents: [{ name: 'callout', document: fixture }],
  commands: [{
    name: 'insertCallout',
    args: ['Verified'],
    document: fixture,
    expectAccepted: true,
    expectDocumentChange: true,
  }],
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

const widgetExample = `// Portable definition: safe to import in Node or another renderer.
const statusWidget = defineWidget({
  name: 'status_field',
  attributes: {
    status: {
      default: 'open',
      validate: value => value === 'open' || value === 'resolved',
    },
    owner: { default: '' },
  },
  validate: ({ attributes }) =>
    attributes.status !== 'resolved' || attributes.owner
      ? true
      : 'Resolved work requires an owner.',
  keyPolicy: { Tab: 'cycle', Enter: 'allow', Escape: 'select' },
})

// React is an optional renderer; it is not a second state store.
const statusExtension = createReactWidgetExtension(
  statusWidget,
  ({ attributes, editable, validation, set }) => (
    <label>
      Status
      <select
        value={String(attributes.status)}
        disabled={!editable}
        aria-invalid={!validation.valid}
        onChange={event => set('status', event.target.value)}
      >
        <option value="open">Open</option>
        <option value="resolved">Resolved</option>
      </select>
    </label>
  ),
)

const kit = composeExtensions([
  CoreExtension,
  HistoryExtension,
  statusExtension,
])

// Plain DOM uses createDOMWidgetExtension(statusWidget, render).
// A lower-level custom NodeView remains available as the escape hatch.`;

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

const toolbarExample = `import {
  FountainComposer,
  FountainToolbarButton,
  FountainToolbarGroup,
  FountainToolbarIcon,
  FountainToolbarRoot,
} from 'fountainjs-editor/react'

// Configure the complete supplied toolbar by stable IDs.
<FountainComposer editor={editor} toolbarProps={{
  toolbarLabel: 'Article formatting',
  groups: ['marks', 'block-types', 'history'],
  actionOrder: { marks: ['highlight', 'bold', 'italic'] },
  hiddenActions: ['strike', 'subscript', 'superscript'],
  actionLabels: { bold: 'Strong emphasis' },
  actionIcons: { bold: <ProductStrongIcon aria-hidden="true" /> },
}} />

// Or assemble a product-owned toolbar around any command.
<FountainToolbarRoot label="Comment formatting">
  <FountainToolbarGroup label="Text">
    <FountainToolbarButton
      actionId="bold"
      label="Bold"
      icon={<FountainToolbarIcon name="bold" />}
      onAction={() => toggleMark(editor, 'strong')}
    />
  </FountainToolbarGroup>
</FountainToolbarRoot>`;

const blockReorderingExample = `import {
  canMoveNode,
  moveNode,
  EditorView,
} from 'fountainjs-editor'

// Paths use the current immutable document. toIndex is the final index.
const move = {
  fromPath: [2, 1],
  toParentPath: [4],
  toIndex: 0,
}
if (canMoveNode(editor, move)) moveNode(editor, move)

// The supplied UI is optional and has no React dependency.
new EditorView(mount, editor, {
  blockHandles: {
    include: ({ node, path }) =>
      path.length === 1 || node.type.name === 'list_item',
    labels: {
      drag: () => 'Drag section',
      moveBefore: () => 'Move section earlier',
      moveAfter: () => 'Move section later',
    },
  },
})

// React forwards exactly the same view option:
<FountainComposer editor={editor} blockHandles />`;

const detailsExample = `import {
  DetailsExtension,
  insertDetails,
  wrapInDetails,
} from 'fountainjs-editor/details'
import { StarterKit, composeExtensions } from 'fountainjs-editor'

const kit = composeExtensions([...StarterKit.extensions, DetailsExtension])

insertDetails(editor, {
  summary: 'Deployment notes',
  open: true,
})

// Or wrap the selected top-level blocks in one disclosure.
wrapInDetails(editor, { summary: 'Background' })`;

const textStyleExample = `import {
  getActiveTextStyle,
  setBackgroundColor,
  setFontFamily,
  setFontSize,
  setLineHeight,
  setTextColor,
} from 'fountainjs-editor/text-style'

// Commands work with React, Web Components, or any custom surface.
setFontFamily(editor, 'Atkinson Hyperlegible, sans-serif')
setFontSize(editor, '18px')
setLineHeight(editor, 1.7)
setTextColor(editor, '#17231e')
setBackgroundColor(editor, '#dff8eb')

// Common values are returned; differing values are listed in mixed.
const selectionStyle = getActiveTextStyle(editor)`;

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

const markdownBoundaryExample = `const document = MarkdownImporter.parse(source, schema)

const { markdown, losses } = MarkdownExporter.exportWithReport(document, {
  // Stable, deduplicated definitions instead of inline destinations.
  linkStyle: 'reference',
  onLoss: detail => telemetry.record('markdown-projection', detail),
})

// Each immutable loss names its kind, schema type, document path, and detail.
// Persist document.toJSON() when exact extension data must survive.`;

const migrationExample = `import { CoreSchemaSpec, Schema, createEditor } from 'fountainjs-editor'
import { encodeFountainDocument, migrateFountainDocument } from 'fountainjs-editor/migrations'

const schema = new Schema(CoreSchemaSpec)
const validate = document => { schema.nodeFromJSON(document) }
const editor = createEditor({ schema: CoreSchemaSpec })

// New writes carry a format version independent of npm package SemVer.
await database.write(id, encodeFountainDocument(editor.getJSON(), { validate }))

// Reads accept the envelope or historical bare NodeJSON, then fail closed.
const loaded = migrateFountainDocument(await database.read(id), { validate })
const reopened = createEditor({ schema: CoreSchemaSpec, content: loaded.envelope.document })`;

const stableIdentityExample = `import { CoreExtension, composeExtensions } from 'fountainjs-editor'
import {
  StableNodeIdsExtension,
  getStableNodeIdIndex,
  selectNodeById,
  updateNodeById,
} from 'fountainjs-editor/node-ids'

const kit = composeExtensions([
  CoreExtension,
  StableNodeIdsExtension,
  collaboration, // IDs normalize before the provider connects
])

const entry = getStableNodeIdIndex(editor)?.get(nodeId)
updateNodeById(editor, nodeId, { status: 'approved' })
selectNodeById(editor, nodeId)

// Duplicate IDs never silently resolve to the first match.
if (!entry) showMissingOrAmbiguousReference(nodeId)`;

const tableOfContentsExample = `import { StableNodeIdsExtension } from 'fountainjs-editor/node-ids'
import {
  TableOfContentsExtension,
  getTableOfContentsState,
  navigateTableOfContents,
} from 'fountainjs-editor/table-of-contents'

const kit = composeExtensions([
  CoreExtension,
  StableNodeIdsExtension,
  TableOfContentsExtension,
])

const outline = getTableOfContentsState(editor)
renderOutline(outline?.tree ?? [], entry => {
  navigateTableOfContents(editor, entry.id)
})`;

const integrityExample = `import { inspectTextIntegrity } from 'fountainjs-editor/integrity'
import { InvisibleCharacterExtension } from 'fountainjs-editor/integrity/dom'
import { FountainIntegrityInspector } from 'fountainjs-editor/react/integrity'

const kit = composeExtensions([
  CoreExtension,
  InvisibleCharacterExtension, // before typography and other input rewriters
  TypographyExtension,
])

const report = inspectTextIntegrity('ABC123\\u200Bxyz') // pure Node or browser
render(<FountainIntegrityInspector editor={editor} />)

// The inspector previews explicit cleanup; it never removes text automatically.`;

const structuredAttributesExample = `import {
  defineStructuredAttribute,
  insertStructuredAttributeItems,
  setStructuredAttribute,
} from 'fountainjs-editor/structured-attributes'
import { createYjsCollaborationExtension } from 'fountainjs-editor/yjs'

const boardConfig = defineStructuredAttribute({
  nodeType: 'board',
  attribute: 'config',
  root: 'object',
})

const collaboration = createYjsCollaborationExtension({
  document: ydoc,
  user,
  structuredAttributes: { definitions: [boardConfig] },
})

setStructuredAttribute(editor, [2], boardConfig, ['layout', 'columns'], 4)
insertStructuredAttributeItems(editor, [2], boardConfig, ['filters'], 1, [
  { field: 'owner', value: 'ada' },
])`;

const documentUtilitiesExample = `import {
  EmojiExtension,
  TypographyExtension,
  createCharacterCountExtension,
  createMentionExtension,
} from 'fountainjs-editor/document-utilities'
import { UnicodeEmojiExtension } from 'fountainjs-editor/emoji-data'

const mentions = createMentionExtension({
  suggestions: [{
    char: '@',
    kind: 'person',
    items: ({ query, signal }) => people.search(query, { signal }),
  }],
})

const kit = composeExtensions([
  CoreExtension,
  mentions,
  UnicodeEmojiExtension, // or the curated EmojiExtension
  TypographyExtension,
  createCharacterCountExtension({ limit: 5_000 }),
])

// Controllers are headless; React renders the optional listbox.
const mentionsUI = kit.services.mentions.getController(editor)`;

const slashCommandExample = `import {
  StarterKit,
  composeExtensions,
  createEditor,
} from 'fountainjs-editor'
import {
  SlashCommandRegistry,
  createSlashCommandExtension,
} from 'fountainjs-editor/document-utilities'

const slashCommands = new SlashCommandRegistry()

// Any product module can register and later remove its own source.
const unregister = slashCommands.registerItems('product-blocks', [{
  id: 'callout',
  label: 'Callout',
  aliases: ['notice', 'aside'],
  group: 'Product',
  run: ({ editor }) => insertCallout(editor),
}])

const slash = createSlashCommandExtension({ registry: slashCommands })
const kit = composeExtensions([...StarterKit.extensions, productBlocks, slash])
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins })

// React is optional; every surface can subscribe to this controller.
const controller = kit.services.slashCommands.getController(editor)`;

const contextualMenuExample = `import {
  createBubbleMenuExtension,
  createFloatingMenuExtension,
  getEditorMenuAnchorRect,
  placeEditorMenu,
  type FountainMenuService,
} from 'fountainjs-editor'

const selectionActions = createBubbleMenuExtension({ id: 'selection-actions' })
const emptyBlocks = createFloatingMenuExtension({
  id: 'empty-blocks',
  shouldShow: ({ defaultOpen, editor }) => defaultOpen && editor.editable,
})

const kit = composeExtensions([
  ...StarterKit.extensions,
  selectionActions,
  emptyBlocks,
])

// Any framework can subscribe and position its own surface.
const service = kit.services['bubbleMenu:selection-actions'] as FountainMenuService
const controller = service.getController(editor)
controller.subscribe(snapshot => {
  const reference = getEditorMenuAnchorRect(editorDOM, snapshot)
  if (reference) placeMyMenu(placeEditorMenu(reference, menuRect, snapshot.kind))
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
  ['persistence-releases', 'Persistence & releases'],
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
        <nav aria-label="Primary navigation"><SitePageLink href="./">Home</SitePageLink><SitePageLink href="./demos.html">10 demos</SitePageLink><SitePageLink href="./developers.html" current>Developers</SitePageLink><a className="site-section-link" href="#system-map">Architecture</a><a className="site-section-link" href="#extensions">Extensions</a></nav>
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
            <p>ProseMirror is the engine beneath Tiptap, while Tiptap adds the extension, framework, UI, and service layer above it. FountainJS independently owns both responsibilities: its path-based engine and the first-party product modules built natively around it. The <a href="https://github.com/eddolo/fountainjs/blob/master/docs/PROSEMIRROR_COMPARISON.md">full-stack comparison</a> therefore evaluates FountainJS against ProseMirror + Tiptap together, while retaining ProseMirror alone as the lower-level correctness and performance benchmark.</p>
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
            <p>The dependency direction is deliberate: core modules never import React. The DOM view depends on core; React wraps the DOM view; the Web Component registers the same editor/view pair as a browser standard. An adapter for any other framework only needs to subscribe to <code>Editor</code> and dispatch transactions or commands.</p>
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
              <li><b>Filter</b><span>Every plugin may refuse the complete change before state, history, or subscribers observe it.</span></li>
              <li><b>Transform</b><span>Applies immutable replace, mark, node-attribute, or structure steps in order.</span></li>
              <li><b>State</b><span>Validates the result and lets every plugin calculate its next state.</span></li>
              <li><b>Editor</b><span>Notifies subscribers and the host <code>onUpdate</code> callback.</span></li>
              <li><b>View</b><span>Renders changed documents and synchronizes the browser selection.</span></li>
            </ol>
            <Code>{transactionExample}</Code>
            <p>History is a plugin rather than hidden editor behavior. Its depth and adjacent-input delay are configurable; typing, composition, and repeated deletion form natural groups; <code>closeHistory</code> creates an explicit boundary; and undo/redo restores both document and semantic selection. That snapshot implementation serves local editors. A shared Yjs editor uses the separate origin-aware collaboration history, which rebases through remote work.</p>
          </section>

          <section className="dev-section" id="input-view">
            <p className="dev-label">06 · INPUT & RENDERING</p>
            <h2>The browser is an interface, not the source of truth.</h2>
            <p><code>EditorView</code> mounts one accessible <code>contenteditable</code>. <code>InputManager</code> handles desktop and mobile <code>beforeinput</code> variants, alternate IME commit order, structured paste, image/asset and schema-valid node drop, task toggles, list indentation, table navigation, and history input. <code>SelectionHandler</code> converts DOM ranges to logical document paths and back—including nested and bidirectional text—then renders exact node, gap, all-document, and cell selection states without storing view markers in JSON.</p>
            <h3>Block movement is a model command first</h3>
            <p><code>moveNode</code> names a source path, destination parent, and final child index. It rejects cycles, no-ops, read-only state, and any destination that fails the active schema before dispatching one undoable transaction. <code>canMoveNode</code> evaluates the identical operation without changing state. The optional <code>BlockHandleManager</code> mounts beside the contenteditable, follows nested model paths, highlights the complete target block on hover/focus, strengthens that state while grabbed, and keeps its before/after destination rule visually separate. Pointer drag and Space/Enter grab, Arrow movement, Escape release, or explicit touch buttons all reach the same command; controls and markers never enter document JSON, exports, NodeView DOM, or clipboard text. Try the <a href="./#playground">live homepage editor</a> and read the linked contract together.</p>
            <Code>{blockReorderingExample}</Code>
            <p>Ctrl/Cmd+A selects the document. Clicking an atomic node or pressing Left/Right at its neighboring text boundary creates a node selection. Shift-click extends a table-cell rectangle; Alt+Shift+Arrow does the same from the keyboard. Public selection commands expose the identical behavior to plain DOM, Web Components, React, or another adapter.</p>
            <p>Rendering walks the document and asks each node/mark for a safe DOM output specification. Text wrappers carry document paths for selection recovery. URL attributes and tag names pass safety checks before reaching the DOM.</p>
            <h3>Interactive widgets are portable document state, not component state</h3>
            <p><code>defineWidget</code> declares validated attributes, optional cross-field rules, block or inline structure, protected identity, format projections, and focus-exit keys without importing the DOM or React. <code>createWidgetExtension</code> adds the node and framework-neutral commands. Every accepted control update is one normal transaction, so undo, subscriptions, JSON, read-only policy, selection mapping, and Yjs all observe the same value.</p>
            <Code>{widgetExample}</Code>
            <p>The isolated <code>widgets/dom</code> and <code>react/widgets</code> entries render that same definition. They preserve a focused control across accepted updates and undo, separate renderer-owned controls from optional Fountain-owned <code>contentDOM</code> children, disable controls when read-only, implement explicit composition-aware Tab/Enter/Escape handoff, and tear down exactly once. The live <a href="./demos/plain-dom-notes.html">plain-DOM widget demo</a> and <a href="./demos/react-article.html">React widget demo</a> exercise both surfaces. Read the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/WIDGETS.md">complete widget contract</a>.</p>
            <p>Raw NodeViews remain the advanced escape hatch. Their live path follows transaction mapping; <code>update</code> chooses reuse or recreation; selection hooks mirror node selection; <code>stopEvent</code> and <code>ignoreMutation</code> define the product UI boundary; and <code>destroy</code> releases resources. For editable children, a NodeView returns a <code>contentDOM</code> whose descendants remain Fountain-owned.</p>
            <div className="dev-callout dev-callout--mint"><b>Why controlled input?</b><span>Commands—not browser-generated HTML—decide the resulting document. That keeps undo, schema validation, portable output, cross-block selection, and multiple UI surfaces consistent.</span></div>
          </section>

          <section className="dev-section" id="extensions">
            <p className="dev-label">07 · EXTENSIONS</p>
            <h2>One composition contract for product code.</h2>
            <p>An extension may contribute <b>nodes</b>, <b>marks</b>, <b>plugins</b>, <b>commands</b>, <b>formats</b>, and arbitrary <b>services</b>. The composed kit exposes all contributions and its extension list. Duplicate extension names or contribution names throw by default; intentional replacement must be opted into.</p>
            <Code>{extensionExample}</Code>
            <h3>Generate it, test it, diagnose the complete installation</h3>
            <p>Published extensions carry a SemVer manifest, an exact Fountain extension API version, and ordered runtime requirements. The generator creates a typed package and refuses non-empty destinations. The isolated conformance entry verifies real schema round-trips, non-mutating command dry-runs, executable behavior, and teardown without React. <code>doctor</code> then checks the whole ordered set and reports every invalid manifest, missing dependency, duplicate name, and contribution collision before an editor starts. Read the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/EXTENSIONS.md">complete authoring, compatibility, migration, and publishing contract</a>.</p>
            <Code>{extensionToolingExample}</Code>
            <h3>Behavior is modular too</h3>
            <p>List structure uses public commands too. <code>toggleList</code> wraps multiple blocks or converts only the selected item range; <code>indentListItem</code> and <code>outdentListItem</code> handle multi-item and mixed-type nesting while preserving trailing hierarchy and ordered starts. Nested HTML and Markdown use the same model, and the toolbar plus Tab/Shift+Tab routes call those commands directly.</p>
            <p><code>StarterKit</code> composes the link mark with <code>LinkBehaviorExtension</code>. It safely normalizes and validates destinations, autolinks typed web and email addresses, links selections on paste, edits or removes the complete link around a caret, and emits <code>fountain-link-activate</code> instead of forcing navigation. Replace it with <code>createLinkBehaviorExtension</code> to supply product validation and activation policies; the React toolbar uses the same public contract for add, preview, title, target, edit, and remove controls.</p>
            <p>It also composes <code>SyntaxHighlightExtension</code>. Code source, language, and the line-number preference stay portable; live tokens and number gutters are decorations that never enter JSON or model text. The included tokenizer covers common languages, while <code>createSyntaxHighlightExtension</code> accepts validated ranges from any host grammar engine. Public language and line-number commands drive the same settings shown in the React toolbar.</p>
            <p><code>TableEditingExtension</code> keeps logical grid geometry valid across rowspans and colspans. Public commands merge and split cells, toggle scoped headers, select full logical rows or columns, resize through pointer or keyboard controls, and exchange rectangular TSV/HTML clipboard data. A non-historical append transaction repairs malformed host changes before subscribers receive the final state.</p>
            <h3>Details are document content, not hidden UI state</h3>
            <p>The isolated <code>fountainjs-editor/details</code> entry adds semantic <code>details</code> and <code>details_summary</code> nodes without changing <code>StarterKit</code>. The editable summary supports inline marks; the body accepts any configured block, including nested disclosures. Native click or tap, Ctrl/Cmd+Enter, and public commands persist the open state in the portable document. Read-only readers can still open it locally without causing an edit.</p>
            <Code>{detailsExample}</Code>
            <p>Insert, top-level wrap, unwrap, and explicit open-state commands each dispatch one validated transaction, so history, subscriptions, tracked changes, and generic Yjs synchronization keep working. JSON is exact; safe HTML uses native <code>&lt;details&gt;</code> / <code>&lt;summary&gt;</code>; Markdown uses the same semantic HTML form; text keeps summary and body readable. See the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/DETAILS.md">complete schema, keyboard, interchange, and accessibility guide</a>.</p>
            <h3>Complete text styles are typed document data</h3>
            <p><code>CoreExtension</code> and <code>StarterKit</code> include independent marks for foreground colour, background colour, font family, font size, and line height. The <code>fountainjs-editor/text-style</code> entry exposes the same validated specs plus framework-neutral setters, removers, normalizers, and mixed-selection inspection for custom kits and interfaces.</p>
            <Code>{textStyleExample}</Code>
            <p>Each command follows the ordinary selection and transaction path, including multi-paragraph, node, cell, and all-document selections, stored marks at a caret, history, and generic Yjs synchronization. Values are canonical and bounded before entering JSON or CSS. JSON is exact; safe HTML and Fountain Markdown round-trip every style in browsers and headless Node.js; plain text deliberately keeps only readable characters. The supplied React panel is one optional consumer of this API. See the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/TEXT_STYLE.md">complete text-style contract</a>.</p>
            <h3>Stable identities outlive document paths</h3>
            <p>The opt-in <code>fountainjs-editor/node-ids</code> entry assigns portable <code>nodeId</code> values to blocks, maintains an immutable O(1) lookup index, and exposes path-independent update and selection commands. Missing, malformed, or copied duplicate IDs repair in one position-neutral step without becoming a second undo action. Duplicate lookup fails closed. Hosts may choose node types, filter extension nodes, and inject their own ID generator.</p>
            <Code>{stableIdentityExample}</Code>
            <p>Canonical JSON and generic Yjs preserve identities as ordinary validated attributes. If an older peer introduces a duplicate, an identity-aware peer deterministically repairs the shared document and publishes the correction. Stored JSON can be inspected and normalized in pure Node without jsdom; HTML and Markdown deliberately do not claim to preserve private application IDs. Try the IDs in the live JSON output of the <a href="./demos/go-docs-service.html">Go documentation-service demo</a>, or read the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/NODE_IDS.md">complete identity and migration contract</a>.</p>
            <h3>The live outline is derived, not duplicated document state</h3>
            <p>The optional <code>fountainjs-editor/table-of-contents</code> entry builds immutable flat and hierarchical heading indexes, stable anchors, current paths and positions, and selection-driven active state without reading the DOM. Compose it after stable node IDs so editing or moving a heading changes its title and location without breaking external links. Custom renderers call the same model navigation command.</p>
            <Code>{tableOfContentsExample}</Code>
            <p>The outline beside the <a href="./#playground">homepage editor</a> is the working React adapter: it exposes normalized hierarchy, complete hover titles, <code>aria-current</code>, and scroll-to-heading behavior over the shared state. Headless Node applications can build the same index without jsdom. Read the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/TABLE_OF_CONTENTS.md">complete state, renderer, identity, and persistence contract</a>.</p>
            <h3>Invisible text is inspectable, never silently “fixed”</h3>
            <p>The optional <code>fountainjs-editor/integrity</code> entry reports exact Unicode code points, UTF-8 bytes, line endings, normalization, zero-width characters, BOM, NBSP, bidi controls, tabs, and invalid surrogates without a DOM. Its sanitizer only creates an immutable preview from explicitly selected categories; applying a selection preview fails closed if the text or range changed.</p>
            <Code>{integrityExample}</Code>
            <p>The DOM extension adds bounded view-only markers and literal input in eligible code/verbatim blocks. The separately imported React inspector is a replaceable reference interface, not part of the default React entry. Select the integrity sample in the <a href="./#playground">live homepage editor</a>, or read the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/TEXT_INTEGRITY.md">complete integrity, byte-provenance, and security contract</a>.</p>
            <h3>Nested product state can merge field by field</h3>
            <p>The isolated <code>fountainjs-editor/structured-attributes</code> entry defines bounded object/array attributes and path-based set, delete, insert, and range-delete commands without importing Yjs or a browser. Every accepted change remains one schema-validated Fountain transaction and ordinary JSON.</p>
            <Code>{structuredAttributesExample}</Code>
            <p>Opting the same definitions into the Yjs adapter mirrors those selected values into nested <code>Y.Map</code> and <code>Y.Array</code> trees addressed by stable node ID. Separate nested keys and concurrent list insertions survive; same-leaf edits remain real deterministic conflicts. Local undo preserves a peer’s field, hostile shared values fail closed, and the canonical flat attribute is repaired after convergence. Exercise the controls beneath the <a href="./#collaboration">two-editor demo</a>, or read the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/STRUCTURED_ATTRIBUTES.md">complete concurrency and rollout contract</a>.</p>
            <h3>First-party modules remain opt-in</h3>
            <p>Mentions, emoji, typography, character limits, and slash commands live in the optional <code>fountainjs-editor/document-utilities</code> entry. Mention, emoji, and slash queries use one headless, abortable suggestion controller with stale-result protection; React menus are merely renderers over that state. <code>EmojiExtension</code> keeps a curated catalogue, while <code>fountainjs-editor/emoji-data</code> offers more than 1,900 searchable RGI base entries without loading them into applications that do not ask for them. Typography rules are individually replaceable or removable, and character limits are enforced through the public transaction-filter contract.</p>
            <Code>{documentUtilitiesExample}</Code>
            <h3>Slash commands are a live extension point</h3>
            <p><code>SlashCommandRegistry</code> combines the eleven supplied block actions with static product items or cancellable asynchronous sources. Search ranks exact aliases, prefixes, and multi-term matches while preserving stable source order. Registering or removing a module refreshes an open menu. Acceptance removes the literal query and runs the action in one command batch, so failure or a transaction filter restores the complete previous state.</p>
            <Code>{slashCommandExample}</Code>
            <h3>Contextual menus keep state separate from UI</h3>
            <p><code>BubbleMenuExtension</code> derives eligibility from text, node, or cell selections; <code>FloatingMenuExtension</code> targets an empty nearest block. Both expose framework-neutral controllers with named instances, dismissal, teardown, read-only policy, and contained <code>shouldShow</code> errors. The reusable DOM helper resolves Fountain paths into real selection geometry, while a separate placement function flips and clamps any host surface. React’s optional renderers add focused, labelled toolbars, resize/scroll observation, arrow-key navigation, and Escape—without deciding which product actions belong inside.</p>
            <Code>{contextualMenuExample}</Code>
            <p><code>ClipboardHistoryExtension</code> records a bounded, deduplicated list only when copy or cut originates inside that editor. Native copy/paste remains unchanged; Ctrl/Cmd+Alt+V or a public command opens the optional searchable React picker. Its default is per-editor memory, with no upload and no browser-wide clipboard access. Applications must deliberately inject any persistence adapter, and non-React surfaces can render the same immutable plugin state.</p>
            <p><code>MathExtension</code> adds inline and display TeX nodes, commands, isolated typing/paste rules, and format round trips without changing <code>StarterKit</code>. Its default NodeView keeps accessible source visible; <code>createMathExtension</code> accepts a host-owned DOM renderer, and <code>createKaTeXRenderer</code> adapts KaTeX without coupling FountainJS to that dependency. Try the complete source-to-JSON route in the <a href="./demos/node-markdown.html">headless Markdown and LaTeX demo</a>.</p>
            <p><code>LeanExtension</code> is equally optional and works source-only: portable Lean blocks, Unicode shortcuts, highlighting, and a clear <code>LeanInfoView</code> do not require a server. An injected <code>LeanProvider</code> may add mapped diagnostics, goals, hover, and completion through a local, self-hosted, managed, or one-shot service. FountainJS chooses no endpoint and stores no credentials; see the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/LEAN.md">Lean provider and security guide</a>.</p>
            <h3>Collaboration is a replaceable boundary</h3>
            <p><code>createCollaborationExtension</code> owns validated remote application, status, no-echo lifecycle, normalized presence, and accessible caret/range decorations without choosing a transport. The optional <code>fountainjs-editor/yjs</code> entry maps generic Fountain nodes onto shared XML elements, character-level shared text, optional stable-ID-addressed nested attributes, relative selections, and a local-origin undo manager. The application supplies a WebSocket, WebRTC, managed, custom, or no provider; it also owns authentication, room authorization, offline persistence, and retention.</p>
            <Code>{collaborationExample}</Code>
            <p>Incoming shared trees must validate against the complete local schema before they replace editor state. Custom node types therefore work generically when every client composes the same extension, while an incompatible or hostile client fails closed. The <a href="https://github.com/eddolo/fountainjs/blob/master/docs/COLLABORATION.md">collaboration guide</a> documents the shared representation, provider contract, security rules, simultaneous-room initialization, relative presence, and undo behavior.</p>
            <h3>Performance is a release contract</h3>
            <p>Small edits reuse immutable validated subtrees and unchanged block DOM. Provider deltas can enter as current-state transactions; the Yjs adapter maps text-only changes directly instead of rebuilding the complete JSON tree. CI measures local, incremental-remote, and untrusted-snapshot curves through 10,000 blocks, live-session and teardown memory, raw startup size, React NodeView churn, and real input-to-paint in Chromium, Firefox, and WebKit. Read the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/PERFORMANCE.md">methodology, ceilings, measurements, and honest limits</a>.</p>
            <h3>Comments are document-aware, but storage-neutral</h3>
            <p>The isolated <code>fountainjs-editor/comments</code> entry keeps thread records outside the document while mapping inline, cross-block, point, block, and document anchors through accepted transactions. Overlapping annotations are normal decorations. If replacement content removes an anchor, deterministic quote/context or block-fingerprint recovery runs; an unsafe match stays visibly orphaned until a reviewer reattaches it.</p>
            <Code>{commentsExample}</Code>
            <p>Every reply, edit, reaction, resolve, archive, delete, and anchor update waits for an authoritative <code>CommentsAdapter</code> result. A REST API, database, CRDT map, local store, or another service can implement that small boundary. <code>InMemoryCommentsStore</code> is supplied for local products and tests. Browser permission predicates keep the interface consistent, but the authenticated adapter service must authorize operations, validate payloads, deduplicate operation IDs, and resolve revisions. The optional <code>fountainjs-editor/react/comments</code> panel is one accessible renderer, not a requirement. Read the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/COMMENTS.md">comments architecture and security guide</a>.</p>
            <h3>Tracked changes keep both sides of a decision</h3>
            <p>The isolated <code>fountainjs-editor/tracked-changes</code> entry transforms any normal schema-valid transaction into bounded portable review metadata. Insertions, retained deletions, exact replacements, mark changes, node attributes, atoms, tables, and structural changes share one resolver. Author, timestamps, an optional reason, and an optional discussion id travel in FountainJSON and through Yjs; receiving peers never re-author remote work.</p>
            <Code>{trackedChangesExample}</Code>
            <p>A transaction filter prepares and validates the complete review document before the raw edit enters state. The appended representation preserves the logical selection and normal history group. Accept/reject is a pure document rewrite and can target one id, a range, an author, a filter, or everything. The optional React panel shows complete wrapping/scrollable text and full identities rather than hiding the decision behind ellipses. Read the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/TRACKED_CHANGES.md">representation, API, collaboration, and security guide</a>.</p>
            <h3>Named versions are durable checkpoints, not undo history</h3>
            <p>The isolated <code>fountainjs-editor/versions</code> entry stores no data by itself. <code>VersionController</code> sends bounded portable JSON to a replaceable <code>VersionProvider</code>, validates everything returned, detects stale heads through optimistic concurrency, and makes repeated operation IDs exactly idempotent. Manual and debounced automatic versions share one model; list reads are paginated and cancellable.</p>
            <Code>{versionsExample}</Code>
            <p>Preview never mutates the editor. Comparison returns exact text, mark, attribute, and structural node changes. Default restoration saves dirty current work as a backup, replaces the document in one undoable transaction, and writes a new head linked to the source. It bypasses tracked-change attribution while remaining a normal collaboration-visible edit. The optional React panel wraps complete names and values and requires a second explicit click before restore or delete. Read the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/VERSIONS.md">provider, failure, consistency, and security guide</a>.</p>
            <h3>Stateful behavior belongs in plugins</h3>
            <Code>{pluginExample}</Code>
            <p>Plugins can intercept keyboard, before-input, text-input, copy, cut, paste, drop, and click events, run editor create/destroy lifecycle hooks, refuse complete transactions with <code>filterTransaction</code>, and append validated follow-up transactions. Dispatch resolves accepted follow-ups first; subscribers receive one complete mapped transaction and the final state. Returning <code>true</code> tells the view the event was handled and prevents the browser default.</p>
          </section>

          <section className="dev-section" id="surfaces">
            <p className="dev-label">08 · FRAMEWORK SURFACES</p>
            <h2>Pick an adapter without changing the document.</h2>
            <h3>The visible editor is yours</h3>
            <p>FountainJS does not impose a visual shell. The supplied components and stylesheet are optional implementations of public state and commands. Keep and restyle them, replace individual controls, or supply every toolbar, menu, dialog, outline, block handle, icon, and NodeView yourself. Omitting Fountain CSS or changing the complete interface never changes the document model or portable JSON.</p>
            <Code>{surfacesExample}</Code>
            <div className="dev-two-column dev-two-column--cards">
              <div><h3>Core + DOM</h3><p>The lowest-level browser API. Own every surrounding control and subscribe directly to editor state.</p></div>
              <div><h3>Web Component</h3><p>A standards boundary with a <code>value</code> property, <code>fountain-change</code> event, and configurable schema/plugins.</p></div>
              <div><h3>React</h3><p>Hooks, composer, toolbar, navigator, clipboard picker, accessible suggestion/slash/bubble/floating menus and character count, plus optional AI review UI from <code>fountainjs-editor/react</code>. Discussions, tracked review, versions, and text-integrity inspection are isolated in <code>fountainjs-editor/react/comments</code>, <code>fountainjs-editor/react/tracked-changes</code>, <code>fountainjs-editor/react/versions</code>, and <code>fountainjs-editor/react/integrity</code>.</p></div>
              <div><h3>Your framework</h3><p>Create one editor, subscribe on mount, dispatch commands from UI, and destroy both view and editor on unmount.</p></div>
            </div>
            <h3>The supplied toolbar is composable, not mandatory</h3>
            <p>The React toolbar maps stable group and action IDs onto the same public commands used by every other surface. Products can change group/action order, visibility, labels, icons, and rendering through <code>FountainComposer.toolbarProps</code>, or compose the root/group/button primitives directly. Built-in buttons keep the model selection intact, publish pressed and disabled states, offer complete names and hover titles, traverse with RTL-aware Arrow/Home/End keys, and scroll by intact groups on narrow screens.</p>
            <Code>{toolbarExample}</Code>
            <p>Plain DOM, Vue, Svelte, Angular, and Web Component hosts do not need a hidden React toolbar service: subscribe to <code>editor.state</code>, derive active/disabled state, and call the framework-neutral commands directly. The complete ID registry and replacement contract are in the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/TOOLBAR.md">toolbar guide</a>.</p>
            <h3>Handles are optional; nested movement is core</h3>
            <p>Pass <code>blockHandles</code> to <code>EditorView</code>, <code>FountainEditor</code>, <code>FountainComposer</code>, or <code>registerFountainElement</code>. The supplied contextual toolbar adds full-block target/grab feedback, a native handle, a separate schema-valid before/after indicator, and full-name move buttons with 44px coarse-pointer targets and keyboard traversal. Candidate and label functions are product-owned. A Vue, Svelte, Angular, Web Component, or plain-DOM product can also render entirely different controls around <code>canMoveNode</code> / <code>moveNode</code>. Try it in the <a href="./#playground">live homepage editor</a>, then read the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/BLOCK_REORDERING.md">complete reordering contract</a>.</p>
          </section>

          <section className="dev-section" id="formats-media">
            <p className="dev-label">09 · FORMATS & MEDIA</p>
            <h2>Storage and uploads stay outside the core.</h2>
            <p>JSON is lossless and is the recommended persistence format. Markdown, HTML, and text are modular boundaries for publishing and interchange. A product-specific format is just a parser/serializer pair contributed by an extension.</p>
            <p>HTML is extension-aware rather than a fixed built-in switch. A node or mark can pair its safe <code>toDOM</code> output with priority-ordered, platform-neutral <code>parseHTML</code> rules that match a CSS selector, recover validated attributes, and optionally identify a nested content element. Existing browser-only <code>parseDOM</code> rules remain compatible. Invalid selectors, callback failures, unsafe attributes, executable output tags, and schema-invalid content fail closed; the complete imported tree is validated before paste or API callers receive it. Copying between compatible Fountain editors additionally uses a versioned, schema-validated JSON clipboard flavor for exact nodes, marks, attributes, media, tables, and custom atoms. Clean semantic HTML and readable text are written alongside it for external rich and plain-text editors, and become the safe fallback when the receiver lacks an extension.</p>
            <h3>Server HTML does not pretend Node is a browser</h3>
            <p>Import <code>ServerHTMLImporter</code> from <code>fountainjs-editor/html/server</code> to turn HTML into the same schema-validated document in Node.js without <code>window</code>, <code>document</code>, <code>DOMParser</code>, jsdom, or another fake DOM. The isolated entry is dynamically loadable, reports unsupported legacy DOM callbacks instead of executing them, and enforces explicit input, node, depth, attribute, and parser-error limits. Browser and server fixtures must produce identical JSON for every portable rule. Try it in the <a href="./demos/node-markdown.html">server document conversion demo</a>, then read the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/SERVER_HTML.md">complete API, limits, compatibility, and security contract</a>.</p>
            <p>Markdown accepts titled inline links and full, collapsed, or shortcut references; recursive quotes; loose nested lists; and aligned tables with escaped pipes. Reference export is stable and deduplicated. Because Markdown cannot encode every schema, <code>exportWithReport</code> returns path-based losses for projected nodes, marks, and attributes instead of silently pretending the conversion is exact. The callback is observational and cannot break serialization.</p>
            <Code>{markdownBoundaryExample}</Code>
            <Code>{formatExample}</Code>
            <p>Block images support editable captions, alt text, titles, alignment, responsive source sets, explicit dimensions, load recovery, and pointer, touch, or keyboard resizing. <code>inline_image</code> is a separate typed node that can sit between text. Both are selectable and portable through JSON and HTML.</p>
            <Code>{mediaExample}</Code>
            <p><code>MediaExtension</code>, included in <code>StarterKit</code>, adds typed native audio/video with tracks and playback policy, downloadable file cards, and titled embeds. Default embeds are fail-closed: public YouTube URLs become privacy-enhanced <code>youtube-nocookie.com</code> frames, Vimeo becomes <code>player.vimeo.com</code>, and every other origin is refused. <code>createMediaExtension</code> lets a host replace that allowlist with explicit provider resolvers and validated sandbox/permission tokens.</p>
            <p>Upload progress, errors, cancellation, and retry stay transient. The intended insertion or replacement target maps through edits made during the upload; if a replacement node is deleted, the response fails closed instead of overwriting another node. By default only small local images become size-limited data URLs. Audio, video, and files require <code>assetUpload(file, context)</code>, so the host keeps responsibility for storage, authorization, malware scanning, content types, and URL lifetime. Credentials and <code>File</code> objects never enter FountainJS configuration or document state.</p>
          </section>

          <section className="dev-section" id="persistence-releases">
            <p className="dev-label">10 · PERSISTENCE & RELEASES</p>
            <h2>Stored documents have their own explicit lifetime.</h2>
            <p>npm package versions, the Fountain extension API integer, and the persisted document format version answer different questions. New records use a small <code>{'{ format, version, document }'}</code> envelope. Historical bare <code>NodeJSON</code> remains readable as format version 1, unknown future versions are rejected, and every format change must advance through one deterministic application-owned step per version.</p>
            <Code>{migrationExample}</Code>
            <p>The migration entry is DOM-independent and has no global registry. It clones and freezes portable input, bounds depth and size, rejects ambiguous or invalid values, and asks the receiving application schema to validate the final document. Extensions may export pure migration helpers, but the application composes the one authoritative chain so ordering cannot depend on package discovery. Read the <a href="https://github.com/eddolo/fountainjs/blob/master/docs/MIGRATIONS.md">complete migration and safe-deployment contract</a>.</p>
            <h3>Compatibility is checked before publication</h3>
            <p>The release gate compares every declaration reachable from every public package entry against the reviewed API snapshot, checks the exact package-version/tag/changelog relationship, imports the packed ESM and CommonJS package, validates every export with publint and Are the Types Wrong, enforces bundle/performance budgets, and runs Node plus real Chromium, Firefox, WebKit, Pixel, and iPhone contracts. npm uses trusted-publisher OIDC and provenance; there is no long-lived npm token in GitHub. The <a href="https://github.com/eddolo/fountainjs/blob/master/docs/RELEASES.md">release policy</a> defines deprecations, rollback, and security support.</p>
            <div className="dev-callout"><b>Portability status</b><span>The model, schema, logical selection, transactions, history, extension composition, serialization, Yjs synchronization, and the isolated server HTML importer run in pure Node today. The main public declaration graph still exposes some DOM contracts, so FountainJS does not yet claim a clean native-renderer core package. The evidence-backed <a href="https://github.com/eddolo/fountainjs/blob/master/docs/PORTABILITY_AUDIT.md">portability audit</a> lists every remaining dependency and the smallest boundary changes; native renderers are not claimed today.</span></div>
          </section>

          <section className="dev-section" id="ai-mcp">
            <p className="dev-label">11 · OPTIONAL AI & MCP</p>
            <h2>AI proposes. The transaction system decides.</h2>
            <p>The core editor has no model dependency. <code>AIController</code> reads the current selection, sends a provider-neutral request to an adapter, and creates a before/after proposal. Ordinary adapters return once; streaming adapters yield bounded append-only deltas into a cancellable transient preview. Neither route edits the document while generating. Accept appears only after completion and applies one normal undoable transaction; reject changes nothing; stale proposals are refused if their target text has changed.</p>
            <p><code>MCPAIAdapter</code> is one adapter. It negotiates an MCP Streamable HTTP session, discovers tools, calls the selected tool, handles JSON or server-sent-event responses, and closes the session. Your product can instead provide a local function, HTTP service, worker, or any model SDK.</p>
            <h3>Structured agents get tools, not unrestricted editor access</h3>
            <p>The isolated DOM-free <code>fountainjs-editor/ai/document-tools</code> entry describes five portable calls: bounded path/schema reads plus insert, replace, format, and structure proposals. Mutation calls run against an isolated transaction and validate the actual host schema, but cannot touch the editor. The host reviews a proposal and explicitly accepts it as one stale-checked undoable transaction or rejects it without change. Allowlists, payload/read/operation/proposal limits, and declared-attribute policy stay application-owned. The <a href="https://github.com/eddolo/fountainjs/blob/master/docs/AI_DOCUMENT_TOOLS.md">complete guide</a> includes the adapter and security contract.</p>
            <div className="dev-callout"><b>Privacy posture</b><span>The default request contains the selected text and minimal action context—not the whole document. The host owns the adapter, endpoint, authentication, logging, and retention policy.</span></div>
          </section>

          <section className="dev-section" id="source-tour">
            <p className="dev-label">12 · SOURCE TOUR</p>
            <h2>Where to read and where to add code.</h2>
            <div className="source-list">
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/core/schema"><code>src/core/schema/</code><span>Node, mark, schema, attributes, content-expression validation.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/core/transaction"><code>src/core/transaction/</code><span>Immutable steps, paths, ranges, transforms, transaction metadata.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/src/html/server.ts"><code>src/html/server.ts</code><span>DOM-free HTML parsing, portable extension rules, bounded traversal, recovery reports, and final schema validation.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/SERVER_HTML.md"><code>docs/SERVER_HTML.md</code><span>Server entry point, custom-rule contract, resource limits, compatibility, security, and runtime support.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/src/core/commands.ts"><code>src/core/commands.ts</code><span>Text, marks, blocks, selection, document insertion, table and list commands.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/view"><code>src/view/</code><span>DOM renderer, input normalization, selection bridge, media, Web Component.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/src/view/block-handles.ts"><code>src/view/block-handles.ts</code><span>Optional contextual controls, nested path targeting, schema-valid indicators, and touch/keyboard movement.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/extensions"><code>src/extensions/</code><span>Composition API plus built-in nodes, marks, formats, media providers, and plugins.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/testing"><code>src/testing/</code><span>Framework-neutral extension conformance and whole-installation compatibility diagnostics.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/migrations"><code>src/migrations/</code><span>DOM-independent document envelopes, bounded portable input, and deterministic sequential migrations.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/node-ids"><code>src/node-ids/</code><span>DOM-independent identity policy, deterministic repair, immutable lookup, editor commands, and JSON normalization.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/NODE_IDS.md"><code>docs/NODE_IDS.md</code><span>Composition, ID policy, lookup, history, mixed-client collaboration, migration, performance, and limits.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/structured-attributes"><code>src/structured-attributes/</code><span>DOM-free structured-value contracts, recursive limits, validation, typed-path commands, and transaction metadata.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/STRUCTURED_ATTRIBUTES.md"><code>docs/STRUCTURED_ATTRIBUTES.md</code><span>Nested Yjs representation, concurrency matrix, undo, JSON compatibility, rollout, safety, and current boundaries.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/widgets"><code>src/widgets/</code><span>Portable widget definitions and commands plus isolated DOM lifecycle, focus, keyboard, and read-only behavior.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/WIDGETS.md"><code>docs/WIDGETS.md</code><span>Widget state, validation, renderers, history, collaboration, accessibility, formats, and current limits.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/EXTENSIONS.md"><code>docs/EXTENSIONS.md</code><span>Scaffold, manifests, requirements, fixtures, doctor, compatibility, migrations, and publishing contract.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/MIGRATIONS.md"><code>docs/MIGRATIONS.md</code><span>Document versions, extension helpers, schema validation, and safe deployment order.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/RELEASES.md"><code>docs/RELEASES.md</code><span>API stability, deprecation, evidence, trusted publishing, rollback, and security support.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/PORTABILITY_AUDIT.md"><code>docs/PORTABILITY_AUDIT.md</code><span>Every browser dependency, owning layer, pure-Node probe, platform matrix, and minimum neutral-core boundary.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/ROADMAP.md"><code>docs/ROADMAP.md</code><span>Prioritized opportunities, current baselines, required proof, and unverified research leads.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/text-style"><code>src/text-style/</code><span>Validated style values, selection inspection, and framework-neutral set/unset commands.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/TEXT_STYLE.md"><code>docs/TEXT_STYLE.md</code><span>Schema, commands, controls, sanitization, interchange, frameworks, and collaboration contract.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/details"><code>src/details/</code><span>Optional details/summary schema, commands, native NodeView, keyboard behavior, and interchange contract.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/DETAILS.md"><code>docs/DETAILS.md</code><span>Composition, document shape, commands, accessibility, collaboration, safety, and current boundaries.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/PROSEMIRROR_COMPARISON.md"><code>docs/PROSEMIRROR_COMPARISON.md</code><span>Engine relationship, one-to-one architecture comparison, compatibility boundaries, strengths, and maturity gaps.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/src/extensions/collaboration.ts"><code>src/extensions/collaboration.ts</code><span>Provider-neutral lifecycle, validated remote changes, presence decorations, and collaboration commands.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/yjs"><code>src/yjs/</code><span>Optional CRDT tree conversion, relative positions, and origin-aware undo.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/COLLABORATION.md"><code>docs/COLLABORATION.md</code><span>Provider, authentication, persistence, awareness, security, and shared-state contracts.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/comments"><code>src/comments/</code><span>Optional thread data, mapped anchors, provider operations, permissions, lifecycle, and in-memory adapter.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/COMMENTS.md"><code>docs/COMMENTS.md</code><span>Production storage, security, anchor recovery, rich content, framework UI, and Yjs composition.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/tracked-changes"><code>src/tracked-changes/</code><span>Portable suggestion records, preflight diffing, accept/reject resolution, queries, events, and collaboration-safe metadata.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/TRACKED_CHANGES.md"><code>docs/TRACKED_CHANGES.md</code><span>Review representation, commands, UI, comments/Yjs composition, validation, and production authorization.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/versions"><code>src/versions/</code><span>Named snapshot records, provider consistency, exact comparison, preview, autosave, permissions, and safe restore.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/VERSIONS.md"><code>docs/VERSIONS.md</code><span>Complete provider, UI, framework, restoration, failure, and production security contract.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/src/extensions/suggestion.ts"><code>src/extensions/suggestion.ts</code><span>Headless trigger matching, cancellable providers, stale-result protection, selection, and query decorations.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/DOCUMENT_UTILITIES.md"><code>docs/DOCUMENT_UTILITIES.md</code><span>Complete mention, emoji, typography, counting, React accessibility, and interchange contracts.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/docs/SLASH_COMMANDS.md"><code>docs/SLASH_COMMANDS.md</code><span>Runtime registrations, async sources, filtering, atomic execution, UI, and lifecycle contracts.</span></a>
              <a href="https://github.com/eddolo/fountainjs/blob/master/src/extensions/math.ts"><code>src/extensions/math.ts</code><span>Opt-in TeX nodes, commands, input/paste rules, NodeViews, and renderer adapter.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/lean"><code>src/lean/</code><span>Provider-neutral Lean requests, proof-service results, validation, and stale protection.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/react"><code>src/react/</code><span>Optional React hooks and product-ready interface components.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/src/ai"><code>src/ai/</code><span>Provider-neutral review, streaming, schema-aware document tools, and MCP adapter.</span></a>
              <a href="https://github.com/eddolo/fountainjs/tree/master/tests"><code>tests/</code><span>Core, extension, view, AI, and live loopback MCP behavior.</span></a>
            </div>
          </section>

          <section className="dev-section" id="contributing">
            <p className="dev-label">13 · TESTING & CONTRIBUTING</p>
            <h2>Change behavior with evidence.</h2>
            <p>Start with a failing behavior test in the closest suite. Core tests cover immutable transforms and selection semantics; view tests run the real DOM input layer in JSDOM; text-style tests cover validation, mixed and cross-block selection, history, safe browser/headless interchange, React controls, and Yjs; details tests cover schema constraints, commands, nested interchange, native/read-only behavior, keyboard transitions, history, and Yjs; collaboration tests exchange actual Yjs updates, disconnect peers, resolve relative cursors, and exercise local-origin undo; comments tests connect multiple editors, map and recover anchors, exercise authoritative operations and permission policy; tracked-change tests prove both review outcomes across text, formatting, attributes, structure, Yjs, and the accessible React panel; version tests cover provider conflicts, idempotency, exact comparison, preview, backup-first restore, autosave, permissions, and complete React rendering; MCP tests include a local HTTP server through the entire connect/discover/call/apply/close lifecycle.</p>
            <Code>{`pnpm install
pnpm dev          # live website and playground
pnpm typecheck    # public and internal TypeScript contracts
pnpm test:api     # reviewed public declaration surface
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
