# Platform-neutral core

`fountainjs-editor/core` is the dependency-enforced FountainJS engine surface
for servers, workers, tests, conversion jobs, and future non-DOM renderers. It
imports and compiles with `lib: ["ES2023"]`, `types: []`, and
`skipLibCheck: false`; it does not require `window`, `document`, DOM types,
jsdom, or another fake browser.

This is an additive entry. Existing browser applications continue to import
`fountainjs-editor`, `fountainjs-editor/react`, or the Web Component.

## Included

- immutable nodes, marks, schema validation, and portable JSON;
- logical selections, transactions, steps, mappings, and editor state;
- state plugins, lifecycle hooks, commands, extension composition, and history;
- collaboration adapter state, remote transactions, presence data, and undo
  delegation, without browser caret rendering;
- HTML-string, JSON, Markdown, and plain-text exporters plus the dependency-free
  Markdown importer;
- document migrations, stable node IDs, and structured attributes.

The package intentionally does not export `EditorView`, browser input and
selection mapping, DOM `NodeView` implementations, ReactDOM, the Web Component,
or the browser `HTMLImporter`. Use `fountainjs-editor/html/server` for bounded
HTML parsing in Node, Bun, Deno, and serverless runtimes.

## Minimal Node example

```ts
import {
  MarkdownExporter,
  TextExporter,
  composeExtensions,
  createCommandManager,
  createEditor,
  defineExtension,
  insertText,
} from 'fountainjs-editor/core'

const documentExtension = defineExtension({
  name: 'server-document',
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline', inline: true },
  },
  commands: { insertText },
})

const kit = composeExtensions([documentExtension])
const editor = createEditor({
  schema: kit.schema,
  plugins: kit.plugins,
  content: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Server' }] }],
  },
})

createCommandManager(editor, kit.commands).commands.insertText(' document')
console.log(TextExporter.export(editor.state))
console.log(MarkdownExporter.export(editor.state))
editor.destroy()
```

`toDOM` above is a declarative HTML output tuple, not a DOM node. It is safe for
the string exporter to execute on a server.

## Headless collaboration

Use `createCoreCollaborationExtension()` when the host needs synchronized state
without browser cursor decoration:

```ts
import { createCoreCollaborationExtension } from 'fountainjs-editor/core'

const collaboration = createCoreCollaborationExtension({
  adapter: () => ({
    connect(context) {
      // Bind a transport or CRDT and call context.applyRemoteTransaction(),
      // context.applyRemoteDocument(), context.setPresences(), or setStatus().
    },
  }),
})
```

The ordinary `createCollaborationExtension()` remains browser-ready and adds a
small DOM presence renderer for colored ranges and carets. Both functions share
the same transport lifecycle and commands. The optional
`fountainjs-editor/yjs` adapter is also runtime-tested in pure Node without a
fake DOM.

Yjs itself publishes XML-to-DOM convenience methods in its declaration graph.
That upstream typing detail means an unusually strict TypeScript project that
imports `yjs` with no DOM library and `skipLibCheck: false` will see Yjs's DOM
type references. It does not affect runtime portability or the independently
certified `fountainjs-editor/core` declarations.

## Permanent enforcement

`pnpm test:headless` performs two independent checks:

1. it walks every relative import reachable from `src/headless/index.ts` and
   fails if the graph enters the DOM view, React, browser HTML importer, or the
   aggregate browser extensions entry;
2. it compiles a real package consumer with no DOM library and full dependency
   declaration checking.

The Node test additionally edits and undoes a document, imports and exports
formats, applies remote collaboration state, publishes a local update, and runs
the first-party Yjs adapter while both `document` and `window` are absent.

This boundary designs for native renderers; it is not a claim that React Native,
Flutter, SwiftUI, or Android Compose renderers exist today. Those platforms need
their own selection, input, IME, clipboard, accessibility, and layout adapters.
