# Guaranteed trailing editable block

Tables, media, dividers, and interactive widgets are valid final document
blocks, but browsers do not consistently provide a usable caret position after
them. FountainJS solves that product problem in the document model rather than
drawing a view-only fake line.

`TrailingEditableBlockExtension` guarantees that every configured root ends in
a direct text-editable block. It is included in `StarterKit`; the lower-level
`CoreExtension` remains policy-free.

```ts
import {
  CoreExtension,
  HistoryExtension,
  createTrailingEditableBlockExtension,
  composeExtensions,
} from 'fountainjs-editor'

const trailingBlock = createTrailingEditableBlockExtension({
  nodeType: 'paragraph',
  rootTypes: ['doc', 'blockquote'],
})

const kit = composeExtensions([
  CoreExtension,
  HistoryExtension,
  trailingBlock,
])
```

## What counts as editable

The extension asks the active schema whether the final child is a non-atomic
block that can contain text directly. This deliberately recognizes custom text
blocks as well as Fountain's paragraph, heading, and code block. Containers such
as quotes and lists do not count merely because they contain text deeper in
their tree: the user still needs a top-level caret position after them.

The configured trailing `nodeType` must be a schema-valid non-atomic block that
accepts direct text. Every configured `rootTypes` entry must be a non-atomic
container. Bad configuration throws during editor creation.

## Transaction, history, and collaboration behavior

Repairs happen on editor creation and after document-changing transactions.
They are idempotent: a valid ending produces no transaction, and repeated
repairs never stack empty paragraphs. Nested roots are processed deepest-first
so one repair cannot invalidate another.

The repair transaction has `addToHistory: false`. The user's structural edit
remains the undoable action, while the invariant is restored after undo and redo
when necessary. A repair appended to a remote transaction carries
`REBROADCAST_APPEND_TRANSACTION_META`, allowing the collaboration adapter to
send that deterministic structural result once. Generic-adapter and Yjs tests
verify convergence without duplicate blocks.

## Public helpers

- `TrailingEditableBlockExtension`: default singleton used by `StarterKit`.
- `createTrailingEditableBlockExtension(options)`: create an independently
  keyed configured extension.
- `ensureTrailingEditableBlocks(editor, options?)`: repair immediately and
  report whether a transaction was dispatched.
- `createTrailingEditableBlockTransaction(state, options?)`: inspect or compose
  the repair without dispatching it.
- `TRAILING_EDITABLE_BLOCK_META`: identifies repaired root paths on a
  transaction.

Applications that intentionally allow a document to terminate on an atomic or
container block can compose their own kit without this extension. Renderers do
not need special cases: the trailing paragraph is ordinary portable Fountain
JSON and works in DOM, React, Web Components, server processing, history, and
collaboration.
