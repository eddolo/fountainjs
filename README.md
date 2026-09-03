# FountainJS

[![npm version](https://img.shields.io/npm/v/fountainjs-editor?color=6d4aff)](https://www.npmjs.com/package/fountainjs-editor)
[![CI](https://github.com/eddolo/fountainjs/actions/workflows/ci.yml/badge.svg)](https://github.com/eddolo/fountainjs/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/fountainjs-editor)](LICENSE)

**One editor core. Any framework. Yours to extend.**

FountainJS is a modular rich-text engine for building editors inside web products. The core owns a typed document model, selections, transactions, plugins, history, and a plain DOM view. Everything else—including React controls, a Web Component, format adapters, and AI review—is a replaceable surface or module.

> `0.3.0` is an early public beta and a ground-up replacement for the `0.2.x` proof of concept.

## What “language agnostic” means

The editor runtime is JavaScript/TypeScript because it edits a browser DOM. FountainJS does not pretend an npm package executes natively in Python or Go.

Its boundaries are language and framework agnostic:

- Use the DOM API directly from any frontend framework.
- Register the standards-based `<fountain-editor>` Web Component in React, Vue, Svelte, Angular, plain HTML, or any Custom-Element-capable environment.
- Use the first-party React package when React-specific hooks and components are useful.
- Persist stable JSON that any backend language can store, validate, index, or transform.
- Add nodes, marks, plugins, commands, formats, and host services through one extension contract.

React is an adapter, not the architecture. AI is an optional module, not the product identity.

## Install

```bash
npm install fountainjs-editor
```

React is an optional peer dependency. Install `react` and `react-dom` only when importing `fountainjs-editor/react`.

## Compose an editor

Use the supplied rich-document extension, add behavior, and define your own capability:

```ts
import {
  CoreExtension,
  EditorView,
  composeExtensions,
  createEditor,
  defineExtension,
  historyPlugin,
  insertNode,
} from 'fountainjs-editor';

const callout = defineExtension({
  name: 'callout',
  nodes: {
    callout: {
      group: 'block',
      content: 'inline*',
      attrs: { tone: { default: 'info' } },
      toDOM: (node) => ['aside', { 'data-tone': node.attrs.tone }, 0],
    },
  },
  commands: {
    insertCallout: (editor, text = 'A useful callout') => {
      const { schema } = editor.state;
      return insertNode(editor, schema.node('callout', { tone: 'info' }, [schema.text(text)]));
    },
  },
  services: {
    analytics: { track: (event) => console.info('editor event', event) },
  },
});

const kit = composeExtensions([
  CoreExtension,
  defineExtension({ name: 'history', plugins: [historyPlugin] }),
  callout,
]);

const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
const view = new EditorView(document.querySelector('#editor')!, editor);
const commands = view.commandManager(kit.commands);

commands.commands.insertCallout('This command came from an extension.');
commands.chain().focus('end').insertText('Atomic ').toggleMark('strong').run();
commands.can().insertImage({ src: '/cover.jpg', alt: 'Cover' });
```

Chains stop and roll back when any command returns `false` or throws. A successful
chain is dispatched once, so subscribers and history see one atomic edit. `can()`
runs the same command logic against temporary state without changing the editor.
`EditorView.commandManager()` adds a view-aware `focus('current' | 'start' | 'end')`
command; use `createCommandManager()` when there is no DOM view.
Use `.command(name, ...args)` for an extension command named `run`, `command`, or
`chain`, since those names are reserved by the fluent API.

Composition rejects duplicate extension names and conflicting node, mark, command, format, or service names by default. Use `{ onConflict: 'replace' }` only for an intentional override.

An extension can contribute:

- `nodes` and `marks` to the schema
- stateful `plugins`
- reusable `commands`
- `formats` with parse/serialize boundaries
- open-ended `services` interpreted by the host application

## Production table editing

Tables use a span-aware `TableMap`, so logical rows and columns remain correct
through `rowspan` and `colspan`. The public command set covers row/column
insertion and deletion, merge/split, row/column/cell header toggles, whole-row
and whole-column selection, exact column widths, repair, and spreadsheet-style
TSV paste. Rectangular copy writes both plain TSV and an HTML table. Resizing is
available from an accessible pointer/keyboard handle and the React toolbar.
Column widths round-trip through JSON and safe HTML.

```ts
selectCells(editor, [0, 0, 0], [0, 1, 1])
mergeTableCells(editor)
splitTableCell(editor)
resizeTableColumn(editor, 180)
toggleTableHeaderRow(editor)
```

`TableEditingExtension` is part of `StarterKit`; it repairs non-rectangular
geometry after arbitrary host transactions without adding repair steps to local
undo history.

## Optional clipboard history

`ClipboardHistoryExtension` adds a bounded, searchable list of text copied
inside an editor. Normal Ctrl/Cmd+C, Ctrl/Cmd+X, and Ctrl/Cmd+V keep their native
behavior. Ctrl/Cmd+Alt+V (or `openClipboardHistory`) opens the supplied React
picker when it is mounted. Every shortened preview has the complete value in a
hover title and can be expanded to read the full text before pasting.

```ts
const kit = composeExtensions([
  ...StarterKit.extensions,
  createClipboardHistoryExtension({ maxEntries: 25 }),
])
```

History is memory-only by default, belongs to that editor instance, and never
uploads anything. Persistence happens only when an application explicitly
passes its own synchronous `{ load, save }` adapter. Commands are available for
open, close, paste, remove, and clear, so non-React products can render the same
immutable state in any interface.

## Native LaTeX mathematics

`MathExtension` is a first-party but opt-in module. It adds portable
`inline_math` and `math_block` nodes, `$...$` / `$$...$$` typing and paste
rules, insertion/update commands, accessible source fallback, and lossless
JSON plus HTML/Markdown/text interchange.

```ts
import katex from 'katex'
import {
  MathExtension, StarterKit, composeExtensions,
  createKaTeXRenderer, createMathExtension,
} from 'fountainjs-editor'

// Source-only fallback (no rendering dependency):
const portable = composeExtensions([...StarterKit.extensions, MathExtension])

// Or pass a caller-owned renderer:
const math = createMathExtension({ renderer: createKaTeXRenderer(katex) })
const rendered = composeExtensions([...StarterKit.extensions, math])
```

The editor stores TeX source—not renderer HTML. KaTeX is deliberately not a
runtime dependency: applications choose their renderer/version and may provide
another `MathRenderer` that returns a DOM node. Renderer errors keep the source
visible and editable through `setMathSource`.

## Lean 4 without mandatory hosting

`LeanExtension` is also opt-in. With no provider it supplies portable Lean code
blocks, insertion/update commands, Unicode backslash shortcuts, highlighting,
and an explicit source-only controller; no source leaves the editor and no
verification is claimed. Applications may attach a named local, remote,
managed, or one-shot provider for diagnostics, goals, hover, and completion.
Provider diagnostics render as mapped, transient decorations, and the optional
plain-DOM `LeanInfoView` exposes source-only/provider state plus proof results.
There is no built-in endpoint or credential storage.

```ts
const kit = composeExtensions([...StarterKit.extensions, LeanExtension])
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins })
kit.commands.insertLeanBlock(editor, 'example : True := by trivial')

const lean = kit.services.lean.createController(editor)
await lean.check() // explicit `not-checked` result in source-only mode
```

See [Lean integration and trust boundaries](docs/LEAN.md) for local bridge and
provider examples.

## Use any UI surface

### Plain DOM

```ts
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
const view = new EditorView(document.querySelector('#editor')!, editor, {
  placeholder: 'Start writing…',
  ariaLabel: 'Article body',
  imageUpload: async (file, { signal, reportProgress }) => {
    const body = new FormData();
    body.append('file', file);
    const response = await uploadWithProgress('/api/media', body, {
      signal,
      onProgress: reportProgress,
    });
    return response.json(); // { src, alt?, caption?, width?, srcset?, sizes? }
  },
});

const stopSaving = editor.subscribe((state) => saveDraft(state.doc.toJSON()));

// Cleanup:
stopSaving();
view.destroy();
editor.destroy();
```

### Production images

Block images support editable captions, alternative text, titles, left/centre/
right alignment, responsive `srcset`/`sizes`, safe load settings, explicit width
and height, load-error recovery, and mouse, touch, or keyboard resizing. Use
`insertInlineImage` when the image must live between text fragments. Both forms
remain typed, selectable nodes and round-trip through JSON and HTML; standard
Markdown image syntax covers their portable subset.

`startImageUpload` returns an observable task. Its insertion or replacement
target maps through edits made while the upload is running, so a slow response
cannot silently overwrite the wrong image. The host owns the transport and can
report progress; FountainJS supplies cancellation, retry state, validation, and
safe insertion:

```ts
const task = startImageUpload(editor, file, {
  placement: 'block', // or 'inline'
  upload: async (file, { signal, reportProgress }) =>
    myAssets.upload(file, { signal, onProgress: reportProgress }),
})

const unsubscribe = task.subscribe(snapshot => renderUpload(snapshot))
task.cancel()
await task.retry() // available after a failed attempt
```

Pass `replacePath` to replace an existing block or inline image without losing
its metadata. Upload state is transient and local; credentials, files, and
progress never enter document JSON.

### Web Component

```ts
import { registerFountainElement } from 'fountainjs-editor';

registerFountainElement({
  schema: kit.schema,
  plugins: kit.plugins,
});
```

```html
<fountain-editor placeholder="Start writing…"></fountain-editor>

<script>
  const element = document.querySelector('fountain-editor');
  element.value = savedDocumentJSON;
  element.addEventListener('fountain-change', (event) => {
    save(event.detail.value);
  });
</script>
```

### React

```tsx
import { FountainComposer, useFountain } from 'fountainjs-editor/react';
import 'fountainjs-editor/styles.css';

export function WritingRoom() {
  const editor = useFountain({
    schema: kit.schema,
    plugins: kit.plugins,
    onUpdate: (state) => saveDraft(state.doc.toJSON()),
  });

  return <FountainComposer editor={editor} placeholder="Start writing…" />;
}
```

The React entry is separate, so the framework-neutral root does not load React. A new framework binding only needs to create an editor, subscribe to its immutable state, and mount or replace its view.

### Build interactive nodes

An extension node can provide a plain DOM `nodeView` for polls, diagrams,
mentions, embeds, or any product-owned widget. FountainJS keeps its instance and
live path across mapped edits, calls `update` when model data changes, mirrors
semantic node selection, isolates embedded controls with `stopEvent`, restores
unapproved DOM mutations, refreshes optional editable `contentDOM`, and calls
`destroy` on replacement or removal. React products can adapt a component with
`createReactNodeView` from `fountainjs-editor/react`; React remains absent from
the package root. See the [NodeView API](docs/API.md#custom-nodeviews) and the
[working plain-DOM demo](https://eddolo.github.io/fountainjs/demos/plain-dom-notes.html).

## Included document capabilities

`CoreExtension` supplies paragraphs, six heading levels, alignment, quotes, bullet/ordered/task lists, code blocks, tables, media, dividers, semantic hard breaks, links, highlights, text colour, subscript, superscript, and common text marks. Its commands are available both as named imports and through `kit.commands`. Lists support multi-block wrapping, selected-range type conversion, mixed nesting, multi-item indent/lift, ordered starts, task state, boundary joins, and nested HTML/Markdown interchange; the React controls toggle types and expose lift/indent actions. Tables support span-aware merge/split, structural repair, header scopes, full-row/column selections, column resizing, and TSV/HTML clipboard exchange. `StarterKit` also adds safe link behavior, live language-aware code highlighting, and automatic table repair. Code tokens and optional line numbers are view-only decorations, language metadata round-trips through JSON/Markdown/HTML, the React toolbar edits language and line-number settings, and `createSyntaxHighlightExtension` accepts any host tokenizer through validated ranges. Link behavior includes normalization and validation hooks, typed web/email autolinking, link-on-paste, whole-link editing around a caret, host-owned activation, and complete React add/preview/edit/remove controls.

The editing core provides immutable state; mapped text, node, gap, all-document,
and rectangular table-cell selections; typed transactions; keyboard and IME
input; configurable input/paste rules; multiline and rich-HTML paste; image
paste/drop/upload; selected-block drag-move; find/replace; Markdown shortcuts;
and configurable undo/redo that groups adjacent browser input.
JSON is the lossless source of truth; Markdown, safe HTML, and plain text are
interoperability boundaries.

```ts
const schema = new Schema(CoreSchemaSpec);
const document = MarkdownImporter.parse('# Hello\n\nA **bold** beginning.', schema);

MarkdownExporter.export(document);
HTMLExporter.export(document, { document: false });
JSONExporter.export(document);
```

HTML export escapes text and attributes and rejects unsafe URL protocols. JSON import validates node and mark names through the receiving schema.

## Optional AI review module

AI is one example of a host service. FountainJS does not provide a model account or require a Fountain cloud. The optional `AIController` lets an application inspect exactly what will be sent, request a text proposal from any adapter, show a before/after review, accept or reject, block stale proposals, and undo acceptance.

```ts
const adapter = createAIAdapter(async (request, { signal }) => {
  const response = await fetch('/api/rewrite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  return response.json(); // { replacement, explanation?, model?, metadata? }
});

const ai = new AIController(editor, adapter);
const disclosure = ai.inspectRequest({ action: 'improve' });
const proposal = await ai.suggest({ action: 'improve' });

ai.accept(proposal); // one undoable editor transaction
// or: ai.reject(proposal);
```

Full-document context is off by default. The included `MCPAIAdapter` connects the same workflow to a compatible MCP Streamable HTTP tool; MCP is a transport option, not the AI itself. Never ship permanent provider credentials in browser code.

React applications can render the optional workflow with `<FountainAIReview controller={ai} />`.

## Honest comparison

FountainJS is not the first framework-neutral or extensible editor.

| Project | Architecture and maturity | Practical reason to choose it |
| --- | --- | --- |
| [Tiptap](https://tiptap.dev/docs/editor/getting-started/overview) | Mature ProseMirror platform with multiple framework integrations and a large extension ecosystem | Collaboration, ecosystem depth, and commercial support |
| [Plate](https://platejs.org/docs) | Powerful React/Slate framework with a broad plugin catalog | A React-first product with many polished capabilities ready now |
| [BlockNote](https://www.blocknotejs.org/docs) | Polished React block editor with an out-of-the-box Notion-like experience | Shipping a strong block UI quickly |
| **FountainJS** | DOM-first editor platform, Web Component, React adapter, and explicit extension composition | Owning a modular editor platform and keeping framework/data boundaries open |

Choose FountainJS when those boundaries matter and an early API is acceptable. Choose a mature alternative today when you need real-time collaboration, physical-device IME/mobile certification, a large plugin market, or commercial support.

## React exports

- `useFountain` and `useFountainState`
- `FountainEditor`, `FountainToolbar`, and `FountainComposer`
- `ClipboardHistoryMenu`
- `Navigator` and `useNavigatorState`
- `FountainAIReview` and `useAIControllerState`
- `createReactNodeView` and `ReactNodeViewProps`

## Development

```bash
pnpm install
pnpm dev
pnpm check
pnpm test:browser
pnpm pack:check
```

Generated bundles and dependencies are not committed. CI runs type checks,
behavioural tests, production and package builds, plus Playwright contracts in
Chromium, Firefox, WebKit, emulated Pixel Chrome, and emulated iPhone Safari.
Failed browser runs retain traces and screenshots.

The website includes [a ten-demo integration gallery](https://eddolo.github.io/fountainjs/demos.html) with dedicated working pages for React, plain DOM, the Web Component, Vue, Svelte, Angular, headless Node.js, and JSON boundaries with Python, Go, and Java. Framework recipes use the real supported adapter boundary; backend recipes are explicitly presented as portable JSON contracts rather than browser runtimes.

## Project status

The tested release supports multi-paragraph text selection plus mapped node,
gap, all-document, and rectangular cell selections; formatting across marked
and nested text; block splitting and joining; attributed text and alignment;
find/replace; rich content insertion; image URL/upload/paste/drop workflows;
reusable input and paste rules; links, lists, tasks, code, tables, local history,
interactive NodeViews, grouped browser input, structured clipboard and selected-
block drag-move, browser-event plugin hooks, extensible schema composition,
safe format serialization, DOM/Web Component/React surfaces, optional AI
proposals, and MCP transport.

FountainJS is open about integration boundaries: host applications choose their media storage, persistence, authentication, and collaboration provider through adapters and services. No Fountain cloud account is required, and those product-specific systems are not silently bundled into the editor.

- [Architecture and internals](docs/ARCHITECTURE.md)
- [Tiptap parity programme and verified gap baseline](docs/TIPTAP_PARITY.md)
- [Ten working integration demos](https://eddolo.github.io/fountainjs/demos.html)
- [API guide](docs/API.md)
- [Format boundaries](docs/FORMATS.md)
- [Optional AI and MCP](docs/MCP.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE) © Paolo Cappuccini.
