# Collapsible details

`fountainjs-editor/details` is an optional, framework-neutral disclosure module.
It adds native `<details>` and `<summary>` content without adding anything to
`StarterKit` or requiring React.

## Install and compose

The module ships in the main package:

```ts
import {
  DetailsExtension,
  insertDetails,
} from 'fountainjs-editor/details'
import { StarterKit, composeExtensions, createEditor } from 'fountainjs-editor'

const kit = composeExtensions([
  ...StarterKit.extensions,
  DetailsExtension,
])

const editor = createEditor({ schema: kit.schema, plugins: kit.plugins })

insertDetails(editor, {
  summary: 'Deployment notes',
  open: true,
})
```

Vue, Svelte, Angular, Web Components, React, and plain DOM applications compose
the same extension and call the same commands. The supplied `EditorView` renders
the disclosure; a framework-specific wrapper is not required.

## Document model

A disclosure is normal portable document content:

```json
{
  "type": "details",
  "attrs": { "open": false },
  "content": [
    {
      "type": "details_summary",
      "content": [{ "type": "text", "text": "Deployment notes" }]
    },
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "Restart the worker." }]
    }
  ]
}
```

The schema requires exactly one summary first and one or more body blocks after
it. A summary accepts marked inline content but cannot appear on its own at the
document root. The body accepts every block supported by the composed schema,
including paragraphs, lists, tables, images, code blocks, and nested details.
The `open` attribute is a validated boolean and is part of JSON state.

## Commands

- `insertDetails(editor, options?)` inserts a new disclosure after the selected
  top-level block. It defaults to a closed disclosure named `Details` with one
  empty paragraph.
- `wrapInDetails(editor, options?)` wraps the selected top-level block range.
  Nested-range wrapping is deliberately rejected instead of guessing which
  ancestor should move.
- `unwrapDetails(editor)` replaces the active disclosure with a paragraph made
  from its summary, followed by all body blocks.
- `toggleDetails(editor, options?)` wraps a top-level selection or unwraps the
  disclosure containing the caret.
- `setDetailsOpen(editor, open, path?)` persists an explicit open state for the
  active disclosure or a supplied model path.
- `toggleDetailsOpen(editor, path?)` toggles that persisted state.
- `getActiveDetails(editor)` returns the active disclosure and its current path.

Every changing command checks editability, builds one validated transaction,
and participates in normal undo, subscriptions, tracked changes, and
collaboration.

## Editing and keyboard behavior

The native summary remains directly editable.

- `Enter` in the summary keeps the text before the caret as the summary and
  starts the trailing content in a new first body paragraph.
- `Backspace` at the start of the first body paragraph moves the caret back to
  the end of the summary.
- `Ctrl+Enter` or `Cmd+Enter` toggles the disclosure while the caret is inside.
- Clicking or tapping the native disclosure marker persists `open` in the
  document when the editor is editable.

In a read-only editor, a reader may still open or close the native disclosure
locally, but the document is not changed. This preserves ordinary browser
reading behavior without turning a view preference into an unauthorized edit.

## Interchange

FountainJSON is the lossless persistence format. Safe HTML uses semantic
`<details>` and `<summary>` elements and preserves `open`. Markdown import and
export uses the widely understood HTML form:

```md
<details open>
<summary>Deployment **notes**</summary>

Restart the worker.

</details>
```

Nested supported blocks and inline summary marks round-trip. Plain-text export
emits the summary followed by body text. Applications should keep JSON when an
exact extension document must survive a format that cannot express its schema.

## Collaboration and persistence

No disclosure state is stored outside the document. A Yjs-enabled editor shares
the nodes, nested body edits, and `open` attribute through the same generic tree
mapping used by other extension nodes. Every participant must compose
`DetailsExtension`; a peer with an incompatible schema rejects the incoming tree
rather than flattening it silently.

## Accessibility and safety

The default NodeView uses native HTML disclosure semantics, so keyboard and
assistive-technology behavior come from the platform. FountainJS adds visible
focus treatment and a 44-pixel coarse-pointer summary target. It does not place
interactive controls inside the summary automatically.

Imported attributes are schema-owned: only the boolean `open` state is read.
Executable attributes and arbitrary HTML are not persisted. Programmatic body
nodes must belong to the active schema, and every resulting document is
validated before dispatch.

## Current boundary

The module supplies the document structure, commands, native rendering,
keyboard behavior, and interchange. It intentionally does not impose a product
accordion policy, animations, exclusive-open groups, remote storage, or custom
icons. Those can be built as an extension/plugin or host UI around the public
commands without forking the editor core.
