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
    insertCallout: (editor) => {
      // A host-owned command can dispatch any valid transaction.
      return true;
    },
  },
  services: {
    analytics: yourAnalyticsAdapter,
  },
});

const kit = composeExtensions([
  CoreExtension,
  defineExtension({ name: 'history', plugins: [historyPlugin] }),
  callout,
]);

const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
const view = new EditorView(document.querySelector('#editor')!, editor);
```

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

`CoreExtension` supplies paragraphs, six heading levels, quotes, bullet/ordered/task lists, code blocks, tables, media, dividers, hard breaks, links, highlights, and common text marks.

The editing core provides immutable state, path-based selections, inline cross-mark selection, typed transactions, keyboard input, Markdown shortcuts, and 100-step undo/redo. JSON is the lossless source of truth; Markdown, safe HTML, and plain text are interoperability boundaries.

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
| **FountainJS** | Early-beta DOM-first engine, Web Component, React adapter, and explicit extension composition | Owning a compact modular stack and keeping framework/data boundaries open |

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
pnpm pack:check
```

Generated bundles and dependencies are not committed. CI runs type checks, behavioral tests, a production build, and a package dry run.

## Project status

The tested beta supports one-block inline selections (including ranges across mark boundaries), local history, extensible schema composition, safe format serialization, DOM/Web Component/React surfaces, optional AI proposals, and MCP transport. Cross-block selections, real-time collaboration, streaming AI output, and comprehensive IME/mobile hardening remain roadmap work.

- [API guide](docs/API.md)
- [Format boundaries](docs/FORMATS.md)
- [Optional AI and MCP](docs/MCP.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

[MIT](LICENSE) © Paolo Cappuccini.
