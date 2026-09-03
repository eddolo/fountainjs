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

## Use any UI surface

### Plain DOM

```ts
const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
const view = new EditorView(document.querySelector('#editor')!, editor, {
  placeholder: 'Start writing…',
  ariaLabel: 'Article body',
  imageUpload: async (file) => {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/media', { method: 'POST', body });
    return response.json(); // { src, alt?, title?, caption?, width? }
  },
});

const stopSaving = editor.subscribe((state) => saveDraft(state.doc.toJSON()));

// Cleanup:
stopSaving();
view.destroy();
editor.destroy();
```

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

## Included document capabilities

`CoreExtension` supplies paragraphs, six heading levels, alignment, quotes, bullet/ordered/task lists, code blocks, tables, media, dividers, semantic hard breaks, links, highlights, text colour, subscript, superscript, and common text marks. Its commands are available both as named imports and through `kit.commands`.

The editing core provides immutable state; mapped text, node, gap, all-document,
and rectangular table-cell selections; typed transactions; keyboard and IME
input; configurable input/paste rules; multiline and rich-HTML paste; image
paste/drop/upload; find/replace; Markdown shortcuts; and 100-step undo/redo.
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

Choose FountainJS when those boundaries matter and an early API is acceptable. Choose a mature alternative today when you need real-time collaboration, comprehensive IME/mobile hardening, a large plugin market, or commercial support.

## React exports

- `useFountain` and `useFountainState`
- `FountainEditor`, `FountainToolbar`, and `FountainComposer`
- `Navigator` and `useNavigatorState`
- `FountainAIReview` and `useAIControllerState`

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
Chromium, Firefox, and WebKit. Failed browser runs retain traces and screenshots.

The website includes [a ten-demo integration gallery](https://eddolo.github.io/fountainjs/demos.html) with dedicated working pages for React, plain DOM, the Web Component, Vue, Svelte, Angular, headless Node.js, and JSON boundaries with Python, Go, and Java. Framework recipes use the real supported adapter boundary; backend recipes are explicitly presented as portable JSON contracts rather than browser runtimes.

## Project status

The tested release supports multi-paragraph text selection plus mapped node,
gap, all-document, and rectangular cell selections; formatting across marked
and nested text; block splitting and joining; attributed text and alignment;
find/replace; rich content insertion; image URL/upload/paste/drop workflows;
reusable input and paste rules; links, lists, tasks, code, tables, local history,
interactive NodeViews, browser-event plugin hooks, extensible schema composition,
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
